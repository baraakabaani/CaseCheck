# تدقيق ملفات الدعاوى — Case File Audit Platform

A full-stack tool for auditing legal case files and accounting-expert
engagements (تدقيق ملفات الدعاوى القضائية والخبرة المحاسبية). It compares the
documents a client actually uploads against a checklist of required documents,
classifying each requirement as **مقدم** (provided), **مقدم جزئياً**
(partially provided), or **غير مقدم** (missing) — with reasoning and document
references — and can draft a formal Arabic letter requesting whatever is
missing. Works with an AI model (Gemini, with Groq as an alternative) when a
key is available, and falls back to a rule-based local matcher when it
isn't — no API key is required to use the app.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) — UI and API routes in one deployable app
- **Tailwind CSS v4 + shadcn/ui**, RTL-first (`dir="rtl"`, `lang="ar"`)
- **Prisma + SQLite** for persistence (swap the datasource for Postgres in production)
- **Gemini (`gemini-3.6-flash`, OpenAI-compatible endpoint) or Groq (`groq-sdk`, `qwen/qwen3.8-27b`)** — structured-output matching engine, case analysis, and Arabic email generation, with a zero-API rule-based fallback for all three. Gemini is preferred whenever a key is available (see `lib/ai-client.ts`); Groq remains supported as an alternative.
- Document parsing: `pdf-parse` (PDF), `mammoth` (DOCX), `exceljs`/`papaparse` (XLSX/CSV). Images are stored and matched by filename only — the configured AI models are text-only, so there's no automatic OCR.

## Getting started

