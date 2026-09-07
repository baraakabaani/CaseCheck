import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  ShadingType,
  WidthType,
} from "docx";
import { arabicOrdinal } from "./arabic-ordinals";

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
// موديول 4 — استوديو التقرير القضائي: مطابق لتنظيم التقرير المرجعي الحقيقي
// الذي زوَّدنا به المستخدم (تقرير خبرة محاسبية نهائي أودعه لدى محكمة
// إماراتية): صفحة غلاف ← فهرس Word حقيقي (حقل TableOfContents يُحدَّث
// تلقائياً عند الفتح، لا أرقام صفحات مكتوبة يدوياً) ← خطاب افتتاحي موجَّه
// للقاضي ← تسعة أقسام مرقّمة بالحروف العربية (lib/arabic-ordinals.ts، مصدر
// وحيد للترقيم) ← حافظة مستندات مرقّمة "مرفق رقم (N)" (lib/reports/attachments.ts
// هو مصدر هذا الترقيم أيضاً — لا يمكن أن يختلف عمّا يظهر في الواجهة).
// خط Sakkal Majalla وجداول بحدود سوداء رفيعة وتظليل رمادي فاتح (F2F2F2) —
// يخص هذا التصدير وحده، لا بقية دوال هذا الملف (بعده أدناه: Arial وترويسة
// الشركة الحمراء كما كانت). لا تلوين حسب المصدر (provenance) في المستند
// المُصدَّر — بوابة التصدير (lib/reports/provenance.ts) تضمن أصلاً اعتماد
// كل مهمة/جدول/رد/خلاصة قبل السماح بالتصدير أصلاً.
// ---------------------------------------------------------------------------

const REPORT_FONT = "Sakkal Majalla";

function reportParagraph(
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    spacingBefore?: number;
    spacingAfter?: number;
    heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
    pageBreakBefore?: boolean;
    center?: boolean;
  } = {},
): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.RIGHT,
    heading: opts.heading,
    pageBreakBefore: opts.pageBreakBefore,
    spacing: { before: opts.spacingBefore ?? 0, after: opts.spacingAfter ?? 140 },
    children: [
      new TextRun({ text: text || " ", bold: opts.bold, size: opts.size, rightToLeft: true, font: REPORT_FONT }),
    ],
  });
}

function reportMultilineParagraphs(text: string | null, fallback = "لم تتم تعبئة هذا القسم بعد."): Paragraph[] {
  return (text || fallback).split("\n").map((line) => reportParagraph(line));
}

/** عنوان قسم رئيسي (أولاً..تاسعاً) — Heading1 حقيقي يلتقطه حقل TableOfContents
 * أدناه؛ ordinalIndex صفري (0 ⇒ أولاً). */
function reportSectionHeading(ordinalIndex: number, title: string): Paragraph {
  return reportParagraph(`${arabicOrdinal(ordinalIndex)}: ${title}`, {
    bold: true,
    size: 30,
    spacingBefore: 420,
    spacingAfter: 200,
    heading: HeadingLevel.HEADING_1,
  });
}

/** عنوان فرعي (مهمة واحدة ضمن خامساً، أو اعتراض واحد ضمن سابعاً) —
 * Heading2 لتمييزه بصرياً فقط، لا يظهر في الفهرس (headingStyleRange
 * أدناه يقتصر على "1-1"). */
function reportSubHeading(text: string): Paragraph {
  return reportParagraph(text, {
    bold: true,
    size: 24,
    spacingBefore: 320,
    spacingAfter: 140,
    heading: HeadingLevel.HEADING_2,
  });
}

const REPORT_TABLE_SHADING = { fill: "F2F2F2", type: ShadingType.CLEAR };
const REPORT_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const REPORT_TABLE_BORDERS = {
  top: REPORT_BORDER,
  bottom: REPORT_BORDER,
  left: REPORT_BORDER,
  right: REPORT_BORDER,
  insideHorizontal: REPORT_BORDER,
  insideVertical: REPORT_BORDER,
};

function reportTableCellParagraph(text: string, opts: { bold?: boolean } = {}): Paragraph {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: text || "—", bold: opts.bold, rightToLeft: true, font: REPORT_FONT, size: 20 })],
  });
}

export interface CourtReportDocxTableRow {
  cells: string[];
  isTotal?: boolean;
}

/** جدول RTL عام بحدود سوداء رفيعة وتظليل رمادي فاتح للرأس وصفوف الإجمالي —
 * يُستخدم لكل جدول في هذا التصدير (تصفية الحساب، حافظة المستندات، وكل
 * جدول مالي في lib/reports/financial-tables.ts). صف الإجمالي قد يظهر في
 * أي موضع ضمن rows (isTotal)، لا آخر صف حصراً، مطابقةً لجداول الميزانية في
 * التقرير المرجعي. */
