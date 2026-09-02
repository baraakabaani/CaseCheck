import type {
  AttendanceStatus,
  CourtReportStatus,
  HearingStatus,
  MeetingAttendeeRole,
} from "./hub-schemas";

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
