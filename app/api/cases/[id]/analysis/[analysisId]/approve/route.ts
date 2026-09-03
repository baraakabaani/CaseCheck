import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { MissingDocumentItem } from "@/lib/case-analysis-schemas";

interface RouteParams {
  params: Promise<{ id: string; analysisId: string }>;
}

// اعتماد التحليل الأولي: يحوّل قائمة "المستندات الناقصة" إلى صفوف Requirement
// فعلية، فتستمر شاشة المتطلبات ونموذج الإخطار بالعمل كما هي دون أي تعديل،
// وينهي معالج فتح الملف (Case.intakeStatus = ACTIVE).
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, analysisId } = await params;

  const analysis = await prisma.caseAnalysis.findFirst({
    where: { id: analysisId, caseId },
  });
  if (!analysis) {
    return NextResponse.json({ error: "التحليل غير موجود" }, { status: 404 });
  }
  if (analysis.status === "APPROVED") {
    return NextResponse.json({ error: "تم اعتماد هذا التحليل مسبقاً" }, { status: 400 });
  }

  const missingDocuments = safeParseJson<MissingDocumentItem[]>(analysis.missingDocuments, []);

  const [, , updatedCase] = await prisma.$transaction([
    prisma.caseAnalysis.update({
      where: { id: analysisId },
      data: { status: "APPROVED", approvedAt: new Date() },
    }),
    prisma.requirement.createMany({
      data: missingDocuments.map((m, index) => ({
        caseId,
        labelAr: m.item,
        description: m.reason,
        status: "MISSING",
        aiNotes: m.reason,
        relatedTask: m.relatedTask ?? null,
        order: index,
      })),
    }),
    prisma.case.update({
      where: { id: caseId },
      data: { intakeStatus: "ACTIVE" },
    }),
  ]);

  return NextResponse.json({ case: updatedCase, createdRequirements: missingDocuments.length });
}

function safeParseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
