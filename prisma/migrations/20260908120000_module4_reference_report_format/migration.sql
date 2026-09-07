-- CreateTable: ExpertProfile (سجل واحد فقط — لا مستخدمين/مصادقة في هذا التطبيق)
CREATE TABLE "ExpertProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expertName" TEXT NOT NULL DEFAULT '',
    "expertTitle" TEXT NOT NULL DEFAULT 'الخبير الحسابي',
    "registrationNumber" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "fax" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CaseParty: صفة الطرف كما تُطبع في جدولي الغلاف (شريك بنسبة 68% ومدير الشركة)
ALTER TABLE "CaseParty" ADD COLUMN "capacityNote" TEXT;

-- CourtReport: خطاب الغلاف + نطاق الفحص + عرض التقرير المبدئي + الخلاصة المرقّمة
ALTER TABLE "CourtReport" ADD COLUMN "judgeName" TEXT;
ALTER TABLE "CourtReport" ADD COLUMN "judgeTitle" TEXT;
ALTER TABLE "CourtReport" ADD COLUMN "letterDate" DATETIME;
ALTER TABLE "CourtReport" ADD COLUMN "scopeNarrative" TEXT;
ALTER TABLE "CourtReport" ADD COLUMN "scopeNarrativeProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT';
ALTER TABLE "CourtReport" ADD COLUMN "preliminaryReportSharedAt" DATETIME;
ALTER TABLE "CourtReport" ADD COLUMN "objectionsDeadline" DATETIME;
ALTER TABLE "CourtReport" ADD COLUMN "objectionsIntro" TEXT;
ALTER TABLE "CourtReport" ADD COLUMN "objectionsIntroProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT';
ALTER TABLE "CourtReport" ADD COLUMN "conclusionIntro" TEXT;
ALTER TABLE "CourtReport" ADD COLUMN "conclusionItemsJson" TEXT;
ALTER TABLE "CourtReport" ADD COLUMN "conclusionClosing" TEXT;
ALTER TABLE "CourtReport" ADD COLUMN "conclusionProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT';

-- CreateTable: CourtReportTable (جداول التقرير المالية — جدول لكل تحليل فرعي)
CREATE TABLE "CourtReportTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courtReportId" TEXT NOT NULL,
    "courtReportTaskId" TEXT,
    "placement" TEXT NOT NULL DEFAULT 'TASK',
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "columnsJson" TEXT NOT NULL,
    "rowsJson" TEXT NOT NULL,
    "basisNote" TEXT,
    "computation" TEXT NOT NULL DEFAULT 'AI_PROPOSED',
    "sourceDocumentIds" TEXT,
    "computationJson" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourtReportTable_courtReportId_fkey" FOREIGN KEY ("courtReportId") REFERENCES "CourtReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourtReportTable_courtReportTaskId_fkey" FOREIGN KEY ("courtReportTaskId") REFERENCES "CourtReportTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CourtReportTable_courtReportId_idx" ON "CourtReportTable"("courtReportId");
CREATE INDEX "CourtReportTable_courtReportTaskId_idx" ON "CourtReportTable"("courtReportTaskId");

-- CreateTable: ReportObjection (اعتراضات الأطراف على التقرير المبدئي وردود الخبرة)
CREATE TABLE "ReportObjection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courtReportId" TEXT NOT NULL,
    "partyRole" TEXT NOT NULL,
    "submittedOnBehalfOfLabel" TEXT NOT NULL,
    "objectionMemoDate" DATETIME,
    "order" INTEGER NOT NULL DEFAULT 0,
    "objectionText" TEXT NOT NULL,
    "objectionProvenance" TEXT NOT NULL DEFAULT 'EXTRACT',
    "responseText" TEXT,
    "responseProvenance" TEXT NOT NULL DEFAULT 'AI_DRAFT',
    "linkedTaskIndex" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportObjection_courtReportId_fkey" FOREIGN KEY ("courtReportId") REFERENCES "CourtReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReportObjection_courtReportId_idx" ON "ReportObjection"("courtReportId");
