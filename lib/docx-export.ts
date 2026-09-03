import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

export interface EmailDocxInput {
  subject: string;
  bodyAr: string;
}

/** Parker Russell corporate letterhead block, prepended to every official
 * exported .docx (client letters, Module-4 report drafts). Fetches the
 * logo client-side (this module only ever runs in the browser — see
 * downloadBlob below) since the `docx` package needs raw image bytes. */
async function buildBrandedDocxHeader(): Promise<Paragraph[]> {
  let logoParagraph: Paragraph | null = null;
  try {
    const res = await fetch("/parker-russell-logo.png");
    const data = await res.arrayBuffer();
    logoParagraph = new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new ImageRun({
          type: "png",
          data,
          transformation: { width: 170, height: 78 },
        }),
      ],
    });
  } catch {
    // Offline/blocked asset fetch — export continues without the logo
    // image rather than failing the whole document.
  }

  return [
    ...(logoParagraph ? [logoParagraph] : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "C8102E", space: 6 },
      },
      children: [
        new TextRun({ text: "Parker Russell", bold: true, size: 22, color: "2C3E50" }),
      ],
    }),
  ];
}

export async function buildEmailDocxBlob({ subject, bodyAr }: EmailDocxInput): Promise<Blob> {
  const bodyParagraphs = bodyAr.split("\n").map(
    (line) =>
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { after: 160 },
        children: [new TextRun({ text: line, rightToLeft: true, font: "Arial" })],
      }),
  );

  const doc = new Document({
    sections: [
      {
        children: [
          ...(await buildBrandedDocxHeader()),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            spacing: { after: 300 },
            children: [
              new TextRun({
                text: subject,
                bold: true,
                size: 28,
                rightToLeft: true,
                font: "Arial",
              }),
            ],
          }),
          ...bodyParagraphs,
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export interface CourtReportDocxSection {
  title: string;
  content: string | null;
}

export interface CourtReportDocxInput {
  caseNumber: string;
  caseTitle: string;
  sections: CourtReportDocxSection[];
}

/** موديول 4 — استوديو إعداد التقرير القضائي: تصدير أساسي (نص حر لكل
 * تبويب) بترويسة Parker Russell. التجميع الآلي والأقسام الديناميكية لكل
 * مهمة (المهمة رقم 1، 2...) والتلوين حسب المصدر تطوير لاحق. */
export async function buildCourtReportDocxBlob({
  caseNumber,
  caseTitle,
  sections,
}: CourtReportDocxInput): Promise<Blob> {
  const sectionParagraphs = sections.flatMap((s) => [
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      spacing: { before: 300, after: 120 },
      children: [new TextRun({ text: s.title, bold: true, size: 26, rightToLeft: true, font: "Arial" })],
    }),
    ...(s.content || "لم تتم تعبئة هذا القسم بعد.")
      .split("\n")
      .map(
        (line) =>
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            spacing: { after: 140 },
            children: [new TextRun({ text: line, rightToLeft: true, font: "Arial" })],
          }),
      ),
  ]);

  const doc = new Document({
    sections: [
      {
        children: [
          ...(await buildBrandedDocxHeader()),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: `تقرير الخبرة الحسابية القضائية — الدعوى رقم ${caseNumber}`,
                bold: true,
                size: 28,
                rightToLeft: true,
                font: "Arial",
              }),
            ],
          }),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            spacing: { after: 300 },
            children: [new TextRun({ text: caseTitle, size: 22, rightToLeft: true, font: "Arial" })],
          }),
          ...sectionParagraphs,
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

/** Shared shape behind every "compiled from structured data" export
 * (hearing minutes, site-visit reports, ...): branded header, a bold
 * title line, the body split into paragraphs, and an optional signature
 * line — reused instead of re-duplicating the same docx assembly a third
 * time. */
async function buildBrandedTextReportDocxBlob({
  title,
  bodyText,
  signatureLabel,
}: {
  title: string;
  bodyText: string;
  signatureLabel?: string;
}): Promise<Blob> {
  const bodyParagraphs = bodyText.split("\n").map(
    (line) =>
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { after: 140 },
        children: [new TextRun({ text: line || " ", rightToLeft: true, font: "Arial" })],
      }),
  );

  const doc = new Document({
    sections: [
      {
        children: [
          ...(await buildBrandedDocxHeader()),
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            spacing: { after: 300 },
            children: [new TextRun({ text: title, bold: true, size: 28, rightToLeft: true, font: "Arial" })],
          }),
          ...bodyParagraphs,
          ...(signatureLabel
            ? [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 500 },
                  children: [
                    new TextRun({ text: signatureLabel, bold: true, rightToLeft: true, font: "Arial" }),
                  ],
                }),
              ]
            : []),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export interface HearingMinutesDocxInput {
  caseNumber: string;
  label: string;
  minutesText: string;
}

/** موديول 2 — تصدير مسودة محضر الجلسة (المجمَّعة آلياً في
 * lib/hearing-minutes.ts) بترويسة Parker Russell، مع مكان توقيع الخبير. */
export function buildHearingMinutesDocxBlob({
  caseNumber,
  label,
  minutesText,
}: HearingMinutesDocxInput): Promise<Blob> {
  return buildBrandedTextReportDocxBlob({
    title: `محضر ${label} — الدعوى رقم ${caseNumber}`,
    bodyText: minutesText,
    signatureLabel: "توقيع الخبير الحسابي:",
  });
}

export interface SiteInspectionReportDocxInput {
  caseNumber: string;
  visitDate: string;
  reportText: string;
}

/** موديول 3 — تصدير مسودة محضر الانتقال والمعاينة (المجمَّعة آلياً في
 * lib/site-inspection-report.ts) بترويسة Parker Russell. */
export function buildSiteInspectionReportDocxBlob({
  caseNumber,
  visitDate,
  reportText,
}: SiteInspectionReportDocxInput): Promise<Blob> {
  return buildBrandedTextReportDocxBlob({
    title: `محضر انتقال ومعاينة — الدعوى رقم ${caseNumber} — ${visitDate}`,
    bodyText: reportText,
    signatureLabel: "توقيع الخبير الحسابي:",
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
