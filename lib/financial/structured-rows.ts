// تحليل حتمي (بلا ذكاء اصطناعي) لصفوف كشوف الحساب/دفاتر الأستاذ الحقيقية —
// يُعيد قراءة الملف الأصلي (xlsx/csv) عبر lib/file-storage.ts's
// readStoredFile بدل الاعتماد على Document.extractedText المُسطَّح نصياً
// (lib/document-parser.ts)، لأن الأخير يفقد الأعمدة والتواريخ الحقيقية
// (ExcelJS تُرجع كائنات Date فعلية للخلايا المهيّأة كتاريخ — وهذا بالضبط ما
// يُفقَد عند التسطيح إلى نص). هذا مسار مواز مستقل، لا يُغيّر ما يُخزَّن في
// extractedText أو كيف تُستهلَك من بقية التطبيق (المطابقة الآلية، محرك
// الضغط الذكي، مربع حوار الاقتباس).
//
// فشل الاكتشاف صريح وكامل دوماً (null) وليس تخميناً جزئياً — انظر
// lib/reports/financial-tables.ts للطبقة الحتمية التالية (تجميع الفترات)
// التي تُبنى فوق هذا الملف.

import ExcelJS from "exceljs";
import Papa from "papaparse";
import { readStoredFile } from "../file-storage";
import { CREDIT_KEYWORDS, DEBIT_KEYWORDS, BALANCE_KEYWORDS, DATE_KEYWORDS, DESCRIPTION_KEYWORDS, AMOUNT_KEYWORDS } from "./keywords";

export interface StructuredSheet {
  sheetName: string;
  /** قيم الخلايا الخام كما وردت — قد يكون الصف الأول (أو أحد أول 30 صفاً)
   * هو صف العناوين؛ اكتشافه مهمة detectLedgerColumns، لا هذه الدالة. */
  rows: (string | number | Date | null)[][];
}

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => ARABIC_INDIC_DIGITS[d] ?? d);
}

function cellToPrimitive(v: unknown): string | number | Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("text" in obj) return String(obj.text);
    if ("result" in obj) return cellToPrimitive(obj.result);
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return (obj.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
    }
  }
  return String(v);
}

/** إعادة قراءة xlsx/csv مع الاحتفاظ بالخلايا كقيم فعلية (رقم/تاريخ/نص) —
 * على عكس lib/document-parser.ts الذي يُسطِّح كل صف إلى نص "|"-مفصول. */
export async function extractStructuredSheets(
  buffer: Buffer,
  fileKind: "xlsx" | "csv",
): Promise<StructuredSheet[]> {
  if (fileKind === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheets: StructuredSheet[] = [];
    workbook.eachSheet((sheet) => {
      const rows: (string | number | Date | null)[][] = [];
      sheet.eachRow((row) => {
        rows.push((row.values as unknown[]).slice(1).map(cellToPrimitive));
      });
      sheets.push({ sheetName: sheet.name, rows });
    });
    return sheets;
  }

  const content = buffer.toString("utf-8");
  const parsed = Papa.parse<string[]>(content, { skipEmptyLines: true });
  const rows: (string | number | Date | null)[][] = parsed.data.map((row) =>
    row.map((c) => (c === "" ? null : c)),
  );
  return [{ sheetName: "CSV", rows }];
}

/** يحوّل قيمة خلية إلى رقم — يدعم الأرقام العربية-الهندية، فواصل الآلاف،
 * السالب بين قوسين "(1,234.50)"، ورموز العملة. يُعيد null دون تخمين عند
 * أي غموض حقيقي، لا صفراً. */
export function parseAmountCell(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw instanceof Date) return null;

  let text = normalizeDigits(String(raw)).trim();
  if (!text) return null;

  const isParenNegative = /^\(.*\)$/.test(text);
  if (isParenNegative) text = text.slice(1, -1);
  const isSignedNegative = /^[-−]/.test(text);

  const cleaned = text.replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;

  return isParenNegative || isSignedNegative ? -n : n;
}

function buildUtcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** يحوّل قيمة خلية إلى تاريخ — كائن Date كما هو (ExcelJS)، رقم تسلسل تاريخ
 * Excel الخام، أو نص بصيغة yyyy-mm-dd أو dd/mm/yyyy (الاصطلاح المحلي:
 * اليوم أولاً — إن تجاوز الجزء الثاني 12 يُفترض العكس). */
