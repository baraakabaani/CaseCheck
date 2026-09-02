// Shared between client components (which read keys from localStorage and
// attach these headers) and server routes (which read them back off the
// request) — kept in their own file so client bundles never need to import
// the Groq SDK or any provider-specific code.
export const GEMINI_API_KEY_HEADER = "x-gemini-api-key";
export const GROQ_API_KEY_HEADER = "x-groq-api-key";
