// الموديول 2 — تصحيح نص تفريغ اجتماع الخبرة بالذكاء الاصطناعي. نصوص
// التفريغ الآلي (تحويل صوت إلى نص) غالباً عربية وغير دقيقة — أسماء أطراف
// مشوّهة، مصطلحات محاسبية/قانونية خاطئة، إلخ. هذا الوحدة تصحّح النص
// بالاستعانة بسياق الدعوى (أسماء الأطراف، ملخص الدعوى، نص المأمورية) كمرجع
// موثوق، وتحاول أيضاً مطابقة الإجابات الفعلية في النص مع الأسئلة المُعدّة
// مسبقاً للاجتماع. يتبع نفس نمط lib/case-analyzer.ts بالضبط: الذكاء
// الاصطناعي بصيغة JSON مع محرك احتياطي صادق (لا يخترع تصحيحات) بدون مفتاح.

import { z } from "zod";
import { createAiClient, resolveAiKey, type ClientApiKeys, type ResolvedAiKey } from "./ai-client";
import { tokenize, tokenSet, tokenCoverage } from "./text-normalize";

const CHARS_PER_TOKEN = 3; // نفس المعيار التقريبي المستخدم في lib/smart-ingest.ts
const TRANSCRIPT_TOKEN_BUDGET = 4000; // محاضر الاجتماعات الحقيقية قد تطول
const TOTAL_TRANSCRIPT_CHARS_BUDGET = TRANSCRIPT_TOKEN_BUDGET * CHARS_PER_TOKEN;

export interface TranscriptCorrectionParty {
  name: string;
  role: "CLAIMANT" | "RESPONDENT";
}

export interface TranscriptCorrectionQuestion {
  id: string;
  partyRole: "CLAIMANT" | "RESPONDENT";
  questionText: string;
}

export interface TranscriptCorrectionContext {
  caseNumber: string;
  court?: string | null;
  parties: TranscriptCorrectionParty[];
  caseSummary?: string | null;
  mandateText?: string | null;
  questions: TranscriptCorrectionQuestion[];
}

export interface TranscriptCorrectionOutcome {
  correctedTranscript: string;
  matchedAnswers: { questionId: string; answerExcerpt: string }[];
  mode: "AI" | "OFFLINE";
  warning?: string;
}

const matchedAnswerSchema = z.object({
  questionText: z.string(),
  answerExcerpt: z.string(),
});

const aiResultSchema = z.object({
  correctedTranscript: z.string(),
  matchedAnswers: z.array(matchedAnswerSchema).default([]),
});

const AI_JSON_SCHEMA = `{
  "correctedTranscript": "string",
  "matchedAnswers": [{ "questionText": "string", "answerExcerpt": "string" }]
}`;

const SYSTEM_PROMPT = `أنت مساعد قانوني متخصص في مراجعة محاضر جلسات الخبرة القضائية في دولة الإمارات العربية المتحدة.

سيُعرض عليك نص تفريغ آلي (تحويل صوت إلى نص) لاجتماع خبرة محاسبية، غالباً باللغة العربية وقد يحتوي أخطاء تفريغ شائعة: أسماء أطراف أو شركات مشوّهة، مصطلحات قانونية أو محاسبية غير دقيقة، أرقام دعوى أو مبالغ غير واضحة، وتكرار أو انقطاعات.

مهمتك:
1. صحّح النص بالاستعانة بسياق الدعوى المعطى لك (أسماء الأطراف، رقم الدعوى، ملخص الدعوى، نص المأمورية) — استخدم هذه الأسماء والمصطلحات بالضبط كلما ظهر ما يشبهها بشكل مشوّه في التفريغ. لا تُغيّر المعنى ولا تحذف أي جزء من كلام المتحدثين، فقط صحّح الأخطاء الإملائية/الصوتية الواضحة ونظّم علامات الترقيم.
2. من النص المصحَّح، حدد أي إجابات فعلية أعطاها أحد الأطراف على الأسئلة المُعدّة مسبقاً للاجتماع (معطاة لك أدناه) — أرجعها في matchedAnswers: لكل سؤال وجدت له إجابة واضحة في النص، questionText (انسخ نص السؤال كما ورد لك بالضبط دون تعديل) وanswerExcerpt (مقتطف من إجابة المتحدث الفعلية كما وردت، وليس إعادة صياغة).

لا تخترع أي كلام أو إجابة غير موجودة فعلياً في النص. إن كان جزء من النص غير مفهوم تماماً، أبقه كما هو مع علامة [غير واضح] بدل تخمين محتواه. أجب بالعربية الفصحى. يجب أن يكون ردك بصيغة JSON صالحة فقط، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown، مطابقاً تماماً للمخطط التالي:
${AI_JSON_SCHEMA}`;

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("لم يتم العثور على JSON صالح في رد النموذج");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function buildQuestionsBlock(questions: TranscriptCorrectionQuestion[]): string {
  return questions
    .map((q) => `[${q.partyRole === "CLAIMANT" ? "سؤال للمدعي" : "سؤال للمدعى عليه"}] ${q.questionText}`)
    .join("\n");
}

