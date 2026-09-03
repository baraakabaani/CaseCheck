# تدقيق ملفات الدعاوى — Case File Audit Platform

A full-stack tool for auditing legal case files and accounting-expert
engagements (تدقيق ملفات الدعاوى القضائية والخبرة المحاسبية). It compares the
documents a client actually uploads against a checklist of required documents,
classifying each requirement as **مقدم** (provided), **مقدم جزئياً**
(partially provided), or **غير مقدم** (missing) — with reasoning and document
references — and can draft a formal Arabic letter requesting whatever is
missing. Works with an AI model (Groq, with Gemini as an alternative) when a
key is available, and falls back to a rule-based local matcher when it
isn't — no API key is required to use the app.

Styled with **Parker Russell**'s corporate identity (brand tokens in
`app/globals.css`, logo at `public/parker-russell-logo.png`) and organized
as a **Modular Milestone Dashboard** — see below.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) — UI and API routes in one deployable app
- **Tailwind CSS v4 + shadcn/ui**, RTL-first (`dir="rtl"`, `lang="ar"`)
- **Prisma + SQLite** for persistence (swap the datasource for Postgres in production)
- **Groq (`groq-sdk`, `qwen/qwen3.8-27b`) or Gemini (`gemini-3.6-flash`, OpenAI-compatible endpoint)** — structured-output matching engine, case analysis, and Arabic email generation, with a zero-API rule-based fallback for all three. Groq is preferred whenever a key is available (see `lib/ai-client.ts`); Gemini remains supported as an alternative/fallback.
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
| `GROQ_API_KEY` | Optional. Server-side fallback key for AI matching/analysis/email drafting — preferred over `GEMINI_API_KEY` when both are set. |
| `GROQ_MODEL` | Optional override, defaults to `qwen/qwen3.8-27b` |
| `GEMINI_API_KEY` | Optional. Used only when no Groq key is available. |
| `GEMINI_MODEL` | Optional override, defaults to `gemini-3.6-flash` |
| `UPLOADS_DIR` | Local folder for uploaded case files (default `uploads`) |

### Five ways to run the AI-backed features

The app resolves an API key in this order, per request (`lib/ai-client.ts`):

1. **A Groq key typed into the UI** (the "مفتاح الذكاء الاصطناعي" button in
   the header) — stored in the browser's `localStorage` only, sent to this
   app's own API routes as an `x-groq-api-key` header.
2. **A Gemini key typed into the UI** — same mechanism, `x-gemini-api-key` header.
3. **`GROQ_API_KEY`** on the server, if no client key is provided.
4. **`GEMINI_API_KEY`** on the server, if none of the above is available.
5. **Offline fallback** — if none of the above is set, `lib/offline-matcher.ts`
   / `lib/offline-case-analyzer.ts` run a local keyword/period-coverage
   heuristic instead of calling any API, and the email generator falls back
   to a deterministic Arabic template (`lib/email-templates.ts`). Every
   AI-backed response reports which mode ran (`mode: "AI" | "OFFLINE"`),
   surfaced to the user as a toast.

Groq is preferred over Gemini whenever both are available. Gemini was
briefly tried as the primary provider — its free tier has a far larger
*token* budget and a ~1M token context window, which would remove the
document-truncation tradeoff described below for most real cases — but its
free tier's *request-rate* limit turned out to be tight enough to hit HTTP
429 in normal use, so Groq is primary again. Gemini remains available as a
fallback/alternative provider if you hit Groq's own rate limit instead.

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
   5 fixed upload slots (`CaseDocumentsStep.tsx` + `DocumentSlotUploader.tsx`),
   one per `DocCategory`: الحكم التمهيدي/قرار الندب، لائحة الدعوى، مذكرات
   الأطراف، مستندات الأطراف وحوافظ المستندات، ومستندات قضائية أخرى. The
   category is set at upload time (not guessed by the AI afterward) — this
   is what drives `lib/smart-ingest.ts` (see below).
4. **التحليل الأولي لملف الدعوى** (`/cases/[id]/setup/analysis`) —
   `lib/case-analyzer.ts` reads every uploaded document and produces a case
   summary, the expert mandate broken into tasks, a received-documents
   table (matched to the party that submitted it), a missing-documents
   list, unclear/contradictory points, and suggested questions per party —
   reviewed on one screen (`CaseAnalysisReview.tsx`) and approved.

**Approving Phase 4 materializes its missing-documents list into ordinary
`Requirement` rows** — the pre-existing checklist (`ChecklistTable.tsx`),
its AI/offline matching (`lib/ai-matcher.ts` / `lib/offline-matcher.ts`),
and the Notice form's pre-fill (`NoticeForm.tsx`) all keep working
unchanged on top of it. From there, the existing case workspace
(`/cases/[id]`) takes over: run smart matching against the checklist,
draft the client letter, and generate the اخطار (expert-meeting notice) —
which is effectively this wizard's implied Phase 5 ("prepare and send the
document request and invite parties to the first meeting").

