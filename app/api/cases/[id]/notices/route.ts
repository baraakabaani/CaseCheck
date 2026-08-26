import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createNoticeSchema } from "@/lib/notice-schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;
  const notices = await prisma.notice.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ notices });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createNoticeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const {
    referenceLetterDate,
    meetingDate,
    meetingLink,
    meetingId,
    meetingPasscode,
    referenceLetterNumber,
    addressees,
    requestedItems,
    ...rest
  } = parsed.data;

  const notice = await prisma.notice.create({
    data: {
      ...rest,
      caseId,
      referenceLetterNumber: referenceLetterNumber || null,
      referenceLetterDate: referenceLetterDate ? new Date(referenceLetterDate) : null,
      meetingDate: new Date(meetingDate),
      meetingLink: meetingLink || null,
      meetingId: meetingId || null,
      meetingPasscode: meetingPasscode || null,
      addressees: JSON.stringify(addressees),
      requestedItems: JSON.stringify(requestedItems),
    },
  });

  return NextResponse.json({ notice }, { status: 201 });
}
