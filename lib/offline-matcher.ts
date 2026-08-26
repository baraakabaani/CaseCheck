// Zero-API fallback matching engine. Runs entirely locally (no network
// call) using keyword-coverage scoring plus detected-date/period coverage,
// so the audit checklist stays usable even with no Groq key configured.

import { aiMatchResponseSchema, type AiMatchResponse, type CaseType } from "./schemas";
import { findPresetItem } from "./presets";
import { tokenize, tokenSet, tokenCoverage } from "./text-normalize";
import type { MatchDocumentInput, MatchRequirementInput } from "./matching-types";

const MISSING_THRESHOLD = 0.25;
const PARTIAL_THRESHOLD = 0.5;
const MAX_MATCHES_RETURNED = 5;
const YEAR_PATTERN = /(19|20)\d{2}/;

function extractYears(dateStrings: string[]): number[] {
  const years = new Set<number>();
  for (const s of dateStrings) {
    const m = s.match(YEAR_PATTERN);
    if (m) years.add(Number(m[0]));
  }
  return [...years];
}

function requiredYears(periodStart?: string | null, periodEnd?: string | null): number[] {
  if (!periodStart && !periodEnd) return [];
  const startYear = periodStart ? new Date(periodStart).getFullYear() : undefined;
  const endYear = periodEnd ? new Date(periodEnd).getFullYear() : undefined;
  const s = startYear ?? endYear;
  const e = endYear ?? startYear;
  if (s === undefined || e === undefined) return [];
  const years: number[] = [];
  for (let y = Math.min(s, e); y <= Math.max(s, e); y++) years.push(y);
  return years;
}

interface RequirementPhrases {
  /** Each entry is one candidate phrase (label, or a single curated
   * keyword/synonym) scored independently — so a document that strongly
   * matches *one* specific term (e.g. "trade license") isn't diluted by the
   * rest of a long, formal requirement label it doesn't otherwise echo. */
  primary: string[][];
  /** Category + free-text description, merged and scored at a discount —
   * too generic on their own to count as a confident match. */
  secondary: string[];
}

function buildRequirementPhrases(
  req: MatchRequirementInput,
  caseType: CaseType,
): RequirementPhrases {
  const preset = req.presetKey ? findPresetItem(caseType, req.presetKey) : undefined;
  const primarySources = [req.labelAr, req.labelEn ?? "", ...(preset?.keywords ?? [])];
  const primary = primarySources.map((s) => tokenize(s)).filter((tokens) => tokens.length > 0);
  const secondary = tokenize(`${req.category ?? ""} ${req.description ?? ""}`);
  return { primary, secondary };
}

const SECONDARY_MATCH_DISCOUNT = 0.6;

function scoreDocument(phrases: RequirementPhrases, docTokens: Set<string>): number {
  let best = 0;
  for (const phrase of phrases.primary) {
    const score = tokenCoverage(phrase, docTokens);
    if (score > best) best = score;
  }
  if (phrases.secondary.length > 0) {
    const secondaryScore = tokenCoverage(phrases.secondary, docTokens) * SECONDARY_MATCH_DISCOUNT;
    if (secondaryScore > best) best = secondaryScore;
  }
  return best;
}

function hasParseIssue(doc: MatchDocumentInput): boolean {
  return doc.parseStatus === "FAILED" || doc.parseStatus === "UNSUPPORTED" || Boolean(doc.note);
}

