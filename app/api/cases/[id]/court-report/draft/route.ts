import { NextRequest, NextResponse } from "next/server";
import type { CourtReportTable } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getClientApiKeysFromRequest } from "@/lib/ai-client";
import { buildReportAggregate } from "@/lib/reports/report-aggregator";
import { draftCourtReport } from "@/lib/report-draft-ai";
import { computeLiquidation } from "@/lib/reports/liquidation";
import { buildDeterministicTables, type ProposedTable } from "@/lib/reports/financial-tables";
import { buildConclusionIntroText, buildConclusionClosingText } from "@/lib/reports/report-sections";
import { getExpertProfile } from "@/lib/queries";
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
  "scopeNarrative",
] as const;

/** "معتمد من الخبير" يجب أن يعني فعلاً وجود نص اعتمده الخبير — صف مُرحَّل
 * من نسخة سابقة (أو أي حالة أخرى) قد يحمل الوسم EXPERT_CERTIFIED على حقل
 * فارغ فعلياً؛ معاملة ذلك كـ"معتمد" كان يمنع توليده للأبد. */
function hasRealContent(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** نفس قاعدة hasRealContent مطبَّقة على جدول: صف واحد حقيقي على الأقل يحمل
 * خلية غير فارغة — "معتمد" على جدول فارغ فعلياً لا يعني شيئاً. */
function hasRealTableContent(table: { rowsJson: string }): boolean {
  try {
    const rows = JSON.parse(table.rowsJson) as { cells: string[] }[];
    return rows.some((r) => r.cells.some((c) => c.trim().length > 0));
  } catch {
    return false;
  }
}

/** لا يُعاد إنشاء جدول اعتمده الخبير فعلاً أو أدخله يدوياً (MANUAL) عند
 * إعادة التوليد — نفس منطق حماية "رأي الخبرة" لكل مهمة، مُطبَّقاً على
 * الجداول. جدول AI_DRAFT/AI_PROPOSED أو DETERMINISTIC لم يُعتمد بعد يُستبدَل
 * بحرية عند كل إعادة توليد لنفس المهمة. */
function isTablePreserved(table: { provenance: string; computation: string; rowsJson: string }): boolean {
  if (table.computation === "MANUAL") return true;
  return table.provenance === "EXPERT_CERTIFIED" && hasRealTableContent(table);
}

function hasRealConclusionItems(itemsJson: string | null | undefined): boolean {
  if (!itemsJson) return false;
  try {
    const items = JSON.parse(itemsJson) as unknown[];
    return items.length > 0;
  } catch {
    return false;
  }
}

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
    include: { tasks: true, tables: true },
  });
  const existingTaskByIndex = new Map((existingReport?.tasks ?? []).map((t) => [t.taskIndex, t]));
  const existingTablesByTaskId = new Map<string | null, CourtReportTable[]>();
  for (const table of existingReport?.tables ?? []) {
    const key = table.courtReportTaskId;
    const list = existingTablesByTaskId.get(key) ?? [];
    list.push(table);
    existingTablesByTaskId.set(key, list);
  }

  // بنود الخلاصة (ثامناً) — نسخة حرفية من "رأي الخبرة" المعتمَد فعلاً لكل
  // مهمة فقط؛ مهمة لم يُعتمد رأيها بعد لا تظهر كبند في الخلاصة (لا استنتاج
  // نهائي بلا اعتماد خبير حقيقي وراءه).
  const certifiedVerdicts: string[] = [];
  for (const t of aggregate.tasks) {
    const existing = existingTaskByIndex.get(t.taskIndex);
    if (existing?.expertVerdictProvenance === "EXPERT_CERTIFIED" && hasRealContent(existing.expertVerdict)) {
      certifiedVerdicts.push(existing.expertVerdict);
    }
  }

  const tasksToGenerate = aggregate.tasks.filter((t) => {
    const existing = existingTaskByIndex.get(t.taskIndex);
    const isCertified = existing?.expertVerdictProvenance === "EXPERT_CERTIFIED" && hasRealContent(existing?.expertVerdict);
    return !isCertified || forceRegenerate.has(t.taskIndex);
  });

  const clientKeys = getClientApiKeysFromRequest(req);
  const deterministicTables = await buildDeterministicTables(aggregate);
  const expertProfile = await getExpertProfile();
  const outcome = await draftCourtReport(aggregate, tasksToGenerate, clientKeys, deterministicTables.byTaskIndex);
  const taskResultByIndex = new Map(outcome.result.taskAnalyses.map((t) => [Number(t.taskId), t]));
  const taskTablesByIndex = new Map(outcome.result.taskTables.map((t) => [t.taskIndex, t.tables]));

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
      const existingValue = existingReport?.[field as keyof typeof existingReport];
      if (existingProvenance === "EXPERT_CERTIFIED" && hasRealContent(existingValue)) {
        preservedCertifiedFields++;
        continue; // النص الذي اعتمده الخبير فعلاً لا يُستبدَل بإعادة التوليد
      }
      reportData[field] = outcome.result.preliminarySections[field];
      reportData[`${field}Provenance`] = deterministicOfflineFields.has(field) ? "EXTRACT" : "AI_DRAFT";
    }
    if (
      existingReport?.settlementNarrativeProvenance === "EXPERT_CERTIFIED" &&
      hasRealContent(existingReport?.settlementNarrative)
    ) {
      preservedCertifiedFields++;
      delete reportData.settlementBeneficiary;
      delete reportData.settlementNarrative;
      delete reportData.settlementNarrativeProvenance;
    }

    // ثامناً: الخلاصة — حقل provenance واحد يحرس ثلاثة أعمدة معاً (نفس نمط
    // settlementNarrativeProvenance أعلاه). المحتوى نفسه بالكامل مجمَّع
    // حتمياً هنا (قالب ثابت + بنود منقولة حرفياً من "رأي خبرة" معتمَد فعلاً)
    // — provenance الافتراضي EXTRACT لا AI_DRAFT، لكن بوابة التصدير (لاحقاً)
    // تشترط EXPERT_CERTIFIED صراحةً على هذا الحقل بعينه بصرف النظر عن ذلك،
    // لأن الخلاصة أهم قسم في التقرير قانونياً ولا يكفي أن يكون محتواها
    // "حقيقياً" — يجب أن يراجعها الخبير كوحدة واحدة مجمَّعة قبل الاعتماد.
    if (
      existingReport?.conclusionProvenance === "EXPERT_CERTIFIED" &&
      hasRealConclusionItems(existingReport?.conclusionItemsJson)
    ) {
      preservedCertifiedFields++;
    } else {
      reportData.conclusionIntro = buildConclusionIntroText(aggregate.basics);
      reportData.conclusionItemsJson = JSON.stringify(certifiedVerdicts);
      reportData.conclusionClosing = buildConclusionClosingText(
        expertProfile && expertProfile.expertName.trim()
          ? {
              expertTitle: expertProfile.expertTitle,
              expertName: expertProfile.expertName,
              registrationNumber: expertProfile.registrationNumber,
            }
          : null,
      );
      reportData.conclusionProvenance = "EXTRACT";
    }

    const upserted = await tx.courtReport.upsert({
      where: { caseId },
      create: { caseId, ...reportData },
      update: reportData,
    });

    for (const task of aggregate.tasks) {
      const existing = existingTaskByIndex.get(task.taskIndex);
      const isCertified = existing?.expertVerdictProvenance === "EXPERT_CERTIFIED" && hasRealContent(existing?.expertVerdict);
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

      const upsertedTask = await tx.courtReportTask.upsert({
        where: { courtReportId_taskIndex: { courtReportId: upserted.id, taskIndex: task.taskIndex } },
        create: { courtReportId: upserted.id, taskIndex: task.taskIndex, ...taskData },
        update: taskData,
      });

      // جداول هذه المهمة: يُستبدَل ما لم يُعتمَد أو يُدخَل يدوياً فقط —
      // هذا الفرع من الحلقة أصلاً لا يُنفَّذ إلا لمهمة أُعيد توليدها أو
      // أُنشئت للمرة الأولى (المهام المعتمدة تُكمِل الحلقة أعلاه قبل الوصول
      // هنا)، فلا حاجة لفحص "wasRegenerated" مرة أخرى.
      const existingTaskTables = existingTablesByTaskId.get(upsertedTask.id) ?? [];
      const tablesToDelete = existingTaskTables.filter((t) => !isTablePreserved(t));
      if (tablesToDelete.length > 0) {
        await tx.courtReportTable.deleteMany({ where: { id: { in: tablesToDelete.map((t) => t.id) } } });
      }
      const preservedTableCount = existingTaskTables.length - tablesToDelete.length;
      const freshTables = taskTablesByIndex.get(task.taskIndex) ?? [];
      for (let i = 0; i < freshTables.length; i++) {
        const table: ProposedTable = freshTables[i];
        await tx.courtReportTable.create({
          data: {
            courtReportId: upserted.id,
            courtReportTaskId: upsertedTask.id,
            placement: "TASK",
            order: preservedTableCount + i,
            title: table.title,
            subtitle: table.subtitle ?? null,
            columnsJson: JSON.stringify(table.columns),
            rowsJson: JSON.stringify(table.rows),
            basisNote: table.basisNote,
            computation: table.computation,
            sourceDocumentIds: JSON.stringify(table.sourceDocumentIds),
            computationJson: table.computationJson ?? null,
          },
        });
      }
    }

    // جداول نطاق الفحص (خامساً، على مستوى التقرير لا مهمة بعينها) — نفس
    // منطق استبدال جداول المهام أعلاه، بمفتاح courtReportTaskId: null.
    // فارغة دوماً في هذا الإصدار (انظر تعليق DeterministicTablesResult في
    // lib/reports/financial-tables.ts) لكن الكود عام لأي إضافة مستقبلية.
    const existingScopeTables = existingTablesByTaskId.get(null) ?? [];
    const scopeTablesToDelete = existingScopeTables.filter((t) => !isTablePreserved(t));
    if (scopeTablesToDelete.length > 0) {
      await tx.courtReportTable.deleteMany({ where: { id: { in: scopeTablesToDelete.map((t) => t.id) } } });
    }
    const preservedScopeTableCount = existingScopeTables.length - scopeTablesToDelete.length;
    for (let i = 0; i < deterministicTables.scopeTables.length; i++) {
      const table = deterministicTables.scopeTables[i];
      await tx.courtReportTable.create({
        data: {
          courtReportId: upserted.id,
          courtReportTaskId: null,
          placement: "SCOPE",
          order: preservedScopeTableCount + i,
          title: table.title,
          subtitle: table.subtitle ?? null,
          columnsJson: JSON.stringify(table.columns),
          rowsJson: JSON.stringify(table.rows),
          basisNote: table.basisNote,
          computation: table.computation,
          sourceDocumentIds: JSON.stringify(table.sourceDocumentIds),
          computationJson: table.computationJson ?? null,
        },
      });
    }

    // مهام كانت موجودة سابقاً لكن تجاوز فهرسها عدد مهام المأمورية الحالي
    // (تقلّصت القائمة) — تُحذَف فقط إن لم تحمل رأي خبرة معتمَداً؛ أي مهمة
    // معتمَدة تبقى محفوظة (تُعرَض في الواجهة كـ"مهمة لم تعد ضمن المأمورية").
    for (const [taskIndex, existing] of existingTaskByIndex) {
      const stillCertified = existing.expertVerdictProvenance === "EXPERT_CERTIFIED" && hasRealContent(existing.expertVerdict);
      if (taskIndex >= aggregate.tasks.length && !stillCertified) {
        await tx.courtReportTask.delete({ where: { id: existing.id } });
      }
    }

    return tx.courtReport.findUniqueOrThrow({
      where: { id: upserted.id },
      include: {
        tasks: { orderBy: { taskIndex: "asc" } },
        tables: { orderBy: [{ placement: "asc" }, { order: "asc" }] },
        objections: { orderBy: [{ partyRole: "asc" }, { order: "asc" }] },
      },
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
      scopeNarrative: report.scopeNarrative,
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
    financialParsingWarnings: deterministicTables.warnings,
  });
}
