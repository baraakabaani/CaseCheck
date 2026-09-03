-- HearingSession: drop the one-session-per-case constraint (a case can now
-- have multiple hearing sessions) and add live-hearing-room fields.
DROP INDEX "HearingSession_caseId_key";

ALTER TABLE "HearingSession" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'الاجتماع الأول';
ALTER TABLE "HearingSession" ADD COLUMN "meetingTime" TEXT;
ALTER TABLE "HearingSession" ADD COLUMN "meetingMethod" TEXT;
ALTER TABLE "HearingSession" ADD COLUMN "meetingLink" TEXT;
ALTER TABLE "HearingSession" ADD COLUMN "meetingId" TEXT;
ALTER TABLE "HearingSession" ADD COLUMN "meetingPasscode" TEXT;
ALTER TABLE "HearingSession" ADD COLUMN "startedAt" DATETIME;
ALTER TABLE "HearingSession" ADD COLUMN "endedAt" DATETIME;
ALTER TABLE "HearingSession" ADD COLUMN "rawTranscript" TEXT;
ALTER TABLE "HearingSession" ADD COLUMN "correctedTranscript" TEXT;

-- MeetingAttendee: attach an uploaded POA document.
ALTER TABLE "MeetingAttendee" ADD COLUMN "documentId" TEXT;

-- CreateIndex
CREATE INDEX "MeetingAttendee_documentId_idx" ON "MeetingAttendee"("documentId");

-- CreateTable: HearingQuestion (Q&A log per session)
CREATE TABLE "HearingQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hearingSessionId" TEXT NOT NULL,
    "partyRole" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "answerText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "HearingQuestion_hearingSessionId_fkey" FOREIGN KEY ("hearingSessionId") REFERENCES "HearingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HearingQuestion_hearingSessionId_idx" ON "HearingQuestion"("hearingSessionId");

-- CreateTable: HearingAttendanceRecord (live roll-call per session)
CREATE TABLE "HearingAttendanceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hearingSessionId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "markedAt" DATETIME,
    CONSTRAINT "HearingAttendanceRecord_hearingSessionId_fkey" FOREIGN KEY ("hearingSessionId") REFERENCES "HearingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HearingAttendanceRecord_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "MeetingAttendee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HearingAttendanceRecord_hearingSessionId_attendeeId_key" ON "HearingAttendanceRecord"("hearingSessionId", "attendeeId");
CREATE INDEX "HearingAttendanceRecord_hearingSessionId_idx" ON "HearingAttendanceRecord"("hearingSessionId");

-- CreateTable: DocumentDemand (Module 2/3 — document requests with deadlines)
CREATE TABLE "DocumentDemand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "hearingSessionId" TEXT,
    "item" TEXT NOT NULL,
    "requestedFromPartyIds" TEXT NOT NULL,
    "deadline" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentDemand_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentDemand_hearingSessionId_fkey" FOREIGN KEY ("hearingSessionId") REFERENCES "HearingSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DocumentDemand_caseId_idx" ON "DocumentDemand"("caseId");
CREATE INDEX "DocumentDemand_hearingSessionId_idx" ON "DocumentDemand"("hearingSessionId");

-- CreateTable: NoticeDelivery (per-attendee delivery tracking)
CREATE TABLE "NoticeDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noticeId" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    CONSTRAINT "NoticeDelivery_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoticeDelivery_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "MeetingAttendee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NoticeDelivery_noticeId_attendeeId_key" ON "NoticeDelivery"("noticeId", "attendeeId");
CREATE INDEX "NoticeDelivery_noticeId_idx" ON "NoticeDelivery"("noticeId");
