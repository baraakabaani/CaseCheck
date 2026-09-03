// Zod input schemas for the Case Hub modules (Module 2/3/4). Mirrors the
// existing pattern in lib/schemas.ts.

import { z } from "zod";

// --- الموديول 2: إدارة الاجتماع والتواصل -------------------------------
export const MEETING_ATTENDEE_ROLES = ["CLAIMANT", "RESPONDENT", "POA", "EXPERT", "OTHER"] as const;
export type MeetingAttendeeRole = (typeof MEETING_ATTENDEE_ROLES)[number];

export const ATTENDANCE_STATUSES = ["PENDING", "PRESENT", "LATE", "ABSENT"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const meetingAttendeeInputSchema = z.object({
  name: z.string().min(1, "اسم الحاضر مطلوب"),
  role: z.enum(MEETING_ATTENDEE_ROLES),
  representingParty: z.string().optional().nullable(),
  order: z.number().int().default(0),
});
export type MeetingAttendeeInput = z.infer<typeof meetingAttendeeInputSchema>;

export const updateMeetingAttendeeSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(MEETING_ATTENDEE_ROLES).optional(),
  representingParty: z.string().optional().nullable(),
  attendanceStatus: z.enum(ATTENDANCE_STATUSES).optional(),
  documentId: z.string().optional().nullable(),
});
export type UpdateMeetingAttendeeInput = z.infer<typeof updateMeetingAttendeeSchema>;

export const HEARING_STATUSES = ["NOT_SCHEDULED", "SCHEDULED", "IN_PROGRESS", "COMPLETED"] as const;
export type HearingStatus = (typeof HEARING_STATUSES)[number];

export const hearingSessionInputSchema = z.object({
  label: z.string().min(1).default("الاجتماع الأول"),
  meetingDate: z.string().datetime().optional().nullable(),
  meetingTime: z.string().optional().nullable(),
  meetingMethod: z.string().optional().nullable(),
  meetingLink: z.string().optional().nullable(),
  meetingId: z.string().optional().nullable(),
  meetingPasscode: z.string().optional().nullable(),
});
export type HearingSessionInput = z.infer<typeof hearingSessionInputSchema>;

export const updateHearingSessionSchema = z.object({
  label: z.string().min(1).optional(),
  status: z.enum(HEARING_STATUSES).optional(),
  meetingDate: z.string().datetime().optional().nullable(),
  meetingTime: z.string().optional().nullable(),
  meetingMethod: z.string().optional().nullable(),
  meetingLink: z.string().optional().nullable(),
  meetingId: z.string().optional().nullable(),
  meetingPasscode: z.string().optional().nullable(),
  openingNotes: z.string().optional().nullable(),
  minutesDraft: z.string().optional().nullable(),
});
export type UpdateHearingSessionInput = z.infer<typeof updateHearingSessionSchema>;

export const HEARING_QUESTION_PARTY_ROLES = ["CLAIMANT", "RESPONDENT"] as const;
export type HearingQuestionPartyRole = (typeof HEARING_QUESTION_PARTY_ROLES)[number];

export const HEARING_QUESTION_STATUSES = ["PENDING", "ANSWERED", "DEFERRED", "REFUSED"] as const;
export type HearingQuestionStatus = (typeof HEARING_QUESTION_STATUSES)[number];

export const hearingQuestionInputSchema = z.object({
  partyRole: z.enum(HEARING_QUESTION_PARTY_ROLES),
  questionText: z.string().min(1, "نص السؤال مطلوب"),
});
export type HearingQuestionInput = z.infer<typeof hearingQuestionInputSchema>;

export const updateHearingQuestionSchema = z.object({
  questionText: z.string().min(1).optional(),
  answerText: z.string().optional().nullable(),
  status: z.enum(HEARING_QUESTION_STATUSES).optional(),
});
export type UpdateHearingQuestionInput = z.infer<typeof updateHearingQuestionSchema>;

export const updateHearingAttendanceSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES),
});
export type UpdateHearingAttendanceInput = z.infer<typeof updateHearingAttendanceSchema>;

