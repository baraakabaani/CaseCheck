import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClientApiKeysFromRequest } from "@/lib/ai-client";
import { suggestTasksFromHearing } from "@/lib/hearing-task-suggester";

interface RouteParams {
  params: Promise<{ id: string; hearingId: string }>;
}

// زر "استخراج مهام من المحضر" في غرفة الاجتماع — لا يُعدِّل أي شيء بنفسه؛
// يعيد فقط اقتراحات (كل منها مع اقتباسه من المحضر) ليراجعها الخبير ويختار
// ما يريد إضافته فعلياً عبر PATCH منفصل على /api/cases/:id/analysis/:analysisId
// الموجود أصلاً (lib/case-analysis-schemas.ts's updateCaseAnalysisSchema).
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, hearingId } = await params;

  const [session, caseRecord] = await Promise.all([
    prisma.hearingSession.findFirst({ where: { id: hearingId, caseId } }),
    prisma.case.findUnique({
      where: { id: caseId },
      include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);
  if (!session) {
    return NextResponse.json({ error: "الاجتماع غير موجود" }, { status: 404 });
  }
  if (!session.correctedTranscript?.trim()) {
    return NextResponse.json({ error: "لا يوجد نص تفريغ مصحَّح لهذا الاجتماع بعد" }, { status: 400 });
  }
  const analysis = caseRecord?.analyses[0];
  if (!analysis) {
    return NextResponse.json({ error: "لا يوجد تحليل أولي لهذه الدعوى بعد" }, { status: 400 });
  }

  const existingTasks = JSON.parse(analysis.mandateTasks) as string[];
  const clientKeys = getClientApiKeysFromRequest(req);
  const outcome = await suggestTasksFromHearing(session.correctedTranscript, existingTasks, clientKeys);

  return NextResponse.json({
    analysisId: analysis.id,
    existingTasks,
    suggestions: outcome.suggestions,
    mode: outcome.mode,
    warning: outcome.warning ?? null,
  });
}