function buildReportTable({ head, rows }: { head: string[]; rows: CourtReportDocxTableRow[] }): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: head.map(
      (h) => new TableCell({ shading: REPORT_TABLE_SHADING, children: [reportTableCellParagraph(h, { bold: true })] }),
    ),
  });

  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.cells.map(
          (cell) =>
            new TableCell({
              shading: row.isTotal ? REPORT_TABLE_SHADING : undefined,
              children: [reportTableCellParagraph(cell, { bold: row.isTotal })],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    visuallyRightToLeft: true,
    borders: REPORT_TABLE_BORDERS,
    rows: [headerRow, ...dataRows],
  });
}

export interface CourtReportDocxFinancialTable {
  title: string;
  subtitle?: string | null;
  columnLabels: string[];
  rows: CourtReportDocxTableRow[];
  basisNote?: string | null;
}

function buildFinancialTableBlock(table: CourtReportDocxFinancialTable): (Paragraph | Table)[] {
  return [
    reportParagraph(table.title, { bold: true, spacingBefore: 220, spacingAfter: 60 }),
    ...(table.subtitle ? [reportParagraph(table.subtitle, { size: 20, spacingAfter: 80 })] : []),
    buildReportTable({ head: table.columnLabels, rows: table.rows }),
    ...(table.basisNote
      ? [reportParagraph(`سند الأرقام: ${table.basisNote}`, { size: 18, spacingBefore: 80, spacingAfter: 220 })]
      : [new Paragraph({ spacing: { after: 220 }, children: [] })]),
  ];
}

export interface CourtReportDocxParty {
  roleLabel: string;
  name: string;
  capacityNote: string | null;
}

export interface CourtReportDocxTimelineEvent {
  dateLabel: string;
  label: string;
  detail: string | null;
}

export interface CourtReportDocxTask {
  index: number;
  taskText: string;
  claimantPosition: string | null;
  respondentPosition: string | null;
  exhibitFileNames: string[];
  attachmentNumbers: number[];
  forensicAnalysis: string | null;
  tables: CourtReportDocxFinancialTable[];
  missingDocsImpact: string | null;
  expertVerdict: string | null;
}

export interface CourtReportDocxLiquidationRow {
  taskLabel: string;
  claimantAmountLabel: string;
  respondentOffsetLabel: string;
  netLabel: string;
}

export interface CourtReportDocxObjection {
  partyRoleLabel: string;
  submittedOnBehalfOfLabel: string;
  memoDateLabel: string | null;
  objectionText: string;
  responseText: string | null;
}

export interface CourtReportDocxDocumentsIndexRow {
  number: number;
  fileName: string;
}

export interface CourtReportDocxInput {
  caseNumber: string;
  caseTitle: string;
  court: string | null;
  judgeName: string | null;
  judgeTitle: string | null;
  letterDateLabel: string | null;
  parties: CourtReportDocxParty[];
  introduction: string | null;
  mandateSummary: string | null;
  proceduralHistory: string | null;
  timeline: CourtReportDocxTimelineEvent[];
  scopeNarrative: string | null;
  scopeTables: CourtReportDocxFinancialTable[];
  tasks: CourtReportDocxTask[];
  liquidation: {
    rows: CourtReportDocxLiquidationRow[];
    totalClaimantLabel: string;
    totalRespondentLabel: string;
    netResultLabel: string;
    narrative: string | null;
  };
  objectionsIntro: string | null;
  objections: CourtReportDocxObjection[];
  conclusionIntro: string | null;
  conclusionItems: string[];
  conclusionClosing: string | null;
  documentsIndex: CourtReportDocxDocumentsIndexRow[];
}

