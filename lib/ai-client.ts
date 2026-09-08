import Groq from "groq-sdk";
import { GEMINI_API_KEY_HEADER, GROQ_API_KEY_HEADER } from "./api-key-header";

export type AiProvider = "gemini" | "groq" | "deepseek";

// gemini-3.6-flash: verified live (2026-09-02) against Gemini's
// OpenAI-compatible endpoint with response_format: json_object. Its free
// tier has a much larger *token* budget and ~1M token context window than
// Groq's free "on_demand" tier (8,000 tokens/minute) — but its free tier's
// *request-rate* limit is tight enough to hit HTTP 429 in normal use, so
// it's kept as a fallback/alternative provider, not the primary one (see
// resolveAiKey below).
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// qwen/qwen3.8-27b, not one of the openai/gpt-oss-* models: those are
// reasoning models that burn a large, variable share of max_tokens on
// hidden chain-of-thought before writing the JSON answer, which is a poor
// fit for Groq's free-tier 8,000 TPM cap — verified against a live probe
// (gpt-oss-120b needed 500+ completion tokens and still didn't finish
// valid JSON for a request qwen3.8-27b answered correctly in ~730 tokens).
export const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

// DeepSeek: not a free tier — a paid, very cheap fallback (see
// resolveAiKeys below for why it's tried last, only once every free
// Groq/Gemini candidate has been exhausted). deepseek-v4-flash is the
// cheap/fast checkpoint (deepseek-v4-pro costs roughly 3x as much per
// official pricing as of 2026-09 — verified against api-docs.deepseek.com,
// not assumed). The older deepseek-chat/deepseek-reasoner model aliases
// were retired mid-2026; deepseek-v4-flash is the current name.
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

// Gemini's OpenAI-compatible endpoint (Bearer-token auth, same
// request/response shape as the chat completions API groq-sdk's types
// model) — groq-sdk itself can't be pointed at this URL because it
// hardcodes the resource path to /openai/v1/chat/completions, which
// doesn't match Gemini's /openai/chat/completions path, so this provider
// is called via a small structurally-compatible fetch client instead.
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// DeepSeek's own OpenAI-compatible endpoint — same reasoning as Gemini
// above (structurally compatible response shape, but its own base URL),
// verified against api-docs.deepseek.com (2026-09).
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

export interface AiChatMessage {
  role: "system" | "user";
  content: string;
}

