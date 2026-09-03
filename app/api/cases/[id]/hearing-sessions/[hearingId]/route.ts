import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateHearingSessionSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; hearingId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, hearingId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = updateHearingSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.hearingSession.findFirst({
    where: { id: hearingId, caseId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الاجتماع غير موجود" }, { status: 404 });
  }

  const { meetingDate, status, ...rest } = parsed.data;

  const session = await prisma.hearingSession.update({
    where: { id: hearingId },
    data: {
      ...rest,
      ...(meetingDate !== undefined ? { meetingDate: meetingDate ? new Date(meetingDate) : null } : {}),
      ...(status !== undefined ? { status } : {}),
      // بدء/انتهاء الاجتماع الفعليان يُسجَّلان تلقائياً أول مرة تتحول الحالة
      // إليها — طابع زمني حقيقي وموثوق، لا يُرسَل من العميل.
      ...(status === "IN_PROGRESS" && !existing.startedAt ? { startedAt: new Date() } : {}),
      ...(status === "COMPLETED" && !existing.endedAt ? { endedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({ hearingSession: session });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, hearingId } = await params;

  const existing = await prisma.hearingSession.findFirst({
    where: { id: hearingId, caseId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الاجتماع غير موجود" }, { status: 404 });
  }

  await prisma.hearingSession.delete({ where: { id: hearingId } });
  return NextResponse.json({ ok: true });
}
