"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Trash2,
  MapPin,
  CheckCircle2,
  CircleDashed,
  Mail,
  FileDown,
  Copy,
  Paperclip,
  FileText,
  Sparkles,
  Save,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { buildEmailDocxBlob, buildSiteInspectionReportDocxBlob, downloadBlob } from "@/lib/docx-export";
import { CASE_READINESS_STATUS_LABELS } from "@/lib/case-hub-labels";
import type { CaseDetail } from "@/lib/queries";
import type { CaseReadinessStatus } from "@/lib/schemas";

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// 4 أعمدة موحّدة (تطابق التسمية الأصلية بالضبط) تجمع بين قائمة المتطلبات
// (الموديول 1) ومطالبات المستندات الناتجة عن الاجتماعات (الموديول 2) في
// لوحة تتبّع واحدة.
type BoardColumn = "REQUESTED" | "PARTIAL" | "OVERDUE" | "DONE";

const COLUMN_META: Record<BoardColumn, { title: string; accent: string }> = {
  REQUESTED: { title: "مطلوبة", accent: "border-t-[#c8102e]" },
  PARTIAL: { title: "مستلمة جزئياً", accent: "border-t-amber-400" },
  OVERDUE: { title: "تخلف عن التقديم", accent: "border-t-[#a00c24]" },
  DONE: { title: "مكتملة ومطابقة", accent: "border-t-primary" },
};

interface BoardItem {
  key: string;
  kind: "requirement" | "demand";
  id: string;
  label: string;
  relatedTask: string | null;
  column: BoardColumn;
  deadline: Date | null;
}

