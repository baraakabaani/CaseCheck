// موديول 4 — المصدر الوحيد لترقيم "مرفق رقم (N)" عبر التقرير كله (نمط
// التقرير المرجعي: كل مستند يُستشهَد به في المتن يحمل رقم مرفق ثابتاً، ثم
// فهرس ختامي "حافظة المستندات" يسردها بنفس الأرقام). تُستخدَم هذه الدالة
// نفسها في شارة كل جدول مهمة بالواجهة (components/ReportTaskTables.tsx)
// وفي تصدير Word (lib/docx-export.ts) — لا يمكن أن يختلف الرقمان أبداً لأن
// كليهما يستدعي نفس الدالة على نفس المدخلات، تماماً كمبدأ computeLiquidation
// (lib/reports/liquidation.ts) كمصدر حساب وحيد.

export interface AttachmentEntry {
  documentId: string;
  number: number; // مرفق رقم (N) — 1-based، متسلسل بلا فجوات
  fileName: string;
}

export interface AttachmentPlan {
  entries: AttachmentEntry[];
  numberByDocumentId: Map<string, number>;
}

/** يرقّم كل مستند مرتبط فعلياً بمهمة واحدة على الأقل من مهام التقرير، حسب
 * ترتيب أول ظهور له عبر المهام (بترتيب taskIndex ثم ترتيب الربط داخل
 * المهمة) — لا ترتيب أبجدي ولا ترتيب رفع، بل ترتيب الاستشهاد الفعلي في متن
 * التقرير، كما في التقرير المرجعي. مستند مرفوع لكنه غير مرتبط بأي مهمة لا
 * يحصل على رقم مرفق (لا استشهاد به في المتن يستوجب رقماً). */
export function buildAttachmentPlan(
  tasks: { taskIndex: number; linkedDocumentIds: string[] }[],
  documentsById: Map<string, { id: string; fileName: string }>,
): AttachmentPlan {
  const seen = new Set<string>();
  const entries: AttachmentEntry[] = [];

  for (const task of [...tasks].sort((a, b) => a.taskIndex - b.taskIndex)) {
    for (const docId of task.linkedDocumentIds) {
      if (seen.has(docId)) continue;
      const doc = documentsById.get(docId);
      if (!doc) continue;
      seen.add(docId);
      entries.push({ documentId: docId, number: entries.length + 1, fileName: doc.fileName });
    }
  }

  return { entries, numberByDocumentId: new Map(entries.map((e) => [e.documentId, e.number])) };
}
