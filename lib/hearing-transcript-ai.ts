// الموديول 2 — تصحيح نص تفريغ اجتماع الخبرة بالذكاء الاصطناعي. نصوص
// التفريغ الآلي (تحويل صوت إلى نص) غالباً عربية وغير دقيقة — أسماء أطراف
// مشوّهة، مصطلحات محاسبية/قانونية خاطئة، إلخ. هذا الوحدة تصحّح النص
// بالاستعانة بسياق الدعوى (أسماء الأطراف، ملخص الدعوى، نص المأمورية) كمرجع
// موثوق، وتحاول أيضاً مطابقة الإجابات الفعلية في النص مع الأسئلة المُعدّة
// مسبقاً للاجتماع. يتبع نفس نمط lib/case-analyzer.ts بالضبط: الذكاء
// الاصطناعي بصيغة JSON مع محرك احتياطي صادق (لا يخترع تصحيحات) بدون مفتاح.
//
// نصوص الاجتماعات الطويلة فعلياً تتجاوز ميزانية الرموز المسموح بها لطلب
// واحد — بدل اقتطاع الباقي وفقدانه بالكامل (كما كان يحدث سابقاً)، يُقسَّم
// النص إلى أجزاء متتالية يُصحَّح كل منها بطلب منفصل ثم تُجمَّع النتيجة
// كاملة (splitTranscriptIntoChunks). كذلك، كل طلب يُجرَّب على كل مزود ذكاء
// اصطناعي متاح بالترتيب (Groq ثم Gemini، عبر callWithAiFailover في
// lib/ai-client.ts) قبل التنازل عن ذلك الجزء تحديداً والاحتفاظ بنصه الخام
// كما هو — حتى بلوغ حد الطلبات المجانية لدى مزود واحد لا يعود يعني فشل
// التصحيح بالكامل.

import { z } from "zod";
import {
  createAiClient,
  resolveAiKeys,
  callWithAiFailover,
  AiFailoverError,
  type ClientApiKeys,
  type ResolvedAiKey,
} from "./ai-client";
import { tokenize, tokenSet, tokenCoverage } from "./text-normalize";

const CHARS_PER_TOKEN = 3; // نفس المعيار التقريبي المستخدم في lib/smart-ingest.ts
const TRANSCRIPT_TOKEN_BUDGET = 4000; // ميزانية كل جزء/طلب على حدة، وليس النص كاملاً
const CHUNK_CHARS_BUDGET = TRANSCRIPT_TOKEN_BUDGET * CHARS_PER_TOKEN;

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
  extractedQuestions: { partyRole: "CLAIMANT" | "RESPONDENT"; questionText: string; answerText: string }[];
  mode: "AI" | "OFFLINE";
  warning?: string;
}

const matchedAnswerSchema = z.object({
  questionText: z.string(),
  answerExcerpt: z.string(),
});

const extractedQuestionSchema = z.object({
  partyRole: z.enum(["CLAIMANT", "RESPONDENT"]),
  questionText: z.string(),
  answerText: z.string(),
});

const aiResultSchema = z.object({
  correctedTranscript: z.string(),
  matchedAnswers: z.array(matchedAnswerSchema).default([]),
  extractedQuestions: z.array(extractedQuestionSchema).default([]),
});

const AI_JSON_SCHEMA = `{
  "correctedTranscript": "string",
  "matchedAnswers": [{ "questionText": "string", "answerExcerpt": "string" }],
  "extractedQuestions": [{ "partyRole": "CLAIMANT | RESPONDENT", "questionText": "string", "answerText": "string" }]
}`;

