import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateReportObjectionSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; objectionId: string }>;
}

/** نفس قاعدة hasRealContent (court-report/draft/route.ts) — لا اعتماد رد
 * فارغ فعلياً على اعتراض، حتى لو حمل الوسم EXPERT_CERTIFIED. */
function hasRealContent(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, objectionId } = await params;

  const objection = await prisma.reportObjection.findFirst({
    where: { id: objectionId, courtReport: { caseId } },
  });
  if (!objection) {
    return NextResponse.json({ error: "الاعتراض غير موجود" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateReportObjectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة", issues: parsed.error.issues }, { status: 400 });
  }
  const { objectionMemoDate, ...rest } = parsed.data;
  const nextResponseText = rest.responseText !== undefined ? rest.responseText : objection.responseText;

  if (rest.responseProvenance === "EXPERT_CERTIFIED" && !hasRealContent(nextResponseText)) {
    return NextResponse.json({ error: "لا يمكن اعتماد رد فارغ — اكتب رد الخبير على الاعتراض أولاً" }, { status: 400 });
  }

  const updated = await prisma.reportObjection.update({
    where: { id: objectionId },
    data: {
      ...rest,
      ...(objectionMemoDate !== undefined
        ? { objectionMemoDate: objectionMemoDate ? new Date(objectionMemoDate) : null }
        : {}),
    },
  });

  return NextResponse.json({ objection: updated });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, objectionId } = await params;

  const objection = await prisma.reportObjection.findFirst({
    where: { id: objectionId, courtReport: { caseId } },
  });
  if (!objection) {
    return NextResponse.json({ error: "الاعتراض غير موجود" }, { status: 404 });
  }

  await prisma.reportObjection.delete({ where: { id: objectionId } });
  return NextResponse.json({ ok: true });
}
