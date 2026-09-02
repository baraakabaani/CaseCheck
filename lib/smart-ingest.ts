// "نظام الضغط الذكي" — local, zero-API pre-processing that turns raw
// extracted document text into small, information-dense digests before any
// of it reaches an LLM. Replaces the old approach (dump the first N raw
// characters of every document) which wasted most of its budget on
// boilerplate/disclosure text and still routinely got documents skipped or
// cut off mid-sentence for real multi-document cases — the direct cause of
// the "Expected ',' or ']' after array element in JSON" class of errors
// (the model runs out of output budget trying to make sense of a huge,
// truncated raw-text prompt). Every document now gets a hard, bounded
// budget regardless of its original size, driven by which of the 5 upload
// slots (Phase 3) it was filed under — see docCategory, set at upload time
// in app/api/cases/[id]/documents/route.ts, not guessed by the AI anymore.
//
// This is heuristic, not a language model: it never invents figures. Any
// computed metric (see computeLedgerDigest) is clearly labeled as
// automatically computed so the expert knows to verify it.

import type { DocCategory } from "./schemas";

const CHARS_PER_TOKEN = 3; // Arabic-heavy text, same heuristic used in lib/ai-matcher.ts / lib/case-analyzer.ts

export interface SmartIngestDocument {
  id: string;
  fileName: string;
  fileKind: string; // pdf | docx | xlsx | csv | image | other
  docCategory: DocCategory;
  text: string;
}

export interface SmartIngestPayload {
  court_ruling_summary: string | null;
  case_pleading_summary: string | null;
  parties_memos_summary: string[];
  financial_and_evidence_digests: { file_name: string; doc_type: string; summary_metrics: string }[];
  other_docs: string[];
  /** Ready-to-embed JSON block for the LLM user prompt. */
  promptJson: string;
  /** Every digest string starts with this tag so the model can always cite
   * the exact documentId back in its structured output. */
  taggedDocumentIds: string[];
  stats: { approxTokensUsed: number; skippedCount: number; truncatedCount: number };
}

// ---------------------------------------------------------------------------
// Budgets (tokens) — see AGENTS spec: per-category budgets, ~3,500–4,500
// tokens total. Enforced as a shared pool processed in priority order so a
// case with many documents degrades gracefully (later/lower-priority items
// get skipped with an honest note) instead of blowing past the limit.
// ---------------------------------------------------------------------------
const TOTAL_PAYLOAD_TOKEN_BUDGET = 4500;
const RULING_BUDGET_TOKENS = 600;
const CLAIM_BUDGET_TOKENS = 500;
const MEMO_BUDGET_TOKENS = 400; // per memo
const FINANCIAL_TOTAL_BUDGET_TOKENS = 600; // shared across all Slot-4 documents
const OTHER_BUDGET_TOKENS = 300; // per document
const MIN_USEFUL_TOKENS = 40; // below this, skip rather than include a near-empty fragment

function tokensToChars(tokens: number): number {
  return Math.max(0, Math.floor(tokens * CHARS_PER_TOKEN));
}

function capToTokens(text: string, tokenBudget: number): { text: string; truncated: boolean } {
  const charBudget = tokensToChars(tokenBudget);
  const trimmed = text.trim();
  if (trimmed.length <= charBudget) return { text: trimmed, truncated: false };
  return { text: trimmed.slice(0, charBudget).trim() + " …", truncated: true };
}

/** Finds the first of `markers` present in `text` and returns a window
 * around it — used to pull out the legally load-bearing paragraphs (the
 * operative order, the prayer for relief, ...) instead of an arbitrary
 * prefix of the document. */
