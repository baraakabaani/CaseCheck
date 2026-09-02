"use client";

// Lightweight localStorage draft persistence for the multi-phase case
// intake wizard — so a lawyer/expert who navigates away or reloads mid-form
// doesn't lose everything they typed. Per-viewer convenience only, not a
// source of truth (the server record is), so failures here are swallowed.

export function loadFormDraft<T>(key: string): Partial<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

export function saveFormDraft<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full/unavailable — the form still works, it just won't persist
  }
}

export function clearFormDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
