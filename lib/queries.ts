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
      notices: { orderBy: { createdAt: "desc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      // الموديولات 2-4 (لوحة القضية بنظام البطاقات) — انظر lib/hub-schemas.ts
      meetingAttendees: { orderBy: { order: "asc" } },
      hearingSession: true,
      siteInspections: { orderBy: { visitDate: "desc" } },
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
export type HearingSessionDetail = CaseDetail["hearingSession"];
export type SiteInspectionDetail = CaseDetail["siteInspections"][number];
export type CourtReportDetail = CaseDetail["courtReport"];

export function getNoticeDetail(caseId: string, noticeId: string) {
  return prisma.notice.findFirst({ where: { id: noticeId, caseId } });
}

export type NoticeDetail = NonNullable<Awaited<ReturnType<typeof getNoticeDetail>>>;
