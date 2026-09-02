// المرحلة 4 — التحليل الأولي لملف الدعوى بالذكاء الاصطناعي: يقرأ النظام كل
// المستندات المرفوعة (الحكم التمهيدي، لائحة الدعوى، مذكرات الأطراف، وكل
// المرفقات) وينتج تقريراً أولياً منظّماً يراجعه الخبير ويعتمده. يتبع نفس
// نمط lib/ai-matcher.ts: الذكاء الاصطناعي بصيغة JSON، مع محرك احتياطي بدون
// مفتاح API. المستندات لا تُرسل خاماً — يمر كل مستند أولاً عبر "نظام الضغط
// الذكي" (lib/smart-ingest.ts) الذي يستخرج محلياً الأجزاء المهمة فقط
// (منطوق الحكم، طلبات اللائحة، خلاصات المذكرات، الأرقام المالية المحسوبة
// من كشوف الحساب) ضمن ميزانية رموز صارمة لكل تصنيف — بدل تفريغ نص خام قد
// يُقتطع في منتصف الجملة ويُربك استجابة النموذج (وهو السبب المباشر لأخطاء
// JSON غير صالح رأيناها سابقاً مع الملفات الكبيرة).

import {
  aiCaseAnalysisResultSchema,
  type AiReceivedDocument,
  type CaseAnalysisResult,
  type ReceivedDocumentSummary,
} from "./case-analysis-schemas";
import { createAiClient, resolveAiKey, type ClientApiKeys, type ResolvedAiKey } from "./ai-client";
import { buildSmartIngestPayload, type SmartIngestDocument } from "./smart-ingest";
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

// The JSON schema below excludes receivedDocuments.docCategory (see
// case-analysis-schemas.ts) — it's already known from the Phase-3 upload
// slot, so the model doesn't need to re-derive or re-emit it.
const AI_JSON_SCHEMA = `{
  "caseSummary": "string",
  "mandateText": "string",
  "mandateTasks": ["string"],
  "receivedDocuments": [
    { "documentId": "string", "submittedByPartyId": "string | null", "periodLabel": "string | null", "status": "string" }
  ],
  "missingDocuments": [
    { "item": "string", "requestedFromPartyIds": ["string"], "reason": "string", "relatedTask": "string | null" }
  ],
  "unclearPoints": ["string"],
  "claimantQuestions": ["string"],
  "respondentQuestions": ["string"],
  "expertNotes": ["string"]
}`;

const SYSTEM_PROMPT = `أنت خبير حسابي قضائي متمرس تراجع ملف دعوى كاملاً عقب تكليفك بمأمورية خبرة من محكمة إماراتية، بهدف إعداد "ملخص التحليل الأولي" الذي يعتمده الخبير قبل الاجتماع الأول مع الأطراف.

المستندات المرفقة في هذه الرسالة ليست نصاً خاماً — تمت معالجتها محلياً وتلخيصها ضمن حقول JSON محددة سلفاً (انظر بنية "المستندات المرفوعة" أدناه): court_ruling_summary (خلاصة الحكم التمهيدي/قرار الندب)، case_pleading_summary (خلاصة لائحة الدعوى)، parties_memos_summary (خلاصات مذكرات الأطراف)، financial_and_evidence_digests (ملخصات/أرقام محسوبة آلياً من كشوف الحساب والمستندات المالية للأطراف)، other_docs (مستندات قضائية أخرى). كل نص يبدأ بوسم "[معرف المستند: xxx]" — استخدم هذا المعرف بالضبط عند الإشارة لأي مستند. لا تفترض وجود محتوى غير معروض عليك، ولا تعترض على كون النصوص ملخصة — هذا متعمّد لتقليل حجم الطلب.

بناءً على ما هو معروض عليك فقط، أنتج:

1. ملخص الدعوى (caseSummary): ملخص مهني مختصر بالعربية الفصحى يشمل طبيعة العلاقة بين الأطراف، موضوع النزاع، أهم مطالبات المدعي، أهم دفوع المدعى عليه، المبالغ والفترات الرئيسية محل النزاع، وجوهر الخلاف الذي يحتاج بحث الخبرة.

2. نص مأمورية الخبرة (mandateText): استخرج نص المأمورية من court_ruling_summary حرفياً أو بأقرب صياغة ممكنة.

3. تقسيم المأمورية إلى مهام (mandateTasks): قائمة مهام واضحة وقابلة للبحث والدراسة، مستخلصة من نص المأمورية.

4. كشف المستندات المستلمة (receivedDocuments): لكل مستند معروض عليك (استخدم معرّفه [معرف المستند] بالضبط في documentId)، حدد من قدّمه (submittedByPartyId من قائمة الأطراف المعطاة، أو null إن تعذر التحديد)، والفترة/التاريخ الذي يغطيه إن أمكن (periodLabel)، وحالته (status، اكتب "مستلم"). لا حاجة لتصنيف نوع المستند — معروف مسبقاً.

5. المستندات الناقصة المطلوب طلبها (missingDocuments): مستندات لازمة لاستكمال مأمورية الخبرة وغير موجودة في الملف المرفوع (مثل كشوف الحساب البنكية، دفتر الأستاذ، الفواتير، سندات القبض والسداد، العقود والملاحق، كشوف الحساب بين الطرفين، القوائم المالية). لكل بند حدد: item (المستند المطلوب)، requestedFromPartyIds (مصفوفة تضم معرّف طرف واحد أو أكثر من قائمة الأطراف المعطاة — كثير من المستندات المحاسبية يُطلب من الطرفين معاً، مثال: كشوفات الحساب البنكية غالباً تُطلب من المدعي والمدعى عليه معاً لمطابقة التحويلات الفعلية مع الفواتير)، reason (سبب طلبه)، relatedTask (المهمة المرتبطة به من mandateTasks).

6. نقاط تحتاج إلى إيضاح من الأطراف (unclearPoints): مسائل غير واضحة أو متعارضة، مثل اختلاف قيمة المطالبة بين اللائحة والمستندات، مبلغ دون بيان طبيعته، اختلاف تواريخ العقود، نقص في فترة كشف الحساب، عدم وضوح أساس احتساب مبلغ معين.

7. أسئلة مقترحة للاجتماع الأول: أسئلة منفصلة للمدعي (claimantQuestions) وللمدعى عليه (respondentQuestions)، مبنية على وقائع هذه القضية تحديداً.

8. ملاحظات أولية للخبير (expertNotes): نقاط قصيرة جداً تستحق انتباه الخبير قبل الاجتماع (اختلاف جوهري بين الأطراف، مستند محاسبي رئيسي غير موجود، أكثر من رقم للمطالبة، ضرورة طلب كشف حساب لفترة محددة، مسألة تحتاج توضيحاً مباشراً).

لا تخترع وقائع أو مبالغ غير مذكورة فيما هو معروض عليك. أجب بالعربية الفصحى في كل الحقول النصية. يجب أن يكون ردك بصيغة JSON صالحة فقط، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown، مطابقاً تماماً للمخطط التالي:
${AI_JSON_SCHEMA}`;