const SYSTEM_PROMPT = `أنت مساعد قانوني متخصص في مراجعة محاضر جلسات الخبرة القضائية في دولة الإمارات العربية المتحدة.

سيُعرض عليك نص تفريغ آلي (تحويل صوت إلى نص) لاجتماع خبرة محاسبية، غالباً باللغة العربية وقد يحتوي أخطاء تفريغ شائعة: أسماء أطراف أو شركات مشوّهة، مصطلحات قانونية أو محاسبية غير دقيقة، أرقام دعوى أو مبالغ غير واضحة، وتكرار أو انقطاعات.

مهمتك:
1. صحّح النص بالاستعانة الفعّالة بكامل سياق الدعوى المعطى لك أدناه (أسماء الأطراف وصفاتهم، رقم الدعوى، المحكمة، ملخص الدعوى، نص المأمورية، الأسئلة المُعدّة مسبقاً). هذا التصحيح له ثلاثة جوانب متكاملة، أهمها الأول:

1أ. أسماء الأطراف والشركات — هذا أهم جزء في مهمتك وأكثرها احتياجاً لجهد فعلي، لأن التفريغ الآلي يشوّه الأسماء الأجنبية/غير الشائعة صوتياً بشدة، وغالباً بصورة تبدو بعيدة جداً عن الاسم الصحيح عند القراءة السطحية. لا تكتفِ بمطابقة حرفية أو تشابه واضح — افحص بفاعلية كل اسم علم أو اسم شركة أو مقطع غامض يظهر في النص وقارنه صوتياً (لا إملائياً) بكل اسم في قائمة "أطراف الدعوى" أدناه، بما في ذلك الاسم الأول وحده، أو المقطع الأخير من اسم مركّب طويل، أو نطق مشوّه جزئياً لجزء من الاسم فقط. مثال توضيحي (بأسماء افتراضية لا علاقة لها بالدعوى الحالية): إن كان أحد الأطراف في القائمة اسمه "فيرانديز روبن كومار" وورد في نص التفريغ مقطع مثل "فرندز" أو "بيرندس" بمفرده أو ملتصقاً بكلام آخر غير مرتبط ظاهرياً، فالمرجَّح جداً أنه إشارة مشوّهة لهذا الاسم نفسه، فصحّحه إليه كاملاً بدل تركه كما ورد أو معاملته ككلمة عربية عادية بلا معنى. طبّق نفس المنطق على أي اسم شركة (مثال: "في لابز" في اسم الطرف الرابع قد يظهر مشوّهاً كـ"فيليبس" أو "فيلابز" أو ما شابه صوتياً). كل ظهور لاسم طرف في محضر الاجتماع يجب أن يخرج مصحَّحاً بصيغته الكاملة الصحيحة كما وردت في قائمة الأطراف، لا مقطوعاً أو مشوّهاً.
1ب. مصطلحات ومبالغ — عبارة مقطوعة أو غامضة قد يوضّحها ملخص الدعوى أو نص المأمورية بثقة تامة (مثال: مصطلح محاسبي/قانوني مشوّه صوتياً يمكن التعرف عليه من طبيعة النزاع الموصوفة في الملخص)، وأرقام أو مبالغ غير واضحة قد يُستدل على السياق الصحيح لها مما ورد في المأمورية.
1ج. ركاكة الجمل الناتجة عن أخطاء التفريغ (تكرار كلمات، انقطاعات، علامات ترقيم مفقودة) — صحّحها لتصبح القراءة سليمة، خصوصاً الأرقام المنطوقة رقماً رقماً (مثال: "صفر خمسة، صفر خمسة، اثنان ثمانية" لرقم هاتف) التي يجب دمجها في رقم واحد متصل بدل تكرارها كأنها كلام منفصل.

القيد الوحيد الذي لا يجوز تجاوزه في كل ما سبق: لا تُغيّر ما قاله المتحدث فعلياً ولا تحذف أي جزء من كلامه ولا تخترع أي معلومة أو رقم أو اسم لا يوجد له أي أثر أو إشارة في النص الأصلي — الاستعانة بالسياق هنا وسيلة لفهم وتصحيح ما قيل فعلاً بدقة أكبر، وليست إذناً بإضافة محتوى جديد. إن بقي جزء غامضاً تماماً حتى بعد الاستعانة بكل عناصر السياق المتاحة وبعد محاولة جادة للمطابقة الصوتية مع أسماء الأطراف، أبقه كما هو مع علامة [غير واضح] بدل التخمين الحر.
2. من النص المصحَّح، حدد أي إجابات فعلية أعطاها أحد الأطراف على الأسئلة المُعدّة مسبقاً للاجتماع (معطاة لك أدناه) — أرجعها في matchedAnswers: لكل سؤال وجدت له إجابة واضحة في النص، questionText (انسخ نص السؤال كما ورد لك بالضبط دون تعديل) وanswerExcerpt (مقتطف من إجابة المتحدث الفعلية كما وردت، وليس إعادة صياغة).
3. بعد ذلك، افحص باقي النص عن أي تبادل سؤال-وجواب فعلي آخر جرى في الاجتماع ولم يكن ضمن الأسئلة المُعدّة مسبقاً (سؤال ارتجالي طرحه الخبير أو أحد الوكلاء، مع إجابة أحد الأطراف عليه) — أرجعها في extractedQuestions: partyRole (الطرف الذي أجاب)، questionText (نص السؤال كما ورد أو بأقرب صياغة ممكنة)، answerText (نص الإجابة الفعلية). لا تُدرج في extractedQuestions أي سؤال سبق إدراجه في matchedAnswers.

لا تخترع أي كلام أو سؤال أو إجابة غير موجودة فعلياً في النص. إن كان جزء من النص غير مفهوم تماماً، أبقه كما هو مع علامة [غير واضح] بدل تخمين محتواه. أجب بالعربية الفصحى. يجب أن يكون ردك بصيغة JSON صالحة فقط، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown، مطابقاً تماماً للمخطط التالي:
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

/** يقسّم نص التفريغ الطويل إلى أجزاء متتالية، كل منها ضمن ميزانية الرموز
 * المسموح بها لطلب واحد، بدل اقتطاع النص وفقدان ما بعد الحد بالكامل. يحاول
 * القطع عند أقرب فراغ/سطر جديد قبل حد الميزانية تفادياً لتقطيع كلمة في
 * منتصفها؛ نص أقصر من الميزانية يُعاد كجزء واحد دون تغيير. */
function splitTranscriptIntoChunks(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed ? [trimmed] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = Math.min(start + maxChars, trimmed.length);
    if (end < trimmed.length) {
      const breakPoint = Math.max(trimmed.lastIndexOf(" ", end), trimmed.lastIndexOf("\n", end));
      if (breakPoint > start) end = breakPoint;
    }
    const piece = trimmed.slice(start, end).trim();
    if (piece) chunks.push(piece);
    start = end;
  }
  return chunks;
}

interface ChunkCorrectionResult {
  correctedTranscript: string;
  matchedAnswers: { questionId: string; answerExcerpt: string }[];
  extractedQuestions: { partyRole: "CLAIMANT" | "RESPONDENT"; questionText: string; answerText: string }[];
}

async function callAiForTranscriptChunk(
  resolved: ResolvedAiKey,
  chunkText: string,
  ctx: TranscriptCorrectionContext,
  chunkInfo: { index: number; total: number },
): Promise<ChunkCorrectionResult> {
  const client = createAiClient(resolved);

  const partiesBlock = ctx.parties
    .map((p) => `الصفة: ${p.role === "CLAIMANT" ? "مدعٍ" : "مدعى عليه"} — الاسم: ${p.name}`)
    .join("\n");
  const questionsBlock = buildQuestionsBlock(ctx.questions);
  const isMultiPart = chunkInfo.total > 1;

  const userContent = `بيانات الدعوى:
