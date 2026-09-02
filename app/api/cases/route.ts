import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { caseIntakeStep1Schema } from "@/lib/schemas";

export async function GET() {
  const cases = await prisma.case.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { documents: true, requirements: true } },
      requirements: { select: { status: true } },
      parties: { orderBy: { order: "asc" } },
    },
  });

  const withMetrics = cases.map(({ requirements, _count, ...c }) => {
    const total = requirements.length;
    const provided = requirements.filter((r) => r.status === "PROVIDED").length;
    const partial = requirements.filter(
      (r) => r.status === "PARTIALLY_PROVIDED",
    ).length;
    const missing = requirements.filter((r) => r.status === "MISSING").length;
    return {
      ...c,
      documentCount: _count.documents,
      requirementCount: total,
      metrics: { total, provided, partial, missing },
    };
  });

  return NextResponse.json({ cases: withMetrics });
}

// المرحلة 1 — بيانات القضية الأساسية. ينشئ الدعوى بحالة DRAFT_PHASE_2 ليكمل
// المستخدم بقية معالج الفتح (بيانات المأمورية، رفع المستندات، التحليل الأولي).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = caseIntakeStep1Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { claimants, respondents, clientEmail, title, ...rest } = parsed.data;

  const created = await prisma.case.create({
    data: {
      ...rest,
      title: title?.trim() || rest.caseNumber,
      clientEmail: clientEmail || null,
      caseType: "ACCOUNTING_EXPERT",
      intakeStatus: "DRAFT_PHASE_2",
      parties: {
        create: [
          ...claimants.map((name, order) => ({ role: "CLAIMANT", name, order })),
          ...respondents.map((name, order) => ({ role: "RESPONDENT", name, order })),
        ],
      },
    },
    include: { parties: true },
  });

  return NextResponse.json({ case: created }, { status: 201 });
}
