import { prisma } from "./db";

export function getCaseDetail(id: string) {
  return prisma.case.findUnique({
    where: { id },
    include: {
      parties: { orderBy: { order: "asc" } },
      requirements: {
        orderBy: { order: "asc" },
        include: {
          matches: { include: { document: true }, orderBy: { confidence: "desc" } },
        },
      },
      documents: { orderBy: { uploadedAt: "desc" } },
      emailDrafts: { orderBy: { createdAt: "desc" } },
      notices: { orderBy: { createdAt: "desc" }, include: { deliveries: true } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      // الموديولات 2-4 (لوحة القضية بنظام البطاقات) — انظر lib/hub-schemas.ts
      meetingAttendees: { orderBy: { order: "asc" }, include: { document: true } },
      hearingSessions: { orderBy: { createdAt: "asc" } },
      documentDemands: { orderBy: { deadline: "asc" } },
      siteInspections: {
        orderBy: { visitDate: "desc" },
        include: { testimonies: { orderBy: { order: "asc" } } },
      },
      courtReport: true,
    },
  });
}

export type CaseDetail = NonNullable<Awaited<ReturnType<typeof getCaseDetail>>>;
export type CasePartyDetail = CaseDetail["parties"][number];
export type RequirementDetail = CaseDetail["requirements"][number];
export type DocumentDetail = CaseDetail["documents"][number];
export type EmailDraftDetail = CaseDetail["emailDrafts"][number];
export type NoticeSummary = CaseDetail["notices"][number];
export type CaseAnalysisDetail = CaseDetail["analyses"][number];
export type MeetingAttendeeDetail = CaseDetail["meetingAttendees"][number];
export type HearingSessionSummary = CaseDetail["hearingSessions"][number];
export type DocumentDemandDetail = CaseDetail["documentDemands"][number];
export type SiteInspectionDetail = CaseDetail["siteInspections"][number];
export type CourtReportDetail = CaseDetail["courtReport"];

export function getNoticeDetail(caseId: string, noticeId: string) {
  return prisma.notice.findFirst({ where: { id: noticeId, caseId } });
}

export type NoticeDetail = NonNullable<Awaited<ReturnType<typeof getNoticeDetail>>>;

/** غرفة إدارة الاجتماع (الموديول 2) — تُجلب على حدة عن بيانات الدعوى
 * الكاملة لتفادي جلب زائد في صفحة قد تُفتح أثناء اجتماع حي. */
export function getHearingSessionDetail(caseId: string, hearingId: string) {
  return prisma.hearingSession.findFirst({
    where: { id: hearingId, caseId },
    include: {
      questions: { orderBy: { order: "asc" } },
      attendanceRecords: { include: { attendee: true } },
      documentDemands: { orderBy: { deadline: "asc" } },
    },
  });
}

export type HearingSessionDetail = NonNullable<
  Awaited<ReturnType<typeof getHearingSessionDetail>>
>;
export type HearingQuestionDetail = HearingSessionDetail["questions"][number];
export type HearingAttendanceRecordDetail = HearingSessionDetail["attendanceRecords"][number];
