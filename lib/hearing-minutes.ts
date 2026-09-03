// الموديول 2 — تجميع مسودة محضر الجلسة من البيانات المنظمة المسجَّلة أثناء
// الاجتماع (حضور، كلمة افتتاحية، أسئلة وأجوبة، مطالبات مستندات). نص ثابت
// (deterministic)، وليس مولَّداً بالذكاء الاصطناعي — بنفس فلسفة نموذج
// الإخطار (lib/notice-templates.ts) الجاهز: مستند رسمي يجب أن يكون موثوقاً
// وقابلاً للتنبؤ به بالكامل، لا مصدره احتمالي.

import { ATTENDANCE_STATUS_LABELS, MEETING_ATTENDEE_ROLE_LABELS } from "./case-hub-labels";
import { formatDate } from "./format";
import type { AttendanceStatus, MeetingAttendeeRole } from "./hub-schemas";

export interface MinutesAttendanceRow {
  name: string;
  role: MeetingAttendeeRole;
  representingParty: string | null;
  status: AttendanceStatus;
}

export interface MinutesQuestionRow {
  partyRole: "CLAIMANT" | "RESPONDENT";
  questionText: string;
  answerText: string | null;
  status: string;
}

export interface MinutesDocumentDemandRow {
  item: string;
  requestedFrom: string; // pre-resolved party names, joined
  deadline: Date;
}

export interface HearingMinutesInput {
  caseNumber: string;
  court?: string | null;
  label: string;
  meetingDate?: Date | null;
  meetingTime?: string | null;
  meetingMethod?: string | null;
  openingNotes?: string | null;
  attendance: MinutesAttendanceRow[];
  questions: MinutesQuestionRow[];
  documentDemands: MinutesDocumentDemandRow[];
}

export function buildHearingMinutesText(input: HearingMinutesInput): string {
  const lines: string[] = [];

  lines.push(`محضر اجتماع الخبرة — ${input.label}`);
  lines.push(`الدعوى رقم ${input.caseNumber}${input.court ? ` أمام ${input.court}` : ""}`);
  if (input.meetingDate) {
    lines.push(`تاريخ الاجتماع: ${formatDate(input.meetingDate)}${input.meetingTime ? ` — ${input.meetingTime}` : ""}`);
  }
  if (input.meetingMethod) lines.push(`طريقة الانعقاد: ${input.meetingMethod}`);
  lines.push("");

  lines.push("الحضور:");
  if (input.attendance.length === 0) {
    lines.push("لا يوجد حاضرون مسجَّلون.");
  } else {
    for (const a of input.attendance) {
      const parts = [
        a.name,
        `(${MEETING_ATTENDEE_ROLE_LABELS[a.role]}${a.representingParty ? ` — يمثل: ${a.representingParty}` : ""})`,
        `— ${ATTENDANCE_STATUS_LABELS[a.status]}`,
      ];
      lines.push(`- ${parts.join(" ")}`);
    }
  }
  lines.push("");

  if (input.openingNotes) {
    lines.push("الكلمة الافتتاحية:");
    lines.push(input.openingNotes);
    lines.push("");
  }

  const claimantQuestions = input.questions.filter((q) => q.partyRole === "CLAIMANT");
  const respondentQuestions = input.questions.filter((q) => q.partyRole === "RESPONDENT");

  if (input.questions.length > 0) {
    lines.push("الأسئلة والأجوبة:");
    if (claimantQuestions.length > 0) {
      lines.push("مع المدعي:");
      claimantQuestions.forEach((q, i) => {
        lines.push(`${i + 1}. ${q.questionText}`);
        lines.push(`   الإجابة: ${q.answerText || "لم تتم الإجابة"}`);
      });
    }
    if (respondentQuestions.length > 0) {
      lines.push("مع المدعى عليه:");
      respondentQuestions.forEach((q, i) => {
        lines.push(`${i + 1}. ${q.questionText}`);
        lines.push(`   الإجابة: ${q.answerText || "لم تتم الإجابة"}`);
      });
    }
    lines.push("");
  }

  if (input.documentDemands.length > 0) {
    lines.push("المستندات المطلوبة عقب الاجتماع:");
    for (const d of input.documentDemands) {
      lines.push(`- ${d.item} — من: ${d.requestedFrom || "غير محدد"} — الموعد النهائي: ${formatDate(d.deadline)}`);
    }
    lines.push("");
  }

  lines.push("حرر هذا المحضر بمعرفة الخبير الحسابي المنتدب في الدعوى.");

  return lines.join("\n");
}
