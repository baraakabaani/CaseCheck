import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string; inspectionId: string }>;
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