export function Module3Hub({ caseDetail }: { caseDetail: CaseDetail }) {
  const router = useRouter();
  function refresh() {
    router.refresh();
  }

  const mandateTasks = safeParseJson<string[]>(caseDetail.analyses[0]?.mandateTasks, []);

  const boardItems: BoardItem[] = useMemo(() => {
    const now = new Date();
    const fromRequirements: BoardItem[] = caseDetail.requirements.map((r) => ({
      key: `req:${r.id}`,
      kind: "requirement",
      id: r.id,
      label: r.labelAr,
      relatedTask: r.relatedTask,
      deadline: null,
      column:
        r.status === "PROVIDED"
          ? "DONE"
          : r.status === "PARTIALLY_PROVIDED"
            ? "PARTIAL"
            : "REQUESTED",
    }));

    const fromDemands: BoardItem[] = caseDetail.documentDemands.map((d) => {
      const deadline = new Date(d.deadline);
      const overdue = d.status !== "RECEIVED" && deadline < now;
      return {
        key: `demand:${d.id}`,
        kind: "demand",
        id: d.id,
        label: d.item,
        relatedTask: d.relatedTask,
        deadline,
        column: overdue
          ? "OVERDUE"
          : d.status === "RECEIVED"
            ? "DONE"
            : d.status === "PARTIALLY_RECEIVED"
              ? "PARTIAL"
              : "REQUESTED",
      };
    });

    return [...fromRequirements, ...fromDemands];
  }, [caseDetail.requirements, caseDetail.documentDemands]);

  const columns = (Object.keys(COLUMN_META) as BoardColumn[]).map((key) => ({
    key,
    ...COLUMN_META[key],
    items: boardItems.filter((it) => it.column === key),
  }));

  const totalItems = boardItems.length;
  const doneItems = boardItems.filter((it) => it.column === "DONE").length;
  const overdueCount = boardItems.filter((it) => it.column === "OVERDUE").length;

  return (
    <div className="flex flex-col gap-6">
      <ReadinessCard caseId={caseDetail.id} caseDetail={caseDetail} onChanged={refresh} />

      <Card>
        <CardHeader>
          <CardTitle>متابعة استيفاء المستندات</CardTitle>
        </CardHeader>
        <CardContent>
          {totalItems > 0 && (
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {doneItems} / {totalItems} مكتمل
                </span>
                {overdueCount > 0 && (
                  <span className="text-[#c8102e]">{overdueCount} بند متأخر</span>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${totalItems > 0 ? (doneItems / totalItems) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {columns.map((col) => (
              <div
                key={col.key}
                className={`rounded-md border border-t-4 ${col.accent} bg-muted/30 p-3`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{col.title}</span>
                  <Badge variant="secondary">{col.items.length}</Badge>
                </div>
                <div className="flex flex-col gap-2">
                  {col.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">لا يوجد</p>
                  ) : (
                    col.items.map((it) => (
                      <BoardCard key={it.key} item={it} caseId={caseDetail.id} onChanged={refresh} />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <QuickAddDemandCard caseDetail={caseDetail} mandateTasks={mandateTasks} onChanged={refresh} />

      {overdueCount > 0 && <OverdueReminderCard caseDetail={caseDetail} />}

      <SiteInspectionsCard caseDetail={caseDetail} onChanged={refresh} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// علامة جاهزية الملف للدراسة
// ---------------------------------------------------------------------------
function ReadinessCard({
  caseId,
  caseDetail,
  onChanged,
}: {
  caseId: string;
  caseDetail: CaseDetail;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const status = caseDetail.readinessStatus as CaseReadinessStatus;
  const ready = status === "READY_FOR_STUDY";

  async function toggle() {
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readinessStatus: ready ? "NEEDS_MORE_WORK" : "READY_FOR_STUDY" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل التحديث");
      toast.success(ready ? "تم إلغاء علامة الجاهزية" : "تم تعليم الملف كجاهز للدراسة");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحديث");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <Badge
          variant="outline"
          className={
            ready
              ? "gap-1 border-primary/30 bg-primary/10 text-primary"
              : "gap-1 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400"
          }
        >
          {ready ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
          {CASE_READINESS_STATUS_LABELS[status]}
        </Badge>
        <Button variant="outline" size="sm" onClick={toggle} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : ready ? (
            <CircleDashed className="size-4" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          {ready ? "إلغاء علامة الجاهزية" : "تعليم الملف جاهزاً للدراسة"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// بطاقة عنصر في اللوحة — أدوات نقل بالنقر (بديل السحب والإفلات).
// ---------------------------------------------------------------------------
function BoardCard({
  item,
  caseId,
  onChanged,
}: {
  item: BoardItem;
  caseId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState("");

  const options: { value: string; label: string }[] =
    item.kind === "requirement"
      ? [
          { value: "MISSING", label: COLUMN_META.REQUESTED.title },
          { value: "PARTIALLY_PROVIDED", label: COLUMN_META.PARTIAL.title },
          { value: "PROVIDED", label: COLUMN_META.DONE.title },
        ]
      : [
          { value: "PENDING", label: COLUMN_META.REQUESTED.title },
          { value: "PARTIALLY_RECEIVED", label: COLUMN_META.PARTIAL.title },
          { value: "RECEIVED", label: COLUMN_META.DONE.title },
        ];

  const currentValue =
    item.kind === "requirement"
      ? item.column === "DONE"
        ? "PROVIDED"
        : item.column === "PARTIAL"
          ? "PARTIALLY_PROVIDED"
          : "MISSING"
      : item.column === "DONE"
        ? "RECEIVED"
        : item.column === "PARTIAL"
          ? "PARTIALLY_RECEIVED"
          : "PENDING";

  async function handleMove(value: string) {
    setBusy(true);
    try {
      const url =
        item.kind === "requirement"
          ? `/api/cases/${caseId}/requirements/${item.id}`
          : `/api/cases/${caseId}/document-demands/${item.id}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل التحديث");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحديث");
    } finally {
      setBusy(false);
    }
  }

  async function handleExtendDeadline() {
    if (!deadlineDraft) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/document-demands/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadline: new Date(deadlineDraft).toISOString() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل تحديث الموعد");
      toast.success("تم تمديد الموعد النهائي");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تحديث الموعد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border bg-card p-2 text-xs">
      <div className="font-medium text-foreground">{item.label}</div>
      {item.relatedTask && (
        <Badge variant="outline" className="mt-1 text-[10px]">
          {item.relatedTask}
        </Badge>
      )}
      {item.deadline && (
        <div className="mt-1 text-muted-foreground">الموعد النهائي: {formatDate(item.deadline)}</div>
      )}
      <Select value={currentValue} onValueChange={handleMove} disabled={busy}>
        <SelectTrigger className="mt-1.5 h-7 w-full text-[11px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {item.column === "OVERDUE" && (
        <div className="mt-1.5 flex gap-1">
          <Input
            type="date"
            className="h-7 text-[11px]"
            value={deadlineDraft}
            onChange={(e) => setDeadlineDraft(e.target.value)}
          />
          <Button size="sm" className="h-7 px-2 text-[11px]" onClick={handleExtendDeadline} disabled={busy || !deadlineDraft}>
            تمديد
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// إضافة مطالبة مستند مباشرة من الموديول 3 (وليس فقط من غرفة الاجتماع).
// ---------------------------------------------------------------------------
function QuickAddDemandCard({
  caseDetail,
  mandateTasks,
  onChanged,
}: {
  caseDetail: CaseDetail;
  mandateTasks: string[];
  onChanged: () => void;
}) {
  const caseId = caseDetail.id;
  const [item, setItem] = useState("");
  const [deadline, setDeadline] = useState("");
  const [relatedTask, setRelatedTask] = useState<string>("");
  const [selectedParties, setSelectedParties] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggleParty(id: string) {
    setSelectedParties((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (!item.trim() || !deadline) {
      toast.error("الرجاء تعبئة اسم المستند والموعد النهائي");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/document-demands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: item.trim(),
          requestedFromPartyIds: Array.from(selectedParties),
          deadline: new Date(deadline).toISOString(),
          relatedTask: relatedTask || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل إضافة المطالبة");
      setItem("");
      setDeadline("");
      setRelatedTask("");
      setSelectedParties(new Set());
      toast.success("تمت إضافة المطالبة");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة المطالبة");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>إضافة مطالبة مستند</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qaItem">المستند المطلوب</Label>
          <Input id="qaItem" value={item} onChange={(e) => setItem(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qaDeadline">الموعد النهائي</Label>
          <Input id="qaDeadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        {mandateTasks.length > 0 && (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>المهمة المرتبطة (اختياري)</Label>
            <Select value={relatedTask || "__none"} onValueChange={(v) => setRelatedTask(v === "__none" ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">بدون تحديد</SelectItem>
                {mandateTasks.map((t, i) => (
                  <SelectItem key={i} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>من (طرف أو أكثر)</Label>
          <div className="flex flex-wrap gap-3">
            {caseDetail.parties.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-sm">
                <Checkbox checked={selectedParties.has(p.id)} onCheckedChange={() => toggleParty(p.id)} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            إضافة مطالبة
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// خطاب تذكير بالمطالبات المتأخرة — يعيد استخدام محرك خطاب المستندات
// الناقصة (lib/email-templates.ts) دون أي تعديل.
// ---------------------------------------------------------------------------
function OverdueReminderCard({ caseDetail }: { caseDetail: CaseDetail }) {
  const caseId = caseDetail.id;
  const [generating, setGenerating] = useState(false);
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [tone, setTone] = useState<"FORMAL" | "URGENT" | "FRIENDLY_REMINDER">("URGENT");
  const [draft, setDraft] = useState<{ subject: string; bodyAr: string } | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/document-demands/reminder-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadlineDays, tone, extraInstructions: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إنشاء خطاب التذكير");
      setDraft(data.draft);
      if (data.warning) toast.warning(data.warning);
      else if (data.mode === "OFFLINE") toast.success("تم إنشاء خطاب من القالب الاحتياطي (بدون مفتاح API)");
      else toast.success("تم إنشاء خطاب التذكير بالذكاء الاصطناعي");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إنشاء خطاب التذكير");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!draft) return;
    await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.bodyAr}`);
    toast.success("تم نسخ النص إلى الحافظة");
  }

  async function handleDownload() {
    if (!draft) return;
    const blob = await buildEmailDocxBlob({ subject: draft.subject, bodyAr: draft.bodyAr });
    downloadBlob(blob, `خطاب-تذكير-${caseDetail.caseNumber}.docx`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>خطاب تذكير بالمطالبات المتأخرة</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reminderDays">مهلة الرد (أيام)</Label>
            <Input
              id="reminderDays"
              type="number"
              min={1}
              max={90}
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(Number(e.target.value) || 7)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>نبرة الخطاب</Label>
            <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FORMAL">رسمي</SelectItem>
                <SelectItem value="URGENT">رسمي مستعجل</SelectItem>
                <SelectItem value="FRIENDLY_REMINDER">تذكير ودي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleGenerate} disabled={generating} className="w-fit">
          {generating ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
          توليد خطاب تذكير
        </Button>

        {draft && (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-4">
            <div className="font-semibold">{draft.subject}</div>
            <div className="whitespace-pre-wrap text-sm leading-7">{draft.bodyAr}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="size-4" />
                نسخ النص
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <FileDown className="size-4" />
                تنزيل Word
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// الانتقال والمعاينة الميدانية
// ---------------------------------------------------------------------------
function SiteInspectionsCard({
  caseDetail,
  onChanged,
}: {
  caseDetail: CaseDetail;
  onChanged: () => void;
}) {
  const caseId = caseDetail.id;
  const [visitDate, setVisitDate] = useState("");
  const [location, setLocation] = useState("");
  const [purpose, setPurpose] = useState("");
  const [attendees, setAttendees] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    if (!visitDate || !location.trim() || !purpose.trim()) {
      toast.error("الرجاء تعبئة تاريخ الزيارة والموقع والغرض منها");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/site-inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitDate: new Date(visitDate).toISOString(),
          location: location.trim(),
          purpose: purpose.trim(),
          attendees: attendees
            .split("\n")
            .map((a) => a.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تسجيل زيارة المعاينة");
      setVisitDate("");
      setLocation("");
      setPurpose("");
      setAttendees("");
      toast.success("تم تسجيل زيارة المعاينة");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تسجيل زيارة المعاينة");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(inspectionId: string) {
    setDeletingId(inspectionId);
    try {
      const res = await fetch(`/api/cases/${caseId}/site-inspections/${inspectionId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل الحذف");
      toast.success("تم حذف سجل المعاينة");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحذف");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>الانتقال والمعاينة الميدانية</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {caseDetail.siteInspections.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد زيارات معاينة مسجَّلة بعد</p>
        ) : (
          <div className="flex flex-col gap-3">
            {caseDetail.siteInspections.map((visit) => (
              <SiteInspectionRow
                key={visit.id}
                caseId={caseId}
                caseDetail={caseDetail}
                visit={visit}
                deleting={deletingId === visit.id}
                onDelete={() => handleDelete(visit.id)}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="visitDate">تاريخ الزيارة</Label>
            <Input
              id="visitDate"
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">الموقع</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="purpose">الغرض من الزيارة</Label>
            <Input id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="attendees">الحاضرون (سطر لكل اسم)</Label>
            <Textarea
              id="attendees"
              rows={2}
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              تسجيل زيارة معاينة
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SiteInspectionRow({
  caseId,
  caseDetail,
  visit,
  deleting,
  onDelete,
  onChanged,
}: {
  caseId: string;
  caseDetail: CaseDetail;
  visit: CaseDetail["siteInspections"][number];
  deleting: boolean;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const [equipmentReviewed, setEquipmentReviewed] = useState(visit.equipmentReviewed ?? "");
  const [booksReviewed, setBooksReviewed] = useState(visit.booksReviewed ?? "");
  const [notes, setNotes] = useState(visit.notes ?? "");
  const [savingFields, setSavingFields] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [testimonyName, setTestimonyName] = useState("");
  const [testimonyRole, setTestimonyRole] = useState("");
  const [testimonyText, setTestimonyText] = useState("");
  const [addingTestimony, setAddingTestimony] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const attendeesList = safeParseJson<string[]>(visit.attendees, []);
  const attachmentIds = safeParseJson<string[]>(visit.attachmentDocumentIds, []);
  const documentById = new Map(caseDetail.documents.map((d) => [d.id, d]));

  async function saveFields() {
    setSavingFields(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/site-inspections/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentReviewed: equipmentReviewed.trim() || null,
          booksReviewed: booksReviewed.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل الحفظ");
      toast.success("تم حفظ بيانات المعاينة");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSavingFields(false);
    }
  }

  async function handleAttach(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("files", file);
      fd.append("docCategory", "OTHER_JUDICIAL");
      const uploadRes = await fetch(`/api/cases/${caseId}/documents`, { method: "POST", body: fd });
      const uploadData = await uploadRes.json();
      const uploaded = uploadData.results?.[0];
      if (!uploadRes.ok || !uploaded?.document) throw new Error(uploaded?.error || "فشل رفع المرفق");

      const res = await fetch(`/api/cases/${caseId}/site-inspections/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentDocumentIds: [...attachmentIds, uploaded.document.id] }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل ربط المرفق");
      toast.success("تم إرفاق الملف");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إرفاق الملف");
    } finally {
      setUploading(false);
    }
  }

  async function handleAddTestimony() {
    if (!testimonyName.trim() || !testimonyText.trim()) {
      toast.error("الرجاء إدخال اسم صاحب الإفادة ونصها");
      return;
    }
    setAddingTestimony(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/site-inspections/${visit.id}/testimonies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personName: testimonyName.trim(),
          personRole: testimonyRole.trim() || null,
          statementText: testimonyText.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل إضافة الإفادة");
      setTestimonyName("");
      setTestimonyRole("");
      setTestimonyText("");
      toast.success("تمت إضافة الإفادة");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة الإفادة");
    } finally {
      setAddingTestimony(false);
    }
  }

  async function handleDeleteTestimony(testimonyId: string) {
    try {
      const res = await fetch(
        `/api/cases/${caseId}/site-inspections/${visit.id}/testimonies/${testimonyId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error((await res.json()).error || "فشل الحذف");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحذف");
    }
  }

  async function handleGenerateReport() {
    setGeneratingReport(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/site-inspections/${visit.id}/report`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل توليد المحضر");
      toast.success("تم توليد مسودة المحضر");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل توليد المحضر");
    } finally {
      setGeneratingReport(false);
    }
  }

  async function handleExportReport() {
    if (!visit.visitReportDraft) return;
    setExportingReport(true);
    try {
      const blob = await buildSiteInspectionReportDocxBlob({
        caseNumber: caseDetail.caseNumber,
        visitDate: formatDate(visit.visitDate),
        reportText: visit.visitReportDraft,
      });
      downloadBlob(blob, `محضر-معاينة-${caseDetail.caseNumber}.docx`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تصدير المحضر");
    } finally {
      setExportingReport(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{visit.location}</div>
          <div className="text-xs text-muted-foreground">
            {formatDate(visit.visitDate)} · الغرض: {visit.purpose}
          </div>
          {attendeesList.length > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">الحاضرون: {attendeesList.join("، ")}</div>
          )}
        </div>
        <Button variant="ghost" size="icon" disabled={deleting} onClick={onDelete}>
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4 text-destructive" />}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">الأجهزة/الخوادم التي تم فحصها</Label>
          <Textarea rows={2} value={equipmentReviewed} onChange={(e) => setEquipmentReviewed(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">الدفاتر المالية التي روجعت</Label>
          <Textarea rows={2} value={booksReviewed} onChange={(e) => setBooksReviewed(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label className="text-xs">ملاحظات إضافية</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <Button size="sm" variant="outline" className="w-fit" onClick={saveFields} disabled={savingFields}>
        {savingFields ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        حفظ
      </Button>

      {/* المرفقات */}
      <div className="flex flex-wrap items-center gap-2">
        {attachmentIds.map((id) => {
          const doc = documentById.get(id);
          return doc ? (
            <Badge key={id} variant="outline" className="gap-1">
              <FileText className="size-3" />
              {doc.fileName}
            </Badge>
          ) : null;
        })}
        <input
          type="file"
          ref={fileInput}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleAttach(file);
            e.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
          إرفاق صورة / مستند
        </Button>
      </div>

      {/* الإفادات الميدانية */}
      <div className="flex flex-col gap-1.5 border-t pt-2">
        <Label className="text-xs">الإفادات الميدانية</Label>
        {visit.testimonies.length > 0 && (
          <div className="flex flex-col gap-1">
            {visit.testimonies.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-2 rounded-md bg-muted/30 p-2 text-xs">
                <div>
                  <span className="font-medium">
                    {t.personName}
                    {t.personRole ? ` (${t.personRole})` : ""}:
                  </span>{" "}
                  {t.statementText}
                </div>
                <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteTestimony(t.id)}>
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_2fr_auto]">
          <Input
            placeholder="الاسم"
            className="h-7 text-xs"
            value={testimonyName}
            onChange={(e) => setTestimonyName(e.target.value)}
          />
          <Input
            placeholder="الصفة (اختياري)"
            className="h-7 text-xs"
            value={testimonyRole}
            onChange={(e) => setTestimonyRole(e.target.value)}
          />
          <Input
            placeholder="نص الإفادة"
            className="h-7 text-xs"
            value={testimonyText}
            onChange={(e) => setTestimonyText(e.target.value)}
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleAddTestimony} disabled={addingTestimony}>
            {addingTestimony ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* توليد المحضر */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        <Button variant="outline" size="sm" onClick={handleGenerateReport} disabled={generatingReport}>
          {generatingReport ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          توليد محضر انتقال ومعاينة
        </Button>
        {visit.visitReportDraft && (
          <Button size="sm" onClick={handleExportReport} disabled={exportingReport}>
            {exportingReport ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
            تصدير كملف Word
          </Button>
        )}
      </div>
      {visit.visitReportDraft && (
        <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs">
          {visit.visitReportDraft}
        </div>
      )}
    </div>
  );
}
