import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateHearingQuestionSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; hearingId: string; questionId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { hearingId, questionId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = updateHearingQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.hearingQuestion.findFirst({
    where: { id: questionId, hearingSessionId: hearingId },
  });
  if (!existing) {
    return NextResponse.json({ error: "السؤال غير موجود" }, { status: 404 });
  }

  const question = await prisma.hearingQuestion.update({
    where: { id: questionId },
    data: parsed.data,
  });
  return NextResponse.json({ question });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { hearingId, questionId } = await params;

  const existing = await prisma.hearingQuestion.findFirst({
    where: { id: questionId, hearingSessionId: hearingId },
  });
  if (!existing) {
    return NextResponse.json({ error: "السؤال غير موجود" }, { status: 404 });
  }

  await prisma.hearingQuestion.delete({ where: { id: questionId } });
  return NextResponse.json({ ok: true });
}
