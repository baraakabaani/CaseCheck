import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

// PDF text extraction. Kept isolated from the other office-format parsers
// because pdf-parse pulls in its own pdf.js-based dependency chain and this
// is where a future OCR fallback (Tesseract / Cloud Document AI) for scanned
// PDFs would plug in.

export interface PdfExtractResult {
  text: string;
  pageCount: number;
  /** true when very little text was recoverable — usually a scanned PDF
   * with no text layer, which needs manual review or an OCR pass. */
  likelyScanned: boolean;
}

const MIN_CHARS_PER_PAGE_THRESHOLD = 20;

// pdfjs-dist (which pdf-parse wraps) resolves its worker script relative to
// its own bundled module by default — that relative resolution breaks under
// Next.js/Turbopack, which doesn't copy pdf-parse's sibling pdf.worker.mjs
// into the compiled output. Symptom: every single PDF (even a perfectly
// valid one) failed with "Setting up fake worker failed: Cannot find
// module '...pdf.worker.mjs'", surfacing as a false "فشلت المعالجة" — this
// was very likely the actual cause behind that report, not corrupt files.
// Fix: point pdfjs at the real on-disk file explicitly, once, via an
// absolute file:// URL (process.cwd()-relative, same assumption already
// used by lib/file-storage.ts's UPLOADS_ROOT).
let workerConfigured = false;
function ensurePdfWorkerConfigured(): void {
  if (workerConfigured) return;
  workerConfigured = true;
  try {
    const workerPath = path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      "node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs",
    );
    PDFParse.setWorker(pathToFileURL(workerPath).href);
  } catch {
    // Best-effort — if this fails, extraction below still throws a clear,
    // catchable error instead of crashing the request.
  }
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  ensurePdfWorkerConfigured();
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = (result.text || "").trim();
    const pageCount = result.total || 1;

    return {
      text,
      pageCount,
      likelyScanned: text.length < pageCount * MIN_CHARS_PER_PAGE_THRESHOLD,
    };
  } finally {
    await parser.destroy();
  }
}
