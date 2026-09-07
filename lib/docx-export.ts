import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  ShadingType,
  WidthType,
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

// ---------------------------------------------------------------------------
// موديول 4 (v2) — استوديو التقرير القضائي: أقسام تمهيدية + قسم مستقل لكل
// مهمة من مهام المأمورية + جدول تصفية حساب حقيقي + حافظة مستندات، بترويسة
// Parker Russell. لا تلوين حسب المصدر (provenance) في المستند المُصدَّر —
// هذا هو ملف التقرير الرسمي، وبوابة التصدير تضمن أصلاً اعتماد "رأي
// الخبرة" في كل مهمة قبل السماح بالتصدير.
// ---------------------------------------------------------------------------

function arabicParagraph(
  text: string,
  opts: { bold?: boolean; size?: number; spacingBefore?: number; spacingAfter?: number } = {},
): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: opts.spacingBefore ?? 0, after: opts.spacingAfter ?? 140 },
    children: [
      new TextRun({ text: text || " ", bold: opts.bold, size: opts.size, rightToLeft: true, font: "Arial" }),
    ],
  });
}

function arabicMultilineParagraphs(text: string | null, fallback = "لم تتم تعبئة هذا القسم بعد."): Paragraph[] {
  return (text || fallback).split("\n").map((line) => arabicParagraph(line));
}

const TABLE_HEADER_SHADING = { fill: "C8102E", type: ShadingType.CLEAR };
const TABLE_TOTAL_SHADING = { fill: "F1EAD9", type: ShadingType.CLEAR };

function tableCellParagraph(text: string, opts: { bold?: boolean; white?: boolean } = {}): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({
        text: text || "—",
        bold: opts.bold,
        color: opts.white ? "FFFFFF" : undefined,
        rightToLeft: true,
        font: "Arial",
        size: 20,
      }),
    ],
  });
}

/** جدول RTL عام (رأس مظلَّل + صفوف بيانات + صف إجمالي اختياري) — يُستخدم
 * لجدول تصفية الحساب وحافظة المستندات معاً بدل تكرار بناء الجدول مرتين. */
function buildDocxTable({
  head,
  rows,
  widths,
  totalsRow,
}: {
  head: string[];
  rows: string[][];
  widths: number[];
  totalsRow?: string[];
}): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: head.map(
      (h) =>
        new TableCell({
          shading: TABLE_HEADER_SHADING,
          children: [tableCellParagraph(h, { bold: true, white: true })],
        }),
    ),
  });

  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map((cell) => new TableCell({ children: [tableCellParagraph(cell)] })),
      }),
  );

  const totalRowEl = totalsRow
    ? [
        new TableRow({
          children: totalsRow.map(
            (cell) =>
              new TableCell({
                shading: TABLE_TOTAL_SHADING,
                children: [tableCellParagraph(cell, { bold: true })],
              }),
          ),
        }),
      ]
    : [];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    visuallyRightToLeft: true,
    rows: [headerRow, ...dataRows, ...totalRowEl],
  });
}

export interface CourtReportDocxPreliminarySection {
  title: string;
  narrative: string | null;
  appendix?: string | null;
}

export interface CourtReportDocxTask {
  index: number;
  taskText: string;
  claimantPosition: string | null;
  respondentPosition: string | null;
  exhibitFileNames: string[];
  forensicAnalysis: string | null;
  missingDocsImpact: string | null;
  expertVerdict: string | null;
}

export interface CourtReportDocxLiquidationRow {
  taskLabel: string;
  claimantAmountLabel: string;
  respondentOffsetLabel: string;
  netLabel: string;
}

export interface CourtReportDocxDocumentsIndexRow {
  label: string;
  statusLabel: string;
  documentNames: string;
}

export interface CourtReportDocxInput {
  caseNumber: string;
  caseTitle: string;
  preliminary: CourtReportDocxPreliminarySection[];
  tasks: CourtReportDocxTask[];
  liquidation: {
    rows: CourtReportDocxLiquidationRow[];
    totalClaimantLabel: string;
    totalRespondentLabel: string;
    netResultLabel: string;
    narrative: string | null;
  };
  documentsIndex: CourtReportDocxDocumentsIndexRow[];
  signatureLabel?: string;
}

