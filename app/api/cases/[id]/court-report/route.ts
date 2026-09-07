import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateCourtReportSchema } from "@/lib/hub-schemas";
import { isExportBlocked } from "@/lib/reports/provenance";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// موديول 4 (v2) — حفظ الأقسام التمهيدية وخلاصة التصفية، والانتقال بين
// DRAFT/FINAL. اعتماد التقرير (FINAL) محجوب فعلياً هنا (لا في الواجهة
// فقط) ما لم يُعتمَد "رأي الخبرة" في كل مهمة — هذه هي البوابة الملزمة.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateCourtReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة", issues: parsed.error.issues }, { status: 400 });
  }

  if (parsed.data.status === "FINAL") {
    const tasks = await prisma.courtReportTask.findMany({
      where: { courtReport: { caseId } },
      select: { taskIndex: true, expertVerdictProvenance: true },
      orderBy: { taskIndex: "asc" },
    });
    const gate = isExportBlocked(tasks);
    if (gate.blocked) {
      return NextResponse.json(
        {
          error:
            tasks.length === 0
              ? "لا يمكن اعتماد التقرير قبل توليده — لا توجد أي مهمة بعد."
              : "لا يمكن اعتماد التقرير قبل اعتماد «رأي الخبرة» في كل مهمة.",
          uncertifiedTaskIndexes: gate.uncertifiedTaskIndexes,
        },
        { status: 409 },
      );
    }
  }

  const data = { ...parsed.data, ...(parsed.data.status === "FINAL" ? { finalizedAt: new Date() } : {}) };

  const report = await prisma.courtReport.upsert({
    where: { caseId },
    create: { caseId, ...data },
    update: data,
    include: { tasks: { orderBy: { taskIndex: "asc" } } },
  });

  return NextResponse.json({ courtReport: report });
}
