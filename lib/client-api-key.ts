"use client";

// Client-only helper for the user's own Groq API key. Stored in
// localStorage (this browser only, never sent anywhere but this app's own
// API routes) so the app can run entirely on a user-supplied key instead of
// the server's GROQ_API_KEY.

const STORAGE_KEY = "lawfiles_groq_api_key";

// The native "storage" event only fires in *other* tabs/windows, not the one
// that made the change — dispatch this too so same-tab UI (e.g. the header
// badge) can stay in sync via useSyncExternalStore without polling or effects.
const CHANGE_EVENT = "lawfiles-groq-key-changed";

export function getStoredGroqApiKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredGroqApiKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // localStorage unavailable (private browsing, disabled storage, etc.)
  }
}

export function clearStoredGroqApiKey(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

/** Subscribe helper for useSyncExternalStore — fires on both cross-tab
 * "storage" events and same-tab writes via the functions above. */
export function subscribeToStoredGroqApiKey(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}
