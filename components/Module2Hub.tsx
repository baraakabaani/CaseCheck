"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, FileText, CheckCircle2, CircleDashed } from "lucide-react";
import { formatDate, toDateInputValue } from "@/lib/format";
import {
  MEETING_ATTENDEE_ROLES,
  ATTENDANCE_STATUSES,
  HEARING_STATUSES,
  type MeetingAttendeeRole,
  type AttendanceStatus,
  type HearingStatus,
} from "@/lib/hub-schemas";
import {
  MEETING_ATTENDEE_ROLE_LABELS,
  ATTENDANCE_STATUS_LABELS,
  HEARING_STATUS_LABELS,
} from "@/lib/case-hub-labels";
import type { CaseDetail } from "@/lib/queries";

export function Module2Hub({ caseDetail }: { caseDetail: CaseDetail }) {
  const router = useRouter();
  const caseId = caseDetail.id;

  const pendingRequirements = caseDetail.requirements.filter(
    (r) => r.status === "MISSING" || r.status === "PARTIALLY_PROVIDED",
  );

  function refresh() {
    router.refresh();
  }

  return (
    <Tabs defaultValue="readiness" className="gap-4">
      <TabsList>
        <TabsTrigger value="readiness">الجاهزية وجدولة الاجتماع</TabsTrigger>
        <TabsTrigger value="attendees">
          سجل الحضور والوكلاء ({caseDetail.meetingAttendees.length})
        </TabsTrigger>
        <TabsTrigger value="notices">
          الإخطارات الرسمية ({caseDetail.notices.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="readiness" className="flex flex-col gap-4">
        <ReadinessCard pendingCount={pendingRequirements.length} caseId={caseId} />
        <SchedulerCard caseDetail={caseDetail} onSaved={refresh} />
      </TabsContent>

      <TabsContent value="attendees">
        <AttendeeRegistryCard caseDetail={caseDetail} onChanged={refresh} />
      </TabsContent>

      <TabsContent value="notices">
        <NoticesCard caseDetail={caseDetail} />
      </TabsContent>
    </Tabs>
  );
}

function ReadinessCard({ pendingCount, caseId }: { pendingCount: number; caseId: string }) {
  const ready = pendingCount === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>جاهزية الاجتماع الأول</CardTitle>
      </CardHeader>
      <CardContent>
        <Badge
          variant="outline"
          className={
            ready
              ? "gap-1 border-primary/30 bg-primary/10 text-primary"
              : "gap-1 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400"
          }
        >
          {ready ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
          {ready ? "جاهز للاجتماع الأول" : `يلزم إجراءات إضافية — ${pendingCount} بند لم يُستوفَ بعد`}
        </Badge>
        <p className="mt-2 text-sm text-muted-foreground">
          مبنية على قائمة المتطلبات المستوردة تلقائياً من التدقيق الأولي (الموديول 1) —{" "}
          <Link href={`/cases/${caseId}/module-1`} className="underline underline-offset-2">
            مراجعتها من هناك
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

function SchedulerCard({
  caseDetail,
  onSaved,
}: {
  caseDetail: CaseDetail;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<HearingStatus>(
    (caseDetail.hearingSession?.status as HearingStatus) ?? "NOT_SCHEDULED",
  );
  const [meetingDate, setMeetingDate] = useState(
    toDateInputValue(caseDetail.hearingSession?.meetingDate),
  );
  const [openingNotes, setOpeningNotes] = useState(caseDetail.hearingSession?.openingNotes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseDetail.id}/hearing-session`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          meetingDate: meetingDate ? new Date(meetingDate).toISOString() : null,
          openingNotes: openingNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حفظ بيانات الاجتماع");
      toast.success("تم حفظ بيانات الاجتماع");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ بيانات الاجتماع");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>جدولة الاجتماع الأول</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>حالة الاجتماع</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as HearingStatus)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEARING_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {HEARING_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meetingDate">تاريخ الاجتماع</Label>
          <Input
            id="meetingDate"
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="openingNotes">
            ملاحظات / كلمة الافتتاح — رابط الاتصال المرئي أو مكان الانعقاد، وملاحظات تحضيرية
          </Label>
          <Textarea
            id="openingNotes"
            rows={3}
            value={openingNotes}
            onChange={(e) => setOpeningNotes(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            حفظ بيانات الاجتماع
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AttendeeRegistryCard({
  caseDetail,
  onChanged,
}: {
  caseDetail: CaseDetail;
  onChanged: () => void;
}) {
  const caseId = caseDetail.id;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<MeetingAttendeeRole>("POA");
  const [representingParty, setRepresentingParty] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAdd() {
    if (!name.trim()) {
      toast.error("الرجاء إدخال اسم الحاضر");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/meeting-attendees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          role,
          representingParty: representingParty.trim() || null,
          order: caseDetail.meetingAttendees.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إضافة الحاضر");
      setName("");
      setRepresentingParty("");
      toast.success("تمت إضافة الحاضر");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة الحاضر");
    } finally {
      setAdding(false);
    }
  }

  async function handleAttendanceChange(attendeeId: string, attendanceStatus: AttendanceStatus) {
    setBusyId(attendeeId);
    try {
      const res = await fetch(`/api/cases/${caseId}/meeting-attendees/${attendeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceStatus }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل تحديث الحالة");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تحديث الحالة");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(attendeeId: string) {
    setBusyId(attendeeId);
    try {
      const res = await fetch(`/api/cases/${caseId}/meeting-attendees/${attendeeId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل الحذف");
      toast.success("تم حذف الحاضر");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحذف");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>سجل الحضور والوكلاء (POA)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {caseDetail.meetingAttendees.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد حاضرون مسجَّلون بعد</p>
        ) : (
          <div className="flex flex-col gap-2">
            {caseDetail.meetingAttendees.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {MEETING_ATTENDEE_ROLE_LABELS[a.role as MeetingAttendeeRole]}
                    {a.representingParty ? ` — يمثل: ${a.representingParty}` : ""}
                  </div>
                </div>
                <Select
                  value={a.attendanceStatus}
                  onValueChange={(v) => handleAttendanceChange(a.id, v as AttendanceStatus)}
                  disabled={busyId === a.id}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTENDANCE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ATTENDANCE_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busyId === a.id}
                  onClick={() => handleDelete(a.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="attendeeName">الاسم</Label>
            <Input id="attendeeName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>الصفة</Label>
            <Select value={role} onValueChange={(v) => setRole(v as MeetingAttendeeRole)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEETING_ATTENDEE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {MEETING_ATTENDEE_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="representingParty">يمثل (اختياري)</Label>
            <Input
              id="representingParty"
              value={representingParty}
              onChange={(e) => setRepresentingParty(e.target.value)}
              placeholder="اسم الطرف"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              إضافة
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NoticesCard({ caseDetail }: { caseDetail: CaseDetail }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          إخطار رسمي بموعد اجتماع الخبرة موجّه إلى وكلاء الأطراف، يطلب استكمال مستندات محددة قبل
          الموعد — بنفس تنسيق خطاب الشركة (ترويسة وعلامة مائية وتذييل)، قابل للطباعة أو الإرسال
          كبريد إلكتروني.
        </p>
        <div>
          <Button asChild>
            <Link href={`/cases/${caseDetail.id}/notices/new`}>
              <Plus className="size-4" />
              إنشاء إخطار جديد
            </Link>
          </Button>
        </div>

        {caseDetail.notices.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-medium">الإخطارات السابقة</p>
            {caseDetail.notices.map((n) => (
              <Link
                key={n.id}
                href={`/cases/${caseDetail.id}/notices/${n.id}`}
                className="flex items-center gap-3 rounded-md border p-3 text-sm hover:bg-accent/40"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    إخطار اجتماع الخبرة {n.noticeLabel} — {n.subjectLine}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    موعد الاجتماع: {formatDate(n.meetingDate)} · تم الإنشاء: {formatDate(n.createdAt)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
