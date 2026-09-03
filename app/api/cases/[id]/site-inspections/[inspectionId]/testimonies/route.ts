import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { siteInspectionTestimonyInputSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; inspectionId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, inspectionId } = await params;

  const inspection = await prisma.siteInspection.findFirst({
    where: { id: inspectionId, caseId },
  });
  if (!inspection) {
    return NextResponse.json({ error: "سجل المعاينة غير موجود" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = siteInspectionTestimonyInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const count = await prisma.siteInspectionTestimony.count({ where: { siteInspectionId: inspectionId } });
  const testimony = await prisma.siteInspectionTestimony.create({
    data: { siteInspectionId: inspectionId, ...parsed.data, order: count },
  });

  return NextResponse.json({ testimony }, { status: 201 });
}
