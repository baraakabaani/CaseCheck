// الموديول 4 — خط تجميع البيانات الحتمي (بلا أي استدعاء ذكاء اصطناعي) الذي
// يُغذّي استوديو التقرير القضائي: الجدول الزمني للإجراءات، جرد المستندات
// المتحقق منها، مواقف الأطراف، وربط كل مهمة من مهام المأمورية بمستنداتها.
// هذا الخط يملك استعلام Prisma خاصاً به بدل الاعتماد على
// lib/queries.ts's getCaseDetail، لأن الأخيرة لا تُضمِّن أسئلة الجلسات
// (HearingQuestion) ولا سجلات الحضور الفعلي (HearingAttendanceRecord) —
// وكلاهما ضروري هنا لبناء الجدول الزمني ومواقف الأطراف، بينما إضافتهما
// لاستعلام getCaseDetail كان سيُثقِل كل صفحات الموديولات الأخرى التي لا
// تحتاجهما.
//
// الحد الفاصل الذي يلتزم به هذا الملف بدقة: لا نص هنا من تأليف نموذج لغوي
// — فقط قراءة وترتيب وربط لبيانات موجودة فعلاً في قاعدة البيانات. صياغة
// السرد التوليدي (بحث الخبرة، تحليل مواقف الأطراف...) مهمة
// lib/report-draft-ai.ts حصراً، وتُغذّى بمخرجات هذا الملف كسياق.

import { prisma } from "../db";
import { buildSingleDocumentDigest, type SmartIngestDocument } from "../smart-ingest";
import { tokenize, tokenSet, tokenCoverage } from "../text-normalize";
import { CASE_PARTY_ROLE_LABELS, DOC_CATEGORY_LABELS } from "../case-intake-labels";
import type { DocCategory } from "../schemas";

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// جلب البيانات المصدرية (الدالة الوحيدة التي تلمس Prisma في هذا الملف)
// ---------------------------------------------------------------------------

