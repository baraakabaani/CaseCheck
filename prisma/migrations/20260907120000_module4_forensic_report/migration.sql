-- CreateTable: CourtReportTask (Module 4 v2 — one isolated section per mandate task)
CREATE TABLE "CourtReportTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courtReportId" TEXT NOT NULL,
    "taskIndex" INTEGER NOT NULL,
    "taskText" TEXT NOT NULL,
    "claimantPosition" TEXT,
    "respondentPosition" TEXT,
    "forensicAnalysis" TEXT,
    "missingDocsImpact" TEXT,
    "expertVerdict" TEXT,
    "claimantPositionProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "respondentPositionProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "forensicAnalysisProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "expertVerdictProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "claimantAmount" REAL,
    "respondentOffset" REAL,
    "amountNote" TEXT,
    "linkedDocumentIds" TEXT,
    "linkedRequirementIds" TEXT,
    "linkedDemandIds" TEXT,
    "exhibitLinksJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourtReportTask_courtReportId_fkey" FOREIGN KEY ("courtReportId") REFERENCES "CourtReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CourtReportTask_courtReportId_idx" ON "CourtReportTask"("courtReportId");
CREATE UNIQUE INDEX "CourtReportTask_courtReportId_taskIndex_key" ON "CourtReportTask"("courtReportId", "taskIndex");

-- RedefineTables: CourtReport v1 (5 free-text tabs) -> v2 (structured sections + provenance)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CourtReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "introduction" TEXT,
    "mandateSummary" TEXT,
    "partiesOverview" TEXT,
    "proceduralHistory" TEXT,
    "documentInventory" TEXT,
    "introductionProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "mandateSummaryProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "partiesOverviewProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "proceduralHistoryProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "documentInventoryProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "settlementBeneficiary" TEXT,
    "settlementNarrative" TEXT,
    "settlementNarrativeProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "timelineJson" TEXT,
    "inventoryJson" TEXT,
    "partyClaimsJson" TEXT,
    "generationMode" TEXT,
    "generationWarning" TEXT,
    "lastGeneratedAt" DATETIME,
    "finalizedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourtReport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- أي نص كتبه الخبير يدوياً في النسخة الأولى يُنقل إلى أقرب قسم مقابل
-- ويُوسم EXPERT_CERTIFIED (فهو من كتابة الخبير أصلاً، لا من الذكاء
-- الاصطناعي). "taskAnalysis" لا مقابل مباشر له (استُبدل بأقسام المهام
-- المستقلة)، فيُلحق بنص الإجراءات مع علامة واضحة بدل إسقاطه بصمت.
INSERT INTO "new_CourtReport" (
    "id","caseId","status",
    "introduction","mandateSummary","partiesOverview","proceduralHistory","documentInventory",
    "introductionProvenance","mandateSummaryProvenance","partiesOverviewProvenance",
    "proceduralHistoryProvenance","documentInventoryProvenance",
    "settlementNarrative","settlementNarrativeProvenance","updatedAt"
)
SELECT
    "id","caseId","status",
    "introductionMandate",
    NULL,
    "partiesAndProcedures",
    CASE
      WHEN "taskAnalysis" IS NULL OR "taskAnalysis" = '' THEN NULL
      ELSE '— نص «البحث والدراسة» من النسخة السابقة —' || char(10) || "taskAnalysis"
    END,
    "documentsIndex",
    'EXPERT_CERTIFIED','AI_DRAFT','EXPERT_CERTIFIED','EXPERT_CERTIFIED','EXPERT_CERTIFIED',
    "conclusionSettlement",'EXPERT_CERTIFIED',
    "updatedAt"
FROM "CourtReport";

DROP TABLE "CourtReport";
ALTER TABLE "new_CourtReport" RENAME TO "CourtReport";
CREATE UNIQUE INDEX "CourtReport_caseId_key" ON "CourtReport"("caseId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
