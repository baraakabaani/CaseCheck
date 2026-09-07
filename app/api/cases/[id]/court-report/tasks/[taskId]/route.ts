import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateCourtReportTaskSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; taskId: string }>;
}

// موديول 4 (v2) — تعديل/اعتماد قسم مهمة واحدة. زر «اعتماد رأي الخبرة» في
// الواجهة هو ببساطة PATCH بـ { expertVerdictProvenance: "EXPERT_CERTIFIED" }
// على هذا المسار، دون حاجة لمسار/فعل منفصل.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, taskId } = await params;

  const task = await prisma.courtReportTask.findFirst({
    where: { id: taskId, courtReport: { caseId } },
  });
  if (!task) {
    return NextResponse.json({ error: "قسم المهمة غير موجود" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateCourtReportTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة", issues: parsed.error.issues }, { status: 400 });
  }

  const { linkedDocumentIds, ...rest } = parsed.data;

  const updated = await prisma.courtReportTask.update({
    where: { id: taskId },
    data: {
      ...rest,
      ...(linkedDocumentIds ? { linkedDocumentIds: JSON.stringify(linkedDocumentIds) } : {}),
    },
  });

  return NextResponse.json({ task: updated });
}
