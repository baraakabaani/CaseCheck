-- CreateTable: CaseParty (created first so we can backfill from the
-- existing Case.claimantName / Case.respondentName columns before they
-- are dropped below).
CREATE TABLE "CaseParty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CaseParty_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CaseParty_caseId_idx" ON "CaseParty"("caseId");

-- Backfill: one CLAIMANT party per case with a non-empty claimantName
INSERT INTO "CaseParty" ("id", "caseId", "role", "name", "order")
SELECT 'cp_' || lower(hex(randomblob(12))), "id", 'CLAIMANT', "claimantName", 0
FROM "Case"
WHERE "claimantName" IS NOT NULL AND trim("claimantName") != '';

-- Backfill: one RESPONDENT party per case with a non-empty respondentName
INSERT INTO "CaseParty" ("id", "caseId", "role", "name", "order")
SELECT 'cp_' || lower(hex(randomblob(12))), "id", 'RESPONDENT', "respondentName", 0
FROM "Case"
WHERE "respondentName" IS NOT NULL AND trim("respondentName") != '';

-- AlterTable: Case — Phase 1/2 intake fields
ALTER TABLE "Case" ADD COLUMN "circuit" TEXT;
ALTER TABLE "Case" ADD COLUMN "litigationDegree" TEXT;
ALTER TABLE "Case" ADD COLUMN "caseCategory" TEXT;
ALTER TABLE "Case" ADD COLUMN "mandateDecisionDate" DATETIME;
ALTER TABLE "Case" ADD COLUMN "mandateReceivedDate" DATETIME;
ALTER TABLE "Case" ADD COLUMN "mandateAcceptedDate" DATETIME;
ALTER TABLE "Case" ADD COLUMN "nextHearingDate" DATETIME;
ALTER TABLE "Case" ADD COLUMN "reportDeadlineDate" DATETIME;
ALTER TABLE "Case" ADD COLUMN "appointmentCapacity" TEXT;
ALTER TABLE "Case" ADD COLUMN "committeeMembers" TEXT;
ALTER TABLE "Case" ADD COLUMN "mandateNature" TEXT;
ALTER TABLE "Case" ADD COLUMN "mandateNotes" TEXT;
ALTER TABLE "Case" ADD COLUMN "intakeStatus" TEXT NOT NULL DEFAULT 'DRAFT_PHASE_1';

-- Existing cases (created before this wizard existed) are already fully
-- set up — mark them ACTIVE so they don't show up as stuck mid-intake.
UPDATE "Case" SET "intakeStatus" = 'ACTIVE';

-- Now safe to drop the single-party columns; data is preserved in CaseParty.
ALTER TABLE "Case" DROP COLUMN "claimantName";
ALTER TABLE "Case" DROP COLUMN "respondentName";

-- AlterTable: Document — AI-assigned classification (Phase 4)
ALTER TABLE "Document" ADD COLUMN "docCategory" TEXT;
ALTER TABLE "Document" ADD COLUMN "submittedByPartyId" TEXT REFERENCES "CaseParty" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Document_submittedByPartyId_idx" ON "Document"("submittedByPartyId");

-- CreateTable: CaseAnalysis (Phase 4 output)
CREATE TABLE "CaseAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "mode" TEXT NOT NULL,
    "caseSummary" TEXT NOT NULL,
    "mandateText" TEXT NOT NULL,
    "mandateTasks" TEXT NOT NULL,
    "receivedDocumentsSummary" TEXT NOT NULL,
    "missingDocuments" TEXT NOT NULL,
    "unclearPoints" TEXT NOT NULL,
    "claimantQuestions" TEXT NOT NULL,
    "respondentQuestions" TEXT NOT NULL,
    "expertNotes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    CONSTRAINT "CaseAnalysis_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CaseAnalysis_caseId_idx" ON "CaseAnalysis"("caseId");
