// Zero-API fallback for the Phase-4 initial analysis. Unlike offline
// document matching, this task is fundamentally generative (summarizing a
// case, extracting the mandate, drafting per-party questions) and can't be
// meaningfully faked by keyword rules — so this fallback is honest about
// its limits: it reuses the offline matcher's keyword-coverage technique
// (against the accounting-expert preset checklist, see lib/presets.ts) to
// give a genuinely useful "likely missing documents" list, and otherwise
// leaves the generative sections as short prompts for the expert to fill
// in manually, rather than inventing plausible-sounding content.

import { tokenize, tokenSet, tokenCoverage } from "./text-normalize";
import { getPresetGroup } from "./presets";
import type {
  CaseAnalyzerContext,
  CaseAnalyzerDocument,
  CaseAnalyzerParty,
} from "./case-analysis-types";
import type { CaseAnalysisResult } from "./case-analysis-schemas";

const PARTIAL_THRESHOLD = 0.5;

function bestKeywordScore(labelAr: string, keywords: string[], docTokens: Set<string>): number {
  const phrases = [labelAr, ...keywords];
  let best = 0;
  for (const phrase of phrases) {
    const score = tokenCoverage(tokenize(phrase), docTokens);
    if (score > best) best = score;
  }
  return best;
}

export function offlineAnalyzeCaseFile(
  caseCtx: CaseAnalyzerContext,
  parties: CaseAnalyzerParty[],
  documents: CaseAnalyzerDocument[],
): CaseAnalysisResult {
  const claimants = parties.filter((p) => p.role === "CLAIMANT").map((p) => p.name);
  const respondents = parties.filter((p) => p.role === "RESPONDENT").map((p) => p.name);

  const combinedTokens = tokenSet(
    documents.map((d) => `${d.text} ${d.fileName}`).join(" "),
  );

  // بدون ذكاء اصطناعي لا يمكن تحديد الطرف الأنسب لكل بند تحديداً، فالافتراض
  // الأسلم لمعظم مستندات مأموريات الخبرة المحاسبية هو طلبها من كل الأطراف.
  const allPartyIds = parties.map((p) => p.id);

  const presetGroup = getPresetGroup("ACCOUNTING_EXPERT");
  const missingDocuments = (presetGroup?.items ?? [])
    .filter(
      (item) => bestKeywordScore(item.labelAr, item.keywords ?? [], combinedTokens) < PARTIAL_THRESHOLD,
    )
    .map((item) => ({
      item: item.labelAr,
      requestedFromPartyIds: allPartyIds,
      reason:
        "من المستندات الشائعة لمأموريات الخبرة المحاسبية ولم يتم العثور عليها ضمن الملف المرفوع (مطابقة آلية بدون ذكاء اصطناعي).",
      relatedTask: null,
    }));

  const receivedDocuments = documents.map((d) => ({
    documentId: d.id,
    docCategory: "UNSPECIFIED" as const,
    submittedByPartyId: null,
    periodLabel: d.detectedDates.slice(0, 3).join("، ") || null,
    status: "مستلم",
  }));

  return {
    caseSummary: `دعوى رقم ${caseCtx.caseNumber}${caseCtx.court ? ` أمام ${caseCtx.court}` : ""} بين ${
      claimants.join("، ") || "غير محدد"
    } (مدعٍ) و${respondents.join("، ") || "غير محدد"} (مدعى عليه). لم يتم تفعيل الذكاء الاصطناعي، لذا هذا ملخص أساسي فقط مبني على بيانات الدعوى المُدخلة — يرجى مراجعة المستندات وكتابة ملخص تفصيلي يدوياً (طبيعة العلاقة بين الأطراف، موضوع النزاع، أهم المطالبات والدفوع، المبالغ والفترات محل النزاع).`,
    mandateText:
      "لم يتم استخراج نص مأمورية الخبرة تلقائياً (بدون ذكاء اصطناعي) — يرجى نسخه من الحكم التمهيدي / قرار الندب يدوياً.",
    mandateTasks: [],
    receivedDocuments,
    missingDocuments,
    unclearPoints: [
      "لم يتم تحليل نقاط الغموض أو التعارض بين مستندات الأطراف تلقائياً — هذه الميزة تتطلب مفتاح Groq API فعّالاً.",
    ],
    claimantQuestions: [],
    respondentQuestions: [],
    expertNotes: [
      "تم إعداد هذا التقرير بمطابقة آلية محدودة بدون ذكاء اصطناعي (باستثناء قائمة المستندات المحتمل نقصها، وهي مبنية على قائمة المستندات الشائعة). يُنصح بمراجعة كامل الملف يدوياً، أو إضافة مفتاح Groq API من زر «مفتاح Groq API» أعلى الصفحة للحصول على تحليل كامل يشمل الملخص ونص المأمورية والأسئلة المقترحة.",
    ],
  };
}
