import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createCaseSchema } from "@/lib/schemas";
import { findPresetItem } from "@/lib/presets";

export async function GET() {
  const cases = await prisma.case.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { documents: true, requirements: true } },
      requirements: { select: { status: true } },
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

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { requirements, clientEmail, ...caseData } = parsed.data;

  const created = await prisma.case.create({
    data: {
      ...caseData,
      clientEmail: clientEmail || null,
      requirements: {
        create: requirements.map((r, index) => {
          const preset = r.presetKey
            ? findPresetItem(caseData.caseType, r.presetKey)
            : undefined;
          return {
            presetKey: r.presetKey ?? null,
            labelAr: r.labelAr,
            labelEn: r.labelEn ?? preset?.labelEn ?? null,
            category: r.category ?? preset?.category ?? null,
            description: r.description ?? preset?.description ?? null,
            periodStart: r.periodStart ? new Date(r.periodStart) : null,
            periodEnd: r.periodEnd ? new Date(r.periodEnd) : null,
            isRequired: r.isRequired,
            order: r.order ?? index,
          };
        }),
      },
    },
    include: { requirements: true },
  });

  return NextResponse.json({ case: created }, { status: 201 });
}
