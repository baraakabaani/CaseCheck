// المرحلة 4 — التحليل الأولي لملف الدعوى بالذكاء الاصطناعي: يقرأ النظام كل
// المستندات المرفوعة (الحكم التمهيدي، لائحة الدعوى، مذكرات الأطراف، وكل
// المرفقات) وينتج تقريراً أولياً منظّماً يراجعه الخبير ويعتمده. يتبع نفس
// نمط lib/ai-matcher.ts: Groq بصيغة JSON، مع محرك احتياطي بدون مفتاح API.

import { z } from "zod";
import {
  caseAnalysisResultSchema,
  type CaseAnalysisResult,
} from "./case-analysis-schemas";
import { createGroqClient, resolveGroqApiKey, GROQ_MODEL } from "./groq-client";
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

function buildDocumentsBlock(documents: CaseAnalyzerDocument[]): string {
  return documents
    .slice(0, MAX_TOTAL_DOCS_IN_PROMPT)
    .map((d, i) => {
      const excerpt = d.text?.trim()
        ? d.text.slice(0, MAX_DOC_CHARS_IN_PROMPT)
        : "(تعذر استخراج نص من هذا الملف)";
      return [
        `[مستند ${i + 1}]`,
        `documentId: ${d.id}`,
        `اسم الملف: ${d.fileName}`,
        `نوع الملف: ${d.fileKind}`,
        `تواريخ مكتشفة: ${d.detectedDates.join("، ") || "لا يوجد"}`,
        `مقتطف من المحتوى:\n"""\n${excerpt}\n"""`,
      ].join("\n");
    })
    .join("\n\n---\n\n");
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

async function callGroqForAnalysis(
  apiKey: string,
  caseCtx: CaseAnalyzerContext,
  parties: CaseAnalyzerParty[],
  documents: CaseAnalyzerDocument[],
): Promise<CaseAnalysisResult> {
  const client = createGroqClient(apiKey);
  const jsonSchema = JSON.stringify(z.toJSONSchema(caseAnalysisResultSchema));

  const mandateNatureLabels = caseCtx.mandateNature
    .map((n) => MANDATE_NATURE_LABELS[n])
    .join("، ");

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

${buildDocumentsBlock(documents)}

=====

قم بإعداد ملخص التحليل الأولي الكامل وفق المخطط المطلوب.`;

  const completion = await client.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.3,
    max_tokens: 8000,
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
  return validated.data;
}

export async function analyzeCaseFile(
  caseCtx: CaseAnalyzerContext,
  parties: CaseAnalyzerParty[],
  documents: CaseAnalyzerDocument[],
  clientApiKey?: string | null,
): Promise<CaseAnalysisOutcome> {
  const apiKey = resolveGroqApiKey(clientApiKey);

  if (!apiKey) {
    return { result: offlineAnalyzeCaseFile(caseCtx, parties, documents), mode: "OFFLINE" };
  }

  try {
    const result = await callGroqForAnalysis(apiKey, caseCtx, parties, documents);
    return { result, mode: "AI" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطأ غير معروف";
    return {
      result: offlineAnalyzeCaseFile(caseCtx, parties, documents),
      mode: "OFFLINE",
      warning: `تعذر استخدام الذكاء الاصطناعي (${message})، تم إعداد تقرير أولي محدود بديلاً عن ذلك.`,
    };
  }
}
