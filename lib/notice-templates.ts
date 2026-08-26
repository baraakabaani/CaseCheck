// Deterministic (no AI) composer for formal "إخطار" (notice) letters, e.g.
// "اخطار اجتماع الخبرة الأول". These follow a fixed legal letter format, so
// unlike the missing-documents email there is no LLM involved — the exact
// wording is assembled from the notice's structured fields. Both the
// printable letterhead document and the plain-text email consume the same
// composed sections, so they never drift out of sync.

import type { NoticeAddressee } from "./notice-schemas";

// Formal notices use a numeric Gregorian date style throughout (e.g.
// "2026/08/05"), not the long spelled-out form used elsewhere in the app
// (lib/format.ts's formatDate()) and not Eastern Arabic-Indic digits (which
// Intl's "ar" locale renders by default) — pad manually to sidestep both.
function formatNoticeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export interface NoticeCaseContext {
  caseNumber: string;
  title: string;
  court?: string | null;
}

export interface NoticeContext {
  noticeLabel: string;
  subjectLine: string;
  referenceLetterNumber?: string | null;
  referenceLetterDate?: Date | string | null;
  meetingDate: Date | string;
  meetingTimeLabel: string;
  meetingMethod: string;
  meetingLink?: string | null;
  meetingId?: string | null;
  meetingPasscode?: string | null;
  documentsDeadlineDays: number;
  requestedFromLabel: string;
  addressees: NoticeAddressee[];
  requestedItems: string[];
  expertTitle: string;
  expertName: string;
  expertRegistrationNumber: string;
  createdAt?: Date | string;
}

const ARABIC_WEEKDAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

export function getArabicWeekday(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return ARABIC_WEEKDAYS[d.getDay()];
}

export function formatDeadlineDays(days: number): string {
  if (days === 1) return "يوم عمل واحد";
  if (days === 2) return "يومين عمل";
  return `${days} أيام عمل`;
}

export interface AddresseeBlockLine {
  lawFirmLine: string;
  roleLine: string;
  nameLines: string[];
}

export interface ComposedNotice {
  dateLine: string;
  addresseeBlocks: AddresseeBlockLine[];
  greeting: string;
  subjectLine1: string;
  subjectLine2: string;
  bodyIntro: string;
  numberedItems: string[];
  reminderNote: string;
  closingLine: string;
  signature: { expertTitle: string; expertName: string; regLine: string };
}

export function composeNotice(
  notice: NoticeContext,
  caseCtx: NoticeCaseContext,
): ComposedNotice {
  const issueDate = notice.createdAt ?? new Date();

  const addresseeBlocks: AddresseeBlockLine[] = notice.addressees.map((a) => ({
    lawFirmLine: `السادة/ ${a.lawFirmName}`,
    roleLine: `${a.roleLabel} -:`,
    nameLines: a.representedNames,
  }));

  const bodyIntroParts = [
    notice.referenceLetterNumber
      ? `بالإشارة إلى كتاب مدير إدارة شؤون الخبراء الفنيين رقم ${notice.referenceLetterNumber}${
          notice.referenceLetterDate
            ? ` المؤرخ ${formatNoticeDate(notice.referenceLetterDate)}`
            : ""
        } بتكليفنا بمباشرة المهمة في الدعوى المشار إليها أعلاه، `
      : "",
    `فقد تقرر أن يكون يوم ${getArabicWeekday(notice.meetingDate)} الموافق ${formatNoticeDate(
      notice.meetingDate,
    )} في تمام الساعة ${notice.meetingTimeLabel} موعداً لاجتماع الخبرة ${
      notice.noticeLabel
    } عبر ${notice.meetingMethod}، ويقتصر حضور الجلسة على الأشخاص الذين سبق تحديدهم من قبلكم والمخولين بالحضور، كما نرجو من ${
      notice.requestedFromLabel
    } تزويدنا بالمستندات التالية خلال ${formatDeadlineDays(notice.documentsDeadlineDays)} من تاريخه: -`,
  ];

  const numberedItems = [...notice.requestedItems];
  if (notice.meetingLink) {
    const linkLines = [`رابط الاجتماع: ${notice.meetingLink}`];
    if (notice.meetingId) linkLines.push(`Meeting ID: ${notice.meetingId}`);
    if (notice.meetingPasscode) linkLines.push(`Passcode: ${notice.meetingPasscode}`);
    numberedItems.push(linkLines.join("\n"));
  }

  return {
    dateLine: `التاريخ ${formatNoticeDate(issueDate)}`,
    addresseeBlocks,
    greeting: "تحية طيبة وبعد ،،،،،،،",
    subjectLine1: `الموضوع / ${notice.subjectLine}`,
    subjectLine2: `في الدعوى رقم ${caseCtx.caseNumber}${caseCtx.court ? ` – ${caseCtx.court}` : ""}`,
    bodyIntro: bodyIntroParts.join(""),
    numberedItems,
    reminderNote:
      "تنوه الخبرة بضرورة إرسال (الهويات، الوكالات، تفويضات الحضور) للحاضرين والمشاركين مع المستندات المطلوبة وذلك قبل موعد الاجتماع بيومي عمل.",
    closingLine: "وتفضلوا بقبول فائق الاحترام ،،،",
    signature: {
      expertTitle: notice.expertTitle,
      expertName: notice.expertName,
      regLine: `رقم القيد وزارة العدل: ${notice.expertRegistrationNumber}`,
    },
  };
}

export interface NoticeEmailContent {
  subject: string;
  bodyAr: string;
}

export function buildNoticeEmailContent(
  notice: NoticeContext,
  caseCtx: NoticeCaseContext,
): NoticeEmailContent {
  const c = composeNotice(notice, caseCtx);

  const lines: string[] = [];
  for (const block of c.addresseeBlocks) {
    lines.push(block.lawFirmLine, block.roleLine, ...block.nameLines, "");
  }
  lines.push(c.greeting, "");
  lines.push(c.subjectLine1, c.subjectLine2, "");
  lines.push(c.bodyIntro, "");
  c.numberedItems.forEach((item, i) => lines.push(`${i + 1}) ${item}`));
  lines.push("");
  lines.push(c.reminderNote, "");
  lines.push(c.closingLine);
  lines.push(c.signature.expertTitle);
  lines.push(c.signature.expertName);
  lines.push(c.signature.regLine);

  return {
    subject: `${notice.subjectLine} — الدعوى رقم ${caseCtx.caseNumber}`,
    bodyAr: lines.join("\n"),
  };
}
