"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Quote } from "lucide-react";
import { ProvenanceField, ProvenanceBadge } from "@/components/ProvenanceBadge";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import { nextProvenance } from "@/lib/reports/provenance";
import { CASE_PARTY_ROLE_LABELS } from "@/lib/case-intake-labels";
import { toDateInputValue } from "@/lib/format";
import type { ProvenanceState, ReportObjectionPartyRole } from "@/lib/hub-schemas";
import type { CourtReportDetail, CourtReportTaskDetail, ReportObjectionDetail } from "@/lib/queries";

/** سابعاً: عرض التقرير المبدئي على الأطراف — تسجيل تاريخ العرض والموعد
 * النهائي للاعتراض، ثم اعتراض/رد لكل طرف. objectionText يُدخَله الخبير
 * اقتباساً حرفياً (EXTRACT بالافتراض من الخادم)، فلا زر اعتماد له هنا — هو
 * أصلاً "منقول من الملف"؛ الرد وحده يحتاج مراجعة واعتماد الخبير. */
export function ReportObjectionsPanel({
  caseId,
  report,
  tasks,
  onChanged,
}: {
  caseId: string;
  report: NonNullable<CourtReportDetail>;
  tasks: CourtReportTaskDetail[];
  onChanged: () => void;
}) {
  const objections = report.objections ?? [];
  const [sharedAt, setSharedAt] = useState(toDateInputValue(report.preliminaryReportSharedAt));
  const [deadline, setDeadline] = useState(toDateInputValue(report.objectionsDeadline));
  const [intro, setIntro] = useState(report.objectionsIntro ?? "");
  const [savingHeader, setSavingHeader] = useState(false);

  async function saveHeader() {
    setSavingHeader(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/court-report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...buildClientApiKeyHeaders() },
        body: JSON.stringify({
          preliminaryReportSharedAt: sharedAt ? new Date(sharedAt).toISOString() : null,
          objectionsDeadline: deadline ? new Date(deadline).toISOString() : null,
          objectionsIntro: intro,
          ...(intro.trim() ? { objectionsIntroProvenance: nextProvenance("AI_DRAFT", "EDIT") } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSavingHeader(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">تاريخ عرض التقرير المبدئي على الأطراف</Label>
              <Input type="date" value={sharedAt} onChange={(e) => setSharedAt(e.target.value)} onBlur={saveHeader} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">الموعد النهائي لتقديم الاعتراضات</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} onBlur={saveHeader} />
            </div>
          </div>
          <ProvenanceField
            label="مقدمة عرض التقرير المبدئي"
            value={intro}
            provenance={(report.objectionsIntroProvenance ?? "AI_DRAFT") as ProvenanceState}
            rows={3}
            onChange={setIntro}
            onBlurSave={saveHeader}
            saving={savingHeader}
          />
        </CardContent>
      </Card>

      <AddObjectionForm caseId={caseId} tasks={tasks} onAdded={onChanged} />

      {objections.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد اعتراضات مسجَّلة بعد.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {objections.map((o, i) => (
            <ObjectionCard key={o.id} caseId={caseId} objection={o} index={i} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddObjectionForm({
  caseId,
  tasks,
  onAdded,
}: {
  caseId: string;
  tasks: CourtReportTaskDetail[];
  onAdded: () => void;
}) {
  const [partyRole, setPartyRole] = useState<ReportObjectionPartyRole>("CLAIMANT");
  const [label, setLabel] = useState("");
  const [memoDate, setMemoDate] = useState("");
  const [text, setText] = useState("");
  const [linkedTaskIndex, setLinkedTaskIndex] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!label.trim() || !text.trim()) {
      toast.error("صفة مقدّم الاعتراض ونص الاعتراض مطلوبان");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/court-report/objections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildClientApiKeyHeaders() },
        body: JSON.stringify({
          partyRole,
          submittedOnBehalfOfLabel: label,
          objectionMemoDate: memoDate ? new Date(memoDate).toISOString() : null,
          objectionText: text,
          linkedTaskIndex: linkedTaskIndex === "none" ? null : Number(linkedTaskIndex),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تسجيل الاعتراض");
      toast.success("تم تسجيل الاعتراض");
      setLabel("");
      setMemoDate("");
      setText("");
      setLinkedTaskIndex("none");
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تسجيل الاعتراض");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <Label className="text-sm font-medium">تسجيل اعتراض جديد</Label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">مقدَّم من</Label>
            <Select value={partyRole} onValueChange={(v) => setPartyRole(v as ReportObjectionPartyRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLAIMANT">{CASE_PARTY_ROLE_LABELS.CLAIMANT}</SelectItem>
                <SelectItem value="RESPONDENT">{CASE_PARTY_ROLE_LABELS.RESPONDENT}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">الصفة (مثال: وكيل المدعيين)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">تاريخ مذكرة الاعتراض</Label>
            <Input type="date" value={memoDate} onChange={(e) => setMemoDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">مهمة مرتبطة (اختياري)</Label>
          <Select value={linkedTaskIndex} onValueChange={setLinkedTaskIndex}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بلا ربط بمهمة محددة</SelectItem>
              {tasks.map((t) => (
                <SelectItem key={t.id} value={String(t.taskIndex)}>
                  مهمة {t.taskIndex + 1}: {t.taskText.slice(0, 50)}
                  {t.taskText.length > 50 ? "…" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">نص الاعتراض (اقتباس حرفي من المذكرة)</Label>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Button type="button" onClick={submit} disabled={saving} className="self-start">
          <Plus className="size-4" />
          تسجيل الاعتراض
        </Button>
      </CardContent>
    </Card>
  );
}

function ObjectionCard({
  caseId,
  objection,
  index,
  onChanged,
}: {
  caseId: string;
  objection: ReportObjectionDetail;
  index: number;
  onChanged: () => void;
}) {
  const [responseText, setResponseText] = useState(objection.responseText ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function patchObjection(body: Record<string, unknown>) {
    const res = await fetch(`/api/cases/${caseId}/court-report/objections/${objection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...buildClientApiKeyHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل الحفظ");
    return data.objection as ReportObjectionDetail;
  }

  async function saveResponse() {
    setSaving(true);
    try {
      const isEmpty = !responseText.trim();
      await patchObjection({
        responseText,
        ...(isEmpty ? {} : { responseProvenance: nextProvenance("AI_DRAFT", "EDIT") }),
      });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ الرد");
    } finally {
      setSaving(false);
    }
  }

  async function certifyResponse() {
    if (!responseText.trim()) {
      toast.error("لا يمكن اعتماد رد فارغ — اكتب رد الخبير أولاً");
      return;
    }
    setSaving(true);
    try {
      await patchObjection({ responseText, responseProvenance: "EXPERT_CERTIFIED" });
      toast.success("تم اعتماد الرد");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الاعتماد");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/court-report/objections/${objection.id}`, {
        method: "DELETE",
        headers: buildClientApiKeyHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحذف");
      toast.success("تم حذف الاعتراض");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحذف");
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              الاعتراض {index + 1} — {CASE_PARTY_ROLE_LABELS[objection.partyRole as "CLAIMANT" | "RESPONDENT"]} (
              {objection.submittedOnBehalfOfLabel})
            </span>
            <ProvenanceBadge state={objection.objectionProvenance as ProvenanceState} short />
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>

        <div className="rounded-md border border-e-4 border-e-emerald-500 bg-card p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Quote className="size-3.5" />
            نص الاعتراض (منقول حرفياً من المذكرة)
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6">{objection.objectionText}</p>
        </div>

        <ProvenanceField
          label="رد الخبير على الاعتراض"
          value={responseText}
          provenance={objection.responseProvenance as ProvenanceState}
          rows={4}
          onChange={setResponseText}
          onBlurSave={saveResponse}
          onCertify={certifyResponse}
          certifyLabel="اعتماد الرد"
          saving={saving}
        />
      </CardContent>
    </Card>
  );
}