function buildPartiesBlock(parties: CaseAnalyzerParty[]): string {
  return parties
    .map(
      (p) =>
        `partyId: ${p.id} — الصفة: ${p.role === "CLAIMANT" ? "مدعٍ" : "مدعى عليه"} — الاسم: ${p.name}`,
    )
    .join("\n");
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

  const mandateNatureLabels = caseCtx.mandateNature
    .map((n) => MANDATE_NATURE_LABELS[n])
    .join("، ");

  const ingestDocs: SmartIngestDocument[] = documents.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    fileKind: d.fileKind,
    docCategory: d.docCategory,
    text: d.text,
  }));
  const payload = buildSmartIngestPayload(ingestDocs);
  const { skippedCount, truncatedCount } = payload.stats;
  const budgetNoteParts: string[] = [];
  if (truncatedCount > 0) budgetNoteParts.push(`تم اختصار محتوى ${truncatedCount} مستند`);
  if (skippedCount > 0) budgetNoteParts.push(`تم تخطي ${skippedCount} مستند بالكامل`);
  const budgetNote = budgetNoteParts.length > 0 ? budgetNoteParts.join(" و") : null;

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

المستندات المرفوعة (العدد الكلي: ${documents.length}، تمت معالجتها محلياً — نظام الضغط الذكي):

${payload.promptJson}

=====

قم بإعداد ملخص التحليل الأولي الكامل وفق المخطط المطلوب.`;

  const completion = await client.chat.completions.create({
    model: resolved.model,
    temperature: 0.3,
    // Freed up from 2500 now that lib/smart-ingest.ts keeps the prompt
    // itself small and bounded regardless of source document sizes — this
    // headroom is for the *output* JSON (receivedDocuments/missingDocuments
    // arrays), which is what was actually getting cut off before.
    max_tokens: 3000,
    // See AiChatParams.reasoning_effort — without this, Gemini spends an
    // unpredictable share of max_tokens on hidden thinking and can return
    // truncated/invalid JSON (verified live against this exact prompt).
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
  const validated = aiCaseAnalysisResultSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("فشل التحقق من صيغة استجابة الذكاء الاصطناعي");
  }

  // docCategory is ground truth from the Phase-3 upload slot, not something
  // the model was asked to produce — fill it back in per document.
  const categoryById = new Map(documents.map((d) => [d.id, d.docCategory]));
  const receivedDocuments: ReceivedDocumentSummary[] = validated.data.receivedDocuments.map(
    (rd: AiReceivedDocument) => ({
      ...rd,
      docCategory: categoryById.get(rd.documentId) ?? "UNSPECIFIED",
    }),
  );

  return {
    result: { ...validated.data, receivedDocuments },
    truncationNote: budgetNote
      ? `تم إعداد التحليل بالذكاء الاصطناعي، لكن ${budgetNote} من المستندات بسبب محدودية حجم الطلب المسموح به — راجعها يدوياً إن لزم.`
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
