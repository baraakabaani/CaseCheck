// المرحلة 4 — التحليل الأولي لملف الدعوى بالذكاء الاصطناعي: يقرأ النظام كل
// المستندات المرفوعة (الحكم التمهيدي، لائحة الدعوى، مذكرات الأطراف، وكل
// المرفقات) وينتج تقريراً أولياً منظّماً يراجعه الخبير ويعتمده. يتبع نفس
// نمط lib/ai-matcher.ts: Groq بصيغة JSON، مع محرك احتياطي بدون مفتاح API.

import { z } from "zod";
import {
  caseAnalysisResultSchema,
  type CaseAnalysisResult,
} from "./case-analysis-schemas";
import { createAiClient, resolveAiKey, type ClientApiKeys, type ResolvedAiKey } from "./ai-client";
import { offlineAnalyzeCaseFile } from "./offline-case-analyzer";
import { MANDATE_NATURE_LABELS } from "./case-intake-labels";
import type {
  CaseAnalyzerContext,
  CaseAnalyzerDocument,
  CaseAnalyzerParty,
} from "./case-analysis-types";

export type { CaseAnalyzerContext, CaseAnalyzerDocument, CaseAnalyzerParty };

export interface CaseAnalysisOutcome {
  result: CaseAnalysisResult;
  mode: "AI" | "OFFLINE";
  warning?: string;
}

const MAX_DOC_CHARS_IN_PROMPT = 8000;
const MAX_TOTAL_DOCS_IN_PROMPT = 25;
// Groq's free "on_demand" tier caps requests at 8,000 tokens/minute
// (prompt_tokens + max_tokens, reserved up front). The fixed system
// prompt + JSON schema alone measures ~1,300 tokens; combined with the
// max_tokens reserved for output below, this is what's left for every
// document's content — real multi-document cases will still commonly
// exceed a per-document cap, so this is a *total* budget shared across
// all documents (see buildDocumentsBlock), not a per-document one.
const TOTAL_DOCUMENT_CHARS_BUDGET = 8000; // ≈ 2,700 tokens at ~3 chars/token for Arabic-heavy text

const SYSTEM_PROMPT = `أنت خبير حسابي قضائي متمرس تراجع ملف دعوى كاملاً عقب تكليفك بمأمورية خبرة من محكمة إماراتية، بهدف إعداد "ملخص التحليل الأولي" الذي يعتمده الخبير قبل الاجتماع الأول مع الأطراف.

اقرأ كل المستندات المرفقة (الحكم التمهيدي/قرار الندب، لائحة الدعوى، مذكرات الأطراف، مرفقاتهم، وأي مستندات قضائية أخرى) ثم أنتج:

1. ملخص الدعوى (caseSummary): ملخص مهني مختصر بالعربية الفصحى يشمل طبيعة العلاقة بين الأطراف، موضوع النزاع، أهم مطالبات المدعي، أهم دفوع المدعى عليه، المبالغ والفترات الرئيسية محل النزاع، وجوهر الخلاف الذي يحتاج بحث الخبرة.

2. نص مأمورية الخبرة (mandateText): استخرج نص المأمورية كما ورد في الحكم التمهيدي/قرار الندب حرفياً أو بأقرب صياغة ممكنة.

3. تقسيم المأمورية إلى مهام (mandateTasks): قائمة مهام واضحة وقابلة للبحث والدراسة، مستخلصة من نص المأمورية.

4. كشف المستندات المستلمة (receivedDocuments): لكل مستند تم رفعه فعلياً، حدد documentId (استخدم فقط المعرّفات المعطاة لك بالضبط)، وتصنيفه docCategory (إحدى القيم بالضبط: PRELIMINARY_RULING للحكم التمهيدي/قرار الندب، STATEMENT_OF_CLAIM للائحة/صحيفة الدعوى، PARTY_MEMO لمذكرات الأطراف، PARTY_ATTACHMENT لمستند مرفق من أحد الأطراف، OTHER_JUDICIAL لمستند قضائي آخر، UNSPECIFIED إن تعذر التصنيف)، ومن قدّمه (submittedByPartyId من قائمة الأطراف المعطاة، أو null إن تعذر التحديد)، والفترة/التاريخ الذي يغطيه إن أمكن، وحالته (اكتب "مستلم").

5. المستندات الناقصة المطلوب طلبها (missingDocuments): مستندات لازمة لاستكمال مأمورية الخبرة وغير موجودة في الملف المرفوع (مثل كشوف الحساب البنكية، دفتر الأستاذ، الفواتير، سندات القبض والسداد، العقود والملاحق، كشوف الحساب بين الطرفين، القوائم المالية). لكل بند حدد: item (المستند المطلوب)، requestedFromPartyIds (مصفوفة تضم معرّف طرف واحد أو أكثر من قائمة الأطراف المعطاة — كثير من المستندات المحاسبية يُطلب من الطرفين معاً، مثال: كشوفات الحساب البنكية غالباً تُطلب من المدعي والمدعى عليه معاً لمطابقة التحويلات الفعلية مع الفواتير)، reason (سبب طلبه)، relatedTask (المهمة المرتبطة به من mandateTasks).

6. نقاط تحتاج إلى إيضاح من الأطراف (unclearPoints): مسائل غير واضحة أو متعارضة، مثل اختلاف قيمة المطالبة بين اللائحة والمستندات، مبلغ دون بيان طبيعته، اختلاف تواريخ العقود، نقص في فترة كشف الحساب، عدم وضوح أساس احتساب مبلغ معين.

7. أسئلة مقترحة للاجتماع الأول: أسئلة منفصلة للمدعي (claimantQuestions) وللمدعى عليه (respondentQuestions)، مبنية على وقائع هذه القضية تحديداً.

8. ملاحظات أولية للخبير (expertNotes): نقاط قصيرة جداً تستحق انتباه الخبير قبل الاجتماع (اختلاف جوهري بين الأطراف، مستند محاسبي رئيسي غير موجود، أكثر من رقم للمطالبة، ضرورة طلب كشف حساب لفترة محددة، مسألة تحتاج توضيحاً مباشراً).

لا تخترع وقائع أو مبالغ غير مذكورة في المستندات المرفقة. إن كان مستند ما غير مقروء أو ناقصاً، اذكر ذلك صراحة بدلاً من افتراض محتواه. أجب بالعربية الفصحى في كل الحقول النصية. يجب أن يكون ردك بصيغة JSON صالحة فقط، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown، مطابقاً تماماً للمخطط التالي:
{{JSON_SCHEMA}}`;

