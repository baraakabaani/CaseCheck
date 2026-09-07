import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { courtReportTableInputSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// موديول 4 — إضافة جدول يدوي (زر "إضافة جدول يدوي" في واجهة مهمة/نطاق
// الفحص). الجداول الحتمية وAI_PROPOSED تُنشأ فقط من مسار التوليد
// /court-report/draft؛ هذا المسار الوحيد الذي ينشئ صفاً بـ computation:
// "MANUAL". provenance يبقى AI_DRAFT الافتراضي حتى أول تعديل/اعتماد من
// الخبير (نفس قاعدة EDIT⇒EXPERT_CERTIFIED المتّبعة في كل حقول التقرير).
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const courtReport = await prisma.courtReport.findUnique({ where: { caseId } });
  if (!courtReport) {
    return NextResponse.json({ error: "لم يُولَّد التقرير القضائي لهذه الدعوى بعد" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = courtReportTableInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة", issues: parsed.error.issues }, { status: 400 });
  }
  const { columns, rows, courtReportTaskId, ...rest } = parsed.data;

  if (courtReportTaskId) {
    const task = await prisma.courtReportTask.findFirst({
      where: { id: courtReportTaskId, courtReportId: courtReport.id },
    });
    if (!task) {
      return NextResponse.json({ error: "قسم المهمة غير موجود ضمن هذا التقرير" }, { status: 400 });
    }
  }

  const order =
    rest.order ??
    (await prisma.courtReportTable.count({
      where: { courtReportId: courtReport.id, placement: rest.placement, courtReportTaskId: courtReportTaskId ?? null },
    }));

  const table = await prisma.courtReportTable.create({
    data: {
      courtReportId: courtReport.id,
      courtReportTaskId: courtReportTaskId ?? null,
      placement: rest.placement,
      order,
      title: rest.title,
      subtitle: rest.subtitle ?? null,
      columnsJson: JSON.stringify(columns),
      rowsJson: JSON.stringify(rows),
      basisNote: rest.basisNote ?? null,
      computation: "MANUAL",
    },
  });

  return NextResponse.json({ table }, { status: 201 });
}
