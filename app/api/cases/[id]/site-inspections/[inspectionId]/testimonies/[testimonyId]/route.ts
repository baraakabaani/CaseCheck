import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateSiteInspectionTestimonySchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; inspectionId: string; testimonyId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { inspectionId, testimonyId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = updateSiteInspectionTestimonySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.siteInspectionTestimony.findFirst({
    where: { id: testimonyId, siteInspectionId: inspectionId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الإفادة غير موجودة" }, { status: 404 });
  }

  const testimony = await prisma.siteInspectionTestimony.update({
    where: { id: testimonyId },
    data: parsed.data,
  });
  return NextResponse.json({ testimony });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { inspectionId, testimonyId } = await params;

  const existing = await prisma.siteInspectionTestimony.findFirst({
    where: { id: testimonyId, siteInspectionId: inspectionId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الإفادة غير موجودة" }, { status: 404 });
  }

  await prisma.siteInspectionTestimony.delete({ where: { id: testimonyId } });
  return NextResponse.json({ ok: true });
}