export function parseDateCell(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;

  if (typeof raw === "number") {
    // رقم تسلسل تاريخ Excel الخام (نادر مع ExcelJS الذي يُرجع Date عادة،
    // لكن بعض الملفات المُصدَّرة من أنظمة أخرى تخزّنه هكذا).
    const excelEpochUtcMs = Date.UTC(1899, 11, 30);
    const d = new Date(excelEpochUtcMs + raw * 86_400_000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const text = normalizeDigits(String(raw)).trim();
  if (!text) return null;

  let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return buildUtcDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    let day = Number(m[1]);
    let month = Number(m[2]);
    if (month > 12 && day <= 12) [day, month] = [month, day];
    const yearRaw = m[3];
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    return buildUtcDate(year, month, day);
  }

  return null;
}

export interface LedgerColumnMap {
  date: number | null;
  description: number | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  amount: number | null;
}

export interface DetectedLedgerHeader {
  headerRowIndex: number;
  map: LedgerColumnMap;
  confidence: number;
}

/** يبحث في أول 30 صفاً عن صف عناوين يحدد أعمدة تاريخ/بيان/مدين/دائن/رصيد/
 * مبلغ عبر مطابقة كلمات مفتاحية (lib/financial/keywords.ts)، ويُرجع أفضل
 * تطابق (الأعلى ثقة) أو null إن لم يوجد صف يحمل شكل جدول حسابي أصلاً
 * (لا عمودي مدين+دائن، ولا رصيد، ولا مبلغ). */
export function detectLedgerColumns(sheet: StructuredSheet): DetectedLedgerHeader | null {
  const searchLimit = Math.min(sheet.rows.length, 30);
  let best: DetectedLedgerHeader | null = null;

  for (let i = 0; i < searchLimit; i++) {
    const row = sheet.rows[i];
    const cellsLower = row.map((c) => (c == null ? "" : String(c).trim().toLowerCase()));
    if (cellsLower.filter(Boolean).length < 2) continue;

    const find = (keywords: string[]) => {
      const idx = cellsLower.findIndex((c) => c && keywords.some((k) => c.includes(k)));
      return idx >= 0 ? idx : null;
    };
    const map: LedgerColumnMap = {
      date: find(DATE_KEYWORDS),
      description: find(DESCRIPTION_KEYWORDS),
      debit: find(DEBIT_KEYWORDS),
      credit: find(CREDIT_KEYWORDS),
      balance: find(BALANCE_KEYWORDS),
      amount: find(AMOUNT_KEYWORDS),
    };

    const hasAmountShape = (map.debit !== null && map.credit !== null) || map.balance !== null || map.amount !== null;
    if (!hasAmountShape) continue;

    let score = 0;
    if (map.date !== null) score += 1;
    if (map.debit !== null) score += 1;
    if (map.credit !== null) score += 1;
    if (map.balance !== null) score += 1;
    if (map.amount !== null) score += 0.5;
    if (map.description !== null) score += 0.5;
    const confidence = Math.min(1, score / 3);

    if (!best || confidence > best.confidence) {
      best = { headerRowIndex: i, map, confidence };
    }
  }

  return best;
}

export interface ParsedTransaction {
  date: Date;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  sheetName: string;
  rowIndex: number;
}

export interface ParsedLedger {
  documentId: string;
  fileName: string;
  transactions: ParsedTransaction[];
  coverage: { totalRows: number; parsedRows: number; skippedRows: number };
  warnings: string[];
}

const MIN_HEADER_CONFIDENCE = 0.5;
const MIN_ROW_COVERAGE = 0.6;

/** يُعيد قراءة المستند الأصلي (xlsx/csv فقط) ويحلّله إلى معاملات حقيقية —
 * تاريخ + مبلغ فعليين لكل صف، لا نصاً مُلخَّصاً. يُعيد null صراحة (فشل
 * كامل، لا نتيجة جزئية مشكوك فيها) حين: نوع الملف غير مدعوم، لا يوجد صف
 * عناوين بثقة كافية، أو أقل من 60% من صفوف البيانات أمكن فهمها كتاريخ +
 * مبلغ معاً. */
export async function parseDocumentLedger(doc: {
  id: string;
  fileName: string;
  fileKind: string;
  storedPath: string;
}): Promise<ParsedLedger | null> {
  if (doc.fileKind !== "xlsx" && doc.fileKind !== "csv") return null;

  let buffer: Buffer;
  try {
    buffer = await readStoredFile(doc.storedPath);
  } catch {
    return null;
  }

  let sheets: StructuredSheet[];
  try {
    sheets = await extractStructuredSheets(buffer, doc.fileKind);
  } catch {
    return null;
  }

  const transactions: ParsedTransaction[] = [];
  let totalDataRows = 0;
  let parsedRows = 0;

  for (const sheet of sheets) {
    const detected = detectLedgerColumns(sheet);
    if (!detected || detected.confidence < MIN_HEADER_CONFIDENCE) continue;

    const { headerRowIndex, map } = detected;
    for (let i = headerRowIndex + 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      if (row.every((c) => c == null || c === "")) continue;
      totalDataRows++;

      const date = map.date !== null ? parseDateCell(row[map.date]) : null;
      const debit = map.debit !== null ? parseAmountCell(row[map.debit]) : null;
      const credit = map.credit !== null ? parseAmountCell(row[map.credit]) : null;
      const balance = map.balance !== null ? parseAmountCell(row[map.balance]) : null;
      const amount = map.amount !== null ? parseAmountCell(row[map.amount]) : null;
      const hasAmount = debit !== null || credit !== null || balance !== null || amount !== null;

      if (!date || !hasAmount) continue;
      parsedRows++;
      transactions.push({
        date,
        description: map.description !== null ? String(row[map.description] ?? "") : "",
        debit: debit ?? (amount !== null && amount < 0 ? Math.abs(amount) : null),
        credit: credit ?? (amount !== null && amount >= 0 ? amount : null),
        balance,
        sheetName: sheet.sheetName,
        rowIndex: i,
      });
    }
  }

  if (totalDataRows === 0) return null;
  const coverageRatio = parsedRows / totalDataRows;
  if (coverageRatio < MIN_ROW_COVERAGE) return null;

  const skippedRows = totalDataRows - parsedRows;
  const warnings =
    skippedRows > 0
      ? [`تعذّر فهم ${skippedRows} من أصل ${totalDataRows} صف في «${doc.fileName}» (تُجوهل هذه الصفوف في الحساب).`]
      : [];

  return {
    documentId: doc.id,
    fileName: doc.fileName,
    transactions,
    coverage: { totalRows: totalDataRows, parsedRows, skippedRows },
    warnings,
  };
}
