// الموديول 2 — تصدير موعد الاجتماع كملف .ics (تقويم) — توليد نصي بسيط من
// جانب المتصفح، بدون أي تبعية خارجية.

import { downloadBlob } from "./docx-export";

export interface HearingIcsInput {
  caseNumber: string;
  label: string;
  meetingDate: string | Date; // ISO string or Date
  meetingTime?: string | null;
  meetingMethod?: string | null;
  meetingLink?: string | null;
  court?: string | null;
}

function toIcsDateStamp(date: Date): string {
  // YYYYMMDDTHHMMSSZ
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function toIcsDateOnly(date: Date): string {
  // YYYYMMDD — treated as an all-day marker since the exact meeting time
  // (meetingTime) is free text, not reliably machine-parseable.
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildHearingIcsBlob(input: HearingIcsInput): Blob {
  const meetingDate = typeof input.meetingDate === "string" ? new Date(input.meetingDate) : input.meetingDate;
  const now = new Date();

  const descriptionParts = [
    `الدعوى رقم ${input.caseNumber}`,
    input.court ? `المحكمة: ${input.court}` : null,
    input.meetingTime ? `الوقت: ${input.meetingTime}` : null,
    input.meetingMethod ? `طريقة الانعقاد: ${input.meetingMethod}` : null,
    input.meetingLink ? `الرابط: ${input.meetingLink}` : null,
  ].filter(Boolean);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Parker Russell//Case Hub//AR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:hearing-${meetingDate.getTime()}-${Math.random().toString(36).slice(2)}@casehub`,
    `DTSTAMP:${toIcsDateStamp(now)}`,
    `DTSTART;VALUE=DATE:${toIcsDateOnly(meetingDate)}`,
    `SUMMARY:${escapeIcsText(`${input.label} — الدعوى رقم ${input.caseNumber}`)}`,
    `DESCRIPTION:${escapeIcsText(descriptionParts.join("\\n"))}`,
    ...(input.meetingLink ? [`LOCATION:${escapeIcsText(input.meetingLink)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
}

export { downloadBlob };