export function offlineMatchDocumentsToRequirements(
  requirements: MatchRequirementInput[],
  documents: MatchDocumentInput[],
  caseType: CaseType,
): AiMatchResponse {
  const docTokenSets = documents.map((doc) => ({
    doc,
    tokens: tokenSet(`${doc.text} ${doc.fileName}`),
  }));

  const results = requirements.map((req) => {
    const phrases = buildRequirementPhrases(req, caseType);

    if (phrases.primary.length === 0 && phrases.secondary.length === 0) {
      return {
        requirementId: req.id,
        status: "MISSING" as const,
        confidence: 0.3,
        reasoning:
          "تعذر تحديد كلمات مفتاحية كافية لهذا المتطلب لإجراء مطابقة آلية دقيقة — يُنصح بالمراجعة اليدوية (مطابقة آلية بدون ذكاء اصطناعي).",
        matchedDocuments: [],
      };
    }

    const scored = docTokenSets
      .map(({ doc, tokens }) => ({ doc, score: scoreDocument(phrases, tokens) }))
      .filter((s) => s.score >= MISSING_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        requirementId: req.id,
        status: "MISSING" as const,
        confidence: 0.7,
        reasoning:
          "لم يتم العثور على مستند تتطابق كلماته الأساسية مع هذا المتطلب (مطابقة آلية بدون ذكاء اصطناعي).",
        matchedDocuments: [],
      };
    }

    const bestScore = scored[0].score;
    const relevant = scored.filter((s) => s.score >= PARTIAL_THRESHOLD);
    const matchedDocuments = scored.slice(0, MAX_MATCHES_RETURNED).map((s) => ({
      documentId: s.doc.id,
      relevance: Math.min(1, s.score),
      pageRefs: null,
      note: `تطابق كلمات مفتاحية بنسبة ${Math.round(s.score * 100)}%`,
    }));

    if (bestScore < PARTIAL_THRESHOLD) {
      return {
        requirementId: req.id,
        status: "PARTIALLY_PROVIDED" as const,
        confidence: bestScore,
        reasoning: `تم العثور على مستند قد تكون له صلة (${scored[0].doc.fileName}) لكن التطابق ضعيف (${Math.round(
          bestScore * 100,
        )}%) — يُرجى التحقق يدوياً (مطابقة آلية بدون ذكاء اصطناعي).`,
        matchedDocuments,
      };
    }

    const parseIssue = relevant.some((s) => hasParseIssue(s.doc));
    const reqYears = requiredYears(req.periodStart, req.periodEnd);

    if (reqYears.length > 0) {
      const coveredYears = new Set(relevant.flatMap((s) => extractYears(s.doc.detectedDates)));
      const missingYears = reqYears.filter((y) => !coveredYears.has(y));

      if (missingYears.length > 0) {
        return {
          requirementId: req.id,
          status: "PARTIALLY_PROVIDED" as const,
          confidence: bestScore * 0.8,
          reasoning: `المستندات المرفوعة لا تغطي كامل الفترة المطلوبة — السنوات الناقصة: ${missingYears.join(
            "، ",
          )} (مطابقة آلية بدون ذكاء اصطناعي).`,
          matchedDocuments,
        };
      }

      return {
        requirementId: req.id,
        status: (parseIssue ? "PARTIALLY_PROVIDED" : "PROVIDED") as
          | "PARTIALLY_PROVIDED"
          | "PROVIDED",
        confidence: bestScore,
        reasoning: parseIssue
          ? `تم العثور على مستندات تغطي الفترة المطلوبة (${reqYears.join(
              "، ",
            )}) لكن بعضها قد يكون ممسوحاً ضوئياً أو غير واضح — يُنصح بالمراجعة اليدوية (مطابقة آلية بدون ذكاء اصطناعي).`
          : `تم العثور على مستندات تغطي الفترة المطلوبة بالكامل (${reqYears.join(
              "، ",
            )}) بناءً على مطابقة الكلمات المفتاحية والتواريخ المكتشفة (مطابقة آلية بدون ذكاء اصطناعي).`,
        matchedDocuments,
      };
    }

    return {
      requirementId: req.id,
      status: (parseIssue ? "PARTIALLY_PROVIDED" : "PROVIDED") as
        | "PARTIALLY_PROVIDED"
        | "PROVIDED",
      confidence: bestScore,
      reasoning: parseIssue
        ? `تم العثور على مستند مطابق (${scored[0].doc.fileName}) لكنه قد يكون ممسوحاً ضوئياً أو غير مكتمل — يُنصح بالمراجعة اليدوية (مطابقة آلية بدون ذكاء اصطناعي).`
        : `تم العثور على مستند مطابق (${scored[0].doc.fileName}) بنسبة تطابق كلمات مفتاحية ${Math.round(
            bestScore * 100,
          )}% (مطابقة آلية بدون ذكاء اصطناعي).`,
      matchedDocuments,
    };
  });

  return aiMatchResponseSchema.parse({ results });
}