export interface AiChatCompletion {
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export interface AiChatParams {
  model: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
  messages: AiChatMessage[];
  /** Gemini 3 models (e.g. gemini-3.6-flash) think by default and spend a
   * large, variable share of max_tokens on a hidden reasoning pass before
   * writing the visible JSON answer — verified live: with this unset, a
   * real analysis prompt hit finish_reason "length" and returned truncated,
   * invalid JSON at max_tokens 2500 despite only ~100 visible completion
   * tokens being used (the rest went to hidden thinking). Setting this to
   * "low" fixed it (same prompt then completed in full within budget).
   * This mirrors the exact pitfall hit with Groq's openai/gpt-oss-* models
   * (see GROQ_MODEL comment) — only meaningful for Gemini; the Groq and
   * DeepSeek clients below both drop it (Groq's API doesn't support this
   * field at all; DeepSeek uses an unrelated nested `thinking` shape and
   * is unconditionally called with thinking disabled instead, see
   * createDeepSeekClient — none of this app's calls need its reasoning
   * mode). */
  reasoning_effort?: "low" | "medium" | "high";
}

/** The minimal shape both providers are called through — Groq's SDK client
 * already satisfies this structurally. */
export interface AiClient {
  chat: {
    completions: {
      create(params: AiChatParams): Promise<AiChatCompletion>;
    };
  };
}

export interface ResolvedAiKey {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

export interface ClientApiKeys {
  gemini?: string | null;
  groq?: string | null;
}

/** GROQ_API_KEY/GEMINI_API_KEY/DEEPSEEK_API_KEY each accept a
 * comma-separated list, not just one key — every extra key is a
 * *completely separate* account with its own independent free-tier rate
 * limit bucket, so three Groq keys means three times the request-rate
 * budget before the failover chain has to move on, not just one bigger
 * pool sharing the same limit. Whitespace around each key is trimmed;
 * empty entries (trailing comma, etc.) are dropped. */
function splitKeys(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Every AI key actually available for this request, in the order they
 * should be tried:
 *   1. client-provided Groq key (typed into the UI, sent as a header)
 *   2. every server GROQ_API_KEY (comma-separated — see splitKeys above)
 *   3. client-provided Gemini key
 *   4. every server GEMINI_API_KEY
 *   5. every server DEEPSEEK_API_KEY
 *   → empty array if none of the above is configured, caller falls back to
 *     its offline heuristic.
 *
 * This is what makes automatic provider failover possible (see
 * callWithAiFailover below): a caller with several candidates configured
 * retries the next one if an earlier one's free-tier rate limit rejects
 * the request, instead of giving up straight to the offline fallback.
 * Groq is tried before Gemini — Gemini was briefly tried as the primary
 * provider (larger free-tier token budget, ~1M token context — see
 * GEMINI_MODEL comment below) but its free tier's *request-rate* limit
 * (not just tokens/minute) turned out to be tight enough to hit HTTP 429 in
 * normal use.
 *
 * DeepSeek is deliberately last and server-only (no client-provided key
 * today) — unlike Groq/Gemini it's not a free tier, so it's held back
 * as the "this basically never fails" option once every free candidate
 * above has actually been exhausted, not spent on requests the free tiers
 * could have handled. Configuring it is optional; nothing regresses if
 * DEEPSEEK_API_KEY is unset. */
export function resolveAiKeys(clientKeys?: ClientApiKeys | null): ResolvedAiKey[] {
  const keys: ResolvedAiKey[] = [];
  const seen = new Set<string>(); // نفس المفتاح الحرفي قد يصل من أكثر من مصدر (مثال: العميل كتب مفتاحاً موجوداً أصلاً في متغيرات الخادم) — لا داعي لمحاولته مرتين

  function pushUnique(provider: AiProvider, apiKey: string, model: string) {
    const dedupeKey = `${provider}:${apiKey}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    keys.push({ provider, apiKey, model });
  }

  const clientGroq = clientKeys?.groq?.trim();
  if (clientGroq) pushUnique("groq", clientGroq, GROQ_MODEL);
  for (const key of splitKeys(process.env.GROQ_API_KEY)) pushUnique("groq", key, GROQ_MODEL);

  const clientGemini = clientKeys?.gemini?.trim();
  if (clientGemini) pushUnique("gemini", clientGemini, GEMINI_MODEL);
  for (const key of splitKeys(process.env.GEMINI_API_KEY)) pushUnique("gemini", key, GEMINI_MODEL);

  for (const key of splitKeys(process.env.DEEPSEEK_API_KEY)) pushUnique("deepseek", key, DEEPSEEK_MODEL);

  return keys;
}

/** Convenience for callers that only ever want the single best candidate
 * (e.g. audio transcription, which only has a Groq-backed endpoint to
 * begin with) — equivalent to resolveAiKeys(...)[0] ?? null. */
export function resolveAiKey(clientKeys?: ClientApiKeys | null): ResolvedAiKey | null {
  return resolveAiKeys(clientKeys)[0] ?? null;
}

export interface AiFailoverAttempt {
  provider: AiProvider;
  error: unknown;
}

/** Thrown by callWithAiFailover only once every candidate has failed —
 * carries every attempt so the caller can build an honest, specific
 * OFFLINE-fallback warning instead of just surfacing the last error. */
export class AiFailoverError extends Error {
  attempts: AiFailoverAttempt[];
  constructor(attempts: AiFailoverAttempt[]) {
    const last = attempts[attempts.length - 1];
    const lastMessage = last?.error instanceof Error ? last.error.message : String(last?.error);
    super(
      attempts.length > 1
        ? `فشلت كل مزودات الذكاء الاصطناعي المتاحة (${attempts.length}) — آخر خطأ (${last.provider}): ${lastMessage}`
        : lastMessage,
    );
    this.name = "AiFailoverError";
    this.attempts = attempts;
  }
}

/**
 * Runs `fn` against each candidate key in order (see resolveAiKeys),
 * returning the first successful result. If a candidate's call throws —
 * most commonly a 429 from that provider's free tier, but any error
 * qualifies — it moves on to the next candidate instead of giving up
 * immediately. Only throws (AiFailoverError) once every candidate has been
 * tried and failed; callers catch that exactly where they previously
 * caught a single provider's error, and fall back to the same offline
 * heuristic as before.
 */
export async function callWithAiFailover<T>(
  candidates: ResolvedAiKey[],
  fn: (resolved: ResolvedAiKey) => Promise<T>,
): Promise<{ result: T; provider: AiProvider }> {
  const attempts: AiFailoverAttempt[] = [];
  for (const resolved of candidates) {
    try {
      const result = await fn(resolved);
      return { result, provider: resolved.provider };
    } catch (err) {
      attempts.push({ provider: resolved.provider, error: err });
    }
  }
  throw new AiFailoverError(attempts);
}

export function getClientApiKeysFromRequest(req: Request): ClientApiKeys {
  return {
    gemini: req.headers.get(GEMINI_API_KEY_HEADER),
    groq: req.headers.get(GROQ_API_KEY_HEADER),
  };
}

function createGeminiClient(apiKey: string): AiClient {
  return {
    chat: {
      completions: {
        async create(params) {
          const res = await fetch(GEMINI_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(params),
          });

          if (!res.ok) {
            let detail = "";
            try {
              const errBody = (await res.json()) as { error?: { message?: string } };
              detail = errBody?.error?.message ?? "";
            } catch {
              // response body wasn't JSON — proceed with no extra detail
            }
            throw new Error(`تعذر الاتصال بخدمة Gemini (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
          }

          return (await res.json()) as AiChatCompletion;
        },
      },
    },
  };
}

