# تدقيق ملفات الدعاوى — Case File Audit Platform

A full-stack tool for auditing legal case files and accounting-expert
engagements (تدقيق ملفات الدعاوى القضائية والخبرة المحاسبية). It compares the
documents a client actually uploads against a checklist of required documents,
classifying each requirement as **مقدم** (provided), **مقدم جزئياً**
(partially provided), or **غير مقدم** (missing) — with reasoning and document
references — and can draft a formal Arabic letter requesting whatever is
missing. Works with an AI model (Groq) when a key is available, and falls
back to a rule-based local matcher when it isn't — no API key is required to
use the app.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) — UI and API routes in one deployable app
- **Tailwind CSS v4 + shadcn/ui**, RTL-first (`dir="rtl"`, `lang="ar"`)
- **Prisma + SQLite** for persistence (swap the datasource for Postgres in production)
- **Groq (`groq-sdk`, `llama-3.3-70b-versatile`)** — structured-output matching engine and Arabic email generation, with a zero-API rule-based fallback for both
- Document parsing: `pdf-parse` (PDF), `mammoth` (DOCX), `exceljs`/`papaparse` (XLSX/CSV). Images are stored and matched by filename only — `llama-3.3-70b-versatile` is text-only, so there's no automatic OCR.

## Getting started

```bash
npm install
cp .env.example .env   # GROQ_API_KEY is optional — see below
npx prisma migrate dev # first run only — creates prisma/dev.db
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file path by default (`file:./dev.db`) |
| `GROQ_API_KEY` | Optional. Server-side fallback key for AI matching/email drafting. |
| `GROQ_MODEL` | Optional override, defaults to `llama-3.3-70b-versatile` |
| `UPLOADS_DIR` | Local folder for uploaded case files (default `uploads`) |

### Three ways to run the matching engine

The app resolves an API key in this order, per request:

1. **A key typed into the UI** (the "مفتاح Groq API" button in the header) —
   stored in the browser's `localStorage` only, sent to this app's own API
   routes as an `x-groq-api-key` header. Lets each user run the app on their
   own Groq account without touching the server's `.env`.
2. **`GROQ_API_KEY`** on the server, if no client key is provided.
3. **Offline fallback** — if neither is set, `lib/offline-matcher.ts` runs a
   local keyword/period-coverage heuristic instead of calling any API, and
   the email generator falls back to a deterministic Arabic template
   (`lib/email-templates.ts`). Every AI-backed response reports which mode
   ran (`mode: "AI" | "OFFLINE"`), surfaced to the user as a toast.

## How it works

1. **Create a case** (`/cases/new`) — case metadata plus a requirement
   checklist, pre-populated from UAE litigation / accounting-expert presets
   (`lib/presets.ts`, including bilingual `keywords` used by the offline
   matcher) and freely editable.
2. **Upload documents** — dropped files are parsed server-side
   (`lib/document-parser.ts`) into plain text plus detected dates/page count.
3. **Run smart matching** — `lib/ai-matcher.ts` resolves an API key (see
   above) and either calls Groq with a strict JSON schema (`lib/schemas.ts`)
   or runs `lib/offline-matcher.ts`, returning a status, confidence,
   reasoning, and matched-document references for each requirement either way.
4. **Review & override** — the checklist table shows the resulting
   status/reasoning; any item can be manually overridden, which pins it out
   of future matching runs until reset.
5. **Generate the client letter** — `lib/email-templates.ts` drafts a formal
   Arabic letter itemizing what's missing/incomplete (AI or template-based),
   with copy/Word/print export.

## Project layout

```
app/                    RTL App Router pages + API routes
  cases/new             Case + checklist creation
  cases/[id]            Case workspace (checklist, documents, email)
  api/cases/...          REST endpoints backing the above
components/             FileUploader, ChecklistTable, EmailPreviewModal,
                        MetricCards, ApiKeySettingsDialog, ...
lib/                    ai-matcher.ts, offline-matcher.ts, groq-client.ts,
                         document-parser.ts, pdf-parser.ts, email-templates.ts,
                         schemas.ts, presets.ts, matching-types.ts,
                         text-normalize.ts, client-api-key.ts, db.ts
prisma/schema.prisma    Case / Requirement / Document / RequirementMatch / EmailDraft
locales/ar.json         Arabic string dictionary reference
```

## Deploying on Railway

Railway runs this as a persistent container, so SQLite + local disk storage
work with no code changes — but only if the data lives on a **Volume**,
otherwise it's wiped on every restart/redeploy:

1. Create the service from this repo (Railway auto-detects Next.js via Nixpacks).
2. Add a **Volume**, mounted at `/data`.
3. Set environment variables:
   - `DATABASE_URL=file:/data/prod.db`
   - `UPLOADS_DIR=/data/uploads`
   - `GROQ_API_KEY` (optional — the app works without it, see above)
4. Deploy. `npm start` runs `prisma migrate deploy` automatically before
   starting the server, so the SQLite file/schema is created on first boot.

## Notes & limitations

- Scanned PDFs with no text layer are flagged (`likelyScanned`) for manual
  review rather than silently failing. Image uploads carry no extracted
  text at all (see Stack above) and are matched by filename only.
- The offline matcher is a keyword/period-coverage heuristic
  (`lib/text-normalize.ts` + `lib/offline-matcher.ts`), not a language model —
  it's meant to keep the checklist usable with zero setup, not to replace
  manual review. Its reasoning text always says so explicitly.
- File storage is local disk by default; for a multi-instance deployment,
  swap `lib/file-storage.ts` for object storage (S3-compatible) and
  `DATABASE_URL` for Postgres.