function extractAroundMarker(
  text: string,
  markers: string[],
  { before = 0, after = 700 }: { before?: number; after?: number } = {},
): string | null {
  for (const marker of markers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      const start = Math.max(0, idx - before);
      const end = Math.min(text.length, idx + marker.length + after);
      return text.slice(start, end).trim();
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Slot 1 — الحكم التمهيدي / قرار الندب
// ---------------------------------------------------------------------------
const RULING_OPERATIVE_MARKERS = [
  "حكمت المحكمة",
  "قررت المحكمة",
  "وحكمت",
  "وندبت",
  "ندبت",
  "قرار الندب",
  "مأمورية الخبير",
];

function rawRulingDigest(text: string): string {
  const header = text.slice(0, 400); // court, case number, date, judge usually appear in the preamble
  const operative = extractAroundMarker(text, RULING_OPERATIVE_MARKERS, { after: 900 });
  return operative ? `${header}\n…\n${operative}` : text.slice(0, 1300);
}

// ---------------------------------------------------------------------------
// Slot 2 — لائحة / صحيفة الدعوى
// ---------------------------------------------------------------------------
const CLAIM_PRAYER_MARKERS = ["بناءً عليه", "بناء عليه", "يلتمس المدعي", "الطلبات", "لذلك"];

function rawClaimDigest(text: string): string {
  const intro = text.slice(0, 500); // parties/capacities + opening summary of the claim
  const prayer = extractAroundMarker(text, CLAIM_PRAYER_MARKERS, { after: 700 });
  return prayer ? `${intro}\n…\n${prayer}` : text.slice(0, 1300);
}

// ---------------------------------------------------------------------------
// Slot 3 — مذكرات الأطراف
// ---------------------------------------------------------------------------
const MEMO_CONCLUSION_MARKERS = ["لذلك", "بناء عليه", "بناءً عليه", "الطلبات", "وعليه"];

function rawMemoDigest(text: string): string {
  const intro = text.slice(0, 400);
  const conclusion =
    extractAroundMarker(text, MEMO_CONCLUSION_MARKERS, { after: 500 }) ??
    text.slice(Math.max(0, text.length - 500));
  return `${intro}\n…\n${conclusion}`;
}

// ---------------------------------------------------------------------------
// Slot 4 — مستندات الأطراف وحوافظ المستندات (بيانات مالية مدققة / كشوف بنكية)
// ---------------------------------------------------------------------------
const FINANCIAL_STATEMENT_MARKERS = [
  "قائمة المركز المالي",
  "الميزانية العمومية",
  "قائمة الدخل",
  "قائمة الأرباح والخسائر",
  "تقرير مدقق الحسابات",
  "رأي مراقب الحسابات",
];

const CREDIT_KEYWORDS = ["دائن", "ايداع", "إيداع", "credit", "deposit"];
const DEBIT_KEYWORDS = ["مدين", "سحب", "debit", "withdrawal"];
const BALANCE_KEYWORDS = ["رصيد", "balance"];

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function findBankName(text: string): string | null {
  for (const line of text.split("\n").slice(0, 15)) {
    if (/بنك|مصرف|bank/i.test(line) && line.trim().length > 0 && line.trim().length < 80) {
      return line.trim();
    }
  }
  return null;
}

function findAccountNumber(text: string): string | null {
  const iban = text.match(/\bAE\d{21}\b/i);
  if (iban) return iban[0];
  const labeled = text.match(/(?:رقم الحساب|account\s*(?:no\.?|number)?)\s*[:\-]?\s*(\d{6,20})/i);
  return labeled ? labeled[1] : null;
}

/** Runs local arithmetic over a parsed bank-statement/ledger table (already
 * flattened to " | "-delimited rows by lib/document-parser.ts) instead of
 * sending the raw rows to the LLM: detects a header row naming
 * credit/debit/balance columns, sums the credit and debit columns, and
 * reads the first/last balance-column values as opening/closing balance.
 * Returns null (caller falls back to a plain excerpt) when no such header
 * can be confidently located — this never guesses at numbers. */
function computeLedgerDigest(text: string): string | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let headerIdx = -1;
  let creditCol = -1;
  let debitCol = -1;
  let balanceCol = -1;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const cols = lines[i].split("|").map((c) => c.trim().toLowerCase());
    if (cols.length < 2) continue;
    const cIdx = cols.findIndex((c) => CREDIT_KEYWORDS.some((k) => c.includes(k)));
    const dIdx = cols.findIndex((c) => DEBIT_KEYWORDS.some((k) => c.includes(k)));
    const bIdx = cols.findIndex((c) => BALANCE_KEYWORDS.some((k) => c.includes(k)));
    if ((cIdx >= 0 && dIdx >= 0) || bIdx >= 0) {
      headerIdx = i;
      creditCol = cIdx;
      debitCol = dIdx;
      balanceCol = bIdx;
      break;
    }
  }
  if (headerIdx === -1) return null;

  let totalCredit = 0;
  let totalDebit = 0;
  let creditCount = 0;
  let debitCount = 0;
  let firstBalance: number | null = null;
  let lastBalance: number | null = null;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split("|").map((c) => c.trim());
    if (creditCol >= 0 && cols[creditCol]) {
      const v = parseAmount(cols[creditCol]);
      if (v) {
        totalCredit += v;
        creditCount++;
      }
    }
    if (debitCol >= 0 && cols[debitCol]) {
      const v = parseAmount(cols[debitCol]);
      if (v) {
        totalDebit += v;
        debitCount++;
      }
    }
    if (balanceCol >= 0 && cols[balanceCol]) {
      const v = parseAmount(cols[balanceCol]);
      if (v !== null) {
        if (firstBalance === null) firstBalance = v;
        lastBalance = v;
      }
    }
  }

  if (creditCount === 0 && debitCount === 0 && firstBalance === null) return null;

  const parts: string[] = [];
  const bankName = findBankName(text);
  const accountNumber = findAccountNumber(text);
  if (bankName) parts.push(`البنك: ${bankName}`);
  if (accountNumber) parts.push(`رقم الحساب: ${accountNumber}`);
  if (creditCount > 0) {
    parts.push(`إجمالي الإيداعات: ${totalCredit.toLocaleString("en-US")} (${creditCount} حركة)`);
  }
  if (debitCount > 0) {
    parts.push(`إجمالي المسحوبات: ${totalDebit.toLocaleString("en-US")} (${debitCount} حركة)`);
  }
  if (firstBalance !== null) {
    parts.push(`الرصيد الافتتاحي: ${firstBalance.toLocaleString("en-US")}`);
  }
  if (lastBalance !== null && lastBalance !== firstBalance) {
    parts.push(`الرصيد الختامي: ${lastBalance.toLocaleString("en-US")}`);
  }
  parts.push("(أرقام محسوبة آلياً من الملف — يُنصح بالتحقق اليدوي)");
  return parts.join(" — ");
}

