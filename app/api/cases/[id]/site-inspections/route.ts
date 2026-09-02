import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { siteInspectionInputSchema } from "@/lib/hub-schemas";

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
  const parsed = siteInspectionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { visitDate, attendees, notes, ...rest } = parsed.data;
  const inspection = await prisma.siteInspection.create({
    data: {
      caseId,
      ...rest,
      visitDate: new Date(visitDate),
      attendees: JSON.stringify(attendees),
      notes: notes || null,
    },
  });

  return NextResponse.json({ inspection }, { status: 201 });
}
