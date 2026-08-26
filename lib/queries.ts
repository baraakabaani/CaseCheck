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
    },
  });
}

export type CaseDetail = NonNullable<Awaited<ReturnType<typeof getCaseDetail>>>;
export type RequirementDetail = CaseDetail["requirements"][number];
export type DocumentDetail = CaseDetail["documents"][number];
export type EmailDraftDetail = CaseDetail["emailDrafts"][number];