- رقم الدعوى: ${ctx.caseNumber}
${ctx.court ? `- المحكمة: ${ctx.court}\n` : ""}${ctx.caseSummary ? `- ملخص الدعوى: ${ctx.caseSummary}\n` : ""}${
    ctx.mandateText ? `- نص المأمورية: ${ctx.mandateText}\n` : ""
  }
أطراف الدعوى:
${partiesBlock || "غير محدد"}

الأسئلة المُعدّة مسبقاً للاجتماع (التي لم تُطابَق إجابتها بعد):
${questionsBlock || "لا يوجد — إما لا توجد أسئلة معدة، أو أن جميعها طوبقت بالفعل في أجزاء سابقة من هذا التفريغ"}

=====
${
    isMultiPart
      ? `تنبيه: هذا هو الجزء رقم ${chunkInfo.index + 1} من أصل ${chunkInfo.total} من نص تفريغ أطول لنفس الاجتماع (قُسِّم فقط بسبب طوله، وليس لأي سبب آخر) — صحّح هذا الجزء فقط كما هو، وقد يبدأ أو ينتهي في منتصف جملة لأنه مقتطع من نص أطول؛ لا تُضف أي عبارة افتتاحية أو ختامية غير موجودة فعلياً في هذا الجزء.\n\n`
      : ""
  }نص التفريغ الآلي للاجتماع:
"""
${chunkText}
"""

=====