function buildPartiesBlock(parties: CaseAnalyzerParty[]): string {
  return parties
    .map(
      (p) =>
        `partyId: ${p.id} — الصفة: ${p.role === "CLAIMANT" ? "مدعٍ" : "مدعى عليه"} — الاسم: ${p.name}`,
    )
    .join("\n");
}

/** Renders as many documents as fit inside a shared, total character
 * budget (not a flat per-document cap) so the request stays under Groq's
 * free-tier TPM limit — earlier-uploaded documents (typically the ruling
 * and statement of claim) get priority and the fullest excerpts; later
 * ones get whatever budget remains, or are skipped with an honest note
 * rather than silently omitted. */
function buildDocumentsBlock(documents: CaseAnalyzerDocument[]): {
  block: string;
  skippedCount: number;
  truncatedCount: number;
} {
  const included = documents.slice(0, MAX_TOTAL_DOCS_IN_PROMPT);
  let remaining = TOTAL_DOCUMENT_CHARS_BUDGET;
  let skippedCount = documents.length - included.length;
  let truncatedCount = 0;

  const parts: string[] = [];
  for (const [i, d] of included.entries()) {
    const fullText = d.text?.trim() || "";
    if (!fullText) {
      parts.push(
        [
          `[مستند ${i + 1}]`,
          `documentId: ${d.id}`,
          `اسم الملف: ${d.fileName}`,
          `نوع الملف: ${d.fileKind}`,
          `مقتطف من المحتوى:\n"""\n(تعذر استخراج نص من هذا الملف)\n"""`,
        ].join("\n"),
      );
      continue;
    }
    if (remaining < 200) {
      // Not enough budget left for a useful excerpt — skip rather than
      // include a near-empty, misleading fragment.
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
        `تواريخ مكتشفة: ${d.detectedDates.join("، ") || "لا يوجد"}`,
        `مقتطف من المحتوى${excerpt.length < fullText.length ? " (مُختصر لضيق المساحة)" : ""}:\n"""\n${excerpt}\n"""`,
      ].join("\n"),
    );
  }

  return { block: parts.join("\n\n---\n\n"), skippedCount, truncatedCount };
}

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