/** Matches the model's free-text questionText back to a real HearingQuestion
 * id using the same tokenize/tokenCoverage heuristic the offline matcher
 * already uses elsewhere — the model can't know our internal IDs, and an
 * exact string match is too brittle for anything it paraphrases slightly. */
function matchQuestionId(
  questionText: string,
  questions: TranscriptCorrectionQuestion[],
): string | null {
  const needle = tokenize(questionText);
  if (needle.length === 0) return null;
  let bestId: string | null = null;
  let bestScore = 0;
  for (const q of questions) {
    const score = tokenCoverage(needle, tokenSet(q.questionText));
    if (score > bestScore) {
      bestScore = score;
      bestId = q.id;
    }
  }
  return bestScore >= 0.5 ? bestId : null;
}

async function callAiForTranscriptCorrection(
  resolved: ResolvedAiKey,
  rawText: string,
  ctx: TranscriptCorrectionContext,
): Promise<{ outcome: TranscriptCorrectionOutcome; truncationNote?: string }> {
  const client = createAiClient(resolved);

  const truncated = rawText.length > TOTAL_TRANSCRIPT_CHARS_BUDGET;
  const transcriptExcerpt = rawText.slice(0, TOTAL_TRANSCRIPT_CHARS_BUDGET);

  const partiesBlock = ctx.parties
    .map((p) => `الصفة: ${p.role === "CLAIMANT" ? "مدعٍ" : "مدعى عليه"} — الاسم: ${p.name}`)
    .join("\n");
  const questionsBlock = buildQuestionsBlock(ctx.questions);

  const userContent = `بيانات الدعوى:
- رقم الدعوى: ${ctx.caseNumber}
${ctx.court ? `- المحكمة: ${ctx.court}\n` : ""}${ctx.caseSummary ? `- ملخص الدعوى: ${ctx.caseSummary}\n` : ""}${
    ctx.mandateText ? `- نص المأمورية: ${ctx.mandateText}\n` : ""
  }
أطراف الدعوى:
${partiesBlock || "غير محدد"}

الأسئلة المُعدّة مسبقاً للاجتماع:
${questionsBlock || "لا يوجد"}

=====

نص التفريغ الآلي للاجتماع${truncated ? " (تم اقتصاصه لضيق المساحة)" : ""}:
"""
${transcriptExcerpt}
"""

=====

صحّح النص وحدد الإجابات المطابقة للأسئلة وفق التعليمات.`;

  const completion = await client.chat.completions.create({
    model: resolved.model,
    temperature: 0.2,
    // Correction output can be as long as the (budgeted) input transcript —
    // needs real headroom, unlike the compact-JSON outputs elsewhere.
    max_tokens: 4500,
    reasoning_effort: resolved.provider === "gemini" ? "low" : undefined,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("رد فارغ من خدمة الذكاء الاصطناعي");

  const parsed = extractJson(raw);
  const validated = aiResultSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("فشل التحقق من صيغة استجابة الذكاء الاصطناعي");
  }

  const matchedAnswers = validated.data.matchedAnswers
    .map((ma) => {
      const questionId = matchQuestionId(ma.questionText, ctx.questions);
      return questionId ? { questionId, answerExcerpt: ma.answerExcerpt } : null;
    })
    .filter((x): x is { questionId: string; answerExcerpt: string } => x !== null);

  return {
    outcome: {
      correctedTranscript: validated.data.correctedTranscript,
      matchedAnswers,
      mode: "AI",
    },
    truncationNote: truncated
      ? "تم تصحيح النص بالذكاء الاصطناعي، لكن تم اقتصاص جزء من نص التفريغ لضيق حجم الطلب المسموح به — راجع الجزء المتبقي يدوياً إن لزم."
      : undefined,
  };
}

export async function correctHearingTranscript(
  rawText: string,
  ctx: TranscriptCorrectionContext,
  clientKeys?: ClientApiKeys | null,
): Promise<TranscriptCorrectionOutcome> {
  const resolved = resolveAiKey(clientKeys);

  if (!resolved) {
    return {
      correctedTranscript: rawText,
      matchedAnswers: [],
      mode: "OFFLINE",
      warning:
        "تعذّر تفعيل تصحيح النص بالذكاء الاصطناعي (لا يوجد مفتاح API مُهيأ) — تم حفظ النص كما رُفع دون تعديل. أضف مفتاحاً من زر «مفتاح الذكاء الاصطناعي» أعلى الصفحة ثم أعد الرفع للحصول على نص مصحَّح ومطابقة الإجابات تلقائياً.",
    };
  }

  try {
    const { outcome, truncationNote } = await callAiForTranscriptCorrection(resolved, rawText, ctx);
    return { ...outcome, warning: truncationNote };
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطأ غير معروف";
    return {
      correctedTranscript: rawText,
      matchedAnswers: [],
      mode: "OFFLINE",
      warning: `تعذر استخدام الذكاء الاصطناعي (${message})، تم حفظ النص كما رُفع دون تعديل.`,
    };
  }
}