```bash
npm install
cp .env.example .env   # GEMINI_API_KEY / GROQ_API_KEY are optional — see below
npx prisma migrate dev # first run only — creates prisma/dev.db
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file path by default (`file:./dev.db`) |
| `GEMINI_API_KEY` | Optional. Server-side fallback key for AI matching/analysis/email drafting — preferred over `GROQ_API_KEY` when both are set. |
| `GEMINI_MODEL` | Optional override, defaults to `gemini-3.6-flash` |
| `GROQ_API_KEY` | Optional. Used only when no Gemini key is available. |
| `GROQ_MODEL` | Optional override, defaults to `qwen/qwen3.8-27b` |
| `UPLOADS_DIR` | Local folder for uploaded case files (default `uploads`) |

### Five ways to run the AI-backed features

The app resolves an API key in this order, per request (`lib/ai-client.ts`):

1. **A Gemini key typed into the UI** (the "مفتاح الذكاء الاصطناعي" button in
   the header) — stored in the browser's `localStorage` only, sent to this
   app's own API routes as an `x-gemini-api-key` header.
2. **A Groq key typed into the UI** — same mechanism, `x-groq-api-key` header.
3. **`GEMINI_API_KEY`** on the server, if no client key is provided.
4. **`GROQ_API_KEY`** on the server, if none of the above is available.
5. **Offline fallback** — if none of the above is set, `lib/offline-matcher.ts`
   / `lib/offline-case-analyzer.ts` run a local keyword/period-coverage
   heuristic instead of calling any API, and the email generator falls back
   to a deterministic Arabic template (`lib/email-templates.ts`). Every
   AI-backed response reports which mode ran (`mode: "AI" | "OFFLINE"`),
   surfaced to the user as a toast.

Gemini is preferred over Groq whenever both are available: it has a far
larger free-tier token budget and a ~1M token context window, which removes
the document-truncation tradeoff described below for most real cases. Groq
remains fully supported as an alternative/fallback provider.

## How it works — the 4-phase intake wizard (نموذج الخبرة القضائية)

Every case is opened through a sequential wizard (`app/cases/new` →
`app/cases/[id]/setup/*`), each phase gated behind the previous one via
`Case.intakeStatus`:

1. **بيانات القضية الأساسية** (`/cases/new`) — case number, court, circuit,
   litigation degree, case category, and multiple claimant/respondent
   parties (`CaseParty`, replacing single claimant/respondent strings).
2. **بيانات مأمورية الخبرة** (`/cases/[id]/setup/mandate`) — appointment
   decision/received/accepted dates, next hearing, report deadline,
   appointment capacity (sole expert / committee, with committee members),
   and the nature of the accounting mandate (multi-select).
3. **رفع ملف الدعوى والمستندات القضائية** (`/cases/[id]/setup/documents`) —
   one unified dropzone (reuses `FileUploader.tsx` as-is) for every judicial
   document — no manual per-file categorization; the AI classifies them in
   the next phase.
4. **التحليل الأولي لملف الدعوى** (`/cases/[id]/setup/analysis`) —
   `lib/case-analyzer.ts` reads every uploaded document and produces a case
   summary, the expert mandate broken into tasks, a received-documents
   table (each document auto-classified and matched to the party that
   submitted it), a missing-documents list, unclear/contradictory points,
   and suggested questions per party — reviewed on one screen
   (`CaseAnalysisReview.tsx`) and approved.

**Approving Phase 4 materializes its missing-documents list into ordinary
`Requirement` rows** — the pre-existing checklist (`ChecklistTable.tsx`),
its AI/offline matching (`lib/ai-matcher.ts` / `lib/offline-matcher.ts`),
and the Notice form's pre-fill (`NoticeForm.tsx`) all keep working
unchanged on top of it. From there, the existing case workspace
(`/cases/[id]`) takes over: run smart matching against the checklist,
draft the client letter, and generate the اخطار (expert-meeting notice) —
which is effectively this wizard's implied Phase 5 ("prepare and send the
document request and invite parties to the first meeting").

Like the checklist matcher, Phase 4 uses Gemini/Groq when a key is available
and falls back to `lib/offline-case-analyzer.ts` otherwise — but this task is
generative (summarizing, drafting questions), not just keyword-matchable,
so the offline version is honestly limited: it still produces a real
missing-documents list (via the same keyword-coverage technique reused
from the checklist presets) but leaves the summary/mandate/questions as
prompts for the expert to fill in manually, and says so in the UI.

## Project layout

```
app/                    RTL App Router pages + API routes
  cases/new             Phase 1 — case intake wizard entry point
  cases/[id]/setup/      Phases 2–4 — mandate, documents, analysis review
  cases/[id]            Case workspace (checklist, documents, email, notices)
  cases/[id]/notices/    Expert-meeting notice (إخطار) creation + view
  api/cases/...          REST endpoints backing all of the above
components/             CaseIntakeStep1Form, CaseIntakeStep2Form,
                        CaseDocumentsStep, CaseAnalysisReview, WizardSteps,
                        FileUploader, ChecklistTable, EmailPreviewModal,
                        NoticeForm, NoticeDocument, MetricCards,
                        ApiKeySettingsDialog, ...
lib/                    case-analyzer.ts, offline-case-analyzer.ts,
                         case-analysis-schemas.ts, case-analysis-types.ts,
                         case-intake-labels.ts, ai-matcher.ts,
                         offline-matcher.ts, ai-client.ts, api-key-header.ts,
                         document-parser.ts, pdf-parser.ts, email-templates.ts,
                         notice-templates.ts, notice-schemas.ts, schemas.ts,
                         presets.ts, matching-types.ts, text-normalize.ts,
                         client-api-key.ts, db.ts
prisma/schema.prisma    Case / CaseParty / CaseAnalysis / Requirement /
                         Document / RequirementMatch / EmailDraft / Notice
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
   - `GEMINI_API_KEY` and/or `GROQ_API_KEY` (both optional — the app works without them, see above)
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
- Groq's free `on_demand` tier caps requests at **8,000 tokens/minute**,
  counted as `prompt_tokens + max_tokens` up front. The default Groq model
  (`qwen/qwen3.8-27b`) was picked over the `openai/gpt-oss-*` models
  specifically for this — the gpt-oss models are reasoners that spend a
  large, unpredictable share of `max_tokens` on hidden chain-of-thought
  before writing the JSON answer, which blew the free-tier budget even on
  small cases. `max_tokens` is also kept modest (3,000–4,000 for
  matching/analysis, 2,048 for the email draft), and document content sent
  to the matcher/analyzer is capped by a **total** character budget shared
  across all documents (`TOTAL_DOCUMENT_CHARS_BUDGET` in `lib/ai-matcher.ts`
  / `lib/case-analyzer.ts`) rather than a flat per-document limit — earlier
  documents get priority, later ones are truncated or skipped with an
  honest note in both the prompt and the returned warning. A case with
  enough real document content can still exceed Groq's free tier regardless;
  the request then fails over to the offline mode automatically (no
  crash), surfaced as a warning toast. **Gemini doesn't have this problem**
  for the vast majority of real cases — its free tier's token budget is far
  larger and its context window is ~1M tokens — which is why it's tried
  first whenever a key is available (see `lib/ai-client.ts`); the same
  character budget is still applied for it too, just as extra headroom
  rather than a load-bearing constraint. If AI calls fail often on either
  provider, add/upgrade the corresponding key.
