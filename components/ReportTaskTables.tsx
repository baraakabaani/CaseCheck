"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { ReportTableEditor } from "@/components/ReportTableEditor";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import { buildAttachmentPlan } from "@/lib/reports/attachments";
import type { CourtReportTableDetail, CourtReportTaskDetail, DocumentDetail } from "@/lib/queries";

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** جداول مهمة واحدة (بين "بحث الخبرة" وقسم الأرقام المعتمدة) + زر إضافة
 * جدول يدوي. شارة "مرفق رقم" لكل مستند من مستندات هذه المهمة مبنية من
 * lib/reports/attachments.ts على كامل مهام التقرير، لا هذه المهمة وحدها،
 * حتى يتطابق الرقم مع فهرس حافظة المستندات الختامي. */
export function ReportTaskTables({
  caseId,
  task,
  allTasks,
  tables,
  documents,
  onChanged,
}: {
  caseId: string;
  task: CourtReportTaskDetail;
  allTasks: CourtReportTaskDetail[];
  tables: CourtReportTableDetail[];
  documents: DocumentDetail[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);

  const documentsById = new Map(documents.map((d) => [d.id, d]));
  const attachmentPlan = buildAttachmentPlan(
    allTasks.map((t) => ({ taskIndex: t.taskIndex, linkedDocumentIds: safeParseJson<string[]>(t.linkedDocumentIds, []) })),
    documentsById,
  );
  const taskDocumentIds = safeParseJson<string[]>(task.linkedDocumentIds, []);
  const attachmentNumbers = taskDocumentIds
    .map((id) => attachmentPlan.numberByDocumentId.get(id))
    .filter((n): n is number => n !== undefined)
    .sort((a, b) => a - b);

  async function addManualTable() {
    setAdding(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/court-report/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildClientApiKeyHeaders() },
        body: JSON.stringify({
          courtReportTaskId: task.id,
          placement: "TASK",
          title: "جدول جديد",
          columns: [
            { key: "col1", label: "البيان" },
            { key: "col2", label: "المبلغ", align: "end" },
          ],
          rows: [{ cells: ["", ""] }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إضافة الجدول");
      toast.success("تمت إضافة جدول يدوي — عدِّله أدناه");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة الجدول");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">الجداول المالية لهذه المهمة</span>
          {attachmentNumbers.length > 0 && (
            <Badge variant="outline" className="font-normal">
              مرفق رقم {attachmentNumbers.map((n) => `(${n})`).join(" ")}
            </Badge>
          )}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addManualTable} disabled={adding}>
          <Plus className="size-3.5" />
          إضافة جدول يدوي
        </Button>
      </div>

      {tables.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد جداول لهذه المهمة — إن كانت هناك مستندات كشف حساب مهيكلة (Excel/CSV) مرتبطة بها، أعد توليد التقرير
          لمحاولة استخراج جداول حتمية منها، أو أضف جدولاً يدوياً.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {tables.map((table) => (
            <ReportTableEditor
              key={table.id}
              caseId={caseId}
              table={table}
              documents={documents}
              onChanged={onChanged}
              onDeleted={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}