export async function buildCourtReportDocxBlob({
  caseNumber,
  caseTitle,
  preliminary,
  tasks,
  liquidation,
  documentsIndex,
  signatureLabel = "توقيع الخبير الحسابي:",
}: CourtReportDocxInput): Promise<Blob> {
  const preliminaryChildren = preliminary.flatMap((s) => [
    arabicParagraph(s.title, { bold: true, size: 26, spacingBefore: 300, spacingAfter: 120 }),
    ...arabicMultilineParagraphs(s.narrative),
    ...(s.appendix ? arabicMultilineParagraphs(s.appendix) : []),
  ]);

  const taskChildren = tasks.flatMap((t) => [
    arabicParagraph(`المهمة رقم ${t.index + 1}: ${t.taskText}`, {
      bold: true,
      size: 24,
      spacingBefore: 360,
      spacingAfter: 140,
    }),
    arabicParagraph("موقف المدعي:", { bold: true, spacingAfter: 60 }),
    ...arabicMultilineParagraphs(t.claimantPosition, "لم يُدرَج موقف المدعي."),
    arabicParagraph("موقف المدعى عليه:", { bold: true, spacingAfter: 60 }),
    ...arabicMultilineParagraphs(t.respondentPosition, "لم يُدرَج موقف المدعى عليه."),
    arabicParagraph("المستندات المرتبطة:", { bold: true, spacingAfter: 60 }),
    ...(t.exhibitFileNames.length > 0
      ? t.exhibitFileNames.map((name, i) => arabicParagraph(`${i + 1}. ${name}`))
      : [arabicParagraph("لا توجد مستندات مرتبطة.")]),
    arabicParagraph("بحث الخبرة:", { bold: true, spacingAfter: 60 }),
    ...arabicMultilineParagraphs(t.forensicAnalysis, "لم يُدرَج بحث الخبرة."),
    arabicParagraph("أثر المستندات الناقصة:", { bold: true, spacingAfter: 60 }),
    ...arabicMultilineParagraphs(t.missingDocsImpact, "لا يوجد."),
    arabicParagraph("رأي الخبرة:", { bold: true, spacingAfter: 60 }),
    ...arabicMultilineParagraphs(t.expertVerdict, "لم يُعتمد رأي الخبرة."),
  ]);

  const liquidationTable = buildDocxTable({
    head: ["المهمة", "مطالبة المدعي", "خصم/مقاصة المدعى عليه", "الصافي"],
    rows: liquidation.rows.map((r) => [r.taskLabel, r.claimantAmountLabel, r.respondentOffsetLabel, r.netLabel]),
    widths: [40, 20, 20, 20],
    totalsRow: ["الإجمالي", liquidation.totalClaimantLabel, liquidation.totalRespondentLabel, liquidation.netResultLabel],
  });

  const documentsIndexTable =
    documentsIndex.length > 0
      ? buildDocxTable({
          head: ["البند", "الحالة", "المستندات المرفقة"],
          rows: documentsIndex.map((r) => [r.label, r.statusLabel, r.documentNames]),
          widths: [40, 20, 40],
        })
      : null;

  const doc = new Document({
    sections: [
      {
        children: [
          ...(await buildBrandedDocxHeader()),
          arabicParagraph(`تقرير الخبرة الحسابية القضائية — الدعوى رقم ${caseNumber}`, {
            bold: true,
            size: 28,
            spacingAfter: 60,
          }),
          arabicParagraph(caseTitle, { size: 22, spacingAfter: 400 }),

          arabicParagraph("أولاً: الأقسام التمهيدية", { bold: true, size: 30, spacingAfter: 200 }),
          ...preliminaryChildren,

          arabicParagraph("ثانياً: البحث والدراسة", { bold: true, size: 30, spacingBefore: 400, spacingAfter: 200 }),
          ...taskChildren,

          arabicParagraph("ثالثاً: الخلاصة وتصفية الحساب", {
            bold: true,
            size: 30,
            spacingBefore: 400,
            spacingAfter: 200,
          }),
          ...arabicMultilineParagraphs(liquidation.narrative, "لم تُدرَج خلاصة تصفية الحساب."),
          new Paragraph({ spacing: { before: 120, after: 300 }, children: [] }),
          liquidationTable,

          ...(documentsIndexTable
            ? [
                arabicParagraph("رابعاً: حافظة المستندات", { bold: true, size: 30, spacingBefore: 400, spacingAfter: 200 }),
                documentsIndexTable,
              ]
            : []),

          arabicParagraph(signatureLabel, { bold: true, spacingBefore: 600 }),
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
