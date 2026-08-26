"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  RotateCcw,
  Info,
  Paperclip,
  Pencil,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type { RequirementDetail } from "@/lib/queries";
import { REQUIREMENT_STATUSES, type RequirementStatus } from "@/lib/schemas";
import { formatDate } from "@/lib/format";
import { getStoredGroqApiKey } from "@/lib/client-api-key";
import { GROQ_API_KEY_HEADER } from "@/lib/api-key-header";

const STATUS_SELECT_LABEL: Record<RequirementStatus, string> = {
  PROVIDED: "مقدم",
  PARTIALLY_PROVIDED: "مقدم جزئياً",
  MISSING: "غير مقدم",
  NOT_ANALYZED: "لم تتم المطابقة بعد",
};

export function ChecklistTable({
  caseId,
  requirements,
  hasDocuments,
  onChanged,
}: {
  caseId: string;
  requirements: RequirementDetail[];
  hasDocuments: boolean;
  onChanged: () => void;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingRequirement, setAddingRequirement] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const storedKey = getStoredGroqApiKey();
      const res = await fetch(`/api/cases/${caseId}/analyze`, {
        method: "POST",
        headers: storedKey ? { [GROQ_API_KEY_HEADER]: storedKey } : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تشغيل المطابقة الذكية");

      if (data.warning) {
        toast.warning(data.warning);
      } else if (data.mode === "OFFLINE") {
        toast.success("تم تحديث حالة المتطلبات بالمطابقة الآلية (بدون مفتاح API)");
      } else {
        toast.success("تم تحديث حالة المتطلبات بنجاح باستخدام الذكاء الاصطناعي");
      }
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تشغيل المطابقة الذكية");
    } finally {
      setAnalyzing(false);
    }
  }

  async function updateRequirement(
    id: string,
    body: Record<string, unknown>,
    successMessage?: string,
  ) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/cases/${caseId}/requirements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحديث المتطلب");
      if (successMessage) toast.success(successMessage);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تحديث المتطلب");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRequirement(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/cases/${caseId}/requirements/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل حذف المتطلب");
      }
      toast.success("تم حذف المتطلب");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حذف المتطلب");
    } finally {
      setBusyId(null);
    }
  }

  async function addRequirement() {
    if (!newLabel.trim()) {
      toast.error("الرجاء إدخال اسم المتطلب");
      return;
    }
    setBusyId("new");
    try {
      const res = await fetch(`/api/cases/${caseId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirements: [
            {
              labelAr: newLabel.trim(),
              category: newCategory.trim() || null,
              isRequired: true,
              order: requirements.length,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إضافة المتطلب");
      toast.success("تمت إضافة المتطلب");
      setNewLabel("");
      setNewCategory("");
      setAddingRequirement(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة المتطلب");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {hasDocuments
            ? "قم بتشغيل المطابقة الذكية لمقارنة المستندات المرفوعة بقائمة المتطلبات"
            : "لم يتم رفع أي مستندات بعد — سيتم اعتبار جميع المتطلبات غير مقدمة"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setAddingRequirement((v) => !v)}
          >
            <Plus className="size-4" />
            إضافة متطلب
          </Button>
          <Button onClick={runAnalysis} disabled={analyzing || requirements.length === 0}>
            {analyzing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            تشغيل المطابقة الذكية
          </Button>
        </div>
      </div>

      {addingRequirement && (
        <div className="flex items-center gap-2 rounded-md border p-3">
          <Input
            placeholder="اسم المتطلب"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <Input
            placeholder="التصنيف (اختياري)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="w-48"
          />
          <Button onClick={addRequirement} disabled={busyId === "new"}>
            {busyId === "new" && <Loader2 className="size-4 animate-spin" />}
            إضافة
          </Button>
        </div>
      )}

      {requirements.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          لا توجد متطلبات محددة لهذا الملف بعد
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-48">المتطلب</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="min-w-56">المستندات المطابقة</TableHead>
                <TableHead className="min-w-64">ملاحظات / تعليل الذكاء الاصطناعي</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirements.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="align-top">
                    <div className="font-medium">{req.labelAr}</div>
                    {req.category && (
                      <div className="text-xs text-muted-foreground">{req.category}</div>
                    )}
                    {(req.periodStart || req.periodEnd) && (
                      <div className="text-xs text-muted-foreground">
                        الفترة: {req.periodStart ? formatDate(req.periodStart) : "؟"} —{" "}
                        {req.periodEnd ? formatDate(req.periodEnd) : "؟"}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1.5">
                      <Select
                        value={req.status}
                        onValueChange={(v) =>
                          updateRequirement(
                            req.id,
                            { status: v, manualOverride: true },
                            "تم تعديل الحالة يدوياً",
                          )
                        }
                        disabled={busyId === req.id}
                      >
                        <SelectTrigger className="w-44" size="sm">
                          <SelectValue>
                            <StatusBadge status={req.status as RequirementStatus} />
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {REQUIREMENT_STATUSES.filter((s) => s !== "NOT_ANALYZED").map(
                            (s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_SELECT_LABEL[s]}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                      {req.manualOverride && (
                        <button
                          type="button"
                          onClick={() =>
                            updateRequirement(req.id, {
                              manualOverride: false,
                              status: "NOT_ANALYZED",
                            })
                          }
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <RotateCcw className="size-3" />
                          تعديل يدوي — إعادة للتحليل التلقائي
                        </button>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="align-top">
                    {req.matches.length === 0 ? (
                      <span className="text-xs text-muted-foreground">لا يوجد</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {req.matches.map((m) => (
                          <Tooltip key={m.id}>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="w-fit max-w-56 justify-start gap-1 truncate font-normal"
                              >
                                <Paperclip className="size-3 shrink-0" />
                                <span className="truncate">{m.document.fileName}</span>
                                <span className="shrink-0 text-muted-foreground">
                                  {Math.round(m.confidence * 100)}%
                                </span>
                              </Badge>
                            </TooltipTrigger>
                            {m.reasoning && (
                              <TooltipContent className="max-w-xs">
                                {m.reasoning}
                                {m.pageRefs ? ` (صفحات: ${m.pageRefs})` : ""}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ))}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1.5">
                      {req.aiNotes && (
                        <div className="flex items-start gap-1 text-xs text-muted-foreground">
                          <Info className="mt-0.5 size-3 shrink-0" />
                          <span>{req.aiNotes}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-1">
                        <Pencil className="mt-2 size-3 shrink-0 text-muted-foreground" />
                        <Textarea
                          placeholder="ملاحظة يدوية (اختياري)"
                          defaultValue={req.overrideNotes ?? ""}
                          className="min-h-8 text-xs"
                          rows={1}
                          onChange={(e) =>
                            setNotesDraft((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          onBlur={(e) => {
                            if (notesDraft[req.id] === undefined) return;
                            if (e.target.value === (req.overrideNotes ?? "")) return;
                            updateRequirement(req.id, {
                              overrideNotes: e.target.value || null,
                            });
                          }}
                        />
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="align-top">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busyId === req.id}
                      onClick={() => deleteRequirement(req.id)}
                    >
                      {busyId === req.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4 text-destructive" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
