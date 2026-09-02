import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { matchDocumentsToRequirements } from "@/lib/ai-matcher";
import { getClientApiKeysFromRequest } from "@/lib/ai-client";
import type { CaseType, DocCategory } from "@/lib/schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      requirements: { orderBy: { order: "asc" } },
      documents: { orderBy: { uploadedAt: "asc" } },
    },
  });

  if (!caseRecord) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }

  const analyzable = caseRecord.requirements.filter((r) => !r.manualOverride);
  if (analyzable.length === 0) {
    return NextResponse.json({
      message: "لا توجد متطلبات تحتاج إلى تحليل (كلها معدّلة يدوياً)",
      requirements: caseRecord.requirements,
    });
  }

  const clientKeys = getClientApiKeysFromRequest(req);

  let outcome;
  try {
    outcome = await matchDocumentsToRequirements(
      analyzable.map((r) => ({
        id: r.id,
        labelAr: r.labelAr,
        labelEn: r.labelEn,
        category: r.category,
        description: r.description,
        presetKey: r.presetKey,
        periodStart: r.periodStart?.toISOString() ?? null,
        periodEnd: r.periodEnd?.toISOString() ?? null,
        isRequired: r.isRequired,
      })),
      caseRecord.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileKind: d.fileKind,
        detectedDates: safeParseDates(d.detectedDates),
        text: d.extractedText ?? "",
        note: d.detectedPeriod,
        parseStatus: d.parseStatus,
        docCategory: d.docCategory as DocCategory | null,
      })),
      caseRecord.caseType as CaseType,
      clientKeys,
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "فشل تشغيل محرك المطابقة",
      },
      { status: 502 },
    );
  }

  const updatedRequirements = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const result of outcome.response.results) {
      const requirement = analyzable.find((r) => r.id === result.requirementId);
      if (!requirement) continue;

      await tx.requirementMatch.deleteMany({ where: { requirementId: requirement.id } });

      const updated = await tx.requirement.update({
        where: { id: requirement.id },
        data: {
          status: result.status,
          aiNotes: result.reasoning,
          aiConfidence: result.confidence,
          matches: {
            create: result.matchedDocuments
              .filter((m) => caseRecord.documents.some((d) => d.id === m.documentId))
              .map((m) => ({
                documentId: m.documentId,
                confidence: m.relevance,
                reasoning: m.note ?? null,
                pageRefs: m.pageRefs ?? null,
              })),
          },
        },
        include: { matches: { include: { document: true } } },
      });
      results.push(updated);
    }
    return results;
  });

  const finalRequirements = await prisma.requirement.findMany({
    where: { caseId },
    orderBy: { order: "asc" },
    include: { matches: { include: { document: true } } },
  });

  return NextResponse.json({
    requirements: finalRequirements,
    analyzedCount: updatedRequirements.length,
    mode: outcome.mode,
    warning: outcome.warning ?? null,
  });
}

function safeParseDates(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
