// الموديول 4 — منطق تتبّع مصدر كل كتلة نصية في التقرير القضائي (provenance)،
// بمعزل عن أي واجهة أو مسار API حتى يبقى نفس المنطق مُستخدَماً من العميل
// (لتعطيل زر التصدير فوراً) ومن الخادم (كبوابة حقيقية لا يمكن تجاوزها).
//
// ثلاث حالات فقط:
//   EXTRACT          — منقول حرفياً من ملف الدعوى (نص المهمة نفسه، أو
//                       فقرة مُجمَّعة حتمياً من سجلات النظام، أو اقتباس
//                       أدرجه الخبير يدوياً من مستند).
//   AI_DRAFT         — نص اقترحه الذكاء الاصطناعي، لم يراجعه الخبير بعد.
//   EXPERT_CERTIFIED — عدّله الخبير أو اعتمده صراحةً.
//
// القاعدة الوحيدة التي تُلزم التصدير: "رأي الخبرة" لكل مهمة يجب أن يكون
// EXPERT_CERTIFIED — هذا ما ينص عليه طلب المستخدم صراحة، وليس كل كتلة في
// التقرير (بقية الكتل الـ AI_DRAFT تُعرض بوضوح لكن لا تمنع التصدير).

import type { ProvenanceState } from "../hub-schemas";

export type { ProvenanceState };

export type ProvenanceAction = "EDIT" | "INSERT_QUOTE" | "CERTIFY" | "GENERATE";

const RANK: Record<ProvenanceState, number> = {
  AI_DRAFT: 0,
  EXTRACT: 1,
  EXPERT_CERTIFIED: 2,
};

/** يحسب الحالة التالية لكتلة نصية بعد إجراء معيّن عليها.
 * - EDIT/CERTIFY: يعتمدها الخبير دوماً، بصرف النظر عن حالتها السابقة.
 * - INSERT_QUOTE: يرفعها إلى EXTRACT على الأقل، لكن لا يُنزل كتلة معتمدة
 *   بالفعل من الخبير (EXPERT_CERTIFIED يبقى كما هو حتى لو أُدرج فيها اقتباس).
 * - GENERATE: يُعيدها إلى AI_DRAFT — لكن المستدعي (مسار /court-report/draft)
 *   مسؤول عن تخطي أي كتلة EXPERT_CERTIFIED بالكامل ولا يستدعي هذا الإجراء
 *   عليها أصلاً، حتى لا يُفقَد عمل الخبير المعتمد بإعادة التوليد. */
export function nextProvenance(current: ProvenanceState, action: ProvenanceAction): ProvenanceState {
  switch (action) {
    case "EDIT":
    case "CERTIFY":
      return "EXPERT_CERTIFIED";
    case "INSERT_QUOTE":
      return RANK[current] >= RANK.EXTRACT ? current : "EXTRACT";
    case "GENERATE":
      return "AI_DRAFT";
  }
}

/** يُستخدَم قبل الكتابة فوق حقل عند إعادة التوليد: كتلة اعتمدها الخبير
 * بالفعل لا تُستبدَل أبداً بمخرجات ذكاء اصطناعي جديدة. */
export function isCertified(state: ProvenanceState | null | undefined): boolean {
  return state === "EXPERT_CERTIFIED";
}

export interface ExportGateTaskLike {
  taskIndex: number;
  expertVerdictProvenance: string;
  /** اختياري لتوافق الاستدعاءات القديمة، لكن يجب تمريره فعلياً — "معتمد"
   * على حقل فارغ لا يعني شيئاً (انظر التعليق أدناه). */
  expertVerdict?: string | null;
}

export interface ExportGateTableLike {
  id: string;
  provenance: string;
  rowsJson: string;
}

export interface ExportGateObjectionLike {
  id: string;
  objectionText: string;
  responseText: string | null;
  responseProvenance: string;
}

export interface ExportGateReportLike {
  conclusionProvenance: string | null;
  conclusionItemsJson: string | null;
}

export interface ExportGateResult {
  blocked: boolean;
  /** فهارس (taskIndex) المهام التي لم يُعتمد رأي الخبرة فيها بعد. */
  uncertifiedTaskIndexes: number[];
  /** معرّفات الجداول التي لم تُعتمد بعد (أو معتمدة بصفوف فارغة فعلياً). */
  uncertifiedTableIds: string[];
  /** معرّفات الاعتراضات التي لها نص لكن ردّها غير معتمَد بعد. */
  uncertifiedObjectionIds: string[];
  /** الخلاصة (ثامناً) — بوابة صارمة قائمة بذاتها، انظر التعليق أدناه. */
  conclusionUncertified: boolean;
}

