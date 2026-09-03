import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hearingQuestionInputSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; hearingId: string }>;
}

function safeParseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// POST { seed: true } يستورد أسئلة المدعي/المدعى عليه المُولّدة في التحليل
// الأولي (الموديول 1) كأسئلة GENERATED لهذا الاجتماع — مرة واحدة فقط، لا
// يُكرر الاستيراد إن وُجدت أسئلة GENERATED مسبقاً. غير ذلك، يضيف سؤالاً
// يدوياً واحداً وفق hearingQuestionInputSchema.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, hearingId } = await params;

  const session = await prisma.hearingSession.findFirst({ where: { id: hearingId, caseId } });
  if (!session) {
    return NextResponse.json({ error: "الاجتماع غير موجود" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  if (body?.seed === true) {
    const existingGenerated = await prisma.hearingQuestion.count({
      where: { hearingSessionId: hearingId, sourceType: "GENERATED" },
    });
    if (existingGenerated > 0) {
      const questions = await prisma.hearingQuestion.findMany({
        where: { hearingSessionId: hearingId },
        orderBy: { order: "asc" },
      });
      return NextResponse.json({ questions, seeded: 0 });
    }

    const latestAnalysis = await prisma.caseAnalysis.findFirst({
      where: { caseId },
      orderBy: { createdAt: "desc" },
    });
    if (!latestAnalysis) {
      return NextResponse.json({ questions: [], seeded: 0 });
    }

    const claimantQuestions = safeParseJson<string[]>(latestAnalysis.claimantQuestions, []);
    const respondentQuestions = safeParseJson<string[]>(latestAnalysis.respondentQuestions, []);

    const rows = [
      ...claimantQuestions.map((q, i) => ({
        hearingSessionId: hearingId,
        partyRole: "CLAIMANT",
        questionText: q,
        sourceType: "GENERATED",
        order: i,
      })),
      ...respondentQuestions.map((q, i) => ({
        hearingSessionId: hearingId,
        partyRole: "RESPONDENT",
        questionText: q,
        sourceType: "GENERATED",
        order: i,
      })),
    ];

    if (rows.length > 0) {
      await prisma.hearingQuestion.createMany({ data: rows });
    }

    const questions = await prisma.hearingQuestion.findMany({
      where: { hearingSessionId: hearingId },
      orderBy: { order: "asc" },
    });
    return NextResponse.json({ questions, seeded: rows.length });
  }

  const parsed = hearingQuestionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const count = await prisma.hearingQuestion.count({ where: { hearingSessionId: hearingId } });
  const question = await prisma.hearingQuestion.create({
    data: { hearingSessionId: hearingId, ...parsed.data, sourceType: "MANUAL", order: count },
  });

  return NextResponse.json({ question }, { status: 201 });
}