صحّح النص وحدد الإجابات المطابقة للأسئلة وفق التعليمات.`;

  const completion = await client.chat.completions.create({
    model: resolved.model,
    temperature: 0.2,
    // Correction output can be as long as the (budgeted) input chunk, plus
    // now an extractedQuestions array for unplanned Q&A found in the
    // transcript — needs real headroom, unlike the compact-JSON outputs
    // elsewhere.
    max_tokens: 5500,
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
    correctedTranscript: validated.data.correctedTranscript,
    matchedAnswers,
    extractedQuestions: validated.data.extractedQuestions,
  };
}

export async function correctHearingTranscript(
  rawText: string,
  ctx: TranscriptCorrectionContext,
  clientKeys?: ClientApiKeys | null,
): Promise<TranscriptCorrectionOutcome> {
  const candidates = resolveAiKeys(clientKeys);

  if (candidates.length === 0) {
    return {
      correctedTranscript: rawText,
      matchedAnswers: [],
      extractedQuestions: [],
      mode: "OFFLINE",
      warning:
        "تعذّر تفعيل تصحيح النص بالذكاء الاصطناعي (لا يوجد مفتاح API مُهيأ) — تم حفظ النص كما رُفع دون تعديل. أضف مفتاحاً من زر «مفتاح الذكاء الاصطناعي» أعلى الصفحة ثم أعد الرفع للحصول على نص مصحَّح ومطابقة/استخراج الأسئلة والأجوبة تلقائياً.",
    };
  }

  const chunks = splitTranscriptIntoChunks(rawText, CHUNK_CHARS_BUDGET);
  if (chunks.length === 0) {
    return { correctedTranscript: rawText, matchedAnswers: [], extractedQuestions: [], mode: "OFFLINE" };
  }

  const correctedParts: string[] = [];
  const matchedAnswers: TranscriptCorrectionOutcome["matchedAnswers"] = [];
  const extractedQuestions: TranscriptCorrectionOutcome["extractedQuestions"] = [];
  const failedChunkNumbers: number[] = [];
  let remainingQuestions = ctx.questions;
  let successCount = 0;
  let lastErrorMessage: string | null = null;

  // متتالٍ عمداً، وليس بالتوازي: طلبات متزامنة متعددة تستهلك حصة الدقيقة
  // المجانية بسرعة أكبر لدى نفس المزود، وهي بالضبط المشكلة التي يعالجها
  // هذا التعديل.
  for (let i = 0; i < chunks.length; i++) {
    try {
      const { result } = await callWithAiFailover(candidates, (resolved) =>
        callAiForTranscriptChunk(resolved, chunks[i], { ...ctx, questions: remainingQuestions }, {
          index: i,
          total: chunks.length,
        }),
      );
      successCount++;
      correctedParts.push(result.correctedTranscript);
      for (const ma of result.matchedAnswers) {
        matchedAnswers.push(ma);
        remainingQuestions = remainingQuestions.filter((q) => q.id !== ma.questionId);
      }
      extractedQuestions.push(...result.extractedQuestions);
    } catch (err) {
      failedChunkNumbers.push(i + 1);
      lastErrorMessage =
        err instanceof AiFailoverError ? err.message : err instanceof Error ? err.message : "خطأ غير معروف";
      // يُحتفظ بالنص الخام لهذا الجزء تحديداً بدل إسقاطه بالكامل — تصحيح
      // جزئي صادق أفضل من فقدان جزء من محضر الاجتماع.
      correctedParts.push(chunks[i]);
    }
  }

  if (successCount === 0) {
    return {
      correctedTranscript: rawText,
      matchedAnswers: [],
      extractedQuestions: [],
      mode: "OFFLINE",
      warning: `تعذر استخدام الذكاء الاصطناعي (${lastErrorMessage})، تم حفظ النص كما رُفع دون تعديل.`,
    };
  }

  return {
    correctedTranscript: correctedParts.join(" ").trim(),
    matchedAnswers,
    extractedQuestions,
    mode: "AI",
    warning:
      failedChunkNumbers.length > 0
        ? `تم تصحيح ${successCount} من أصل ${chunks.length} جزء من نص التفريغ بالذكاء الاصطناعي، لكن تعذر تصحيح الجزء رقم ${failedChunkNumbers.join("، ")} فتم الاحتفاظ بنصه الخام كما هو دون تصحيح — السبب: ${lastErrorMessage}`
        : undefined,
  };
}
