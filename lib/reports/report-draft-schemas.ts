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
  // خامساً: نطاق الفحص — فقرة تمهيدية تسبق جداول المهام (نطاق ما فحصه
  // الخبير من مستندات ومنهجية العمل)، لا الجداول نفسها (تلك حتمية بالكامل،
  // انظر lib/reports/financial-tables.ts).
  scopeNarrative: z.string(),
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

// ---------------------------------------------------------------------------
// جداول مهمة واحدة (lib/reports/financial-tables.ts + lib/report-draft-ai.ts)
// ---------------------------------------------------------------------------
// النموذج ممنوع بنيوياً من إعادة حساب أي رقم في جدول حتمي: عندما توجد
// مرشحات حتمية لهذه المهمة، دوره ينحصر في selectedCandidates (اختيار
// المفتاح candidateKey من الجداول الجاهزة + عنوان/ملاحظة أساس مقترَحين —
// الأرقام والصفوف تُؤخَذ حرفياً من كائن ProposedTable الأصلي عند الحفظ،
// لا من رد النموذج). proposedTables (جداول كاملة يقترحها النموذج بنفسه) لا
// تُستخدَم إلا حين لا يوجد أي مرشح حتمي لهذه المهمة (انظر lib/report-draft-ai.ts)
// وتبقى AI_PROPOSED تتطلب تحقق الخبير من كل رقم قبل الاعتماد.

export const aiProposedTableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  align: z.enum(["start", "center", "end"]).optional(),
});

export const aiProposedTableRowSchema = z.object({
  cells: z.array(z.string()),
  isTotal: z.boolean().optional().default(false),
});

export const aiProposedTableSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable().default(null),
  columns: z.array(aiProposedTableColumnSchema).min(1),
  rows: z.array(aiProposedTableRowSchema).min(1),
  basisNote: z.string(),
});
export type AiProposedTable = z.infer<typeof aiProposedTableSchema>;

export const selectedDeterministicTableSchema = z.object({
  candidateKey: z.string(),
  title: z.string(),
  basisNote: z.string().nullable().default(null),
});
export type SelectedDeterministicTable = z.infer<typeof selectedDeterministicTableSchema>;

export const reportTaskTablesAiResultSchema = z.object({
  taskId: z.string(),
  selectedCandidates: z.array(selectedDeterministicTableSchema).default([]),
  proposedTables: z.array(aiProposedTableSchema).max(3).default([]),
});
export type ReportTaskTablesAiResult = z.infer<typeof reportTaskTablesAiResultSchema>;
