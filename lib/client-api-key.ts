"use client";

// Client-only helpers for the user's own AI API keys (Gemini preferred,
// Groq as a fallback/alternative — see lib/ai-client.ts for resolution
// order). Stored in localStorage (this browser only, never sent anywhere
// but this app's own API routes) so the app can run entirely on a
// user-supplied key instead of the server's env vars.

import { GEMINI_API_KEY_HEADER, GROQ_API_KEY_HEADER } from "./api-key-header";

const GEMINI_STORAGE_KEY = "lawfiles_gemini_api_key";
const GROQ_STORAGE_KEY = "lawfiles_groq_api_key";

// The native "storage" event only fires in *other* tabs/windows, not the one
// that made the change — dispatch this too so same-tab UI (e.g. the header
// badge) can stay in sync via useSyncExternalStore without polling or effects.
const GEMINI_CHANGE_EVENT = "lawfiles-gemini-key-changed";
const GROQ_CHANGE_EVENT = "lawfiles-groq-key-changed";

function readKey(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeKey(storageKey: string, changeEvent: string, key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, key);
    window.dispatchEvent(new Event(changeEvent));
  } catch {
    // localStorage unavailable (private browsing, disabled storage, etc.)
  }
}

function removeKey(storageKey: string, changeEvent: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
    window.dispatchEvent(new Event(changeEvent));
  } catch {
    // ignore
  }
}

function subscribeToKey(changeEvent: string, callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changeEvent, callback);
  };
}

export function getStoredGeminiApiKey(): string | null {
  return readKey(GEMINI_STORAGE_KEY);
}
export function setStoredGeminiApiKey(key: string): void {
  writeKey(GEMINI_STORAGE_KEY, GEMINI_CHANGE_EVENT, key);
}
export function clearStoredGeminiApiKey(): void {
  removeKey(GEMINI_STORAGE_KEY, GEMINI_CHANGE_EVENT);
}
export function subscribeToStoredGeminiApiKey(callback: () => void): () => void {
  return subscribeToKey(GEMINI_CHANGE_EVENT, callback);
}

export function getStoredGroqApiKey(): string | null {
  return readKey(GROQ_STORAGE_KEY);
}
export function setStoredGroqApiKey(key: string): void {
  writeKey(GROQ_STORAGE_KEY, GROQ_CHANGE_EVENT, key);
}
export function clearStoredGroqApiKey(): void {
  removeKey(GROQ_STORAGE_KEY, GROQ_CHANGE_EVENT);
}
export function subscribeToStoredGroqApiKey(callback: () => void): () => void {
  return subscribeToKey(GROQ_CHANGE_EVENT, callback);
}

/** Builds the header set to attach to a fetch() call to this app's own API
 * routes, from whichever keys are currently stored — used by every
 * component that triggers an AI-backed action (matching, analysis, email
 * drafting). Omits a header entirely when no key is stored for it. */
export function buildClientApiKeyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const gemini = getStoredGeminiApiKey();
  if (gemini) headers[GEMINI_API_KEY_HEADER] = gemini;
  const groq = getStoredGroqApiKey();
  if (groq) headers[GROQ_API_KEY_HEADER] = groq;
  return headers;
}