function hasRealTableRows(rowsJson: string): boolean {
  try {
    const rows = JSON.parse(rowsJson) as { cells: string[] }[];
    return rows.some((r) => r.cells.some((c) => c.trim().length > 0));
  } catch {
    return false;
  }
}

function hasRealConclusionItems(itemsJson: string | null): boolean {
  if (!itemsJson) return false;
  try {
    return (JSON.parse(itemsJson) as unknown[]).length > 0;
  } catch {
    return false;
  }
}

/** بوابة التصدير/الاعتماد الحقيقية — تُستدعى من الخادم (المصدر الملزم) ومن
 * العميل (لتعطيل الأزرار فوراً دون انتظار استجابة الخادم). تقرير بلا مهام
 * على الإطلاق يُعتبر محجوباً أيضاً — لا يوجد تقرير خبرة حقيقي بلا مهام.
 * وسم EXPERT_CERTIFIED على حقل فارغ فعلياً (مثال: صف مُرحَّل من نسخة سابقة
 * لم يكتب فيها الخبير شيئاً) لا يُحتسَب اعتماداً حقيقياً — يجب أن يوجد نص
 * فعلي أيضاً.
 *
 * الشكل القديم (مصفوفة مهام فقط) لا يزال مقبولاً كوسيط وحيد (توافق خلفي مع
 * استدعاءات موجودة)؛ الشكل الجديد يضيف tables/objections/report اختيارية —
 * جدول/اعتراض غير موجودَين في الاستدعاء لا يُحجبان شيئاً (لا يزالان غير
 * مبنيَّين في هذا الاستدعاء تحديداً)، لكن إن مُرِّرا فيُطبَّق عليهما نفس
 * منطق "معتمد يعني محتوى حقيقي فعلاً". الخلاصة (report.conclusionProvenance)
 * بوابة صارمة قائمة بذاتها بمجرد تمرير report: لا يكفي أن تكون EXTRACT
 * (رغم أن محتواها حقيقي فعلياً) — يجب أن يراجعها الخبير ويعتمدها EXPERT_CERTIFIED
 * صراحةً كوحدة واحدة، لأنها أهم قسم في التقرير قانونياً (قرار مقصود، لا خطأ). */
export function isExportBlocked(
  tasks: ExportGateTaskLike[],
  extra?: {
    tables?: ExportGateTableLike[];
    objections?: ExportGateObjectionLike[];
    report?: ExportGateReportLike;
  },
): ExportGateResult {
  const isReallyCertified = (t: ExportGateTaskLike) =>
    t.expertVerdictProvenance === "EXPERT_CERTIFIED" &&
    (t.expertVerdict === undefined || (typeof t.expertVerdict === "string" && t.expertVerdict.trim().length > 0));
  const uncertifiedTaskIndexes = tasks.filter((t) => !isReallyCertified(t)).map((t) => t.taskIndex);

  const tables = extra?.tables ?? [];
  const uncertifiedTableIds = tables
    .filter((t) => !(t.provenance === "EXPERT_CERTIFIED" && hasRealTableRows(t.rowsJson)))
    .map((t) => t.id);

  const objections = extra?.objections ?? [];
  const uncertifiedObjectionIds = objections
    .filter((o) => o.objectionText.trim().length > 0)
    .filter((o) => !(o.responseProvenance === "EXPERT_CERTIFIED" && hasRealContentString(o.responseText)))
    .map((o) => o.id);

  const conclusionUncertified = extra?.report
    ? !(extra.report.conclusionProvenance === "EXPERT_CERTIFIED" && hasRealConclusionItems(extra.report.conclusionItemsJson))
    : false;

  return {
    blocked:
      tasks.length === 0 ||
      uncertifiedTaskIndexes.length > 0 ||
      uncertifiedTableIds.length > 0 ||
      uncertifiedObjectionIds.length > 0 ||
      conclusionUncertified,
    uncertifiedTaskIndexes,
    uncertifiedTableIds,
    uncertifiedObjectionIds,
    conclusionUncertified,
  };
}

function hasRealContentString(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
