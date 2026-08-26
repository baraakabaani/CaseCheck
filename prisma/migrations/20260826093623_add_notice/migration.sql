-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "noticeType" TEXT NOT NULL DEFAULT 'EXPERT_MEETING',
    "noticeLabel" TEXT NOT NULL,
    "subjectLine" TEXT NOT NULL,
    "referenceLetterNumber" TEXT,
    "referenceLetterDate" DATETIME,
    "meetingDate" DATETIME NOT NULL,
    "meetingTimeLabel" TEXT NOT NULL,
    "meetingMethod" TEXT NOT NULL DEFAULT 'تقنية الاتصال المرئي بواسطة تطبيق تقنية ZOOM MEETING',
    "meetingLink" TEXT,
    "meetingId" TEXT,
    "meetingPasscode" TEXT,
    "documentsDeadlineDays" INTEGER NOT NULL DEFAULT 2,
    "requestedFromLabel" TEXT NOT NULL,
    "addressees" TEXT NOT NULL,
    "requestedItems" TEXT NOT NULL,
    "expertTitle" TEXT NOT NULL DEFAULT 'الخبير الحسابي',
    "expertName" TEXT NOT NULL,
    "expertRegistrationNumber" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notice_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Notice_caseId_idx" ON "Notice"("caseId");
