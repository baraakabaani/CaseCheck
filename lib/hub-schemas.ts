// Zod input schemas for the 3 new Case Hub modules (Module 2/3/4 — first
// pass, see AGENTS/plan notes on scope). Mirrors the existing pattern in
// lib/schemas.ts.

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
});
export type UpdateMeetingAttendeeInput = z.infer<typeof updateMeetingAttendeeSchema>;

export const HEARING_STATUSES = ["NOT_SCHEDULED", "SCHEDULED", "IN_PROGRESS", "COMPLETED"] as const;
export type HearingStatus = (typeof HEARING_STATUSES)[number];

export const updateHearingSessionSchema = z.object({
  status: z.enum(HEARING_STATUSES).optional(),
  meetingDate: z.string().datetime().optional().nullable(),
  openingNotes: z.string().optional().nullable(),
  minutesDraft: z.string().optional().nullable(),
});
export type UpdateHearingSessionInput = z.infer<typeof updateHearingSessionSchema>;

// --- الموديول 3: المتابعة والمعاينة الميدانية ---------------------------
export const siteInspectionInputSchema = z.object({
  visitDate: z.string().datetime({ message: "تاريخ الزيارة مطلوب" }),
  location: z.string().min(1, "موقع المعاينة مطلوب"),
  purpose: z.string().min(1, "الغرض من الزيارة مطلوب"),
  attendees: z.array(z.string().min(1)).default([]),
  notes: z.string().optional().nullable(),
});
export type SiteInspectionInput = z.infer<typeof siteInspectionInputSchema>;

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