// نص التفريغ يُرسل إما كملف (multipart، يُعالَج عبر lib/document-parser.ts)
// أو كنص مباشر (JSON) — هذا المخطط للمسار الثاني فقط.
export const hearingTranscriptTextInputSchema = z.object({
  text: z.string().min(1, "نص التفريغ مطلوب"),
});
export type HearingTranscriptTextInput = z.infer<typeof hearingTranscriptTextInputSchema>;

export const NOTICE_DELIVERY_STATUSES = ["SENT", "ACKNOWLEDGED"] as const;
export type NoticeDeliveryStatus = (typeof NOTICE_DELIVERY_STATUSES)[number];

export const updateNoticeDeliverySchema = z.object({
  status: z.enum(NOTICE_DELIVERY_STATUSES),
});
export type UpdateNoticeDeliveryInput = z.infer<typeof updateNoticeDeliverySchema>;

// --- الموديول 3: المتابعة والمعاينة الميدانية ---------------------------
export const siteInspectionInputSchema = z.object({
  visitDate: z.string().datetime({ message: "تاريخ الزيارة مطلوب" }),
  location: z.string().min(1, "موقع المعاينة مطلوب"),
  purpose: z.string().min(1, "الغرض من الزيارة مطلوب"),
  attendees: z.array(z.string().min(1)).default([]),
  notes: z.string().optional().nullable(),
});
export type SiteInspectionInput = z.infer<typeof siteInspectionInputSchema>;

export const updateSiteInspectionSchema = z.object({
  equipmentReviewed: z.string().optional().nullable(),
  booksReviewed: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  attachmentDocumentIds: z.array(z.string()).optional(),
  visitReportDraft: z.string().optional().nullable(),
});
export type UpdateSiteInspectionInput = z.infer<typeof updateSiteInspectionSchema>;

export const siteInspectionTestimonyInputSchema = z.object({
  personName: z.string().min(1, "اسم صاحب الإفادة مطلوب"),
  personRole: z.string().optional().nullable(),
  statementText: z.string().min(1, "نص الإفادة مطلوب"),
});
export type SiteInspectionTestimonyInput = z.infer<typeof siteInspectionTestimonyInputSchema>;

export const updateSiteInspectionTestimonySchema = z.object({
  personName: z.string().min(1).optional(),
  personRole: z.string().optional().nullable(),
  statementText: z.string().min(1).optional(),
});
export type UpdateSiteInspectionTestimonyInput = z.infer<typeof updateSiteInspectionTestimonySchema>;

export const DOCUMENT_DEMAND_STATUSES = ["PENDING", "PARTIALLY_RECEIVED", "RECEIVED"] as const;
export type DocumentDemandStatus = (typeof DOCUMENT_DEMAND_STATUSES)[number];

export const documentDemandInputSchema = z.object({
  hearingSessionId: z.string().optional().nullable(),
  item: z.string().min(1, "اسم المستند المطلوب"),
  requestedFromPartyIds: z.array(z.string()).default([]),
  deadline: z.string().datetime({ message: "الموعد النهائي مطلوب" }),
  relatedTask: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type DocumentDemandInput = z.infer<typeof documentDemandInputSchema>;

export const updateDocumentDemandSchema = z.object({
  item: z.string().min(1).optional(),
  requestedFromPartyIds: z.array(z.string()).optional(),
  deadline: z.string().datetime().optional(),
  status: z.enum(DOCUMENT_DEMAND_STATUSES).optional(),
  relatedTask: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type UpdateDocumentDemandInput = z.infer<typeof updateDocumentDemandSchema>;

// --- الموديول 4: استوديو إعداد التقرير القضائي --------------------------
export const COURT_REPORT_STATUSES = ["DRAFT", "FINAL"] as const;
export type CourtReportStatus = (typeof COURT_REPORT_STATUSES)[number];

export const updateCourtReportSchema = z.object({
  status: z.enum(COURT_REPORT_STATUSES).optional(),
  introductionMandate: z.string().optional().nullable(),
  partiesAndProcedures: z.string().optional().nullable(),
  taskAnalysis: z.string().optional().nullable(),
  conclusionSettlement: z.string().optional().nullable(),
  documentsIndex: z.string().optional().nullable(),
});
export type UpdateCourtReportInput = z.infer<typeof updateCourtReportSchema>;
