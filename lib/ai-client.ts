import Groq from "groq-sdk";
import { GEMINI_API_KEY_HEADER, GROQ_API_KEY_HEADER } from "./api-key-header";

export type AiProvider = "gemini" | "groq";

// gemini-3.6-flash: verified live (2026-09-02) against Gemini's
// OpenAI-compatible endpoint with response_format: json_object. Gemini's
// free tier has a far larger token budget and ~1M token context window
// than Groq's free "on_demand" tier (8,000 tokens/minute, see
// lib/ai-matcher.ts / lib/case-analyzer.ts and README "Notes &
// limitations"), which is why it's preferred here when both are
// available — it removes the truncation problem for most real cases.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// qwen/qwen3.8-27b, not one of the openai/gpt-oss-* models: those are
// reasoning models that burn a large, variable share of max_tokens on
// hidden chain-of-thought before writing the JSON answer, which is a poor
// fit for Groq's free-tier 8,000 TPM cap — verified against a live probe
// (gpt-oss-120b needed 500+ completion tokens and still didn't finish
// valid JSON for a request qwen3.8-27b answered correctly in ~730 tokens).
export const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

// Gemini's OpenAI-compatible endpoint (Bearer-token auth, same
// request/response shape as the chat completions API groq-sdk's types
// model) — groq-sdk itself can't be pointed at this URL because it
// hardcodes the resource path to /openai/v1/chat/completions, which
// doesn't match Gemini's /openai/chat/completions path, so this provider
// is called via a small structurally-compatible fetch client instead.
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

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
   * (see GROQ_MODEL comment) — only meaningful for Gemini; the Groq client
   * below drops it since Groq's API doesn't support this field. */
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

/**
 * Resolution order per request — Gemini is preferred over Groq whenever a
 * usable Gemini key is available (see GEMINI_MODEL comment above for why):
 *   1. client-provided Gemini key (typed into the UI, sent as a header)
 *   2. client-provided Groq key
 *   3. server GEMINI_API_KEY
 *   4. server GROQ_API_KEY
 *   5. none of the above → null, caller falls back to its offline heuristic
 */
export function resolveAiKey(clientKeys?: ClientApiKeys | null): ResolvedAiKey | null {
  const gemini = clientKeys?.gemini?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (gemini) return { provider: "gemini", apiKey: gemini, model: GEMINI_MODEL };

  const groq = clientKeys?.groq?.trim() || process.env.GROQ_API_KEY?.trim();
  if (groq) return { provider: "groq", apiKey: groq, model: GROQ_MODEL };

  return null;
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

export function createAiClient(resolved: ResolvedAiKey): AiClient {
  if (resolved.provider === "gemini") return createGeminiClient(resolved.apiKey);
  return createGroqAiClient(resolved.apiKey);
}
