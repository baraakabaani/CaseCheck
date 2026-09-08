import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateCaseAnalysisSchema } from "@/lib/case-analysis-schemas";

interface RouteParams {
  params: Promise<{ id: string; analysisId: string }>;
}

// تعديل يدوي لأي حقل من نتائج التحليل الأولي (قبل الاعتماد أو بعده — انظر
// تعليق updateCaseAnalysisSchema) — بلا قيد على حالة الاعتماد: تعديل بعد
// الاعتماد لا يُعيد تشغيل الأثر الجانبي لزر "اعتماد" (تحويل المستندات
// الناقصة إلى صفوف Requirement فعلية) تلقائياً، فتعديل missingDocuments
// هنا بعد الاعتماد تعديل توثيقي فقط؛ أما mandateTasks فيُقرأ حياً من
// الموديول 4 في كل توليد تقرير، فتعديله ينعكس فوراً بلا أي إجراء إضافي.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, analysisId } = await params;

  const analysis = await prisma.caseAnalysis.findFirst({
    where: { id: analysisId, caseId },
  });
  if (!analysis) {
    return NextResponse.json({ error: "التحليل غير موجود" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateCaseAnalysisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة", issues: parsed.error.issues }, { status: 400 });
  }

  const {
    receivedDocuments,
    missingDocuments,
    mandateTasks,
    unclearPoints,
    claimantQuestions,
    respondentQuestions,
    expertNotes,
    ...rest
  } = parsed.data;

  const updated = await prisma.caseAnalysis.update({
    where: { id: analysisId },
    data: {
      ...rest,
      ...(mandateTasks ? { mandateTasks: JSON.stringify(mandateTasks) } : {}),
      ...(receivedDocuments ? { receivedDocumentsSummary: JSON.stringify(receivedDocuments) } : {}),
      ...(missingDocuments ? { missingDocuments: JSON.stringify(missingDocuments) } : {}),
      ...(unclearPoints ? { unclearPoints: JSON.stringify(unclearPoints) } : {}),
      ...(claimantQuestions ? { claimantQuestions: JSON.stringify(claimantQuestions) } : {}),
      ...(respondentQuestions ? { respondentQuestions: JSON.stringify(respondentQuestions) } : {}),
      ...(expertNotes ? { expertNotes: JSON.stringify(expertNotes) } : {}),
    },
  });

  return NextResponse.json({ analysis: updated });
}
