import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateDocumentDemandSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; demandId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, demandId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = updateDocumentDemandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.documentDemand.findFirst({ where: { id: demandId, caseId } });
  if (!existing) {
    return NextResponse.json({ error: "المطالبة غير موجودة" }, { status: 404 });
  }

  const { deadline, requestedFromPartyIds, ...rest } = parsed.data;
  const demand = await prisma.documentDemand.update({
    where: { id: demandId },
    data: {
      ...rest,
      ...(deadline !== undefined ? { deadline: new Date(deadline) } : {}),
      ...(requestedFromPartyIds !== undefined
        ? { requestedFromPartyIds: JSON.stringify(requestedFromPartyIds) }
        : {}),
    },
  });

  return NextResponse.json({ demand });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, demandId } = await params;

  const existing = await prisma.documentDemand.findFirst({ where: { id: demandId, caseId } });
  if (!existing) {
    return NextResponse.json({ error: "المطالبة غير موجودة" }, { status: 404 });
  }

  await prisma.documentDemand.delete({ where: { id: demandId } });
  return NextResponse.json({ ok: true });
}
