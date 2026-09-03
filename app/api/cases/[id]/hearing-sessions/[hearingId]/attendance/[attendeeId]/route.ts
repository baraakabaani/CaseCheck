import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateHearingAttendanceSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; hearingId: string; attendeeId: string }>;
}

// الحضور الفعلي (roll call) لهذا الاجتماع تحديداً — منفصل عن
// MeetingAttendee.attendanceStatus (الحالة المتوقعة قبل الاجتماع).
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, hearingId, attendeeId } = await params;

  const [session, attendee] = await Promise.all([
    prisma.hearingSession.findFirst({ where: { id: hearingId, caseId } }),
    prisma.meetingAttendee.findFirst({ where: { id: attendeeId, caseId } }),
  ]);
  if (!session || !attendee) {
    return NextResponse.json({ error: "الاجتماع أو الحاضر غير موجود" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateHearingAttendanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const record = await prisma.hearingAttendanceRecord.upsert({
    where: { hearingSessionId_attendeeId: { hearingSessionId: hearingId, attendeeId } },
    create: { hearingSessionId: hearingId, attendeeId, status: parsed.data.status, markedAt: new Date() },
    update: { status: parsed.data.status, markedAt: new Date() },
  });

  return NextResponse.json({ attendanceRecord: record });
}
