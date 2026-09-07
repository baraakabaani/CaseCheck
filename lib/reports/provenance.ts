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
}

export interface ExportGateResult {
  blocked: boolean;
  /** فهارس (taskIndex) المهام التي لم يُعتمد رأي الخبرة فيها بعد. */
  uncertifiedTaskIndexes: number[];
}

/** بوابة التصدير/الاعتماد الحقيقية — تُستدعى من الخادم (المصدر الملزم) ومن
 * العميل (لتعطيل الأزرار فوراً دون انتظار استجابة الخادم). تقرير بلا مهام
 * على الإطلاق يُعتبر محجوباً أيضاً — لا يوجد تقرير خبرة حقيقي بلا مهام. */
export function isExportBlocked(tasks: ExportGateTaskLike[]): ExportGateResult {
  const uncertifiedTaskIndexes = tasks
    .filter((t) => t.expertVerdictProvenance !== "EXPERT_CERTIFIED")
    .map((t) => t.taskIndex);
  return {
    blocked: tasks.length === 0 || uncertifiedTaskIndexes.length > 0,
    uncertifiedTaskIndexes,
  };
}