Like the checklist matcher, Phase 4 uses Groq/Gemini when a key is available
and falls back to `lib/offline-case-analyzer.ts` otherwise — but this task is
generative (summarizing, drafting questions), not just keyword-matchable,
so the offline version is honestly limited: it still produces a real
missing-documents list (via the same keyword-coverage technique reused
from the checklist presets) but leaves the summary/mandate/questions as
prompts for the expert to fill in manually, and says so in the UI.

### نظام الضغط الذكي — local pre-processing before any AI call

`lib/smart-ingest.ts` runs on every document *before* it reaches an LLM
(both Phase 4's analysis and the checklist matcher use it) — no raw
document text is ever sent as-is. Each of the 5 upload-slot categories gets
a purpose-built, budget-capped extraction instead of an arbitrary prefix of
the file:

- **الحكم التمهيدي / قرار الندب** — header (court/case number/date) +
  the operative section (found via markers like `حكمت المحكمة`, `وندبت`),
  capped at 600 tokens.
- **لائحة / صحيفة الدعوى** — opening summary + the prayer-for-relief
  section (`بناءً عليه`, `يلتمس المدعي`, `الطلبات`), capped at 500 tokens.
- **مذكرات الأطراف** — intro + concluding arguments, 400 tokens per memo.
- **مستندات الأطراف وحوافظ المستندات** — for spreadsheet/CSV bank
  statements and ledgers, local arithmetic (no LLM call) sums the
  credit/debit columns and reads the opening/closing balance directly from
  the parsed rows; for audited financial statements, the Balance
  Sheet/Income Statement/Auditor's Opinion sections are extracted by
  marker. Every computed figure is labeled "محسوبة آلياً" (never presented
  as certain). 600 tokens shared across all documents in this slot.
- **مستندات قضائية أخرى** — first ~1,000 characters, 300 tokens per doc.

All of this is capped by a ~4,500-token total pool processed in priority
order, so a case with many/large documents degrades gracefully (lower-
priority items get skipped with an honest note) instead of the previous
behavior — dumping raw truncated text — which was the direct cause of
"Expected ',' or ']' after array element in JSON" errors on real
multi-document cases (the model would run out of budget mid-response).
`lib/ai-matcher.ts` reuses the same per-document digest function
(`buildSingleDocumentDigest`) for the same reason.

## Case Hub — the 4-module dashboard (لوحة القضية بنظام البطاقات)

Once a case's 4-phase intake wizard reaches `intakeStatus === "ACTIVE"`,
`/cases/[id]` becomes the **Case Hub** (`components/CaseHub.tsx`): 4
milestone cards, each linking into its own module page:

1. **الموديول 1 — التأسيس والتدقيق الأولي** (`/cases/[id]/module-1`) — the
   4-phase wizard's output: checklist matching, documents, client email,
   and the Phase-4 analysis review. Unchanged functionally, just relocated
   out from under the old single-page case workspace.
2. **الموديول 2 — إدارة الاجتماع والتواصل** (`/cases/[id]/module-2`) — an
   editable readiness checklist, multi-session scheduling (a case can have
   more than one `HearingSession`; each exports a `.ics` calendar file),
   an attendee/POA registry (`MeetingAttendee`, with POA documents
   attachable and one-click bulk-add from the case's parties), the
   existing إخطار (notice) generation with per-attendee delivery tracking
   (`NoticeDelivery`), and a **live hearing room**
   (`/cases/[id]/module-2/hearing/[hearingId]`, `components/HearingRoom.tsx`):
   real start/end timestamps, live roll-call separate from the
   pre-registration status (`HearingAttendanceRecord`), a claimant/
   respondent Q&A log seeded from Module 1's generated questions
   (`HearingQuestion`), document demands with deadlines
   (`DocumentDemand`, also surfaced in Module 3), and an
   **AI transcript-correction pipeline** (`lib/hearing-transcript-ai.ts`):
   upload a hearing transcript (pasted text or a file, parsed via the same
   `extractDocument()` used for case documents) — often messy Arabic
   speech-to-text — and it's corrected using the case's own context
   (party names, case summary, mandate, the prepared questions) as ground
   truth, with any answered questions matched back automatically (fuzzy
   text matching via `lib/text-normalize.ts`, since the model can't know
   internal IDs). "Finish meeting" deterministically compiles all of this
   into a `.docx` محضر with the Parker Russell header
   (`buildHearingMinutesDocxBlob`) — not a second AI call, for the same
   reliability reason the إخطار template is deterministic.
3. **الموديول 3 — المتابعة والمعاينة الميدانية** (`/cases/[id]/module-3`,
   `components/Module3Hub.tsx`) — also taken to full depth: a unified
   4-column board (مطلوبة / مستلمة جزئياً / **تخلف عن التقديم** / مكتملة
   ومطابقة) merging both `Requirement` rows (from the Phase-4 checklist)
   and `DocumentDemand` rows (raised in a Module 2 hearing room, or
   directly here via a quick-add form) into one tracker, with a combined
   progress bar and an overdue column derived from each demand's own
   deadline. Every card has an inline click-to-move status control
   (no drag-and-drop dependency — same PATCH endpoints either way) and
   shows its `relatedTask` tag when linked to one of the case's own
   AI-generated `mandateTasks`; the Phase-4 analysis's
   `missingDocuments[].relatedTask` output now actually persists onto
   `Requirement` rows (previously silently dropped by the approve route).
   A manual "الملف جاهز للدراسة" flag (`Case.readinessStatus`) surfaces on
   the Case Hub badge, taking priority over the auto-computed status when
   set. An overdue-reminder card generates a تذكير letter for every
   past-deadline demand by feeding them into the **same unmodified**
   `generateEmailDraft()` used for Module 1's client letters — no new AI
   code, just a different input shape. The site-inspection log
   (`SiteInspection`) now captures structured fields (equipment/servers
   reviewed, financial books reviewed), attachable documents, and
   structured on-site testimonies (`SiteInspectionTestimony`), and a
   "توليد محضر انتقال ومعاينة" button deterministically compiles all of it
   into a محضر (`lib/site-inspection-report.ts`, string-built like the
   إخطار and hearing-minutes templates — not a second AI call), exportable
   to a Parker Russell–branded `.docx` (`buildSiteInspectionReportDocxBlob`).
4. **الموديول 4 — صياغة التقرير القضائي** (`/cases/[id]/module-4`) — a
   5-tab report draft (`CourtReport`: المقدمة والمأمورية | الأطراف
   والإجراءات | البحث والدراسة | الخلاصة وتصفية الحساب | حافظة
   المستندات), autosaved, exportable to a Parker Russell–branded `.docx`
   (`lib/docx-export.ts`'s `buildCourtReportDocxBlob`).

Module 4 is still a deliberate **first pass**: a real Prisma model and a
genuinely working page, but not yet the AI-aggregated per-task forensic
sections with color-coded provenance described in the original spec —
its own follow-up build. Modules 2 and 3 were both taken to full depth
per later requests (see above). Modules 2–4 stay locked (dimmed,
non-clickable) until Module 1 is complete.

State stays server-authoritative throughout (Prisma/SQLite via
`lib/queries.ts`'s `getCaseDetail`, `router.refresh()` after any mutation —
the same pattern used everywhere else in this app), not a separate
client-side store.

## Project layout

```
app/                    RTL App Router pages + API routes
  cases/new             Phase 1 — case intake wizard entry point
  cases/[id]/setup/      Phases 2–4 — mandate, documents, analysis review
  cases/[id]            Case Hub — 4 milestone module cards
  cases/[id]/module-1/   Checklist, documents, email, analysis review
  cases/[id]/module-2/   Meeting readiness, scheduler, attendees, notices
  cases/[id]/module-3/   Unified document-tracking board + site-inspection
                         reports
  cases/[id]/module-4/   Court report draft studio
  cases/[id]/notices/    Expert-meeting notice (إخطار) creation + view
  api/cases/...          REST endpoints backing all of the above
components/             CaseHub, ModuleTopBar, Module2Hub, Module3Hub,
                        Module4Studio, CaseIntakeStep1Form, CaseIntakeStep2Form,
                        CaseDocumentsStep, DocumentSlotUploader,
                        CaseAnalysisReview, WizardSteps, FileUploader,
                        ChecklistTable, EmailPreviewModal, NoticeForm,
                        NoticeDocument, MetricCards, ApiKeySettingsDialog, ...
lib/                    case-analyzer.ts, offline-case-analyzer.ts,
                         case-analysis-schemas.ts, case-analysis-types.ts,
                         case-intake-labels.ts, ai-matcher.ts, smart-ingest.ts,
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
- `lib/pdf-parser.ts` explicitly points pdfjs-dist's `GlobalWorkerOptions.workerSrc`
  at the physical `pdf-parse` worker file (`PDFParse.setWorker(...)`, called
  once at module init). Without this, **every single PDF upload fails**
  under Next.js/Turbopack with `Setting up fake worker failed: Cannot find
  module '...pdf.worker.mjs'` — pdfjs-dist resolves its worker script
  relative to its own bundled module by default, and Turbopack doesn't
  carry that sibling file into the compiled output. This was very likely
  the actual cause behind vague "فشلت المعالجة" reports, not corrupt files
  — verified live (both `next dev` and a production `next build && next
  start`) that a previously-failing valid PDF parses correctly after this
  fix, while a genuinely corrupt file still fails with an honest,
  now-specific reason (`explainParseError` in `lib/document-parser.ts`).
  If this ever regresses after a `pdf-parse`/`pdfjs-dist` version bump,
  check that `node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs`
  still exists at that path.
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
  crash), surfaced as a warning toast. Gemini's free tier has a much larger
  *token* budget (and a ~1M token context window) so it doesn't hit this
  particular problem, but its free tier's own *request-rate* limit can
  return HTTP 429 in normal use — that's why it's kept as a
  fallback/alternative rather than the primary provider (see
  `lib/ai-client.ts`). If AI calls fail often on either provider,
  add/upgrade the corresponding key, or switch which one is configured.