function rawFinancialDigest(doc: SmartIngestDocument): { text: string; docType: string } {
  const text = doc.text?.trim() || "";
  if (!text) return { text: `(تعذر استخراج نص من ${doc.fileName})`, docType: "غير محدد" };

  if (doc.fileKind === "xlsx" || doc.fileKind === "csv") {
    const ledger = computeLedgerDigest(text);
    if (ledger) return { text: ledger, docType: "كشف حساب بنكي / دفتر أستاذ (ملخص محسوب آلياً)" };
  }

  const statement = extractAroundMarker(text, FINANCIAL_STATEMENT_MARKERS, { before: 100, after: 700 });
  if (statement) return { text: statement, docType: "بيانات مالية مدققة (مقتطف)" };

  return { text: text.slice(0, 700), docType: "مستند/مرفق مالي" };
}

// ---------------------------------------------------------------------------
// Slot 5 — مستندات قضائية أخرى
// ---------------------------------------------------------------------------
function rawOtherDigest(text: string): string {
  return text.slice(0, 1000);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
function tagFor(doc: SmartIngestDocument): string {
  return `[معرف المستند: ${doc.id} | الملف: ${doc.fileName}]`;
}

export function buildSmartIngestPayload(documents: SmartIngestDocument[]): SmartIngestPayload {
  let remaining = TOTAL_PAYLOAD_TOKEN_BUDGET;
  let skippedCount = 0;
  let truncatedCount = 0;
  const taggedDocumentIds: string[] = [];

  function process(doc: SmartIngestDocument, ownCapTokens: number, raw: string): string | null {
    const grant = Math.min(ownCapTokens, remaining);
    if (grant < MIN_USEFUL_TOKENS) {
      skippedCount++;
      return null;
    }
    const { text, truncated } = capToTokens(raw, grant);
    remaining -= Math.ceil(text.length / CHARS_PER_TOKEN);
    if (truncated) truncatedCount++;
    taggedDocumentIds.push(doc.id);
    return `${tagFor(doc)} ${text}`;
  }

  const byCategory = new Map<DocCategory, SmartIngestDocument[]>();
  for (const doc of documents) {
    const key = doc.docCategory || "UNSPECIFIED";
    const list = byCategory.get(key) ?? [];
    list.push(doc);
    byCategory.set(key, list);
  }

  const rulingParts = (byCategory.get("PRELIMINARY_RULING") ?? [])
    .map((d) => process(d, RULING_BUDGET_TOKENS, rawRulingDigest(d.text || "")))
    .filter((s): s is string => s !== null);
  const court_ruling_summary = rulingParts.length > 0 ? rulingParts.join("\n\n") : null;

  const claimParts = (byCategory.get("STATEMENT_OF_CLAIM") ?? [])
    .map((d) => process(d, CLAIM_BUDGET_TOKENS, rawClaimDigest(d.text || "")))
    .filter((s): s is string => s !== null);
  const case_pleading_summary = claimParts.length > 0 ? claimParts.join("\n\n") : null;

  const parties_memos_summary = (byCategory.get("PARTY_MEMO") ?? [])
    .map((d) => process(d, MEMO_BUDGET_TOKENS, rawMemoDigest(d.text || "")))
    .filter((s): s is string => s !== null);

  const financialDocs = byCategory.get("PARTY_ATTACHMENT") ?? [];
  const perFinancialCap =
    financialDocs.length > 0
      ? Math.max(MIN_USEFUL_TOKENS, Math.floor(FINANCIAL_TOTAL_BUDGET_TOKENS / financialDocs.length))
      : 0;
  const financial_and_evidence_digests = financialDocs
    .map((d) => {
      const { text: raw, docType } = rawFinancialDigest(d);
      const summary = process(d, perFinancialCap, raw);
      return summary ? { file_name: d.fileName, doc_type: docType, summary_metrics: summary } : null;
    })
    .filter((x): x is { file_name: string; doc_type: string; summary_metrics: string } => x !== null);

  const otherDocs = [...(byCategory.get("OTHER_JUDICIAL") ?? []), ...(byCategory.get("UNSPECIFIED") ?? [])];
  const other_docs = otherDocs
    .map((d) => process(d, OTHER_BUDGET_TOKENS, rawOtherDigest(d.text || "")))
    .filter((s): s is string => s !== null);

  const structured = {
    court_ruling_summary,
    case_pleading_summary,
    parties_memos_summary,
    financial_and_evidence_digests,
    other_docs,
  };

  return {
    ...structured,
    promptJson: JSON.stringify(structured, null, 1),
    taggedDocumentIds,
    stats: {
      approxTokensUsed: TOTAL_PAYLOAD_TOKEN_BUDGET - remaining,
      skippedCount,
      truncatedCount,
    },
  };
}

/** Single-document digest, reused by lib/ai-matcher.ts so the checklist
 * matcher benefits from the same information-dense, budget-bounded
 * extraction instead of a raw truncated excerpt — without the multi-slot
 * grouping that lib/case-analyzer.ts needs. */
export function buildSingleDocumentDigest(
  doc: SmartIngestDocument,
  tokenBudget: number,
): { text: string; truncated: boolean } {
  const text = doc.text?.trim() || "";
  if (!text) return { text: `(تعذر استخراج نص من ${doc.fileName})`, truncated: false };

  let raw: string;
  switch (doc.docCategory) {
    case "PRELIMINARY_RULING":
      raw = rawRulingDigest(text);
      break;
    case "STATEMENT_OF_CLAIM":
      raw = rawClaimDigest(text);
      break;
    case "PARTY_MEMO":
      raw = rawMemoDigest(text);
      break;
    case "PARTY_ATTACHMENT":
      raw = rawFinancialDigest(doc).text;
      break;
    default:
      raw = rawOtherDigest(text);
  }
  return capToTokens(raw, tokenBudget);
}
