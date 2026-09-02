import { z } from "zod";
import { aiMatchResponseSchema, type AiMatchResponse, type CaseType } from "./schemas";
import { createAiClient, resolveAiKey, type ClientApiKeys, type ResolvedAiKey } from "./ai-client";
import { offlineMatchDocumentsToRequirements } from "./offline-matcher";
import type { MatchDocumentInput, MatchRequirementInput } from "./matching-types";

export type { MatchDocumentInput, MatchRequirementInput };

export type MatchMode = "AI" | "OFFLINE";

export interface MatchOutcome {
  response: AiMatchResponse;
  mode: MatchMode;
  /** Set when an AI attempt was made but failed and we fell back to the
   * offline heuristic — surfaced to the user as an informational toast. */
  warning?: string;
}

// This budget is sized for Groq's free "on_demand" tier, which caps
// requests at 8,000 tokens/minute (prompt_tokens + max_tokens, reserved up
// front) — it's a *total* character budget shared across all documents
// (see buildDocumentsBlock), not a flat per-document cap, so a case with
// many/long documents still gets a real (if partial) AI pass instead of
// blowing the limit outright. Gemini's much larger free-tier budget and
// ~1M token context don't need this, but the same cap is kept for it too
// (harmless, keeps prompt sizes/latency reasonable either way).
const TOTAL_DOCUMENT_CHARS_BUDGET = 9000; // ≈ 3,000 tokens at ~3 chars/token for Arabic-heavy text
const MAX_DOC_CHARS_IN_PROMPT = 6000; // ceiling for any single document within that shared budget

const SYSTEM_PROMPT = `أنت خبير قانوني ومحاسبي متخصص في تدقيق ملفات الدعاوى القضائية والخبرة المحاسبية في محاكم دولة الإمارات العربية المتحدة.

مهمتك: مطابقة قائمة "المستندات المطلوبة" (متطلبات ملف الدعوى) مع "المستندات المرفوعة فعلياً" من العميل، بالاعتماد على النصوص المستخرجة من كل مستند.

لكل متطلب، قرر حالته وفق المعايير التالية:
- PROVIDED (مقدم بالكامل): يوجد مستند أو أكثر يغطي المتطلب بشكل كامل، بما في ذلك الفترة الزمنية إن وُجدت.
- PARTIALLY_PROVIDED (مقدم جزئياً): يوجد مستند ذو صلة لكنه ناقص — مثال: كشف حساب بنكي مطلوب عن سنوات 2023-2025 لكن المرفوع يغطي 2023 فقط، أو المستند غير واضح/غير مختوم رسمياً، أو ينقصه جزء واضح.
- MISSING (غير مقدم): لا يوجد أي مستند مرفوع ذو صلة بهذا المتطلب.

اعتبارات إضافية يجب ذكرها في التعليل عند الاقتضاء:
- اكتمال الفترة الزمنية (قارن التواريخ المكتشفة في المستند مع الفترة المطلوبة إن وجدت، واذكر أي سنوات/أشهر ناقصة بوضوح).
- وضوح المستند ووجود أختام/توقيعات رسمية إن أمكن الاستدلال عليها من النص.
- إن كان المستند "قد يكون ممسوحاً ضوئياً بدون طبقة نصية" فاذكر ذلك كملاحظة تستدعي المراجعة اليدوية، ولا تفترض أنه غير مطابق لمجرد ذلك.

أجب دائماً باللغة العربية الفصحى في حقل "reasoning"، بأسلوب مهني موجز ومباشر (2-4 جمل كحد أقصى). استخدم فقط معرّفات (id) المتطلبات والمستندات المعطاة لك بالضبط كما وردت، ولا تخترع معرّفات جديدة. أرجع نتيجة لكل متطلب في القائمة المعطاة دون استثناء.

يجب أن يكون ردك بصيغة JSON صالحة فقط، مطابقة تماماً لمخطط JSON التالي، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown:
{{JSON_SCHEMA}}`;

