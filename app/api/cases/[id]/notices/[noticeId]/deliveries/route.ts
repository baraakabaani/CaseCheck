import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateNoticeDeliverySchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; noticeId: string }>;
}

// تبديل حالة تسليم الإخطار لحاضر/وكيل بعينه — يُنشئ سجل التسليم إن لم
// يوجد (upsert وفق القيد الفريد notice+attendee).
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, noticeId } = await params;

  const body = await req.json().catch(() => ({}));
  const attendeeId = typeof body?.attendeeId === "string" ? body.attendeeId : null;
  if (!attendeeId) {
    return NextResponse.json({ error: "معرّف الحاضر مطلوب" }, { status: 400 });
  }
  const parsed = updateNoticeDeliverySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [notice, attendee] = await Promise.all([
    prisma.notice.findFirst({ where: { id: noticeId, caseId } }),
    prisma.meetingAttendee.findFirst({ where: { id: attendeeId, caseId } }),
  ]);
  if (!notice || !attendee) {
    return NextResponse.json({ error: "الإخطار أو الحاضر غير موجود" }, { status: 404 });
  }

  const status = parsed.data.status;
  const delivery = await prisma.noticeDelivery.upsert({
    where: { noticeId_attendeeId: { noticeId, attendeeId } },
    create: {
      noticeId,
      attendeeId,
      status,
      acknowledgedAt: status === "ACKNOWLEDGED" ? new Date() : null,
    },
    update: {
      status,
      acknowledgedAt: status === "ACKNOWLEDGED" ? new Date() : null,
    },
  });

  return NextResponse.json({ delivery });
}
