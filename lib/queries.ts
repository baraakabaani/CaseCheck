import { prisma } from "./db";

export function getCaseDetail(id: string) {
  return prisma.case.findUnique({
    where: { id },
    include: {
      requirements: {
        orderBy: { order: "asc" },
        include: {
          matches: { include: { document: true }, orderBy: { confidence: "desc" } },
        },
      },
      documents: { orderBy: { uploadedAt: "desc" } },
      emailDrafts: { orderBy: { createdAt: "desc" } },
      notices: { orderBy: { createdAt: "desc" } },
    },
  });
}

export type CaseDetail = NonNullable<Awaited<ReturnType<typeof getCaseDetail>>>;
export type RequirementDetail = CaseDetail["requirements"][number];
export type DocumentDetail = CaseDetail["documents"][number];
export type EmailDraftDetail = CaseDetail["emailDrafts"][number];
export type NoticeSummary = CaseDetail["notices"][number];

export function getNoticeDetail(caseId: string, noticeId: string) {
  return prisma.notice.findFirst({ where: { id: noticeId, caseId } });
}

export type NoticeDetail = NonNullable<Awaited<ReturnType<typeof getNoticeDetail>>>;
