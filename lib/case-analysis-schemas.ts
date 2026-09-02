import { z } from "zod";
import { DOC_CATEGORIES } from "./schemas";

// المرحلة 4 — التحليل الأولي لملف الدعوى: المخطط المطلوب من الذكاء
// الاصطناعي (أو من المحرك الاحتياطي) بعد قراءة كامل المستندات المرفوعة.

export const receivedDocumentSummarySchema = z.object({
  documentId: z.string(),
  docCategory: z.enum(DOC_CATEGORIES).default("UNSPECIFIED"),
  submittedByPartyId: z.string().optional().nullable(),
  periodLabel: z.string().optional().nullable(), // مثال: "2023–2025" أو تاريخ محدد
  status: z.string(), // نص حر مختصر، مثال: "مستلم"
});
export type ReceivedDocumentSummary = z.infer<typeof receivedDocumentSummarySchema>;

export const missingDocumentItemSchema = z.object({
  item: z.string(), // المستند المطلوب
  requestedFromPartyIds: z.array(z.string()).default([]), // المطلوب من أي طرف (قد يكون أكثر من طرف، مثال: المدعي والمدعى عليه معاً)
  reason: z.string(), // سبب طلبه
  relatedTask: z.string().optional().nullable(), // المهمة المرتبطة به
});
export type MissingDocumentItem = z.infer<typeof missingDocumentItemSchema>;

export const caseAnalysisResultSchema = z.object({
  caseSummary: z.string(), // ملخص الدعوى
  mandateText: z.string(), // نص مأمورية الخبرة كما ورد في الحكم
  mandateTasks: z.array(z.string()), // تقسيم المأمورية إلى مهام واضحة
  receivedDocuments: z.array(receivedDocumentSummarySchema),
  missingDocuments: z.array(missingDocumentItemSchema),
  unclearPoints: z.array(z.string()),
  claimantQuestions: z.array(z.string()),
  respondentQuestions: z.array(z.string()),
  expertNotes: z.array(z.string()),
});
export type CaseAnalysisResult = z.infer<typeof caseAnalysisResultSchema>;

// ---------------------------------------------------------------------------
// AI-facing subset — what we actually ask the model to return. docCategory
// is deliberately excluded from receivedDocuments: it's already known (set
// at upload time, one of the 5 Phase-3 slots — see lib/smart-ingest.ts), so
// asking the model to re-derive and re-emit it would just waste output
// tokens. lib/case-analyzer.ts fills it back in from the ground truth
// before returning/storing the full CaseAnalysisResult above.
// ---------------------------------------------------------------------------
export const aiReceivedDocumentSchema = receivedDocumentSummarySchema.omit({ docCategory: true });
export type AiReceivedDocument = z.infer<typeof aiReceivedDocumentSchema>;

export const aiCaseAnalysisResultSchema = caseAnalysisResultSchema
  .omit({ receivedDocuments: true })
  .extend({ receivedDocuments: z.array(aiReceivedDocumentSchema) });
export type AiCaseAnalysisResult = z.infer<typeof aiCaseAnalysisResultSchema>;
