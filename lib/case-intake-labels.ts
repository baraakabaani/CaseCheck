import type {
  AppointmentCapacity,
  CaseCategory,
  CasePartyRole,
  DocCategory,
  IntakeStatus,
  LitigationDegree,
  MandateNatureOption,
} from "./schemas";

export const LITIGATION_DEGREE_LABELS: Record<LitigationDegree, string> = {
  FIRST_INSTANCE: "أول درجة",
  APPEAL: "استئناف",
  EXECUTION: "تنفيذ",
  OTHER: "أخرى",
};

export const CASE_CATEGORY_LABELS: Record<CaseCategory, string> = {
  COMMERCIAL: "تجاري",
  CIVIL: "مدني",
  REAL_ESTATE: "عقاري",
  LABOR: "عمالي",
  OTHER: "أخرى",
};

export const CASE_PARTY_ROLE_LABELS: Record<CasePartyRole, string> = {
  CLAIMANT: "المدعي / المستأنف",
  RESPONDENT: "المدعى عليه / المستأنف ضده",
};

export const APPOINTMENT_CAPACITY_LABELS: Record<AppointmentCapacity, string> = {
  SOLE_EXPERT: "خبير حسابي منفرد",
  COMMITTEE_CHAIR: "رئيس لجنة خبراء",
  COMMITTEE_MEMBER: "عضو في لجنة خبراء",
};

export const MANDATE_NATURE_LABELS: Record<MandateNatureOption, string> = {
  EXAMINE_AUDIT_ACCOUNTS: "فحص وتدقيق الحسابات",
  SETTLE_ACCOUNT_BETWEEN_PARTIES: "تصفية حساب بين الأطراف",
  DETERMINE_PAID_DUE_AMOUNTS: "تحديد المبالغ المسددة والمستحقة",
  EXAMINE_BANKING_TRANSACTIONS: "فحص معاملات مصرفية",
  COMPANY_PARTNER_ACCOUNTS: "حسابات شركات وشركاء",
  EXAMINE_PROFIT_LOSS: "فحص أرباح وخسائر",
  FINANCIAL_CLAIM: "مطالبة مالية",
  OTHER: "أخرى",
};

export const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  PRELIMINARY_RULING: "الحكم التمهيدي / قرار ندب الخبرة",
  STATEMENT_OF_CLAIM: "لائحة / صحيفة الدعوى",
  PARTY_MEMO: "مذكرة أحد الأطراف",
  PARTY_ATTACHMENT: "مستند مرفق من أحد الأطراف",
  OTHER_JUDICIAL: "مستند قضائي آخر",
  UNSPECIFIED: "غير مصنّف",
};

export const INTAKE_STATUS_LABELS: Record<IntakeStatus, string> = {
  DRAFT_PHASE_1: "بيانات القضية الأساسية",
  DRAFT_PHASE_2: "بيانات مأمورية الخبرة",
  DRAFT_PHASE_3: "رفع المستندات",
  DRAFT_PHASE_4: "التحليل الأولي",
  ACTIVE: "مكتمل الفتح",
};

/** Path (relative to /cases/[id]) the case should resume at, given its
 * current intake status — null once the case is fully active. */
export function intakeNextPath(caseId: string, status: IntakeStatus): string | null {
  switch (status) {
    case "DRAFT_PHASE_1":
      return `/cases/new?resume=${caseId}`;
    case "DRAFT_PHASE_2":
      return `/cases/${caseId}/setup/mandate`;
    case "DRAFT_PHASE_3":
      return `/cases/${caseId}/setup/documents`;
    case "DRAFT_PHASE_4":
      return `/cases/${caseId}/setup/analysis`;
    case "ACTIVE":
      return null;
  }
}
