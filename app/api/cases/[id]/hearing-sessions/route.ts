import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hearingSessionInputSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = hearingSessionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { meetingDate, ...rest } = parsed.data;
  const session = await prisma.hearingSession.create({
    data: {
      caseId,
      ...rest,
      meetingDate: meetingDate ? new Date(meetingDate) : null,
    },
  });

  return NextResponse.json({ hearingSession: session }, { status: 201 });
}
