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

// --- المرحلة 1: بيانات القضية الأساسية ---------------------------------------
export const LITIGATION_DEGREES = ["FIRST_INSTANCE", "APPEAL", "EXECUTION", "OTHER"] as const;
export type LitigationDegree = (typeof LITIGATION_DEGREES)[number];

export const CASE_CATEGORIES = ["COMMERCIAL", "CIVIL", "REAL_ESTATE", "LABOR", "OTHER"] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export const CASE_PARTY_ROLES = ["CLAIMANT", "RESPONDENT"] as const;
export type CasePartyRole = (typeof CASE_PARTY_ROLES)[number];

// --- المرحلة 2: بيانات مأمورية الخبرة -----------------------------------------
export const APPOINTMENT_CAPACITIES = [
  "SOLE_EXPERT",
  "COMMITTEE_CHAIR",
  "COMMITTEE_MEMBER",
] as const;
export type AppointmentCapacity = (typeof APPOINTMENT_CAPACITIES)[number];

export const MANDATE_NATURE_OPTIONS = [
  "EXAMINE_AUDIT_ACCOUNTS",
  "SETTLE_ACCOUNT_BETWEEN_PARTIES",
  "DETERMINE_PAID_DUE_AMOUNTS",
  "EXAMINE_BANKING_TRANSACTIONS",
  "COMPANY_PARTNER_ACCOUNTS",
  "EXAMINE_PROFIT_LOSS",
  "FINANCIAL_CLAIM",
  "OTHER",
] as const;
export type MandateNatureOption = (typeof MANDATE_NATURE_OPTIONS)[number];

// --- Wizard progress + Phase-4 document classification -----------------------
export const INTAKE_STATUSES = [
  "DRAFT_PHASE_1",
  "DRAFT_PHASE_2",
  "DRAFT_PHASE_3",
  "DRAFT_PHASE_4",
  "ACTIVE",
] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const DOC_CATEGORIES = [
  "PRELIMINARY_RULING",
  "STATEMENT_OF_CLAIM",
  "PARTY_MEMO",
  "PARTY_ATTACHMENT",
  "OTHER_JUDICIAL",
  "UNSPECIFIED",
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

// الموديول 3 — علامة جاهزية الملف للدراسة
export const CASE_READINESS_STATUSES = ["NEEDS_MORE_WORK", "READY_FOR_STUDY"] as const;
export type CaseReadinessStatus = (typeof CASE_READINESS_STATUSES)[number];

// ---------------------------------------------------------------------------
// Case intake — 4-phase judicial-expertise wizard
// ---------------------------------------------------------------------------
export const committeeMemberSchema = z.object({
  name: z.string().min(1, "اسم العضو مطلوب"),
  specialization: z.string().optional().nullable(),
});
export type CommitteeMember = z.infer<typeof committeeMemberSchema>;

// المرحلة 1 — بيانات القضية الأساسية
export const caseIntakeStep1Schema = z.object({
  caseNumber: z.string().min(1, "رقم الدعوى مطلوب"),
  court: z.string().min(1, "المحكمة / الجهة القضائية مطلوبة"),
  circuit: z.string().optional().nullable(),
  litigationDegree: z.enum(LITIGATION_DEGREES),
  caseCategory: z.enum(CASE_CATEGORIES),
  title: z.string().optional().nullable(), // عنوان مختصر للقضية
  claimants: z.array(z.string().min(1)).min(1, "الرجاء إضافة مدعٍ واحد على الأقل"),
  respondents: z.array(z.string().min(1)).min(1, "الرجاء إضافة مدعى عليه واحد على الأقل"),
  notes: z.string().optional().nullable(), // ملاحظات أولية
  // مراسلة المتعامل — منفصلة عن أطراف الدعوى، تُستخدم في خطاب استكمال المستندات
  clientName: z.string().optional().nullable(),
  clientEmail: z.string().email().optional().or(z.literal("")).nullable(),
});
export type CaseIntakeStep1Input = z.infer<typeof caseIntakeStep1Schema>;

// المرحلة 2 — بيانات مأمورية الخبرة
export const caseIntakeStep2Schema = z.object({
  mandateDecisionDate: z.string().datetime({ message: "تاريخ قرار ندب الخبرة مطلوب" }),
  mandateReceivedDate: z.string().datetime().optional().nullable(),
  mandateAcceptedDate: z.string().datetime().optional().nullable(),
  nextHearingDate: z.string().datetime().optional().nullable(),
  reportDeadlineDate: z.string().datetime().optional().nullable(),
  appointmentCapacity: z.enum(APPOINTMENT_CAPACITIES),
  committeeMembers: z.array(committeeMemberSchema).default([]),
  mandateNature: z.array(z.enum(MANDATE_NATURE_OPTIONS)).default([]),
  mandateNotes: z.string().optional().nullable(),
});
export type CaseIntakeStep2Input = z.infer<typeof caseIntakeStep2Schema>;

// تعديل عام لبيانات الدعوى (يغطي حقول المرحلتين 1 و2 معاً، مستخدَم في PATCH)
export const updateCaseSchema = caseIntakeStep1Schema
  .partial()
  .merge(caseIntakeStep2Schema.partial())
  .extend({
    status: z.enum(CASE_STATUSES).optional(),
    caseType: z.enum(CASE_TYPES).optional(),
    intakeStatus: z.enum(INTAKE_STATUSES).optional(),
    readinessStatus: z.enum(CASE_READINESS_STATUSES).optional(),
  });
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;

// ---------------------------------------------------------------------------
// Requirement checklist (متطلبات الملف) — still used for manual/ad-hoc items
// and as the materialized form of a Phase-4 analysis's missing-documents list.
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
