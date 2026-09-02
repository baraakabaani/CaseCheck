import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeCaseFile } from "@/lib/case-analyzer";
import { getClientApiKeyFromRequest } from "@/lib/groq-client";
import type { MandateNatureOption, LitigationDegree, CaseCategory } from "@/lib/schemas";
import { LITIGATION_DEGREE_LABELS, CASE_CATEGORY_LABELS } from "@/lib/case-intake-labels";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// المرحلة 4 — يقرأ الذكاء الاصطناعي كل المستندات المرفوعة في المرحلة 3
// وينتج تقرير "ملخص التحليل الأولي" الذي يراجعه الخبير ويعتمده.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      parties: { orderBy: { order: "asc" } },
      documents: { orderBy: { uploadedAt: "asc" } },
    },
  });
  if (!caseRecord) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }
  if (caseRecord.documents.length === 0) {
    return NextResponse.json(
      { error: "الرجاء رفع مستندات ملف الدعوى أولاً" },
      { status: 400 },
    );
  }

  const clientApiKey = getClientApiKeyFromRequest(req);

  let outcome;
  try {
    outcome = await analyzeCaseFile(
      {
        caseNumber: caseRecord.caseNumber,
        court: caseRecord.court,
        circuit: caseRecord.circuit,
        litigationDegreeLabel: caseRecord.litigationDegree
          ? LITIGATION_DEGREE_LABELS[caseRecord.litigationDegree as LitigationDegree]
          : null,
        caseCategoryLabel: caseRecord.caseCategory
          ? CASE_CATEGORY_LABELS[caseRecord.caseCategory as CaseCategory]
          : null,
        title: caseRecord.title,
        mandateNature: safeParseJson<MandateNatureOption[]>(caseRecord.mandateNature, []),
      },
      caseRecord.parties.map((p) => ({
        id: p.id,
        role: p.role as "CLAIMANT" | "RESPONDENT",
        name: p.name,
      })),
      caseRecord.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileKind: d.fileKind,
        text: d.extractedText ?? "",
        detectedDates: safeParseJson<string[]>(d.detectedDates, []),
      })),
      clientApiKey,
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "فشل تشغيل التحليل الأولي" },
      { status: 502 },
    );
  }

  const validDocumentIds = new Set(caseRecord.documents.map((d) => d.id));
  const validPartyIds = new Set(caseRecord.parties.map((p) => p.id));

  const [analysis] = await prisma.$transaction([
    prisma.caseAnalysis.create({
      data: {
        caseId,
        status: "DRAFT",
        mode: outcome.mode,
        caseSummary: outcome.result.caseSummary,
        mandateText: outcome.result.mandateText,
        mandateTasks: JSON.stringify(outcome.result.mandateTasks),
        receivedDocumentsSummary: JSON.stringify(outcome.result.receivedDocuments),
        missingDocuments: JSON.stringify(outcome.result.missingDocuments),
        unclearPoints: JSON.stringify(outcome.result.unclearPoints),
        claimantQuestions: JSON.stringify(outcome.result.claimantQuestions),
        respondentQuestions: JSON.stringify(outcome.result.respondentQuestions),
        expertNotes: JSON.stringify(outcome.result.expertNotes),
      },
    }),
    prisma.case.update({ where: { id: caseId }, data: { intakeStatus: "DRAFT_PHASE_4" } }),
    // تصنيف كل مستند وتحديد الطرف الذي قدّمه — دون الحاجة لتصنيف يدوي عند الرفع.
    ...outcome.result.receivedDocuments
      .filter((rd) => validDocumentIds.has(rd.documentId))
      .map((rd) =>
        prisma.document.update({
          where: { id: rd.documentId },
          data: {
            docCategory: rd.docCategory,
            submittedByPartyId:
              rd.submittedByPartyId && validPartyIds.has(rd.submittedByPartyId)
                ? rd.submittedByPartyId
                : null,
          },
        }),
      ),
  ]);

  return NextResponse.json(
    { analysis, mode: outcome.mode, warning: outcome.warning ?? null },
    { status: 201 },
  );
}

function safeParseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
