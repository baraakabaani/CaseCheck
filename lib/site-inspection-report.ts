// الموديول 3 — تجميع مسودة "محضر انتقال ومعاينة قضائي" من بيانات زيارة
// المعاينة المنظّمة (موقع، غرض، حضور، أجهزة/دفاتر مفحوصة، إفادات ميدانية).
// نص ثابت (deterministic)، وليس مولَّداً بالذكاء الاصطناعي — نفس فلسفة
// lib/hearing-minutes.ts ونموذج الإخطار: مستند رسمي يجب أن يكون موثوقاً
// وقابلاً للتنبؤ به بالكامل.

import { formatDate } from "./format";

export interface SiteInspectionTestimonyRow {
  personName: string;
  personRole: string | null;
  statementText: string;
}

export interface SiteInspectionReportInput {
  caseNumber: string;
  court?: string | null;
  visitDate: Date;
  location: string;
  purpose: string;
  attendees: string[];
  equipmentReviewed?: string | null;
  booksReviewed?: string | null;
  notes?: string | null;
  testimonies: SiteInspectionTestimonyRow[];
}

export function buildSiteInspectionReportText(input: SiteInspectionReportInput): string {
  const lines: string[] = [];

  lines.push("محضر انتقال ومعاينة قضائي");
  lines.push(`الدعوى رقم ${input.caseNumber}${input.court ? ` أمام ${input.court}` : ""}`);
  lines.push(`تاريخ الانتقال: ${formatDate(input.visitDate)}`);
  lines.push(`الموقع: ${input.location}`);
  lines.push(`الغرض من المعاينة: ${input.purpose}`);
  lines.push("");

  lines.push("الحضور:");
  if (input.attendees.length === 0) {
    lines.push("لا يوجد حاضرون مسجَّلون.");
  } else {
    for (const a of input.attendees) lines.push(`- ${a}`);
  }
  lines.push("");

  if (input.equipmentReviewed) {
    lines.push("الأجهزة/الخوادم التي تم فحصها:");
    lines.push(input.equipmentReviewed);
    lines.push("");
  }

  if (input.booksReviewed) {
    lines.push("الدفاتر المالية التي روجعت:");
    lines.push(input.booksReviewed);
    lines.push("");
  }

  if (input.testimonies.length > 0) {
    lines.push("الإفادات الميدانية:");
    input.testimonies.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.personName}${t.personRole ? ` (${t.personRole})` : ""}:`);
      lines.push(`   "${t.statementText}"`);
    });
    lines.push("");
  }

  if (input.notes) {
    lines.push("ملاحظات إضافية:");
    lines.push(input.notes);
    lines.push("");
  }

  lines.push("حرر هذا المحضر بمعرفة الخبير الحسابي المنتدب في الدعوى.");

  return lines.join("\n");
}