function createGroqAiClient(apiKey: string): AiClient {
  const client = new Groq({ apiKey });
  return {
    chat: {
      completions: {
        async create(params) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { reasoning_effort, ...groqParams } = params; // Groq doesn't support this field — drop it
          const completion = await client.chat.completions.create(groqParams);
          return completion as AiChatCompletion;
        },
      },
    },
  };
}

function createDeepSeekClient(apiKey: string): AiClient {
  return {
    chat: {
      completions: {
        async create(params) {
          // DeepSeek's request shape doesn't take a flat reasoning_effort
          // field like Gemini's (see AiChatParams) — it's a nested
          // `thinking` object instead, and every call site in this app is a
          // structured single-shot JSON extraction/classification task with
          // no need for DeepSeek's actual multi-step reasoning mode, so
          // thinking is unconditionally disabled here rather than plumbing
          // a third provider-specific reasoning knob through every caller —
          // same reasoning as why Groq drops reasoning_effort entirely
          // above, just a different shape of "not applicable here".
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { reasoning_effort, ...rest } = params;
          const res = await fetch(DEEPSEEK_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ...rest, thinking: { type: "disabled" } }),
          });

          if (!res.ok) {
            let detail = "";
            try {
              const errBody = (await res.json()) as { error?: { message?: string } };
              detail = errBody?.error?.message ?? "";
            } catch {
              // response body wasn't JSON — proceed with no extra detail
            }
            throw new Error(`تعذر الاتصال بخدمة DeepSeek (HTTP ${res.status})${detail ? `: ${detail}` : ""}`);
          }

          return (await res.json()) as AiChatCompletion;
        },
      },
    },
  };
}

export function createAiClient(resolved: ResolvedAiKey): AiClient {
  if (resolved.provider === "gemini") return createGeminiClient(resolved.apiKey);
  if (resolved.provider === "deepseek") return createDeepSeekClient(resolved.apiKey);
  return createGroqAiClient(resolved.apiKey);
}
