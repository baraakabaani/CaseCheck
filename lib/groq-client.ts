import Groq from "groq-sdk";
import { GROQ_API_KEY_HEADER } from "./api-key-header";

export const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

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
