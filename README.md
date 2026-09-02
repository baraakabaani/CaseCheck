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

Like the checklist matcher, Phase 4 uses Groq when a key is available and
falls back to `lib/offline-case-analyzer.ts` otherwise — but this task is
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
                         offline-matcher.ts, groq-client.ts,
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
