import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClientApiKeysFromRequest } from "@/lib/ai-client";
import { buildReportAggregate } from "@/lib/reports/report-aggregator";
import { draftCourtReport } from "@/lib/report-draft-ai";
import { computeLiquidation } from "@/lib/reports/liquidation";
import { generateCourtReportDraftSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const PRELIMINARY_FIELDS = [
  "introduction",
  "mandateSummary",
  "partiesOverview",
  "proceduralHistory",
  "documentInventory",
] as const;

// موديول 4 — توليد/إعادة توليد التقرير القضائي: يجمع البيانات الحتمية عبر
// lib/reports/report-aggregator.ts، ثم يستدعي lib/report-draft-ai.ts
// لصياغة السرد التوليدي فقط. مهمة اعتُمد "رأي الخبرة" فيها بالفعل لا
// تُعاد صياغتها أبداً عند إعادة التوليد (لا يُفقَد عمل الخبير المعتمد)، إلا
// إن طلب المستخدم صراحةً إعادة توليدها عبر regenerateTaskIndexes.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = generateCourtReportDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة", issues: parsed.error.issues }, { status: 400 });
  }
  const forceRegenerate = new Set(parsed.data.regenerateTaskIndexes ?? []);

  const aggregate = await buildReportAggregate(caseId);
  if (!aggregate) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }
  if (aggregate.tasks.length === 0) {
    return NextResponse.json(
      {
        error:
          "لا توجد مهام مأمورية لبناء التقرير عليها — أكمل التحليل الأولي في الموديول 1 واعتمده أولاً (يُقسِّم المأمورية إلى مهام تلقائياً)، أو تحقق من أن التحليل المعتمد يتضمن قائمة مهام.",
      },
      { status: 400 },
    );
  }

  const existingReport = await prisma.courtReport.findUnique({
    where: { caseId },
    include: { tasks: true },
  });
  const existingTaskByIndex = new Map((existingReport?.tasks ?? []).map((t) => [t.taskIndex, t]));

  const tasksToGenerate = aggregate.tasks.filter((t) => {
    const existing = existingTaskByIndex.get(t.taskIndex);
    const isCertified = existing?.expertVerdictProvenance === "EXPERT_CERTIFIED";
    return !isCertified || forceRegenerate.has(t.taskIndex);
  });

  const clientKeys = getClientApiKeysFromRequest(req);
  const outcome = await draftCourtReport(aggregate, tasksToGenerate, clientKeys);
  const taskResultByIndex = new Map(outcome.result.taskAnalyses.map((t) => [Number(t.taskId), t]));

  // كل كتلة تمهيدية مُنتَجة عبر المحرك الحتمي في المحرك الاحتياطي (نص
  // حقيقي مُجمَّع من سجلات النظام، لا نص ذكاء اصطناعي) تُوسَم EXTRACT؛
  // كل كتلة أخرى (سواء نتاج ذكاء اصطناعي فعلي أو نص احتياطي توضيحي بلا
  // مفتاح) تُوسَم AI_DRAFT — تحتاج مراجعة الخبير في الحالتين.
  const deterministicOfflineFields = new Set(
    outcome.mode === "OFFLINE" ? ["introduction", "partiesOverview", "proceduralHistory", "documentInventory"] : [],
  );

  let preservedCertifiedFields = 0;

  const report = await prisma.$transaction(async (tx) => {
    const reportData: Record<string, unknown> = {
      generationMode: outcome.mode,
      generationWarning: outcome.warning ?? null,
      lastGeneratedAt: new Date(),
      settlementBeneficiary: outcome.result.settlement.beneficiary,
      settlementNarrative: outcome.result.settlement.summaryNarrative,
      settlementNarrativeProvenance: "AI_DRAFT",
      // لقطة التجميع الحتمي وقت هذا التوليد — تُستخدَم في عرض الجدول
      // الزمني/الجرد الكامل بالواجهة وفي التصدير، وتُحدَّث في كل توليد.
      timelineJson: JSON.stringify(aggregate.timeline),
      inventoryJson: JSON.stringify(aggregate.inventory),
      partyClaimsJson: JSON.stringify(aggregate.partyClaims),
    };
    for (const field of PRELIMINARY_FIELDS) {
      const existingProvenance = existingReport?.[`${field}Provenance` as keyof typeof existingReport];
      if (existingProvenance === "EXPERT_CERTIFIED") {
        preservedCertifiedFields++;
        continue; // النص الذي اعتمده الخبير لا يُستبدَل بإعادة التوليد
      }
      reportData[field] = outcome.result.preliminarySections[field];
      reportData[`${field}Provenance`] = deterministicOfflineFields.has(field) ? "EXTRACT" : "AI_DRAFT";
    }
    if (existingReport?.settlementNarrativeProvenance === "EXPERT_CERTIFIED") {
      preservedCertifiedFields++;
      delete reportData.settlementBeneficiary;
      delete reportData.settlementNarrative;
      delete reportData.settlementNarrativeProvenance;
    }

    const upserted = await tx.courtReport.upsert({
      where: { caseId },
      create: { caseId, ...reportData },
      update: reportData,
    });

    for (const task of aggregate.tasks) {
      const existing = existingTaskByIndex.get(task.taskIndex);
      const isCertified = existing?.expertVerdictProvenance === "EXPERT_CERTIFIED";
      const wasRegenerated = tasksToGenerate.some((t) => t.taskIndex === task.taskIndex);

      const exhibitLinksJson = JSON.stringify(task.exhibitLinks);
      const linkedDocumentIds = JSON.stringify(task.linkedDocumentIds);
      const linkedRequirementIds = JSON.stringify(task.linkedRequirementIds);
      const linkedDemandIds = JSON.stringify(task.linkedDemandIds);

      if (isCertified && !wasRegenerated) {
        preservedCertifiedFields++;
        // مهمة مُعتمَدة ولم يُطلَب صراحةً إعادة توليدها — تبقى كما هي
        // تماماً، بلا أي لمس حتى لروابط المستندات، احتراماً لاعتماد الخبير.
        continue;
      }

      const generated = taskResultByIndex.get(task.taskIndex);
      const taskData = {
        taskText: task.taskText,
        exhibitLinksJson,
        linkedDocumentIds,
        linkedRequirementIds,
        linkedDemandIds,
        ...(generated
          ? {
              claimantPosition: generated.claimantArguments,
              claimantPositionProvenance: "AI_DRAFT",
              respondentPosition: generated.respondentArguments,
              respondentPositionProvenance: "AI_DRAFT",
              forensicAnalysis: generated.forensicStudy,
              forensicAnalysisProvenance: "AI_DRAFT",
              missingDocsImpact: generated.missingDocsImpact,
              expertVerdict: generated.tentativeFinding,
              expertVerdictProvenance: "AI_DRAFT",
              // مبلغ اعتمده الخبير سابقاً (claimantAmount/respondentOffset
              // غير null على صف موجود) لا يُستبدَل بتخمين جديد؛ يُملأ فقط
              // إن كان فارغاً.
              ...(existing?.claimantAmount == null ? { claimantAmount: generated.claimantAmount } : {}),
              ...(existing?.respondentOffset == null ? { respondentOffset: generated.respondentOffset } : {}),
              ...(existing?.amountNote == null && generated.amountNote
                ? { amountNote: generated.amountNote }
                : {}),
            }
          : {}),
      };

      await tx.courtReportTask.upsert({
        where: { courtReportId_taskIndex: { courtReportId: upserted.id, taskIndex: task.taskIndex } },
        create: { courtReportId: upserted.id, taskIndex: task.taskIndex, ...taskData },
        update: taskData,
      });
    }

    // مهام كانت موجودة سابقاً لكن تجاوز فهرسها عدد مهام المأمورية الحالي
    // (تقلّصت القائمة) — تُحذَف فقط إن لم تحمل رأي خبرة معتمَداً؛ أي مهمة
    // معتمَدة تبقى محفوظة (تُعرَض في الواجهة كـ"مهمة لم تعد ضمن المأمورية").
    for (const [taskIndex, existing] of existingTaskByIndex) {
      if (taskIndex >= aggregate.tasks.length && existing.expertVerdictProvenance !== "EXPERT_CERTIFIED") {
        await tx.courtReportTask.delete({ where: { id: existing.id } });
      }
    }

    return tx.courtReport.findUniqueOrThrow({
      where: { id: upserted.id },
      include: { tasks: { orderBy: { taskIndex: "asc" } } },
    });
  });

  const liquidation = computeLiquidation(report.tasks);

  return NextResponse.json({
    courtReport: report,
    preliminarySections: {
      introduction: report.introduction,
      mandateSummary: report.mandateSummary,
      partiesOverview: report.partiesOverview,
      proceduralHistory: report.proceduralHistory,
      documentInventory: report.documentInventory,
    },
    taskAnalyses: report.tasks.map((t) => ({
      taskId: String(t.taskIndex),
      claimantArguments: t.claimantPosition,
      respondentArguments: t.respondentPosition,
      forensicStudy: t.forensicAnalysis,
      missingDocsImpact: t.missingDocsImpact,
      tentativeFinding: t.expertVerdict,
      claimantAmount: t.claimantAmount,
      respondentOffset: t.respondentOffset,
    })),
    settlement: {
      claimantAmount: liquidation.totalClaimant,
      respondentOffset: liquidation.totalRespondent,
      netDue: liquidation.netDue,
      beneficiary: report.settlementBeneficiary,
      summaryNarrative: report.settlementNarrative,
    },
    mode: outcome.mode,
    warning: outcome.warning ?? null,
    preservedCertifiedFields,
  });
}