async function callAiForAnalysis(
  resolved: ResolvedAiKey,
  caseCtx: CaseAnalyzerContext,
  parties: CaseAnalyzerParty[],
  documents: CaseAnalyzerDocument[],
): Promise<{ result: CaseAnalysisResult; truncationNote?: string }> {
  const client = createAiClient(resolved);
  const jsonSchema = JSON.stringify(z.toJSONSchema(caseAnalysisResultSchema));

  const mandateNatureLabels = caseCtx.mandateNature
    .map((n) => MANDATE_NATURE_LABELS[n])
    .join("، ");

  const { block: documentsBlock, skippedCount, truncatedCount } = buildDocumentsBlock(documents);
  const budgetNoteParts: string[] = [];
  if (truncatedCount > 0) budgetNoteParts.push(`تم اختصار محتوى ${truncatedCount} مستند`);
  if (skippedCount > 0) budgetNoteParts.push(`تم تخطي ${skippedCount} مستند بالكامل`);
  const budgetNote =
    budgetNoteParts.length > 0
      ? `\n\nملاحظة: بسبب محدودية حجم الطلب المسموح به، ${budgetNoteParts.join(" و")} من المستندات المرفوعة — لم تُعرض هذه الأجزاء على الذكاء الاصطناعي، فقد يكون التحليل أدناه غير مكتمل بخصوصها.`
      : "";

  const userContent = `بيانات الدعوى:
- رقم الدعوى: ${caseCtx.caseNumber}
${caseCtx.court ? `- المحكمة: ${caseCtx.court}\n` : ""}${caseCtx.circuit ? `- الدائرة: ${caseCtx.circuit}\n` : ""}${
    caseCtx.litigationDegreeLabel ? `- درجة التقاضي: ${caseCtx.litigationDegreeLabel}\n` : ""
  }${caseCtx.caseCategoryLabel ? `- نوع الدعوى: ${caseCtx.caseCategoryLabel}\n` : ""}${
    caseCtx.title ? `- عنوان القضية: ${caseCtx.title}\n` : ""
  }${mandateNatureLabels ? `- طبيعة المأمورية الحسابية: ${mandateNatureLabels}\n` : ""}
أطراف الدعوى:
${buildPartiesBlock(parties)}

=====

المستندات المرفوعة (العدد الكلي: ${documents.length}):

${documentsBlock}

=====

قم بإعداد ملخص التحليل الأولي الكامل وفق المخطط المطلوب.`;

  const completion = await client.chat.completions.create({
    model: resolved.model,
    temperature: 0.3,
    // Kept well below Groq's free-tier 8,000 TPM cap — Groq's rate limiter
    // reserves (prompt tokens + max_tokens) upfront, so an over-generous
    // ceiling here can trip the limit even when actual usage is far lower.
    // buildDocumentsBlock's total character budget is what keeps the
    // prompt itself under the cap for real multi-document cases.
    max_tokens: 2500,
    // See AiChatParams.reasoning_effort — without this, Gemini spends an
    // unpredictable share of max_tokens on hidden thinking and can return
    // truncated/invalid JSON (verified live against this exact prompt).
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
  const validated = caseAnalysisResultSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("فشل التحقق من صيغة استجابة الذكاء الاصطناعي");
  }
  return {
    result: validated.data,
    truncationNote: budgetNote
      ? `تم إعداد التحليل بالذكاء الاصطناعي، لكن ${budgetNoteParts.join(" و")} من المستندات بسبب محدودية حجم الطلب المسموح به على مستوى الحساب الحالي — راجعها يدوياً إن لزم.`
      : undefined,
  };
}

export async function analyzeCaseFile(
  caseCtx: CaseAnalyzerContext,
  parties: CaseAnalyzerParty[],
  documents: CaseAnalyzerDocument[],
  clientKeys?: ClientApiKeys | null,
): Promise<CaseAnalysisOutcome> {
  const resolved = resolveAiKey(clientKeys);

  if (!resolved) {
    return { result: offlineAnalyzeCaseFile(caseCtx, parties, documents), mode: "OFFLINE" };
  }

  try {
    const { result, truncationNote } = await callAiForAnalysis(
      resolved,
      caseCtx,
      parties,
      documents,
    );
    return { result, mode: "AI", warning: truncationNote };
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطأ غير معروف";
    return {
      result: offlineAnalyzeCaseFile(caseCtx, parties, documents),
      mode: "OFFLINE",
      warning: `تعذر استخدام الذكاء الاصطناعي (${message})، تم إعداد تقرير أولي محدود بديلاً عن ذلك.`,
    };
  }
}
