import type {
  AttendanceStatus,
  CourtReportStatus,
  DocumentDemandStatus,
  HearingQuestionStatus,
  HearingStatus,
  MeetingAttendeeRole,
  NoticeDeliveryStatus,
  ProvenanceState,
} from "./hub-schemas";
import type { CaseReadinessStatus } from "./schemas";
import type { TimelineEventKind } from "./reports/report-aggregator";

export const MEETING_ATTENDEE_ROLE_LABELS: Record<MeetingAttendeeRole, string> = {
  CLAIMANT: "مدعٍ",
  RESPONDENT: "مدعى عليه",
  POA: "وكيل / حامل توكيل",
  EXPERT: "خبير",
  OTHER: "أخرى",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PENDING: "لم يُحدَّد",
  PRESENT: "حاضر",
  LATE: "تأخر",
  ABSENT: "غائب",
};

export const HEARING_STATUS_LABELS: Record<HearingStatus, string> = {
  NOT_SCHEDULED: "لم تُحدَّد بعد",
  SCHEDULED: "بانتظار الاجتماع",
  IN_PROGRESS: "الاجتماع جارٍ",
  COMPLETED: "تم عقد الاجتماع",
};

export const COURT_REPORT_STATUS_LABELS: Record<CourtReportStatus, string> = {
  DRAFT: "مسودة",
  FINAL: "معتمد",
};

export const HEARING_QUESTION_STATUS_LABELS: Record<HearingQuestionStatus, string> = {
  PENDING: "لم تُطرح بعد",
  ANSWERED: "تمت الإجابة",
  DEFERRED: "مؤجَّل",
  REFUSED: "رفض الإجابة",
};

export const DOCUMENT_DEMAND_STATUS_LABELS: Record<DocumentDemandStatus, string> = {
  PENDING: "مطلوبة",
  PARTIALLY_RECEIVED: "مستلمة جزئياً",
  RECEIVED: "مكتملة ومطابقة",
};

export const NOTICE_DELIVERY_STATUS_LABELS: Record<NoticeDeliveryStatus, string> = {
  SENT: "تم الإرسال",
  ACKNOWLEDGED: "تم الاستلام",
};

export const CASE_READINESS_STATUS_LABELS: Record<CaseReadinessStatus, string> = {
  NEEDS_MORE_WORK: "يلزم إجراءات إضافية",
  READY_FOR_STUDY: "الملف جاهز للدراسة",
};

// --- الموديول 4 (v2) — تتبّع مصدر كل كتلة نصية (provenance) ---------------
export const PROVENANCE_LABELS: Record<ProvenanceState, string> = {
  EXTRACT: "منقول من الملف",
  AI_DRAFT: "مسودة ذكاء اصطناعي — تحتاج مراجعة",
  EXPERT_CERTIFIED: "معتمد من الخبير",
};

export const PROVENANCE_SHORT_LABELS: Record<ProvenanceState, string> = {
  EXTRACT: "اقتباس",
  AI_DRAFT: "مسودة AI",
  EXPERT_CERTIFIED: "معتمد",
};

/** فئات Tailwind الجاهزة لشارة/حد كل حالة — أخضر للمنقول حرفياً، بنفسجي
 * لمسودة الذكاء الاصطناعي، ولون العلامة التجارية الأساسي لما اعتمده الخبير
 * (بدل لون محايد منفصل، طالما هو أصلاً لون "الاكتمال" في بقية التطبيق). */
export const PROVENANCE_TONE: Record<ProvenanceState, { badge: string; border: string }> = {
  EXTRACT: {
    badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    border: "border-e-4 border-e-emerald-500",
  },
  AI_DRAFT: {
    badge: "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300",
    border: "border-e-4 border-e-purple-500",
  },
  EXPERT_CERTIFIED: {
    badge: "border-primary/30 bg-primary/10 text-primary",
    border: "border-e-4 border-e-primary",
  },
};

export const REPORT_SECTION_LABELS = {
  introduction: "المقدمة",
  mandateSummary: "ملخص المأمورية",
  partiesOverview: "الأطراف وصفاتهم",
  proceduralHistory: "الإجراءات",
  documentInventory: "حافظة المستندات",
} as const;

export const REPORT_TASK_FIELD_LABELS = {
  taskText: "نص المهمة (من المأمورية)",
  claimantPosition: "موقف المدعي",
  respondentPosition: "موقف المدعى عليه",
  linkedExhibits: "المستندات المرتبطة",
  forensicAnalysis: "بحث الخبرة",
  missingDocsImpact: "أثر المستندات الناقصة",
  expertVerdict: "رأي الخبرة",
} as const;

export const TIMELINE_EVENT_LABELS: Record<TimelineEventKind, string> = {
  MANDATE_DECISION: "صدور قرار ندب الخبرة",
  MANDATE_RECEIVED: "استلام المأمورية",
  MANDATE_ACCEPTED: "قبول المأمورية",
  ANALYSIS_APPROVED: "اعتماد التحليل الأولي",
  NOTICE_ISSUED: "إرسال إخطار الاجتماع",
  NOTICE_DELIVERED: "تسليم إخطار الاجتماع",
  HEARING_HELD: "انعقاد اجتماع الخبرة",
  TRANSCRIPT_CORRECTED: "تصحيح تفريغ الاجتماع",
  DEMANDS_ISSUED: "طلب مستندات",
  SITE_INSPECTION: "زيارة معاينة ميدانية",
  NEXT_HEARING: "الجلسة القادمة أمام المحكمة",
  REPORT_DEADLINE: "آخر موعد لإيداع التقرير",
};
