import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums (kept as string unions so they map cleanly onto SQLite text
// columns in Prisma while still giving full type-safety in the app).
// ---------------------------------------------------------------------------
export const REQUIREMENT_STATUSES = [
  "PROVIDED",
  "PARTIALLY_PROVIDED",
  "MISSING",
  "NOT_ANALYZED",
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const CASE_TYPES = ["LITIGATION", "ACCOUNTING_EXPERT"] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_STATUSES = ["IN_PROGRESS", "COMPLETED", "ARCHIVED"] as const;
export type CaseStatusValue = (typeof CASE_STATUSES)[number];

export const PARSE_STATUSES = ["PENDING", "PARSED", "FAILED", "UNSUPPORTED"] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

export const FILE_KINDS = ["pdf", "docx", "xlsx", "csv", "image", "other"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

// ---------------------------------------------------------------------------
// Case creation / update
// ---------------------------------------------------------------------------
export const requirementInputSchema = z.object({
  presetKey: z.string().optional().nullable(),
  labelAr: z.string().min(1, "اسم المتطلب مطلوب"),
  labelEn: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  periodStart: z.string().datetime().optional().nullable(),
  periodEnd: z.string().datetime().optional().nullable(),
  isRequired: z.boolean().default(true),
  order: z.number().int().default(0),
});
export type RequirementInput = z.infer<typeof requirementInputSchema>;

export const createCaseSchema = z.object({
  caseNumber: z.string().min(1, "رقم الدعوى مطلوب"),
  title: z.string().min(1, "عنوان الدعوى مطلوب"),
  court: z.string().optional().nullable(),
  caseType: z.enum(CASE_TYPES).default("LITIGATION"),
  claimantName: z.string().optional().nullable(),
  respondentName: z.string().optional().nullable(),
  clientName: z.string().optional().nullable(),
  clientEmail: z.string().email().optional().or(z.literal("")).nullable(),
  notes: z.string().optional().nullable(),
  requirements: z.array(requirementInputSchema).default([]),
});
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const updateCaseSchema = createCaseSchema.partial().extend({
  status: z.enum(CASE_STATUSES).optional(),
});

export const updateRequirementSchema = z.object({
  labelAr: z.string().min(1).optional(),
  labelEn: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  isRequired: z.boolean().optional(),
  status: z.enum(REQUIREMENT_STATUSES).optional(),
  overrideNotes: z.string().optional().nullable(),
  manualOverride: z.boolean().optional(),
});
export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;

// ---------------------------------------------------------------------------
// AI smart-matching structured output.
// This is the JSON shape we require from the LLM (via JSON mode) when
// comparing extracted document text against the requirement checklist.
// ---------------------------------------------------------------------------
export const aiMatchedDocumentSchema = z.object({
  documentId: z.string(),
  relevance: z.number().min(0).max(1),
  pageRefs: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export const aiRequirementResultSchema = z.object({
  requirementId: z.string(),
  status: z.enum(["PROVIDED", "PARTIALLY_PROVIDED", "MISSING"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  matchedDocuments: z.array(aiMatchedDocumentSchema).default([]),
});
export type AiRequirementResult = z.infer<typeof aiRequirementResultSchema>;

export const aiMatchResponseSchema = z.object({
  results: z.array(aiRequirementResultSchema),
});
export type AiMatchResponse = z.infer<typeof aiMatchResponseSchema>;

// ---------------------------------------------------------------------------
// Email draft generation
// ---------------------------------------------------------------------------
export const generateEmailInputSchema = z.object({
  deadlineDays: z.number().int().min(1).max(90).default(7),
  tone: z.enum(["FORMAL", "URGENT", "FRIENDLY_REMINDER"]).default("FORMAL"),
  extraInstructions: z.string().optional().nullable(),
});
export type GenerateEmailInput = z.infer<typeof generateEmailInputSchema>;

export const emailDraftContentSchema = z.object({
  subject: z.string(),
  bodyAr: z.string(),
});
export type EmailDraftContent = z.infer<typeof emailDraftContentSchema>;
