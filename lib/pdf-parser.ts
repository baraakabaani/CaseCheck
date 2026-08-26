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

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
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
