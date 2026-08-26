// Shared between client components (which read the key from localStorage
// and attach this header) and server routes (which read it back off the
// request) — kept in its own file so client bundles never need to import
// the Groq SDK itself.
export const GROQ_API_KEY_HEADER = "x-groq-api-key";
