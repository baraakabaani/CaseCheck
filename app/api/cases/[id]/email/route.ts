import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateEmailInputSchema } from "@/lib/schemas";
import { generateEmailDraft } from "@/lib/email-templates";
import { getClientApiKeyFromRequest } from "@/lib/groq-client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;
  const drafts = await prisma.emailDraft.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ drafts });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      requirements: {
        where: { status: { in: ["MISSING", "PARTIALLY_PROVIDED"] } },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!caseRecord) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = generateEmailInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (caseRecord.requirements.length === 0) {
    return NextResponse.json(
      { error: "لا توجد مستندات ناقصة أو غير مكتملة — الملف مكتمل" },
      { status: 400 },
    );
  }

  try {
    const clientApiKey = getClientApiKeyFromRequest(req);
    const outcome = await generateEmailDraft(
      {
        caseNumber: caseRecord.caseNumber,
        title: caseRecord.title,
        court: caseRecord.court,
        clientName: caseRecord.clientName,
      },
      caseRecord.requirements.map((r) => ({
        labelAr: r.labelAr,
        status: r.status as "PARTIALLY_PROVIDED" | "MISSING",
        notes: r.overrideNotes ?? r.aiNotes,
      })),
      parsed.data,
      clientApiKey,
    );

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + parsed.data.deadlineDays);

    const draft = await prisma.emailDraft.create({
      data: {
        caseId,
        subject: outcome.content.subject,
        bodyAr: outcome.content.bodyAr,
        deadline,
      },
    });

    return NextResponse.json(
      { draft, mode: outcome.mode, warning: outcome.warning ?? null },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "فشل إنشاء مسودة البريد" },
      { status: 502 },
    );
  }
}