function buildDocumentsBlock(documents: MatchDocumentInput[]): {
  block: string;
  skippedCount: number;
  truncatedCount: number;
} {
  let remaining = TOTAL_DOCUMENT_CHARS_BUDGET;
  let skippedCount = 0;
  let truncatedCount = 0;

  const parts: string[] = [];
  for (const [i, d] of documents.entries()) {
    const fullText = d.text?.trim() || "";
    if (!fullText) {
      parts.push(
        [
          `[مستند ${i + 1}]`,
          `documentId: ${d.id}`,
          `اسم الملف: ${d.fileName}`,
          `نوع الملف: ${d.fileKind}`,
          d.note ? `ملاحظة: ${d.note}` : null,
          `مقتطف من المحتوى:\n"""\n(تعذر استخراج نص من هذا الملف)\n"""`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      continue;
    }
    if (remaining < 200) {
      skippedCount++;
      continue;
    }
    const cap = Math.min(fullText.length, remaining, MAX_DOC_CHARS_IN_PROMPT);
    const excerpt = fullText.slice(0, cap);
    if (excerpt.length < fullText.length) truncatedCount++;
    remaining -= excerpt.length;

    parts.push(
      [
        `[مستند ${i + 1}]`,
        `documentId: ${d.id}`,
        `اسم الملف: ${d.fileName}`,
        `نوع الملف: ${d.fileKind}`,
        `تواريخ مكتشفة في النص: ${d.detectedDates.join("، ") || "لا يوجد"}`,
        d.note ? `ملاحظة: ${d.note}` : null,
        `مقتطف من المحتوى${excerpt.length < fullText.length ? " (مُختصر لضيق المساحة)" : ""}:\n"""\n${excerpt}\n"""`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return { block: parts.join("\n\n---\n\n"), skippedCount, truncatedCount };
}

function buildRequirementsBlock(requirements: MatchRequirementInput[]): string {
  return requirements
    .map((r, i) => {
      const period =
        r.periodStart || r.periodEnd
          ? `الفترة الزمنية المطلوبة: من ${r.periodStart ?? "غير محدد"} إلى ${r.periodEnd ?? "غير محدد"}`
          : null;
      return [
        `[متطلب ${i + 1}]`,
        `requirementId: ${r.id}`,
        `الاسم: ${r.labelAr}`,
        r.category ? `التصنيف: ${r.category}` : null,
        r.description ? `تفاصيل: ${r.description}` : null,
        period,
        `إلزامي: ${r.isRequired ? "نعم" : "لا"}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

/** Best-effort extraction of a JSON object from a model response — Groq's
 * json_object mode guarantees valid JSON, but this guards against a model
 * that still wraps it in prose or a markdown fence. */
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

async function callAiForMatching(
  resolved: ResolvedAiKey,
  requirements: MatchRequirementInput[],
  documents: MatchDocumentInput[],
): Promise<{ response: AiMatchResponse; truncationNote?: string }> {
  const client = createAiClient(resolved);
  const jsonSchema = JSON.stringify(z.toJSONSchema(aiMatchResponseSchema));

  const { block: documentsBlock, skippedCount, truncatedCount } = buildDocumentsBlock(documents);
  const budgetNoteParts: string[] = [];
  if (truncatedCount > 0) budgetNoteParts.push(`تم اختصار محتوى ${truncatedCount} مستند`);
  if (skippedCount > 0) budgetNoteParts.push(`تم تخطي ${skippedCount} مستند بالكامل`);

  const userContent = `فيما يلي قائمة المتطلبات (متطلبات ملف الدعوى):

${buildRequirementsBlock(requirements)}

=====

وفيما يلي المستندات المرفوعة فعلياً من العميل:

${documentsBlock}

=====

قم بمطابقة كل متطلب من المتطلبات أعلاه (بعددها بالكامل: ${requirements.length}) مع المستندات ذات الصلة، وأرجع النتيجة بصيغة JSON فقط وفق المخطط المطلوب.`;

  const completion = await client.chat.completions.create({
    model: resolved.model,
    temperature: 0.2,
    // Kept well below Groq's free-tier 8,000 TPM cap — Groq's rate limiter
    // reserves (prompt tokens + max_tokens) upfront, so an over-generous
    // ceiling here can trip the limit even when actual usage is far lower.
    // (Harmless headroom for Gemini, whose budget is much larger.)
    max_tokens: 3000,
    // See AiChatParams.reasoning_effort — without this, Gemini spends an
    // unpredictable share of max_tokens on hidden thinking and can return
    // truncated/invalid JSON.
    reasoning_effort: resolved.provider === "gemini" ? "low" : undefined,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT.replace("{{JSON_SCHEMA}}", jsonSchema) },
      { role: "user", content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("رد فارغ من خدمة الذكاء الاصطناعي");

  const parsed = extractJson(raw);
  const validated = aiMatchResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("فشل التحقق من صيغة استجابة الذكاء الاصطناعي");
  }
  return {
    response: validated.data,
    truncationNote:
      budgetNoteParts.length > 0
        ? `تم تشغيل المطابقة بالذكاء الاصطناعي، لكن ${budgetNoteParts.join(" و")} من المستندات بسبب محدودية حجم الطلب المسموح به على مستوى الحساب الحالي — راجعها يدوياً إن لزم.`
        : undefined,
  };
}

export async function matchDocumentsToRequirements(
  requirements: MatchRequirementInput[],
  documents: MatchDocumentInput[],
  caseType: CaseType,
  clientKeys?: ClientApiKeys | null,
): Promise<MatchOutcome> {
  if (requirements.length === 0) {
    return { response: { results: [] }, mode: "OFFLINE" };
  }

  const resolved = resolveAiKey(clientKeys);

  if (!resolved) {
    return {
      response: offlineMatchDocumentsToRequirements(requirements, documents, caseType),
      mode: "OFFLINE",
    };
  }

  if (documents.length === 0) {
    return {
      response: {
        results: requirements.map((r) => ({
          requirementId: r.id,
          status: "MISSING" as const,
          confidence: 1,
          reasoning: "لم يتم رفع أي مستندات في الملف بعد لمطابقتها مع هذا المتطلب.",
          matchedDocuments: [],
        })),
      },
      mode: "AI",
    };
  }

  try {
    const { response, truncationNote } = await callAiForMatching(
      resolved,
      requirements,
      documents,
    );
    return { response, mode: "AI", warning: truncationNote };
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطأ غير معروف";
    return {
      response: offlineMatchDocumentsToRequirements(requirements, documents, caseType),
      mode: "OFFLINE",
      warning: `تعذر استخدام الذكاء الاصطناعي (${message})، تم استخدام المطابقة الآلية الاحتياطية بدلاً من ذلك.`,
    };
  }
}
