import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reportObjectionInputSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// موديول 4 — تسجيل اعتراض ورد عليه من ملف عرض التقرير المبدئي على
// الأطراف. objectionText يُدخَله الخبير اقتباساً حرفياً من مذكرة اعتراض
// حقيقية، لذا provenance الافتراضي EXTRACT (منقول حرفياً)، لا AI_DRAFT —
// خلافاً لأي نص توليدي آخر في هذا التطبيق. الرد (responseText) يبدأ فارغاً
// دوماً؛ لا صياغة آلية جماعية للردود على اعتراضات خصم (قرار مقصود، انظر
// خطة الميزة — لا مسوّغ حتمي لرد تلقائي على دفع خصومي).
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const courtReport = await prisma.courtReport.findUnique({ where: { caseId } });
  if (!courtReport) {
    return NextResponse.json({ error: "لم يُولَّد التقرير القضائي لهذه الدعوى بعد" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = reportObjectionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة", issues: parsed.error.issues }, { status: 400 });
  }
  const { objectionMemoDate, ...rest } = parsed.data;

  const order =
    rest.order ??
    (await prisma.reportObjection.count({ where: { courtReportId: courtReport.id, partyRole: rest.partyRole } }));

  const objection = await prisma.reportObjection.create({
    data: {
      courtReportId: courtReport.id,
      ...rest,
      order,
      objectionMemoDate: objectionMemoDate ? new Date(objectionMemoDate) : null,
      objectionProvenance: "EXTRACT",
    },
  });

  return NextResponse.json({ objection }, { status: 201 });
}
