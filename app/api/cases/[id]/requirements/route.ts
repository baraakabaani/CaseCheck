import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirementInputSchema } from "@/lib/schemas";
import { findPresetItem } from "@/lib/presets";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const addRequirementsSchema = z.object({
  requirements: z.array(requirementInputSchema).min(1),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = addRequirementsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const currentMax = await prisma.requirement.aggregate({
    where: { caseId },
    _max: { order: true },
  });
  let nextOrder = (currentMax._max.order ?? -1) + 1;

  const created = await prisma.$transaction(
    parsed.data.requirements.map((r) => {
      const preset = r.presetKey
        ? findPresetItem(caseRecord.caseType as "LITIGATION" | "ACCOUNTING_EXPERT", r.presetKey)
        : undefined;
      return prisma.requirement.create({
        data: {
          caseId,
          presetKey: r.presetKey ?? null,
          labelAr: r.labelAr,
          labelEn: r.labelEn ?? preset?.labelEn ?? null,
          category: r.category ?? preset?.category ?? null,
          description: r.description ?? preset?.description ?? null,
          periodStart: r.periodStart ? new Date(r.periodStart) : null,
          periodEnd: r.periodEnd ? new Date(r.periodEnd) : null,
          isRequired: r.isRequired,
          order: nextOrder++,
        },
      });
    }),
  );

  return NextResponse.json({ requirements: created }, { status: 201 });
}
