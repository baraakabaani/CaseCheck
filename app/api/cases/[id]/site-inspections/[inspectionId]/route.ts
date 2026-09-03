import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateSiteInspectionSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; inspectionId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, inspectionId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = updateSiteInspectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.siteInspection.findFirst({
    where: { id: inspectionId, caseId },
  });
  if (!existing) {
    return NextResponse.json({ error: "سجل المعاينة غير موجود" }, { status: 404 });
  }

  const { attachmentDocumentIds, ...rest } = parsed.data;
  const inspection = await prisma.siteInspection.update({
    where: { id: inspectionId },
    data: {
      ...rest,
      ...(attachmentDocumentIds !== undefined
        ? { attachmentDocumentIds: JSON.stringify(attachmentDocumentIds) }
        : {}),
    },
  });

  return NextResponse.json({ inspection });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, inspectionId } = await params;

  const existing = await prisma.siteInspection.findFirst({
    where: { id: inspectionId, caseId },
  });
  if (!existing) {
    return NextResponse.json({ error: "سجل المعاينة غير موجود" }, { status: 404 });
  }

  await prisma.siteInspection.delete({ where: { id: inspectionId } });
  return NextResponse.json({ ok: true });
}
