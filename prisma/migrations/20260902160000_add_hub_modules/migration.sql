-- CreateTable: MeetingAttendee (Module 2 — attendee/POA registry)
CREATE TABLE "MeetingAttendee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "representingParty" TEXT,
    "attendanceStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingAttendee_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MeetingAttendee_caseId_idx" ON "MeetingAttendee"("caseId");

-- CreateTable: HearingSession (Module 2 — first-meeting status, v1)
CREATE TABLE "HearingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_SCHEDULED',
    "meetingDate" DATETIME,
    "openingNotes" TEXT,
    "minutesDraft" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HearingSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HearingSession_caseId_key" ON "HearingSession"("caseId");

-- CreateTable: SiteInspection (Module 3 — site visit log)
CREATE TABLE "SiteInspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "visitDate" DATETIME NOT NULL,
    "location" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "attendees" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteInspection_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SiteInspection_caseId_idx" ON "SiteInspection"("caseId");

-- CreateTable: CourtReport (Module 4 — report studio draft, v1)
CREATE TABLE "CourtReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "introductionMandate" TEXT,
    "partiesAndProcedures" TEXT,
    "taskAnalysis" TEXT,
    "conclusionSettlement" TEXT,
    "documentsIndex" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CourtReport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CourtReport_caseId_key" ON "CourtReport"("caseId");
