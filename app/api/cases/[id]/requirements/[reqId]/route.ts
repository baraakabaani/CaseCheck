import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateRequirementSchema } from "@/lib/schemas";

interface RouteParams {
  params: Promise<{ id: string; reqId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, reqId } = await params;

  const body = await req.json();
  const parsed = updateRequirementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.requirement.findFirst({
    where: { id: reqId, caseId },
  });
  if (!existing) {
    return NextResponse.json({ error: "المتطلب غير موجود" }, { status: 404 });
  }

  const { status, overrideNotes, manualOverride, ...rest } = parsed.data;
  const isStatusOverride = status !== undefined;

  const updated = await prisma.requirement.update({
    where: { id: reqId },
    data: {
      ...rest,
      ...(status !== undefined ? { status } : {}),
      ...(overrideNotes !== undefined ? { overrideNotes } : {}),
      manualOverride: manualOverride ?? (isStatusOverride ? true : undefined),
    },
  });

  return NextResponse.json({ requirement: updated });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, reqId } = await params;

  const existing = await prisma.requirement.findFirst({
    where: { id: reqId, caseId },
  });
  if (!existing) {
    return NextResponse.json({ error: "المتطلب غير موجود" }, { status: 404 });
  }

  await prisma.requirement.delete({ where: { id: reqId } });
  return NextResponse.json({ ok: true });
}
