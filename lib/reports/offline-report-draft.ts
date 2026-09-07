// الموديول 4 — المحرك الاحتياطي بدون مفتاح ذكاء اصطناعي. بنفس فلسفة
// lib/offline-case-analyzer.ts: صادق حول حدوده. الأقسام التي يمكن تجميعها
// حتمياً من بيانات النظام (الجدول الزمني، الجرد، الأطراف، أثر المستندات
// الناقصة) تُنتَج كاملة وحقيقية — لا حاجة لذكاء اصطناعي لتجميع بيانات
// موجودة أصلاً. أما السرد التوليدي الذي يتطلب فهماً وتحليلاً (موقف كل طرف،
// بحث الخبرة، الاستنتاج المبدئي) فيُترك كطلب صريح وصادق للخبير لكتابته
// يدوياً، مع سرد المواد المتاحة له ليعمل عليها — لا اختراع لتحليل لم يحدث.

import type { ReportAggregate } from "./report-aggregator";
import {
  buildIntroductionText,
  buildPartiesOverviewText,
  buildProceduralTimelineText,
  buildDocumentInventoryText,
  buildMissingDocsImpactText,
} from "./report-sections";
import type {
  ReportPreliminarySections,
  ReportSettlementNarrative,
  ReportTaskAnalysis,
} from "./report-draft-schemas";

export function offlineDraftPreliminary(aggregate: ReportAggregate): {
  preliminarySections: ReportPreliminarySections;
  settlement: ReportSettlementNarrative;
} {
  return {
    preliminarySections: {
      introduction: buildIntroductionText(aggregate.basics, aggregate.mandate),
      mandateSummary:
        aggregate.mandate.mandateText ??
        "لم يُستخرج نص المأمورية تلقائياً (لا يوجد مفتاح ذكاء اصطناعي مُهيأ) — انسخه من الحكم التمهيدي/قرار الندب في الموديول 1.",
      partiesOverview: buildPartiesOverviewText(aggregate.basics, aggregate.parties, aggregate.attendees),
      proceduralHistory: buildProceduralTimelineText(aggregate.timeline),
      documentInventory: buildDocumentInventoryText(aggregate.inventory),
    },
    settlement: {
      beneficiary: "",
      summaryNarrative:
        "لم تُصَغ خلاصة تصفية الحساب تلقائياً (لا يوجد مفتاح ذكاء اصطناعي مُهيأ) — أدخل الأرقام المعتمدة لكل مهمة أدناه، ثم اكتب الخلاصة يدوياً؛ جدول التصفية سيُحسَب تلقائياً من تلك الأرقام في كل الأحوال.",
    },
  };
}

export function offlineDraftTask(
  aggregate: ReportAggregate,
  task: ReportAggregate["tasks"][number],
): ReportTaskAnalysis {
  const exhibitNames = task.exhibitLinks.map((l) => l.fileName);
  const materialNote =
    exhibitNames.length > 0
      ? `المستندات المرتبطة بهذه المهمة والمتاحة للفحص: ${exhibitNames.join("، ")}.`
      : "لا توجد مستندات مرتبطة بهذه المهمة تلقائياً بعد — قد تحتاج لربطها يدوياً.";
  const honestPlaceholder = (fieldLabel: string) =>
    `لم يتم توليد ${fieldLabel} لهذه المهمة تلقائياً (لا يوجد مفتاح ذكاء اصطناعي مُهيأ). ${materialNote} أضف مفتاحاً من زر «مفتاح الذكاء الاصطناعي» أعلى الصفحة ثم أعد التوليد، أو اكتب هذا القسم يدوياً.`;

  void aggregate; // مُبقاة في التوقيع للاتساق مع callAiForTask ولاستخدام محتمل لاحق
  return {
    taskId: String(task.taskIndex),
    claimantArguments: honestPlaceholder("موقف المدعي"),
    respondentArguments: honestPlaceholder("موقف المدعى عليه"),
    forensicStudy: honestPlaceholder("بحث الخبرة"),
    missingDocsImpact: buildMissingDocsImpactText(task),
    tentativeFinding: honestPlaceholder("الاستنتاج المبدئي"),
    claimantAmount: null,
    respondentOffset: null,
    amountNote: null,
  };
}
