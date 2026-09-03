import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildHearingMinutesText } from "@/lib/hearing-minutes";
import type { AttendanceStatus, MeetingAttendeeRole } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; hearingId: string }>;
}

function safeParseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// إنهاء الاجتماع وتوليد مسودة محضر الجلسة: يضبط الحالة COMPLETED
// وendedAt، ويجمّع minutesDraft من البيانات المنظمة المسجَّلة (لا يستدعي
// الذكاء الاصطناعي — انظر lib/hearing-minutes.ts).
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, hearingId } = await params;

  const session = await prisma.hearingSession.findFirst({
    where: { id: hearingId, caseId },
    include: {
      questions: { orderBy: { order: "asc" } },
      attendanceRecords: { include: { attendee: true } },
      documentDemands: { orderBy: { deadline: "asc" } },
    },
  });
  if (!session) {
    return NextResponse.json({ error: "الاجتماع غير موجود" }, { status: 404 });
  }

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: { parties: true },
  });
  if (!caseRecord) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }
  const partyById = new Map(caseRecord.parties.map((p) => [p.id, p.name]));

  const minutesDraft = buildHearingMinutesText({
    caseNumber: caseRecord.caseNumber,
    court: caseRecord.court,
    label: session.label,
    meetingDate: session.meetingDate,
    meetingTime: session.meetingTime,
    meetingMethod: session.meetingMethod,
    openingNotes: session.openingNotes,
    attendance: session.attendanceRecords.map((r) => ({
      name: r.attendee.name,
      role: r.attendee.role as MeetingAttendeeRole,
      representingParty: r.attendee.representingParty,
      status: r.status as AttendanceStatus,
    })),
    questions: session.questions.map((q) => ({
      partyRole: q.partyRole as "CLAIMANT" | "RESPONDENT",
      questionText: q.questionText,
      answerText: q.answerText,
      status: q.status,
    })),
    documentDemands: session.documentDemands.map((d) => ({
      item: d.item,
      requestedFrom: safeParseJson<string[]>(d.requestedFromPartyIds, [])
        .map((id) => partyById.get(id) ?? id)
        .join("، "),
      deadline: d.deadline,
    })),
  });

  const updated = await prisma.hearingSession.update({
    where: { id: hearingId },
    data: {
      status: "COMPLETED",
      endedAt: session.endedAt ?? new Date(),
      minutesDraft,
    },
  });

  return NextResponse.json({ hearingSession: updated });
}
