import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractDocument } from "@/lib/document-parser";
import { correctHearingTranscript } from "@/lib/hearing-transcript-ai";
import { getClientApiKeysFromRequest } from "@/lib/ai-client";
import { hearingTranscriptTextInputSchema } from "@/lib/hub-schemas";

interface RouteParams {
  params: Promise<{ id: string; hearingId: string }>;
}

// رفع نص تفريغ الاجتماع — إما كملف (multipart، يُستخرج نصه عبر نفس محرك
// استخراج مستندات الموديول 1) أو كنص مباشر (JSON) — ثم تصحيحه بالذكاء
// الاصطناعي بالاستعانة بسياق الدعوى، ومحاولة مطابقة الإجابات مع الأسئلة
// المُعدّة مسبقاً لهذا الاجتماع.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, hearingId } = await params;

  const [caseRecord, session] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      include: { parties: true, analyses: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.hearingSession.findFirst({
      where: { id: hearingId, caseId },
      include: { questions: { orderBy: { order: "asc" } } },
    }),
  ]);
  if (!caseRecord || !session) {
    return NextResponse.json({ error: "الدعوى أو الاجتماع غير موجود" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") || "";
  let rawText: string;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "لم يتم إرفاق ملف" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractDocument(buffer, file.name);
    if (!extracted.text?.trim()) {
      return NextResponse.json(
        { error: extracted.error || "تعذر استخراج نص من الملف المرفوع" },
        { status: 400 },
      );
    }
    rawText = extracted.text;
  } else {
    const body = await req.json().catch(() => ({}));
    const parsed = hearingTranscriptTextInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "بيانات غير صالحة", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    rawText = parsed.data.text;
  }

  const latestAnalysis = caseRecord.analyses[0] ?? null;
  const clientKeys = getClientApiKeysFromRequest(req);

  const outcome = await correctHearingTranscript(
    rawText,
    {
      caseNumber: caseRecord.caseNumber,
      court: caseRecord.court,
      parties: caseRecord.parties.map((p) => ({
        name: p.name,
        role: p.role as "CLAIMANT" | "RESPONDENT",
      })),
      caseSummary: latestAnalysis?.caseSummary ?? null,
      mandateText: latestAnalysis?.mandateText ?? null,
      questions: session.questions.map((q) => ({
        id: q.id,
        partyRole: q.partyRole as "CLAIMANT" | "RESPONDENT",
        questionText: q.questionText,
      })),
    },
    clientKeys,
  );

  // ترتيب الأسئلة المُستخرَجة الجديدة يُلحَق بعد ما هو موجود فعلاً لكل طرف.
  const nextOrder = { CLAIMANT: 0, RESPONDENT: 0 } as Record<"CLAIMANT" | "RESPONDENT", number>;
  for (const q of session.questions) {
    const role = q.partyRole as "CLAIMANT" | "RESPONDENT";
    nextOrder[role] = Math.max(nextOrder[role], q.order + 1);
  }

  await prisma.$transaction([
    prisma.hearingSession.update({
      where: { id: hearingId },
      data: { rawTranscript: rawText, correctedTranscript: outcome.correctedTranscript },
    }),
    ...outcome.matchedAnswers.map((ma) =>
      prisma.hearingQuestion.update({
        where: { id: ma.questionId },
        data: { answerText: ma.answerExcerpt, status: "ANSWERED" },
      }),
    ),
    // أسئلة وأجوبة ارتجالية استُخرجت من النص ولم تكن ضمن الأسئلة المُعدّة
    // مسبقاً — تُضاف كصفوف جديدة بمصدر EXTRACTED.
    ...outcome.extractedQuestions.map((eq) =>
      prisma.hearingQuestion.create({
        data: {
          hearingSessionId: hearingId,
          partyRole: eq.partyRole,
          questionText: eq.questionText,
          answerText: eq.answerText,
          sourceType: "EXTRACTED",
          status: "ANSWERED",
          order: nextOrder[eq.partyRole]++,
        },
      }),
    ),
  ]);

  const questions = await prisma.hearingQuestion.findMany({
    where: { hearingSessionId: hearingId },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({
    correctedTranscript: outcome.correctedTranscript,
    matchedAnswersCount: outcome.matchedAnswers.length,
    extractedQuestionsCount: outcome.extractedQuestions.length,
    questions,
    mode: outcome.mode,
    warning: outcome.warning ?? null,
  });
}
