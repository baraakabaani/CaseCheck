import mammoth from "mammoth";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { extractPdfText } from "./pdf-parser";
import { detectFileKind } from "./file-storage";
import type { FileKind } from "./schemas";

export interface DocumentExtractResult {
  fileKind: FileKind;
  text: string;
  pageCount?: number;
  detectedDates: string[];
  status: "PARSED" | "FAILED" | "UNSUPPORTED";
  error?: string;
  note?: string;
}

// Matches common date formats seen in UAE court/accounting documents:
// 12/03/2024, 12-03-2024, 2024-03-12, and "12 مارس 2024" style mentions.
const DATE_PATTERNS = [
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
  /\b\d{4}-\d{1,2}-\d{1,2}\b/g,
];

const ARABIC_MONTHS =
  "يناير|فبراير|مارس|أبريل|إبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر";
const ARABIC_DATE_PATTERN = new RegExp(
  `\\b\\d{1,2}\\s+(?:${ARABIC_MONTHS})\\s+\\d{4}\\b`,
  "g",
);

function detectDates(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of DATE_PATTERNS) {
    for (const m of text.matchAll(pattern)) found.add(m[0]);
  }
  for (const m of text.matchAll(ARABIC_DATE_PATTERN)) found.add(m[0]);
  return Array.from(found).slice(0, 40);
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`--- Sheet: ${sheet.name} ---`);
    sheet.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1).map((v) => {
        if (v == null) return "";
        if (typeof v === "object" && "text" in (v as Record<string, unknown>)) {
          return String((v as { text: unknown }).text);
        }
        if (typeof v === "object" && "result" in (v as Record<string, unknown>)) {
          return String((v as { result: unknown }).result);
        }
        return String(v);
      });
      const line = values.join(" | ").trim();
      if (line) lines.push(line);
    });
  });
  return lines.join("\n");
}

function extractCsv(buffer: Buffer): string {
  const content = buffer.toString("utf-8");
  const parsed = Papa.parse<string[]>(content, { skipEmptyLines: true });
  return parsed.data.map((row) => row.join(" | ")).join("\n");
}

const MAX_EXTRACTED_CHARS = 60_000;

export async function extractDocument(
  buffer: Buffer,
  fileName: string,
): Promise<DocumentExtractResult> {
  const fileKind = detectFileKind(fileName);

  try {
    switch (fileKind) {
      case "pdf": {
        const { text, pageCount, likelyScanned } = await extractPdfText(buffer);
        return {
          fileKind,
          text: text.slice(0, MAX_EXTRACTED_CHARS),
          pageCount,
          detectedDates: detectDates(text),
          status: "PARSED",
          note: likelyScanned
            ? "قد يكون هذا المستند ممسوحاً ضوئياً بدون طبقة نصية؛ يُنصح بمراجعته يدوياً."
            : undefined,
        };
      }
      case "docx": {
        const result = await mammoth.extractRawText({ buffer });
        const text = result.value || "";
        return {
          fileKind,
          text: text.slice(0, MAX_EXTRACTED_CHARS),
          detectedDates: detectDates(text),
          status: "PARSED",
        };
      }
      case "xlsx": {
        const text = await extractXlsx(buffer);
        return {
          fileKind,
          text: text.slice(0, MAX_EXTRACTED_CHARS),
          detectedDates: detectDates(text),
          status: "PARSED",
        };
      }
      case "csv": {
        const text = extractCsv(buffer);
        return {
          fileKind,
          text: text.slice(0, MAX_EXTRACTED_CHARS),
          detectedDates: detectDates(text),
          status: "PARSED",
        };
      }
      case "image": {
        // No text/vision model is wired up (llama-3.3-70b-versatile is
        // text-only), so images can't be OCR'd automatically. The filename
        // is kept as a weak signal for the offline heuristic matcher, and
        // the note flags the document for manual review either way.
        const text = `[صورة: ${fileName}]`;
        return {
          fileKind,
          text,
          detectedDates: [],
          status: "PARSED",
          note: "لم يتم استخراج نص من هذه الصورة تلقائياً (الصور تتطلب مراجعة يدوية).",
        };
      }
      default:
        return {
          fileKind,
          text: "",
          detectedDates: [],
          status: "UNSUPPORTED",
          error: "نوع الملف غير مدعوم للاستخراج التلقائي للنص",
        };
    }
  } catch (err) {
    return {
      fileKind,
      text: "",
      detectedDates: [],
      status: "FAILED",
      error: err instanceof Error ? err.message : "فشل استخراج النص من الملف",
    };
  }
}
