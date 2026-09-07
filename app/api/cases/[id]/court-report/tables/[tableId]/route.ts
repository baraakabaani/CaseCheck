import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateCourtReportTableSchema, type CourtReportTableRow } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; tableId: string }>;
}

/** "معتمد من الخبير" على جدول بلا أي رقم/نص فعلي في صفوفه لا يعني شيئاً —
 * نفس قاعدة hasRealContent المطبَّقة على حقول التقرير النصية
 * (app/api/cases/[id]/court-report/draft/route.ts)، بصيغتها لجدول: صف
 * واحد حقيقي على الأقل يحمل خلية غير فارغة. */
function hasRealTableContent(rowsJson: string): boolean {
  try {
    const rows = JSON.parse(rowsJson) as CourtReportTableRow[];
    return rows.some((r) => r.cells.some((c) => c.trim().length > 0));
  } catch {
    return false;
  }
}

// موديول 4 — تعديل/اعتماد/حذف جدول واحد. نفس نمط
// court-report/tasks/[taskId]/route.ts، مع بوابة إضافية خاصة بالجداول:
// اعتماد جدول بصفوف فارغة فعلياً مرفوض صراحةً (400)، لا مجرد تحذير لاحق
// عند التصدير — الجدول عنصر بصري يظهر في متن التقرير مباشرة، فارغاً كان
// أو ممتلئاً، خلافاً لحقل نصي قد يُترَك فارغاً بلا أثر بصري.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, tableId } = await params;

  const table = await prisma.courtReportTable.findFirst({
    where: { id: tableId, courtReport: { caseId } },
  });
  if (!table) {
    return NextResponse.json({ error: "الجدول غير موجود" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateCourtReportTableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة", issues: parsed.error.issues }, { status: 400 });
  }
  const { columns, rows, ...rest } = parsed.data;
  const nextRowsJson = rows ? JSON.stringify(rows) : table.rowsJson;

  if (rest.provenance === "EXPERT_CERTIFIED" && !hasRealTableContent(nextRowsJson)) {
    return NextResponse.json({ error: "لا يمكن اعتماد جدول بلا صفوف/أرقام فعلية — أضف بيانات الجدول أولاً" }, { status: 400 });
  }

  const updated = await prisma.courtReportTable.update({
    where: { id: tableId },
    data: {
      ...rest,
      ...(columns ? { columnsJson: JSON.stringify(columns) } : {}),
      ...(rows ? { rowsJson: nextRowsJson } : {}),
    },
  });

  return NextResponse.json({ table: updated });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, tableId } = await params;

  const table = await prisma.courtReportTable.findFirst({
    where: { id: tableId, courtReport: { caseId } },
  });
  if (!table) {
    return NextResponse.json({ error: "الجدول غير موجود" }, { status: 404 });
  }

  await prisma.courtReportTable.delete({ where: { id: tableId } });
  return NextResponse.json({ ok: true });
}