export async function buildCourtReportDocxBlob({
  caseNumber,
  caseTitle,
  court,
  judgeName,
  judgeTitle,
  letterDateLabel,
  parties,
  introduction,
  mandateSummary,
  proceduralHistory,
  timeline,
  scopeNarrative,
  scopeTables,
  tasks,
  liquidation,
  objectionsIntro,
  objections,
  conclusionIntro,
  conclusionItems,
  conclusionClosing,
  documentsIndex,
}: CourtReportDocxInput): Promise<Blob> {
  // صفحة الغلاف — بلا رقم صفحة ولا فهرس، عنوان التقرير فقط.
  const coverChildren = [
    reportParagraph("تقرير خبرة حسابية نهائي", { bold: true, size: 48, center: true, spacingBefore: 2400, spacingAfter: 300 }),
    reportParagraph(`في الدعوى رقم ${caseNumber}`, { bold: true, size: 32, center: true, spacingAfter: 120 }),
    reportParagraph(caseTitle, { size: 26, center: true, spacingAfter: 120 }),
    ...(court ? [reportParagraph(court, { size: 24, center: true })] : []),
  ];

  // صفحة الفهرس — حقل Word حقيقي (TableOfContents)، يُحدَّث تلقائياً عند
  // فتح الملف بفضل features.updateFields أدناه؛ لا نكتب أرقام صفحات هنا
  // لأننا لا نعرف الترقيم الحقيقي وقت التوليد.
  const tocChildren = [
    reportParagraph("فهرس المحتويات", { bold: true, size: 30, center: true, spacingAfter: 300, pageBreakBefore: true }),
    new TableOfContents("فهرس المحتويات", { hyperlink: true, headingStyleRange: "1-1" }),
  ];

  // الخطاب الافتتاحي الموجَّه للقاضي.
  const letterChildren = [
    reportParagraph("سعادة القاضي الموقر،", { bold: true, size: 26, spacingBefore: 300, spacingAfter: 160, pageBreakBefore: true }),
    ...(judgeName ? [reportParagraph(judgeName, { bold: true })] : []),
    ...(judgeTitle ? [reportParagraph(judgeTitle)] : []),
    reportParagraph("تحية طيبة وبعد،", { spacingBefore: 200 }),
    reportParagraph(
      `بالإشارة إلى الدعوى رقم ${caseNumber}${caseTitle ? ` — ${caseTitle}` : ""}، والمنتدب فيها الخبير الموقِّع أدناه لأداء المأمورية المحدَّدة بالحكم/القرار الصادر بالندب، يتشرَّف الخبير بأن يرفع لعدالتكم هذا التقرير عن نتيجة أعماله فيها، وذلك على النحو التالي:`,
      { spacingBefore: 160, spacingAfter: 300 },
    ),
    ...(letterDateLabel ? [reportParagraph(`تحرَّر بتاريخ: ${letterDateLabel}`, { spacingBefore: 200 })] : []),
  ];

  // أولاً: أطراف الدعوى.
  const partiesChildren = [
    reportSectionHeading(0, "أطراف الدعوى"),
    ...parties.map((p, i) =>
      reportParagraph(`${i + 1}) ${p.roleLabel}: ${p.name}${p.capacityNote ? ` (${p.capacityNote})` : ""}`),
    ),
  ];

  // ثانياً: موضوع الدعوى.
  const introductionChildren = [reportSectionHeading(1, "موضوع الدعوى"), ...reportMultilineParagraphs(introduction)];

  // ثالثاً: مهام الخبير المنتدب.
  const mandateChildren = [reportSectionHeading(2, "مهام الخبير المنتدب"), ...reportMultilineParagraphs(mandateSummary)];

  // رابعاً: الإجراءات المتبعة.
  const proceduralChildren = [
    reportSectionHeading(3, "الإجراءات المتبعة"),
    ...reportMultilineParagraphs(proceduralHistory),
    ...timeline.map((e) => reportParagraph(`${e.dateLabel} — ${e.label}${e.detail ? `: ${e.detail}` : ""}`)),
  ];

  // خامساً: بحث الموضوع ورأي الخبرة — نطاق الفحص + جداوله، ثم قسم فرعي لكل
  // مهمة بترتيبها (نص المهمة، مواقف الأطراف، بحث الخبرة، جداولها المالية،
  // أثر المستندات الناقصة، رأي الخبرة).
  const scopeChildren = [
    reportSectionHeading(4, "بحث الموضوع ورأي الخبرة"),
    ...reportMultilineParagraphs(scopeNarrative),
    ...scopeTables.flatMap(buildFinancialTableBlock),
  ];

  const taskChildren = tasks.flatMap((t) => [
    reportSubHeading(`${t.index + 1}. ${t.taskText}`),
    reportParagraph("موقف المدعي:", { bold: true, spacingAfter: 60 }),
    ...reportMultilineParagraphs(t.claimantPosition, "لم يُدرَج موقف المدعي."),
    reportParagraph("موقف المدعى عليه:", { bold: true, spacingAfter: 60 }),
    ...reportMultilineParagraphs(t.respondentPosition, "لم يُدرَج موقف المدعى عليه."),
    reportParagraph("المستندات المرتبطة:", { bold: true, spacingAfter: 60 }),
    ...(t.exhibitFileNames.length > 0
      ? t.exhibitFileNames.map((name, i) =>
          reportParagraph(`${i + 1}. ${name}${t.attachmentNumbers[i] ? ` (مرفق رقم ${t.attachmentNumbers[i]})` : ""}`),
        )
      : [reportParagraph("لا توجد مستندات مرتبطة.")]),
    reportParagraph("بحث الخبرة:", { bold: true, spacingAfter: 60 }),
    ...reportMultilineParagraphs(t.forensicAnalysis, "لم يُدرَج بحث الخبرة."),
    ...t.tables.flatMap(buildFinancialTableBlock),
    reportParagraph("أثر المستندات الناقصة:", { bold: true, spacingAfter: 60 }),
    ...reportMultilineParagraphs(t.missingDocsImpact, "لا يوجد."),
    reportParagraph("رأي الخبرة:", { bold: true, spacingAfter: 60 }),
    ...reportMultilineParagraphs(t.expertVerdict, "لم يُعتمد رأي الخبرة."),
  ]);

  // سادساً: تصفية الحساب.
  const liquidationTable = buildReportTable({
    head: ["المهمة", "مطالبة المدعي", "خصم/مقاصة المدعى عليه", "الصافي"],
    rows: [
      ...liquidation.rows.map((r) => ({ cells: [r.taskLabel, r.claimantAmountLabel, r.respondentOffsetLabel, r.netLabel] })),
      {
        cells: ["الإجمالي", liquidation.totalClaimantLabel, liquidation.totalRespondentLabel, liquidation.netResultLabel],
        isTotal: true,
      },
    ],
  });
  const settlementChildren = [
    reportSectionHeading(5, "تصفية الحساب"),
    ...reportMultilineParagraphs(liquidation.narrative, "لم تُدرَج خلاصة تصفية الحساب."),
    new Paragraph({ spacing: { before: 120, after: 200 }, children: [] }),
    liquidationTable,
  ];

  // سابعاً: العرض على الأطراف.
  const objectionsChildren = [
    reportSectionHeading(6, "العرض على الأطراف"),
    ...reportMultilineParagraphs(objectionsIntro, "عُرض التقرير المبدئي على الأطراف تمهيداً لإعداد هذا التقرير النهائي."),
    ...objections.flatMap((o, i) => [
      reportSubHeading(`الاعتراض ${arabicOrdinal(i)} — ${o.partyRoleLabel} (${o.submittedOnBehalfOfLabel})`),
      ...(o.memoDateLabel ? [reportParagraph(`تاريخ المذكرة: ${o.memoDateLabel}`, { size: 20, spacingAfter: 80 })] : []),
      reportParagraph("نص الاعتراض:", { bold: true, spacingAfter: 60 }),
      ...reportMultilineParagraphs(o.objectionText),
      reportParagraph("رد الخبير:", { bold: true, spacingAfter: 60 }),
      ...reportMultilineParagraphs(o.responseText, "لم يُدرَج رد الخبير."),
    ]),
    ...(objections.length === 0 ? [reportParagraph("لم تَرِد أي اعتراضات على التقرير المبدئي.")] : []),
  ];

  // ثامناً: الخلاصة.
  const conclusionChildren = [
    reportSectionHeading(7, "الخلاصة"),
    ...reportMultilineParagraphs(conclusionIntro),
    ...conclusionItems.map((item, i) => reportParagraph(`${i + 1}. ${item}`)),
    ...(conclusionClosing ? reportMultilineParagraphs(conclusionClosing) : []),
  ];

  // تاسعاً: حافظة المستندات — نفس ترقيم "مرفق رقم (N)" المستخدَم أعلاه في
  // متن كل مهمة (lib/reports/attachments.ts، محسوب مرة واحدة في المستدعي).
  const documentsIndexChildren = [
    reportSectionHeading(8, "حافظة المستندات"),
    ...(documentsIndex.length > 0
      ? [
          buildReportTable({
            head: ["مرفق رقم", "اسم المستند"],
            rows: documentsIndex.map((r) => ({ cells: [String(r.number), r.fileName] })),
          }),
        ]
      : [reportParagraph("لا توجد مستندات مرفقة.")]),
  ];

  const doc = new Document({
    features: { updateFields: true },
    styles: {
      default: {
        heading1: {
          run: { font: REPORT_FONT, bold: true, color: "000000", size: 30 },
          paragraph: { spacing: { before: 420, after: 200 } },
        },
        heading2: {
          run: { font: REPORT_FONT, bold: true, color: "000000", size: 24 },
          paragraph: { spacing: { before: 320, after: 140 } },
        },
        document: {
          run: { font: REPORT_FONT, size: 22 },
        },
      },
    },
    sections: [
      {
        children: [
          ...(await buildBrandedDocxHeader()),
          ...coverChildren,
          ...tocChildren,
          ...letterChildren,
          ...partiesChildren,
          ...introductionChildren,
          ...mandateChildren,
          ...proceduralChildren,
          ...scopeChildren,
          ...taskChildren,
          ...settlementChildren,
          ...objectionsChildren,
          ...conclusionChildren,
          ...documentsIndexChildren,
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
