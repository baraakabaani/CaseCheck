"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FileText, Plus, X, Quote } from "lucide-react";
import { ProvenanceField } from "@/components/ProvenanceBadge";
import { REPORT_TASK_FIELD_LABELS } from "@/lib/case-hub-labels";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import { nextProvenance } from "@/lib/reports/provenance";
import type { ProvenanceState } from "@/lib/hub-schemas";
import type { CourtReportTaskDetail, DocumentDetail } from "@/lib/queries";

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

type QuoteTargetField = "claimantPosition" | "respondentPosition" | "forensicAnalysis";

export function ReportTaskSection({
  caseId,
  task,
  documents,
  onChanged,
}: {
  caseId: string;
  task: CourtReportTaskDetail;
  documents: DocumentDetail[];
  onChanged: () => void;
}) {
  const documentById = new Map(documents.map((d) => [d.id, d]));
  const linkedDocumentIds = safeParseJson<string[]>(task.linkedDocumentIds, []);
  const exhibitLinks = safeParseJson<{ documentId: string; via: string; sourceLabel: string }[]>(
    task.exhibitLinksJson,
    [],
  );
  const exhibitLinkByDocId = new Map(exhibitLinks.map((l) => [l.documentId, l]));

  const [fields, setFields] = useState({
    claimantPosition: task.claimantPosition ?? "",
    respondentPosition: task.respondentPosition ?? "",
    forensicAnalysis: task.forensicAnalysis ?? "",
    expertVerdict: task.expertVerdict ?? "",
  });
  const [claimantAmount, setClaimantAmount] = useState(task.claimantAmount?.toString() ?? "");
  const [respondentOffset, setRespondentOffset] = useState(task.respondentOffset?.toString() ?? "");
  const [amountNote, setAmountNote] = useState(task.amountNote ?? "");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [addDocId, setAddDocId] = useState("");
  const [quoteDialogDocId, setQuoteDialogDocId] = useState<string | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<QuoteTargetField>("forensicAnalysis");
  const quoteTextareaRef = useRef<HTMLTextAreaElement>(null);

  async function patchTask(body: Record<string, unknown>) {
    const res = await fetch(`/api/cases/${caseId}/court-report/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...buildClientApiKeyHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل حفظ التعديل");
    return data.task as CourtReportTaskDetail;
  }

  async function saveField(field: keyof typeof fields, provenanceField: string) {
    setSavingField(field);
    try {
      // تعديل نص من الخبير يُعتمَد تلقائياً — لا حاجة لحالة سابقة، EDIT
      // ينتج EXPERT_CERTIFIED دوماً (انظر lib/reports/provenance.ts).
      await patchTask({ [field]: fields[field], [provenanceField]: nextProvenance("AI_DRAFT", "EDIT") });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ التعديل");
    } finally {
      setSavingField(null);
    }
  }

  async function certifyField(field: keyof typeof fields, provenanceField: string) {
    setSavingField(field);
    try {
      await patchTask({ [field]: fields[field], [provenanceField]: "EXPERT_CERTIFIED" });
      toast.success("تم اعتماد الفقرة");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الاعتماد");
    } finally {
      setSavingField(null);
    }
  }

  async function saveAmounts() {
    setSavingField("amounts");
    try {
      await patchTask({
        claimantAmount: claimantAmount.trim() ? Number(claimantAmount) : null,
        respondentOffset: respondentOffset.trim() ? Number(respondentOffset) : null,
        amountNote: amountNote.trim() || null,
      });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ المبالغ");
    } finally {
      setSavingField(null);
    }
  }

  async function addExhibit() {
    if (!addDocId) return;
    try {
      await patchTask({ linkedDocumentIds: [...linkedDocumentIds, addDocId] });
      toast.success("تمت إضافة المستند");
      setAddDocId("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة المستند");
    }
  }

  async function removeExhibit(docId: string) {
    try {
      await patchTask({ linkedDocumentIds: linkedDocumentIds.filter((id) => id !== docId) });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إزالة المستند");
    }
  }

  async function insertQuote() {
    const textarea = quoteTextareaRef.current;
    const doc = quoteDialogDocId ? documentById.get(quoteDialogDocId) : null;
    if (!textarea || !doc) return;
    const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).trim();
    if (!selected) {
      toast.error("حدد جزءاً من النص أولاً");
      return;
    }
    const citation = `«${selected}» (المستند: ${doc.fileName})`;
    const currentValue = fields[quoteTarget];
    const nextValue = currentValue ? `${currentValue}\n\n${citation}` : citation;
    const provenanceField = `${quoteTarget}Provenance`;
    const currentProvenance = (task as unknown as Record<string, ProvenanceState>)[provenanceField] ?? "AI_DRAFT";

    setFields((prev) => ({ ...prev, [quoteTarget]: nextValue }));
    try {
      await patchTask({ [quoteTarget]: nextValue, [provenanceField]: nextProvenance(currentProvenance, "INSERT_QUOTE") });
      toast.success("تم إدراج الاقتباس");
      setQuoteDialogDocId(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إدراج الاقتباس");
    }
  }

  const availableDocuments = documents.filter((d) => !linkedDocumentIds.includes(d.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border-e-4 border-e-muted-foreground/40 border bg-muted/20 p-3">
        <Label className="mb-1 block text-xs text-muted-foreground">{REPORT_TASK_FIELD_LABELS.taskText}</Label>
        <p className="text-sm font-medium leading-6">{task.taskText}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ProvenanceField
          label={REPORT_TASK_FIELD_LABELS.claimantPosition}
          value={fields.claimantPosition}
          provenance={task.claimantPositionProvenance as ProvenanceState}
          onChange={(v) => setFields((p) => ({ ...p, claimantPosition: v }))}
          onBlurSave={() => saveField("claimantPosition", "claimantPositionProvenance")}
          saving={savingField === "claimantPosition"}
        />
        <ProvenanceField
          label={REPORT_TASK_FIELD_LABELS.respondentPosition}
          value={fields.respondentPosition}
          provenance={task.respondentPositionProvenance as ProvenanceState}
          onChange={(v) => setFields((p) => ({ ...p, respondentPosition: v }))}
          onBlurSave={() => saveField("respondentPosition", "respondentPositionProvenance")}
          saving={savingField === "respondentPosition"}
        />
      </div>

      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-sm font-medium">{REPORT_TASK_FIELD_LABELS.linkedExhibits}</Label>
        </div>
        {linkedDocumentIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد مستندات مرتبطة بهذه المهمة — أضفها يدوياً.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {linkedDocumentIds.map((docId) => {
              const doc = documentById.get(docId);
              const link = exhibitLinkByDocId.get(docId);
              if (!doc) return null;
              return (
                <li key={docId} className="flex flex-wrap items-center gap-2 rounded border bg-card px-2 py-1.5 text-sm">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{doc.fileName}</span>
                  <Badge variant="outline" className="font-normal">
                    {link?.via === "REQUIREMENT"
                      ? `عبر متطلب: ${link.sourceLabel}`
                      : link?.via === "DEMAND"
                        ? `عبر مطالبة: ${link.sourceLabel}`
                        : link?.via === "HEURISTIC_LABEL"
                          ? "ربط مقترح تلقائياً"
                          : "أُضيف يدوياً"}
                  </Badge>
                  <div className="ms-auto flex gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setQuoteDialogDocId(docId)}>
                      <Quote className="size-3.5" />
                      إدراج اقتباس
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeExhibit(docId)}>
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {availableDocuments.length > 0 && (
          <div className="mt-2 flex gap-2">
            <Select value={addDocId} onValueChange={setAddDocId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="إضافة مستند آخر من ملف الدعوى..." />
              </SelectTrigger>
              <SelectContent>
                {availableDocuments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.fileName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={addExhibit} disabled={!addDocId}>
              <Plus className="size-4" />
              إضافة
            </Button>
          </div>
        )}
      </div>

      <ProvenanceField
        label={REPORT_TASK_FIELD_LABELS.forensicAnalysis}
        value={fields.forensicAnalysis}
        provenance={task.forensicAnalysisProvenance as ProvenanceState}
        rows={8}
        onChange={(v) => setFields((p) => ({ ...p, forensicAnalysis: v }))}
        onBlurSave={() => saveField("forensicAnalysis", "forensicAnalysisProvenance")}
        saving={savingField === "forensicAnalysis"}
      />

      <ProvenanceField
        label={REPORT_TASK_FIELD_LABELS.missingDocsImpact}
        value={task.missingDocsImpact ?? ""}
        provenance="EXTRACT"
        readOnly
      />

      <div className="rounded-md border p-3">
        <Label className="mb-2 block text-sm font-medium">الأرقام المعتمدة لهذه المهمة (درهم)</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">مطالبة المدعي</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={claimantAmount}
              onChange={(e) => setClaimantAmount(e.target.value)}
              onBlur={saveAmounts}
              placeholder="اتركه فارغاً إن لم تكن المهمة مالية"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">خصم/مقاصة المدعى عليه</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={respondentOffset}
              onChange={(e) => setRespondentOffset(e.target.value)}
              onBlur={saveAmounts}
              placeholder="اتركه فارغاً إن لم تكن المهمة مالية"
            />
          </div>
        </div>
        <div className="mt-3">
          <Label className="mb-1 block text-xs text-muted-foreground">سند الرقم (المستند/أساس الاحتساب)</Label>
          <Input value={amountNote} onChange={(e) => setAmountNote(e.target.value)} onBlur={saveAmounts} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          ترك الحقلين فارغَين يستبعد هذه المهمة من جدول تصفية الحساب.
        </p>
      </div>

      <ProvenanceField
        label={REPORT_TASK_FIELD_LABELS.expertVerdict}
        value={fields.expertVerdict}
        provenance={task.expertVerdictProvenance as ProvenanceState}
        rows={6}
        onChange={(v) => setFields((p) => ({ ...p, expertVerdict: v }))}
        onBlurSave={() => saveField("expertVerdict", "expertVerdictProvenance")}
        onCertify={() => certifyField("expertVerdict", "expertVerdictProvenance")}
        certifyLabel="اعتماد رأي الخبرة"
        saving={savingField === "expertVerdict"}
      />
      {task.expertVerdictProvenance !== "EXPERT_CERTIFIED" && (
        <p className="rounded-md bg-purple-50 px-3 py-2 text-xs text-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
          هذه الفقرة مسودة ولم تُعتمد بعد — التصدير واعتماد التقرير محجوبان حتى اعتماد «رأي الخبرة» في كل مهمة.
        </p>
      )}

      <Dialog open={quoteDialogDocId !== null} onOpenChange={(open) => !open && setQuoteDialogDocId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>إدراج اقتباس من المستند</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">إدراج في</Label>
              <Select value={quoteTarget} onValueChange={(v) => setQuoteTarget(v as QuoteTargetField)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claimantPosition">{REPORT_TASK_FIELD_LABELS.claimantPosition}</SelectItem>
                  <SelectItem value="respondentPosition">{REPORT_TASK_FIELD_LABELS.respondentPosition}</SelectItem>
                  <SelectItem value="forensicAnalysis">{REPORT_TASK_FIELD_LABELS.forensicAnalysis}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">
                حدّد بالماوس الجزء المطلوب اقتباسه من نص المستند أدناه
              </Label>
              <Textarea
                ref={quoteTextareaRef}
                readOnly
                rows={12}
                className="font-mono text-xs"
                value={
                  (quoteDialogDocId && documentById.get(quoteDialogDocId)?.extractedText) ||
                  "تعذر استخراج نص من هذا المستند."
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQuoteDialogDocId(null)}>
              إلغاء
            </Button>
            <Button type="button" onClick={insertQuote}>
              <Quote className="size-4" />
              إدراج المحدَّد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
