import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateCourtReportSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// موديول 4 — مسودة التقرير القضائي (نسخة v1: حقول نصية حرة لكل تبويب،
// تُحفظ تلقائياً؛ صف واحد لكل دعوى يُنشأ عند أول حفظ).
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateCourtReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const report = await prisma.courtReport.upsert({
    where: { caseId },
    create: { caseId, ...parsed.data },
    update: parsed.data,
  });

  return NextResponse.json({ courtReport: report });
}
