-- Case: الملف جاهز للدراسة flag (Module 3)
ALTER TABLE "Case" ADD COLUMN "readinessStatus" TEXT NOT NULL DEFAULT 'NEEDS_MORE_WORK';

-- Requirement: persist the mandate-task link the Phase-4 AI already
-- produces (previously dropped when materializing missingDocuments).
ALTER TABLE "Requirement" ADD COLUMN "relatedTask" TEXT;

-- DocumentDemand: manual mandate-task tag, settable at creation.
ALTER TABLE "DocumentDemand" ADD COLUMN "relatedTask" TEXT;

-- SiteInspection: structured fields (was one free-text "notes"),
-- attachments, and the deterministically compiled visit-report draft.
ALTER TABLE "SiteInspection" ADD COLUMN "equipmentReviewed" TEXT;
ALTER TABLE "SiteInspection" ADD COLUMN "booksReviewed" TEXT;
ALTER TABLE "SiteInspection" ADD COLUMN "attachmentDocumentIds" TEXT;
ALTER TABLE "SiteInspection" ADD COLUMN "visitReportDraft" TEXT;

-- CreateTable: SiteInspectionTestimony
CREATE TABLE "SiteInspectionTestimony" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteInspectionId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "personRole" TEXT,
    "statementText" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SiteInspectionTestimony_siteInspectionId_fkey" FOREIGN KEY ("siteInspectionId") REFERENCES "SiteInspection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SiteInspectionTestimony_siteInspectionId_idx" ON "SiteInspectionTestimony"("siteInspectionId");
