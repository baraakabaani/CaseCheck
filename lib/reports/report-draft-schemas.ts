// الموديول 4 — مخطط استجابة الذكاء الاصطناعي عند صياغة التقرير القضائي.
// يتبع نفس بنية lib/case-analysis-schemas.ts (Zod + JSON mode). المبالغ
// المالية للتصفية تُطلب من النموذج على مستوى كل مهمة فقط (claimantAmount/
// respondentOffset) — لا يوجد رقم إجمالي مستقل يطلبه النموذج على مستوى
// التقرير كله، فالإجمالي والصافي يُحسبان دوماً من مجموع أرقام المهام
// (lib/reports/liquidation.ts) تطبيقاً لقاعدة "لا رقم بلا سند مهمة محلَّلة".

import { z } from "zod";

export const reportPreliminarySectionsSchema = z.object({
  introduction: z.string(),
  mandateSummary: z.string(),
  partiesOverview: z.string(),
  proceduralHistory: z.string(),
  documentInventory: z.string(),
});
export type ReportPreliminarySections = z.infer<typeof reportPreliminarySectionsSchema>;

export const reportSettlementNarrativeSchema = z.object({
  beneficiary: z.string(),
  summaryNarrative: z.string(),
});
export type ReportSettlementNarrative = z.infer<typeof reportSettlementNarrativeSchema>;

export const reportTaskAnalysisSchema = z.object({
  taskId: z.string(),
  claimantArguments: z.string(),
  respondentArguments: z.string(),
  forensicStudy: z.string(),
  missingDocsImpact: z.string(),
  tentativeFinding: z.string(),
  claimantAmount: z.number().finite().nullable().default(null),
  respondentOffset: z.number().finite().nullable().default(null),
  amountNote: z.string().nullable().default(null),
});
export type ReportTaskAnalysis = z.infer<typeof reportTaskAnalysisSchema>;

export const reportPreliminaryAiResultSchema = z.object({
  preliminarySections: reportPreliminarySectionsSchema,
  settlement: reportSettlementNarrativeSchema,
});

export const reportTaskAiResultSchema = reportTaskAnalysisSchema;
