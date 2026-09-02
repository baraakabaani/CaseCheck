import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateHearingSessionSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// موديول 2 — حالة اجتماع الخبرة الأول (نسخة v1: صف واحد لكل دعوى، يُنشأ
// عند أول تحديث بدل اشتراط إنشائه مسبقاً).
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateHearingSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { meetingDate, ...rest } = parsed.data;
  const data = {
    ...rest,
    ...(meetingDate !== undefined ? { meetingDate: meetingDate ? new Date(meetingDate) : null } : {}),
  };

  const session = await prisma.hearingSession.upsert({
    where: { caseId },
    create: { caseId, ...data },
    update: data,
  });

  return NextResponse.json({ hearingSession: session });
}
