// Shared input shapes for both the Groq-backed matcher (lib/ai-matcher.ts)
// and the zero-API heuristic fallback (lib/offline-matcher.ts), so the two
// engines stay interchangeable behind the same call site.

export interface MatchDocumentInput {
  id: string;
  fileName: string;
  fileKind: string;
  /** Raw date strings as detected in the document text (see document-parser.ts) */
  detectedDates: string[];
  text: string;
  /** Free-text note surfaced to the user, e.g. "likely a scanned PDF" */
  note?: string | null;
  /** PENDING | PARSED | FAILED | UNSUPPORTED */
  parseStatus: string;
}

export interface MatchRequirementInput {
  id: string;
  labelAr: string;
  labelEn?: string | null;
  category?: string | null;
  description?: string | null;
  presetKey?: string | null;
  periodStart?: string | null; // ISO date string
  periodEnd?: string | null; // ISO date string
  isRequired: boolean;
}
