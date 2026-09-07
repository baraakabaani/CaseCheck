// الموديول 4 — حساب جدول تصفية الحساب (الخلاصة وتصفية الحساب). هذا هو
// المكان الوحيد الذي تُحسَب فيه هذه الأرقام — تُستدعى من مكوّن الجدول في
// الواجهة، ومن مسار تصدير Word، ومن استجابة API التوليد، بحيث لا يوجد إلا
// مصدر حساب واحد يمكن أن يختلف. "قاعدة السلامة" في طلب المستخدم (كل بند
// يجب أن يرتبط بمهمة مأمورية مُحلَّلة فعلياً) مُطبَّقة هنا ببنية البيانات
// نفسها: لا يوجد صف في الجدول إلا وهو مبنيّ على CourtReportTask حقيقي —
// لا مجموع مستقل يمكن أن يُختلق بمعزل عن المهام.

import type { ProvenanceState } from "../hub-schemas";

export interface LiquidationTaskLike {
  id: string;
  taskIndex: number;
  taskText: string;
  claimantAmount: number | null;
  respondentOffset: number | null;
  amountNote: string | null;
  expertVerdictProvenance: string;
}

export interface LiquidationRow {
  taskId: string;
  taskIndex: number;
  taskLabel: string;
  claimantAmount: number;
  respondentOffset: number;
  net: number;
  amountNote: string | null;
  verdictCertified: boolean;
}

export interface LiquidationResult {
  rows: LiquidationRow[];
  totalClaimant: number;
  totalRespondent: number;
  netDue: number;
  beneficiaryRole: "CLAIMANT" | "RESPONDENT" | "NONE";
  /** عدد الصفوف التي تحمل رقماً معتمَداً بينما رأي الخبرة في مهمتها لم
   * يُعتمد بعد — تحذير سلامة، وليس خطأً يمنع الحساب. */
  uncertifiedRowCount: number;
}

const MAX_TASK_LABEL_LENGTH = 70;

function shortenTaskLabel(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_TASK_LABEL_LENGTH
    ? `${trimmed.slice(0, MAX_TASK_LABEL_LENGTH).trim()}…`
    : trimmed;
}

/** يحسب جدول التصفية من مهام التقرير مباشرة — صف واحد لكل مهمة تحمل رقماً
 * فعلياً (مطالبة أو مقاصة)؛ المهام غير المالية (بلا أي رقم) لا تظهر في
 * الجدول أصلاً بدل عرضها كصف أصفار بلا معنى. */
export function computeLiquidation(tasks: LiquidationTaskLike[]): LiquidationResult {
  const rows: LiquidationRow[] = [];
  let uncertifiedRowCount = 0;

  for (const task of [...tasks].sort((a, b) => a.taskIndex - b.taskIndex)) {
    const claimantAmount = task.claimantAmount ?? 0;
    const respondentOffset = task.respondentOffset ?? 0;
    if (task.claimantAmount === null && task.respondentOffset === null) continue;

    const verdictCertified = task.expertVerdictProvenance === "EXPERT_CERTIFIED";
    if (!verdictCertified) uncertifiedRowCount++;

    rows.push({
      taskId: task.id,
      taskIndex: task.taskIndex,
      taskLabel: shortenTaskLabel(task.taskText),
      claimantAmount,
      respondentOffset,
      net: claimantAmount - respondentOffset,
      amountNote: task.amountNote,
      verdictCertified,
    });
  }

  const totalClaimant = rows.reduce((sum, r) => sum + r.claimantAmount, 0);
  const totalRespondent = rows.reduce((sum, r) => sum + r.respondentOffset, 0);
  const netDue = totalClaimant - totalRespondent;

  return {
    rows,
    totalClaimant,
    totalRespondent,
    netDue,
    beneficiaryRole: netDue > 0 ? "CLAIMANT" : netDue < 0 ? "RESPONDENT" : "NONE",
    uncertifiedRowCount,
  };
}

/** نفس أسلوب تنسيق الأرقام المستخدم في lib/format.ts (Intl، لا حساب يدوي
 * للفواصل) — درهم إماراتي، بلا كسور (المبالغ في هذا السياق دوماً بالدرهم
 * الكامل عملياً، ونفس الاصطلاح المستخدم في محاضر الاجتماعات والمحاضر). */
export function formatAed(amount: number): string {
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.abs(amount));
  return `${amount < 0 ? "-" : ""}${formatted} درهم`;
}

export function beneficiaryLabel(role: LiquidationResult["beneficiaryRole"]): string {
  switch (role) {
    case "CLAIMANT":
      return "لصالح المدعي";
    case "RESPONDENT":
      return "لصالح المدعى عليه";
    case "NONE":
      return "لا يوجد رصيد مستحق لأي من الطرفين";
  }
}

/** يُستخدم فقط لإعادة توسيم صف كمُعتمَد بصرياً في واجهات لا تصل مباشرة
 * إلى ProvenanceState الكامل — إبقاء التصدير المتّسق بلا استيراد دائري. */
export function isRowCertified(state: ProvenanceState | string): boolean {
  return state === "EXPERT_CERTIFIED";
}
