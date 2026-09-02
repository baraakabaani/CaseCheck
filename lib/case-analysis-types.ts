// Shared input shapes for both the Groq-backed case analyzer
// (lib/case-analyzer.ts) and its zero-API fallback
// (lib/offline-case-analyzer.ts) — kept in their own file (same pattern as
// lib/matching-types.ts) so neither analyzer module has to import the other.

import type { MandateNatureOption } from "./schemas";

export interface CaseAnalyzerParty {
  id: string;
  role: "CLAIMANT" | "RESPONDENT";
  name: string;
}

export interface CaseAnalyzerDocument {
  id: string;
  fileName: string;
  fileKind: string;
  text: string;
  detectedDates: string[];
}

export interface CaseAnalyzerContext {
  caseNumber: string;
  court?: string | null;
  circuit?: string | null;
  litigationDegreeLabel?: string | null;
  caseCategoryLabel?: string | null;
  title?: string | null;
  mandateNature: MandateNatureOption[];
}
