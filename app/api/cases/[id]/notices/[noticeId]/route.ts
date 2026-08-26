import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string; noticeId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, noticeId } = await params;
  const notice = await prisma.notice.findFirst({ where: { id: noticeId, caseId } });
  if (!notice) {
    return NextResponse.json({ error: "الإخطار غير موجود" }, { status: 404 });
  }
  return NextResponse.json({ notice });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, noticeId } = await params;
  const notice = await prisma.notice.findFirst({ where: { id: noticeId, caseId } });
  if (!notice) {
    return NextResponse.json({ error: "الإخطار غير موجود" }, { status: 404 });
  }
  await prisma.notice.delete({ where: { id: noticeId } });
  return NextResponse.json({ ok: true });
}
