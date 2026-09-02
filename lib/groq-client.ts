import Groq from "groq-sdk";
import { GROQ_API_KEY_HEADER } from "./api-key-header";

// qwen/qwen3.8-27b, not one of the openai/gpt-oss-* models: those are
// reasoning models that burn a large, variable share of max_tokens on
// hidden chain-of-thought before writing the JSON answer, which is a poor
// fit for Groq's free-tier 8,000 TPM cap — verified against a live probe
// (gpt-oss-120b needed 500+ completion tokens and still didn't finish
// valid JSON for a request qwen3.8-27b answered correctly in ~730 tokens).
export const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

/** A client-provided key (typed into the UI, kept in the browser's
 * localStorage) always wins over the server's own key — it lets a user run
 * the app entirely on their own Groq account. Falls back to
 * process.env.GROQ_API_KEY, and to null (offline mode) if neither is set. */
export function resolveGroqApiKey(clientProvidedKey?: string | null): string | null {
  const fromClient = clientProvidedKey?.trim();
  if (fromClient) return fromClient;
  const fromEnv = process.env.GROQ_API_KEY?.trim();
  return fromEnv ? fromEnv : null;
}

export function getClientApiKeyFromRequest(req: Request): string | null {
  return req.headers.get(GROQ_API_KEY_HEADER);
}

export function createGroqClient(apiKey: string): Groq {
  return new Groq({ apiKey });
}
