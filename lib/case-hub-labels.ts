import type {
  AttendanceStatus,
  CourtReportStatus,
  DocumentDemandStatus,
  HearingQuestionStatus,
  HearingStatus,
  MeetingAttendeeRole,
  NoticeDeliveryStatus,
} from "./hub-schemas";
import type { CaseReadinessStatus } from "./schemas";

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
