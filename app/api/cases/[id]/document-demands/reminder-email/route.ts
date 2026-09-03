import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateEmailInputSchema } from "@/lib/schemas";
import { generateEmailDraft } from "@/lib/email-templates";
import { getClientApiKeysFromRequest } from "@/lib/ai-client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function safeParseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// موديول 3 — خطاب تذكير بمطالبات المستندات المتأخرة (تجاوزت موعدها
// النهائي). يعيد استخدام lib/email-templates.ts's generateEmailDraft()
// دون أي تعديل — نفس المولّد المستخدم لخطاب المستندات الناقصة في الموديول
// 1، بمدخلات مختلفة فقط.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      parties: true,
      documentDemands: { where: { status: { not: "RECEIVED" } } },
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

  const now = new Date();
  const overdue = caseRecord.documentDemands.filter((d) => new Date(d.deadline) < now);
  if (overdue.length === 0) {
    return NextResponse.json({ error: "لا توجد مطالبات مستندات متأخرة حالياً" }, { status: 400 });
  }

  const partyById = new Map(caseRecord.parties.map((p) => [p.id, p.name]));

  try {
    const clientKeys = getClientApiKeysFromRequest(req);
    const outcome = await generateEmailDraft(
      {
        caseNumber: caseRecord.caseNumber,
        title: caseRecord.title,
        court: caseRecord.court,
        clientName: caseRecord.clientName,
      },
      overdue.map((d) => {
        const requestedFrom = safeParseJson<string[]>(d.requestedFromPartyIds, [])
          .map((id) => partyById.get(id) ?? id)
          .join("، ");
        const deadlineLabel = new Date(d.deadline).toLocaleDateString("ar-EG-u-ca-gregory");
        return {
          labelAr: d.item,
          status: "MISSING" as const,
          notes: `متأخرة عن الموعد النهائي (${deadlineLabel})${requestedFrom ? ` — مطلوبة من: ${requestedFrom}` : ""}${d.notes ? ` — ${d.notes}` : ""}`,
        };
      }),
      parsed.data,
      clientKeys,
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
      { error: err instanceof Error ? err.message : "فشل إنشاء خطاب التذكير" },
      { status: 502 },
    );
  }
}
