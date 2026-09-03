import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { documentDemandInputSchema } from "@/lib/hub-schemas";

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
  const parsed = documentDemandInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { deadline, requestedFromPartyIds, hearingSessionId, ...rest } = parsed.data;
  const demand = await prisma.documentDemand.create({
    data: {
      caseId,
      ...rest,
      hearingSessionId: hearingSessionId || null,
      deadline: new Date(deadline),
      requestedFromPartyIds: JSON.stringify(requestedFromPartyIds),
    },
  });

  return NextResponse.json({ demand }, { status: 201 });
}
