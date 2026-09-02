import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateMeetingAttendeeSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; attendeeId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, attendeeId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = updateMeetingAttendeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.meetingAttendee.findFirst({
    where: { id: attendeeId, caseId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الحاضر غير موجود" }, { status: 404 });
  }

  const attendee = await prisma.meetingAttendee.update({
    where: { id: attendeeId },
    data: parsed.data,
  });
  return NextResponse.json({ attendee });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, attendeeId } = await params;

  const existing = await prisma.meetingAttendee.findFirst({
    where: { id: attendeeId, caseId },
  });
  if (!existing) {
    return NextResponse.json({ error: "الحاضر غير موجود" }, { status: 404 });
  }

  await prisma.meetingAttendee.delete({ where: { id: attendeeId } });
  return NextResponse.json({ ok: true });
}
