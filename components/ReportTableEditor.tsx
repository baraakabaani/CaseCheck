"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calculator, Plus, Trash2, ShieldCheck, Loader2, X } from "lucide-react";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import { cn } from "@/lib/utils";
import { TABLE_COMPUTATION_LABELS, TABLE_COMPUTATION_TONE, PROVENANCE_TONE } from "@/lib/case-hub-labels";
import type { CourtReportTableDetail, DocumentDetail } from "@/lib/queries";
import type { ProvenanceState, CourtReportTableColumn, CourtReportTableRow } from "@/lib/hub-schemas";

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** يحاول تحليل خلية كرقم — يزيل فواصل الآلاف الإنجليزية، ويرفض أي نص غير
 * رقمي بوضوح (بدل NaN صامت). لا علاقة له بـ lib/financial: هذا تنسيق عرض
 * فقط على نص أُدخل بالفعل في الجدول، لا تحليل مستند خام. */
function parseCellNumber(cell: string): number | null {
  const cleaned = cell.replace(/,/g, "").trim();
  if (!cleaned || Number.isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

function formatCellNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function ReportTableEditor({
  caseId,
  table,
  documents,
  onChanged,
  onDeleted,
}: {
  caseId: string;
  table: CourtReportTableDetail;
  documents: DocumentDetail[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(table.title);
  const [subtitle, setSubtitle] = useState(table.subtitle ?? "");
  const [basisNote, setBasisNote] = useState(table.basisNote ?? "");
  const [columns, setColumns] = useState<CourtReportTableColumn[]>(
    safeParseJson<CourtReportTableColumn[]>(table.columnsJson, []),
  );
  const [rows, setRows] = useState<CourtReportTableRow[]>(safeParseJson<CourtReportTableRow[]>(table.rowsJson, []));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sourceDocumentIds = safeParseJson<string[]>(table.sourceDocumentIds, []);
  const sourceDocNames = sourceDocumentIds
    .map((id) => documents.find((d) => d.id === id)?.fileName)
    .filter((n): n is string => Boolean(n));

  async function patchTable(body: Record<string, unknown>) {
    const res = await fetch(`/api/cases/${caseId}/court-report/tables/${table.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...buildClientApiKeyHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل حفظ الجدول");
    return data.table as CourtReportTableDetail;
  }

  async function saveEdits(extra?: Record<string, unknown>) {
    setSaving(true);
    try {
      await patchTable({
        title,
        subtitle: subtitle || null,
        basisNote: basisNote || null,
        columns,
        rows,
        // أي تعديل من الخبير يُعتمَد تلقائياً — نفس قاعدة EDIT⇒EXPERT_CERTIFIED
        // المتّبعة في كل حقول التقرير (lib/reports/provenance.ts)، بشرط وجود
        // صف حقيقي واحد على الأقل (الخادم يرفض اعتماد جدول فارغ فعلياً).
        provenance: "EXPERT_CERTIFIED",
        ...extra,
      });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ الجدول");
    } finally {
      setSaving(false);
    }
  }

  function updateCell(rowIndex: number, colIndex: number, value: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === rowIndex ? { ...r, cells: r.cells.map((c, j) => (j === colIndex ? value : c)) } : r)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, { cells: columns.map(() => "") }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addColumn() {
    const key = `col${columns.length + 1}`;
    setColumns((prev) => [...prev, { key, label: "عمود جديد" }]);
    setRows((prev) => prev.map((r) => ({ ...r, cells: [...r.cells, ""] })));
  }

  function removeColumn(colIndex: number) {
    if (columns.length <= 1) return;
    setColumns((prev) => prev.filter((_, i) => i !== colIndex));
    setRows((prev) => prev.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== colIndex) })));
  }

  function updateColumnLabel(colIndex: number, label: string) {
    setColumns((prev) => prev.map((c, i) => (i === colIndex ? { ...c, label } : c)));
  }

  /** إعادة احتساب صف الإجمالي — جمع مباشر على أرقام مُدخَلة فعلياً في
   * الجدول نفسه، بلا أي استدعاء ذكاء اصطناعي. عمود يحتوي خلية غير رقمية
   * واحدة (في الصفوف غير الإجمالية) يُستبعَد من الجمع ("—" في صف الإجمالي)
   * بدل افتراض صفر خطأً. */
  function recomputeTotals() {
    const dataRows = rows.filter((r) => !r.isTotal);
    if (dataRows.length === 0) {
      toast.error("لا توجد صفوف بيانات لحساب إجمالي منها");
      return;
    }
    const totalCells = columns.map((_, colIndex) => {
      if (colIndex === 0) return "الإجمالي";
      const values = dataRows.map((r) => parseCellNumber(r.cells[colIndex] ?? ""));
      if (values.some((v) => v === null)) return "—";
      const sum = values.reduce<number>((acc, v) => acc + (v as number), 0);
      return formatCellNumber(sum);
    });

    const existingTotalIndex = rows.findIndex((r) => r.isTotal);
    if (existingTotalIndex >= 0) {
      setRows((prev) => prev.map((r, i) => (i === existingTotalIndex ? { cells: totalCells, isTotal: true } : r)));
    } else {
      setRows((prev) => [...prev, { cells: totalCells, isTotal: true }]);
    }
    toast.success("أُعيد احتساب صف الإجمالي من صفوف الجدول الحالية (حساب محلي، بلا ذكاء اصطناعي)");
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/court-report/tables/${table.id}`, {
        method: "DELETE",
        headers: buildClientApiKeyHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حذف الجدول");
      toast.success("تم حذف الجدول");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حذف الجدول");
      setDeleting(false);
    }
  }

  const provenance = table.provenance as ProvenanceState;
  const computation = table.computation as "DETERMINISTIC" | "AI_PROPOSED" | "MANUAL";

  return (
    <div className={cn("rounded-md border bg-card p-3", PROVENANCE_TONE[provenance].border)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md border px-2 py-0.5 text-xs font-medium ${TABLE_COMPUTATION_TONE[computation]}`}
          >
            {TABLE_COMPUTATION_LABELS[computation]}
          </span>
          <ProvenanceBadge state={provenance} short />
          {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={recomputeTotals}>
            <Calculator className="size-3.5" />
            إعادة احتساب صف الإجمالي
          </Button>
          {provenance !== "EXPERT_CERTIFIED" && (
            <Button type="button" size="sm" variant="outline" onClick={() => saveEdits()} disabled={saving}>
              <ShieldCheck className="size-3.5" />
              اعتماد الجدول
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {computation === "AI_PROPOSED" && (
        <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          جدول اقترحه الذكاء الاصطناعي — تحقق من صحة كل رقم فيه مقابل المستندات قبل الاعتماد.
        </p>
      )}
      {computation === "DETERMINISTIC" && sourceDocNames.length > 0 && (
        <p className="mb-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          محسوب آلياً (جمع/طرح مباشر بلا ذكاء اصطناعي) من: {sourceDocNames.join("، ")} — راجع الأرقام قبل الاعتماد رغم ذلك.
        </p>
      )}

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">عنوان الجدول</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => saveEdits()} />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">عنوان فرعي (اختياري)</Label>
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} onBlur={() => saveEdits()} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="bg-muted/40">
              {columns.map((col, colIndex) => (
                <th key={col.key} className="border-b p-1.5">
                  <div className="flex items-center gap-1">
                    <Input
                      value={col.label}
                      onChange={(e) => updateColumnLabel(colIndex, e.target.value)}
                      onBlur={() => saveEdits()}
                      className="h-7 min-w-24 border-none bg-transparent text-center text-xs font-medium"
                    />
                    {columns.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          removeColumn(colIndex);
                          saveEdits();
                        }}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="border-b p-1.5">
                <button type="button" onClick={addColumn} className="text-muted-foreground hover:text-foreground">
                  <Plus className="size-3.5" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={row.isTotal ? "bg-muted/30 font-medium" : undefined}>
                {row.cells.map((cell, colIndex) => (
                  <td key={colIndex} className="border-b p-1">
                    <Input
                      value={cell}
                      onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                      onBlur={() => saveEdits()}
                      className="h-7 min-w-24 border-none bg-transparent text-center text-xs"
                    />
                  </td>
                ))}
                <td className="border-b p-1 text-center">
                  <button type="button" onClick={() => removeRow(rowIndex)} className="text-muted-foreground hover:text-destructive">
                    <X className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" size="sm" variant="ghost" className="mt-1.5" onClick={addRow}>
        <Plus className="size-3.5" />
        إضافة صف
      </Button>

      <div className="mt-2">
        <Label className="mb-1 block text-xs text-muted-foreground">سند الأرقام / ملاحظة الأساس</Label>
        <Textarea rows={2} value={basisNote} onChange={(e) => setBasisNote(e.target.value)} onBlur={() => saveEdits()} className="text-xs" />
      </div>
    </div>
  );
}