export function fetchReportSourceData(caseId: string) {
  return prisma.case.findUnique({
    where: { id: caseId },
    include: {
      parties: { orderBy: { order: "asc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      requirements: {
        orderBy: { order: "asc" },
        include: { matches: { include: { document: true }, orderBy: { confidence: "desc" } } },
      },
      documents: { orderBy: { uploadedAt: "asc" } },
      notices: {
        orderBy: { createdAt: "asc" },
        include: { deliveries: { include: { attendee: true } } },
      },
      meetingAttendees: { orderBy: { order: "asc" }, include: { document: true } },
      hearingSessions: {
        orderBy: { createdAt: "asc" },
        include: {
          questions: { orderBy: { order: "asc" } },
          attendanceRecords: { include: { attendee: true } },
          documentDemands: { orderBy: { deadline: "asc" } },
        },
      },
      documentDemands: { orderBy: { createdAt: "asc" } },
      siteInspections: {
        orderBy: { visitDate: "asc" },
        include: { testimonies: { orderBy: { order: "asc" } } },
      },
    },
  });
}

export type ReportSourceData = NonNullable<Awaited<ReturnType<typeof fetchReportSourceData>>>;

// ---------------------------------------------------------------------------
// الجدول الزمني للإجراءات
// ---------------------------------------------------------------------------

export const TIMELINE_EVENT_KINDS = [
  "MANDATE_DECISION",
  "MANDATE_RECEIVED",
  "MANDATE_ACCEPTED",
  "ANALYSIS_APPROVED",
  "NOTICE_ISSUED",
  "NOTICE_DELIVERED",
  "HEARING_HELD",
  "TRANSCRIPT_CORRECTED",
  "DEMANDS_ISSUED",
  "SITE_INSPECTION",
  "NEXT_HEARING",
  "REPORT_DEADLINE",
] as const;
export type TimelineEventKind = (typeof TIMELINE_EVENT_KINDS)[number];

export interface ProceduralTimelineEvent {
  kind: TimelineEventKind;
  at: string; // ISO — أحداث بلا تاريخ فعلي لا تدخل الجدول الزمني أصلاً
  isEstimated: boolean; // التاريخ بديل تقريبي (مثال: تاريخ آخر تعديل بدل تاريخ فعلي غير مُسجَّل)
  isFuture: boolean;
  title: string;
  detail: string | null;
  sourceKind: "CASE" | "ANALYSIS" | "NOTICE" | "HEARING" | "DEMAND" | "SITE_INSPECTION";
  sourceId: string | null;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildProceduralTimeline(src: ReportSourceData): {
  events: ProceduralTimelineEvent[];
  missingDates: string[];
} {
  const now = Date.now();
  const events: ProceduralTimelineEvent[] = [];
  const missingDates: string[] = [];
  const push = (e: Omit<ProceduralTimelineEvent, "isFuture"> | null) => {
    if (!e) return;
    events.push({ ...e, isFuture: new Date(e.at).getTime() > now });
  };

  if (src.mandateDecisionDate) {
    push({
      kind: "MANDATE_DECISION",
      at: src.mandateDecisionDate.toISOString(),
      isEstimated: false,
      title: "صدور قرار/حكم ندب الخبرة",
      detail: [src.court, src.circuit].filter(Boolean).join(" — ") || null,
      sourceKind: "CASE",
      sourceId: src.id,
    });
  } else missingDates.push("تاريخ قرار ندب الخبرة");

  if (src.mandateReceivedDate) {
    push({
      kind: "MANDATE_RECEIVED",
      at: src.mandateReceivedDate.toISOString(),
      isEstimated: false,
      title: "استلام الخبير للمأمورية",
      detail: null,
      sourceKind: "CASE",
      sourceId: src.id,
    });
  } else missingDates.push("تاريخ استلام المأمورية");

  if (src.mandateAcceptedDate) {
    const committee = safeParseJson<{ name: string; specialization?: string | null }[]>(
      src.committeeMembers,
      [],
    );
    push({
      kind: "MANDATE_ACCEPTED",
      at: src.mandateAcceptedDate.toISOString(),
      isEstimated: false,
      title: "قبول المأمورية",
      detail:
        committee.length > 0
          ? `لجنة خبراء: ${committee.map((m) => m.name).join("، ")}`
          : src.appointmentCapacity === "SOLE_EXPERT"
            ? "خبير منفرد"
            : null,
      sourceKind: "CASE",
      sourceId: src.id,
    });
  }

  const analysis = src.analyses[0];
  if (analysis) {
    const approvedAt = analysis.approvedAt ?? analysis.createdAt;
    const mandateTasks = safeParseJson<string[]>(analysis.mandateTasks, []);
    push({
      kind: "ANALYSIS_APPROVED",
      at: approvedAt.toISOString(),
      isEstimated: !analysis.approvedAt,
      title: analysis.status === "APPROVED" ? "اعتماد التحليل الأولي لملف الدعوى" : "إعداد التحليل الأولي لملف الدعوى",
      detail: `${analysis.mode === "AI" ? "بالذكاء الاصطناعي" : "بالمحرك الاحتياطي"} — ${mandateTasks.length} مهمة`,
      sourceKind: "ANALYSIS",
      sourceId: analysis.id,
    });
  }

  for (const notice of src.notices) {
    const addressees = safeParseJson<{ lawFirmName: string; roleLabel: string }[]>(notice.addressees, []);
    push({
      kind: "NOTICE_ISSUED",
      at: notice.createdAt.toISOString(),
      isEstimated: false,
      title: `إرسال إخطار الاجتماع ${notice.noticeLabel}`,
      detail: [
        `الاجتماع بتاريخ ${notice.meetingTimeLabel}`,
        addressees.length > 0 ? `الموجَّه إليهم: ${addressees.map((a) => a.roleLabel).join("، ")}` : null,
      ]
        .filter(Boolean)
        .join(" — "),
      sourceKind: "NOTICE",
      sourceId: notice.id,
    });

    if (notice.deliveries.length > 0) {
      const acknowledgedCount = notice.deliveries.filter((d) => d.acknowledgedAt).length;
      const lastAt = notice.deliveries.reduce<Date>(
        (latest, d) => ((d.acknowledgedAt ?? d.sentAt) > latest ? (d.acknowledgedAt ?? d.sentAt) : latest),
        notice.deliveries[0].sentAt,
      );
      push({
        kind: "NOTICE_DELIVERED",
        at: lastAt.toISOString(),
        isEstimated: false,
        title: `تسليم إخطار الاجتماع ${notice.noticeLabel}`,
        detail: `${notice.deliveries.length} مُرسَل إليه، ${acknowledgedCount} أكَّد الاستلام`,
        sourceKind: "NOTICE",
        sourceId: notice.id,
      });
    }
  }

  for (const session of src.hearingSessions) {
    const heldAt = session.startedAt ?? session.meetingDate;
    if (heldAt && session.status !== "NOT_SCHEDULED") {
      const present = session.attendanceRecords.filter((r) => r.status === "PRESENT").length;
      const late = session.attendanceRecords.filter((r) => r.status === "LATE").length;
      const absent = session.attendanceRecords.filter((r) => r.status === "ABSENT").length;
      const answered = session.questions.filter((q) => q.status === "ANSWERED").length;
      push({
        kind: "HEARING_HELD",
        at: heldAt.toISOString(),
        isEstimated: !session.startedAt,
        title: `انعقاد ${session.label}`,
        detail: [
          session.attendanceRecords.length > 0 ? `الحضور: ${present} حاضر، ${late} متأخر، ${absent} غائب` : null,
          session.questions.length > 0 ? `${answered} من ${session.questions.length} سؤال أُجيب` : null,
        ]
          .filter(Boolean)
          .join(" — "),
        sourceKind: "HEARING",
        sourceId: session.id,
      });
    }

    if (session.correctedTranscript) {
      push({
        kind: "TRANSCRIPT_CORRECTED",
        at: session.updatedAt.toISOString(),
        isEstimated: true,
        title: `تصحيح تفريغ ${session.label} بالذكاء الاصطناعي`,
        detail: `${session.correctedTranscript.length.toLocaleString("en-US")} حرف`,
        sourceKind: "HEARING",
        sourceId: session.id,
      });
    }
  }

  const demandsByDay = new Map<string, typeof src.documentDemands>();
  for (const demand of src.documentDemands) {
    const key = dayKey(demand.createdAt);
    const list = demandsByDay.get(key) ?? [];
    list.push(demand);
    demandsByDay.set(key, list);
  }
  for (const [key, demands] of demandsByDay) {
    const earliestDeadline = demands.reduce<Date>(
      (min, d) => (d.deadline < min ? d.deadline : min),
      demands[0].deadline,
    );
    push({
      kind: "DEMANDS_ISSUED",
      at: new Date(`${key}T00:00:00.000Z`).toISOString(),
      isEstimated: false,
      title: `طلب ${demands.length} ${demands.length === 1 ? "مستند" : "مستندات"}`,
      detail: `${demands.map((d) => d.item).join("، ")} — أقرب موعد نهائي: ${earliestDeadline.toISOString().slice(0, 10)}`,
      sourceKind: "DEMAND",
      sourceId: null,
    });
  }

  for (const inspection of src.siteInspections) {
    push({
      kind: "SITE_INSPECTION",
      at: inspection.visitDate.toISOString(),
      isEstimated: false,
      title: "زيارة معاينة ميدانية",
      detail: [
        inspection.location,
        inspection.purpose,
        inspection.testimonies.length > 0 ? `${inspection.testimonies.length} إفادة ميدانية` : null,
      ]
        .filter(Boolean)
        .join(" — "),
      sourceKind: "SITE_INSPECTION",
      sourceId: inspection.id,
    });
  }

  if (src.nextHearingDate) {
    push({
      kind: "NEXT_HEARING",
      at: src.nextHearingDate.toISOString(),
      isEstimated: false,
      title: "الجلسة القادمة أمام المحكمة",
      detail: null,
      sourceKind: "CASE",
      sourceId: src.id,
    });
  }

  if (src.reportDeadlineDate) {
    push({
      kind: "REPORT_DEADLINE",
      at: src.reportDeadlineDate.toISOString(),
      isEstimated: false,
      title: "آخر موعد لإيداع تقرير الخبرة",
      detail: null,
      sourceKind: "CASE",
      sourceId: src.id,
    });
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return { events, missingDates };
}

// ---------------------------------------------------------------------------
// جرد المستندات المتحقق منه
// ---------------------------------------------------------------------------

export interface DocumentInventoryDocument {
  id: string;
  fileName: string;
  fileKind: string;
  detectedTitle: string | null;
  periodLabel: string | null;
  submittedByPartyId: string | null;
  submittedByPartyName: string | null;
  uploadedAt: string;
  confidence: number | null;
  pageRefs: string | null;
}

export interface DocumentInventoryEntry {
  sourceKind: "REQUIREMENT" | "DEMAND";
  sourceId: string;
  label: string;
  status: string;
  relatedTask: string | null;
  documents: DocumentInventoryDocument[];
}

export interface DocumentInventory {
  entries: DocumentInventoryEntry[];
  unlinkedDocuments: DocumentInventoryDocument[];
  missingItems: { label: string; status: string; relatedTask: string | null; source: "REQUIREMENT" | "DEMAND" }[];
}

export function buildDocumentInventory(src: ReportSourceData): DocumentInventory {
  const partyNameById = new Map(src.parties.map((p) => [p.id, p.name]));
  const linkedDocumentIds = new Set<string>();

  const toEntryDoc = (doc: {
    id: string;
    fileName: string;
    fileKind: string;
    detectedTitle: string | null;
    detectedPeriod: string | null;
    detectedDates: string | null;
    submittedByPartyId: string | null;
    uploadedAt: Date;
  }, confidence: number | null, pageRefs: string | null): DocumentInventoryDocument => {
    linkedDocumentIds.add(doc.id);
    const dates = safeParseJson<string[]>(doc.detectedDates, []);
    return {
      id: doc.id,
      fileName: doc.fileName,
      fileKind: doc.fileKind,
      detectedTitle: doc.detectedTitle,
      periodLabel: doc.detectedPeriod ?? (dates.length > 0 ? dates.slice(0, 2).join(" – ") : null),
      submittedByPartyId: doc.submittedByPartyId,
      submittedByPartyName: doc.submittedByPartyId ? (partyNameById.get(doc.submittedByPartyId) ?? null) : null,
      uploadedAt: doc.uploadedAt.toISOString(),
      confidence,
      pageRefs,
    };
  };

  const entries: DocumentInventoryEntry[] = [];
  const missingItems: DocumentInventory["missingItems"] = [];

  for (const req of src.requirements) {
    if (req.status === "PROVIDED" || req.status === "PARTIALLY_PROVIDED") {
      entries.push({
        sourceKind: "REQUIREMENT",
        sourceId: req.id,
        label: req.labelAr,
        status: req.status,
        relatedTask: req.relatedTask,
        documents: req.matches.map((m) => toEntryDoc(m.document, m.confidence, m.pageRefs)),
      });
    } else {
      missingItems.push({ label: req.labelAr, status: req.status, relatedTask: req.relatedTask, source: "REQUIREMENT" });
    }
  }

  for (const demand of src.documentDemands) {
    if (demand.status === "RECEIVED" || demand.status === "PARTIALLY_RECEIVED") {
      entries.push({
        sourceKind: "DEMAND",
        sourceId: demand.id,
        label: demand.item,
        status: demand.status,
        relatedTask: demand.relatedTask,
        documents: [], // لا يوجد ربط مباشر بمستند لمطالبات الموديول 2/3 — أمانة، لا نخترع ربطاً
      });
    } else {
      missingItems.push({ label: demand.item, status: demand.status, relatedTask: demand.relatedTask, source: "DEMAND" });
    }
  }

  const unlinkedDocuments = src.documents
    .filter((d) => !linkedDocumentIds.has(d.id))
    .map((d) => toEntryDoc(d, null, null));

  return { entries, unlinkedDocuments, missingItems };
}

// ---------------------------------------------------------------------------
// مواقف الأطراف وإفاداتهم
// ---------------------------------------------------------------------------

export interface PartyPleadingDigest {
  documentId: string;
  fileName: string;
  docCategory: string;
  digest: string;
}
export interface PartyHearingStatement {
  sessionLabel: string;
  questionText: string;
  answerText: string;
  status: string;
}
export interface PartyFieldStatement {
  visitDate: string;
  personName: string;
  personRole: string | null;
  statementText: string;
}
export interface PartySide {
  partyNames: string[];
  pleadingDigests: PartyPleadingDigest[];
  hearingStatements: PartyHearingStatement[];
  fieldStatements: PartyFieldStatement[];
}
export interface PartyClaimsSnapshot {
  claimant: PartySide;
  respondent: PartySide;
  unattributedPleadingDigests: PartyPleadingDigest[];
}

const PLEADING_CATEGORIES: DocCategory[] = ["STATEMENT_OF_CLAIM", "PARTY_MEMO", "PARTY_ATTACHMENT"];

export function buildPartyClaims(src: ReportSourceData): PartyClaimsSnapshot {
  const partyRoleById = new Map(src.parties.map((p) => [p.id, p.role as "CLAIMANT" | "RESPONDENT"]));

  function buildSide(role: "CLAIMANT" | "RESPONDENT"): PartySide {
    const partyIds = new Set(src.parties.filter((p) => p.role === role).map((p) => p.id));
    const pleadingDigests: PartyPleadingDigest[] = src.documents
      .filter(
        (d) =>
          d.submittedByPartyId &&
          partyIds.has(d.submittedByPartyId) &&
          PLEADING_CATEGORIES.includes((d.docCategory ?? "UNSPECIFIED") as DocCategory),
      )
      .map((d) => {
        const digest = buildSingleDocumentDigest(
          {
            id: d.id,
            fileName: d.fileName,
            fileKind: d.fileKind,
            docCategory: (d.docCategory ?? "UNSPECIFIED") as DocCategory,
            text: d.extractedText ?? "",
          } satisfies SmartIngestDocument,
          450,
        );
        return {
          documentId: d.id,
          fileName: d.fileName,
          docCategory: DOC_CATEGORY_LABELS[(d.docCategory ?? "UNSPECIFIED") as DocCategory],
          digest: digest.text,
        };
      });

    const hearingStatements: PartyHearingStatement[] = [];
    for (const session of src.hearingSessions) {
      for (const q of session.questions) {
        if (q.partyRole === role && q.answerText?.trim()) {
          hearingStatements.push({
            sessionLabel: session.label,
            questionText: q.questionText,
            answerText: q.answerText,
            status: q.status,
          });
        }
      }
    }

    const fieldStatements: PartyFieldStatement[] = [];
    for (const inspection of src.siteInspections) {
      for (const t of inspection.testimonies) {
        // لا يوجد ربط صريح بين الإفادة الميدانية وصفة صاحبها في المخطط
        // الحالي — تُعرَض ضمن كل طرف فقط حين يُذكر اسم الطرف نفسه في اسم
        // صاحب الإفادة، وإلا تبقى في partyClaims.unattributed عبر الطرف
        // الآخر لاحقاً (أمانة بدل افتراض انتماء غير مؤكد).
        const personMatchesParty = [...partyIds]
          .map((id) => src.parties.find((p) => p.id === id)?.name ?? "")
          .some((name) => name && t.personName.includes(name));
        if (personMatchesParty) {
          fieldStatements.push({
            visitDate: inspection.visitDate.toISOString(),
            personName: t.personName,
            personRole: t.personRole,
            statementText: t.statementText,
          });
        }
      }
    }

    return {
      partyNames: src.parties.filter((p) => p.role === role).map((p) => p.name),
      pleadingDigests,
      hearingStatements,
      fieldStatements,
    };
  }

  const unattributedPleadingDigests: PartyPleadingDigest[] = src.documents
    .filter(
      (d) =>
        !d.submittedByPartyId &&
        PLEADING_CATEGORIES.includes((d.docCategory ?? "UNSPECIFIED") as DocCategory),
    )
    .map((d) => {
      const digest = buildSingleDocumentDigest(
        {
          id: d.id,
          fileName: d.fileName,
          fileKind: d.fileKind,
          docCategory: (d.docCategory ?? "UNSPECIFIED") as DocCategory,
          text: d.extractedText ?? "",
        } satisfies SmartIngestDocument,
        450,
      );
      return {
        documentId: d.id,
        fileName: d.fileName,
        docCategory: DOC_CATEGORY_LABELS[(d.docCategory ?? "UNSPECIFIED") as DocCategory],
        digest: digest.text,
      };
    });

  void partyRoleById; // مُبقاة كمرجع للقراءة، غير مستخدمة مباشرة بعد — انظر buildSide
  return { claimant: buildSide("CLAIMANT"), respondent: buildSide("RESPONDENT"), unattributedPleadingDigests };
}

// ---------------------------------------------------------------------------
// ربط كل مهمة بمستنداتها (نفس أسلوب matchQuestionId في
// lib/hearing-transcript-ai.ts — تغطية رمزية بين نص حر ونص مرجعي معروف)
// ---------------------------------------------------------------------------

export interface ExhibitLink {
  documentId: string;
  fileName: string;
  via: "REQUIREMENT" | "DEMAND" | "HEURISTIC_LABEL";
  score: number;
  sourceLabel: string;
}
export interface AggregatedTaskMissingItem {
  label: string;
  status: string;
  source: "REQUIREMENT" | "DEMAND";
  deadline: string | null;
}
export interface AggregatedTask {
  taskIndex: number;
  taskText: string;
  linkedRequirementIds: string[];
  linkedDemandIds: string[];
  linkedDocumentIds: string[];
  exhibitLinks: ExhibitLink[];
  missingItems: AggregatedTaskMissingItem[];
}

const PRIMARY_LINK_THRESHOLD = 0.5;
const FALLBACK_LINK_THRESHOLD = 0.65;

/** يطابق نص حر (relatedTask لمتطلب أو مطالبة) مع أقرب مهمة من مهام
 * المأمورية — تماماً بنفس منطق matchQuestionId في lib/hearing-transcript-ai.ts
 * (تغطية الرموز، argmax، عتبة دنيا)، لأن النموذج/المستخدم لا يعرف فهرس
 * المهمة الثابت، فقط نصها. */
export function matchTaskIndexByText(
  text: string,
  tasks: { taskIndex: number; taskText: string }[],
  threshold = PRIMARY_LINK_THRESHOLD,
): number | null {
  const needle = tokenize(text);
  if (needle.length === 0) return null;
  let best: number | null = null;
  let bestScore = 0;
  for (const t of tasks) {
    const score = tokenCoverage(needle, tokenSet(t.taskText));
    if (score > bestScore) {
      bestScore = score;
      best = t.taskIndex;
    }
  }
  return bestScore >= threshold ? best : null;
}

export function buildAggregatedTasks(src: ReportSourceData): AggregatedTask[] {
  const analysis = src.analyses[0];
  const taskTexts = analysis ? safeParseJson<string[]>(analysis.mandateTasks, []) : [];
  if (taskTexts.length === 0) return [];

  const tasks: AggregatedTask[] = taskTexts.map((taskText, taskIndex) => ({
    taskIndex,
    taskText,
    linkedRequirementIds: [],
    linkedDemandIds: [],
    linkedDocumentIds: [],
    exhibitLinks: [],
    missingItems: [],
  }));
  const byIndex = new Map(tasks.map((t) => [t.taskIndex, t]));
  const taskRefs = tasks.map((t) => ({ taskIndex: t.taskIndex, taskText: t.taskText }));

  const addExhibit = (task: AggregatedTask, link: ExhibitLink) => {
    if (!task.linkedDocumentIds.includes(link.documentId)) {
      task.linkedDocumentIds.push(link.documentId);
      task.exhibitLinks.push(link);
    }
  };

  for (const req of src.requirements) {
    let taskIndex: number | null = null;
    let via: ExhibitLink["via"] = "REQUIREMENT";
    let score = 0;
    if (req.relatedTask) {
      taskIndex = matchTaskIndexByText(req.relatedTask, taskRefs, PRIMARY_LINK_THRESHOLD);
      score = taskIndex !== null ? 1 : 0;
    }
    if (taskIndex === null) {
      taskIndex = matchTaskIndexByText(req.labelAr, taskRefs, FALLBACK_LINK_THRESHOLD);
      via = "HEURISTIC_LABEL";
    }
    if (taskIndex === null) continue;
    const task = byIndex.get(taskIndex);
    if (!task) continue;

    if (!task.linkedRequirementIds.includes(req.id)) task.linkedRequirementIds.push(req.id);
    for (const match of req.matches) {
      addExhibit(task, {
        documentId: match.documentId,
        fileName: match.document.fileName,
        via,
        score: via === "REQUIREMENT" ? 1 : score,
        sourceLabel: req.labelAr,
      });
    }
    if (req.status === "MISSING" || req.status === "NOT_ANALYZED") {
      task.missingItems.push({ label: req.labelAr, status: req.status, source: "REQUIREMENT", deadline: null });
    }
  }

  for (const demand of src.documentDemands) {
    let taskIndex: number | null = null;
    if (demand.relatedTask) {
      taskIndex = matchTaskIndexByText(demand.relatedTask, taskRefs, PRIMARY_LINK_THRESHOLD);
    }
    if (taskIndex === null) {
      taskIndex = matchTaskIndexByText(demand.item, taskRefs, FALLBACK_LINK_THRESHOLD);
    }
    if (taskIndex === null) continue;
    const task = byIndex.get(taskIndex);
    if (!task) continue;

    if (!task.linkedDemandIds.includes(demand.id)) task.linkedDemandIds.push(demand.id);
    if (demand.status !== "RECEIVED") {
      task.missingItems.push({
        label: demand.item,
        status: demand.status,
        source: "DEMAND",
        deadline: demand.deadline.toISOString(),
      });
    }
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// التجميعة الكاملة
// ---------------------------------------------------------------------------

export interface ReportAggregateBasics {
  caseNumber: string;
  title: string;
  court: string | null;
  circuit: string | null;
  litigationDegree: string | null;
  caseCategory: string | null;
  clientName: string | null;
  mandateNatureLabels: string[];
  appointmentCapacity: string | null;
  committeeMembers: { name: string; specialization?: string | null }[];
}

export interface ReportAggregate {
  caseId: string;
  basics: ReportAggregateBasics;
  mandate: {
    mandateText: string | null;
    caseSummary: string | null;
    analysisMode: string | null;
    analysisApproved: boolean;
    taskCount: number;
  };
  parties: { id: string; role: string; name: string; capacityNote: string | null }[];
  attendees: { name: string; role: string; representingParty: string | null; hasPoa: boolean }[];
  timeline: ProceduralTimelineEvent[];
  timelineMissingDates: string[];
  inventory: DocumentInventory;
  partyClaims: PartyClaimsSnapshot;
  tasks: AggregatedTask[];
  documentsById: Map<string, ReportSourceData["documents"][number]>;
  stats: {
    documentCount: number;
    providedCount: number;
    missingCount: number;
    hearingCount: number;
    siteInspectionCount: number;
  };
}

export async function buildReportAggregate(caseId: string): Promise<ReportAggregate | null> {
  const src = await fetchReportSourceData(caseId);
  if (!src) return null;

  const analysis = src.analyses[0] ?? null;
  const mandateTasks = analysis ? safeParseJson<string[]>(analysis.mandateTasks, []) : [];
  const { events: timeline, missingDates: timelineMissingDates } = buildProceduralTimeline(src);
  const inventory = buildDocumentInventory(src);
  const partyClaims = buildPartyClaims(src);
  const tasks = buildAggregatedTasks(src);

  return {
    caseId: src.id,
    basics: {
      caseNumber: src.caseNumber,
      title: src.title,
      court: src.court,
      circuit: src.circuit,
      litigationDegree: src.litigationDegree,
      caseCategory: src.caseCategory,
      clientName: src.clientName,
      mandateNatureLabels: safeParseJson<string[]>(src.mandateNature, []),
      appointmentCapacity: src.appointmentCapacity,
      committeeMembers: safeParseJson(src.committeeMembers, []),
    },
    mandate: {
      mandateText: analysis?.mandateText ?? null,
      caseSummary: analysis?.caseSummary ?? null,
      analysisMode: analysis?.mode ?? null,
      analysisApproved: analysis?.status === "APPROVED",
      taskCount: mandateTasks.length,
    },
    parties: src.parties.map((p) => ({ id: p.id, role: p.role, name: p.name, capacityNote: p.capacityNote })),
    attendees: src.meetingAttendees.map((a) => ({
      name: a.name,
      role: a.role,
      representingParty: a.representingParty,
      hasPoa: a.documentId !== null,
    })),
    timeline,
    timelineMissingDates,
    inventory,
    partyClaims,
    tasks,
    documentsById: new Map(src.documents.map((d) => [d.id, d])),
    stats: {
      documentCount: src.documents.length,
      providedCount: src.requirements.filter((r) => r.status === "PROVIDED" || r.status === "PARTIALLY_PROVIDED")
        .length,
      missingCount: src.requirements.filter((r) => r.status === "MISSING").length,
      hearingCount: src.hearingSessions.length,
      siteInspectionCount: src.siteInspections.length,
    },
  };
}

export { CASE_PARTY_ROLE_LABELS };
