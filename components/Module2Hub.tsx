"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  FileText,
  CheckCircle2,
  CircleDashed,
  DoorOpen,
  CalendarPlus,
  Paperclip,
  Users2,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { buildHearingIcsBlob } from "@/lib/ics-export";
import { downloadBlob } from "@/lib/docx-export";
import {
  MEETING_ATTENDEE_ROLES,
  ATTENDANCE_STATUSES,
  NOTICE_DELIVERY_STATUSES,
  type MeetingAttendeeRole,
  type AttendanceStatus,
  type HearingStatus,
  type NoticeDeliveryStatus,
} from "@/lib/hub-schemas";
import {
  MEETING_ATTENDEE_ROLE_LABELS,
  ATTENDANCE_STATUS_LABELS,
  HEARING_STATUS_LABELS,
  NOTICE_DELIVERY_STATUS_LABELS,
} from "@/lib/case-hub-labels";
import type { CaseDetail } from "@/lib/queries";

export function Module2Hub({ caseDetail }: { caseDetail: CaseDetail }) {
  const router = useRouter();

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
        <ReadinessChecklistCard
          caseId={caseDetail.id}
          requirements={pendingRequirements}
          onChanged={refresh}
        />
        <HearingSessionsCard caseDetail={caseDetail} onChanged={refresh} />
      </TabsContent>

      <TabsContent value="attendees">
        <AttendeeRegistryCard caseDetail={caseDetail} onChanged={refresh} />
      </TabsContent>

      <TabsContent value="notices">
        <NoticesCard caseDetail={caseDetail} onChanged={refresh} />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// جاهزية الاجتماع الأول — قائمة تفاعلية (لا مجرد عدّاد): كل بند غير مكتمل
// من قائمة المتطلبات، مع مربّع تأشير يُعلّمه "مقدم" مباشرة من هنا.
// ---------------------------------------------------------------------------
function ReadinessChecklistCard({
  caseId,
  requirements,
  onChanged,
}: {
  caseId: string;
  requirements: CaseDetail["requirements"];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const ready = requirements.length === 0;

  async function markProvided(reqId: string) {
    setBusyId(reqId);
    try {
      const res = await fetch(`/api/cases/${caseId}/requirements/${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PROVIDED" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل تحديث المتطلب");
      toast.success("تم تعليم البند كمقدم");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تحديث المتطلب");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>جاهزية الاجتماع الأول</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Badge
          variant="outline"
          className={
            ready
              ? "w-fit gap-1 border-primary/30 bg-primary/10 text-primary"
              : "w-fit gap-1 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400"
          }
        >
          {ready ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
          {ready ? "جاهز للاجتماع الأول" : `يلزم إجراءات إضافية — ${requirements.length} بند لم يُستوفَ بعد`}
        </Badge>

        {requirements.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {requirements.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-2 rounded-md border p-2.5 text-sm hover:bg-accent/30"
              >
                <Checkbox
                  checked={false}
                  disabled={busyId === r.id}
                  onCheckedChange={() => markProvided(r.id)}
                />
                <span className="flex-1">{r.labelAr}</span>
                {busyId === r.id && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          مستوردة تلقائياً من قائمة المتطلبات (الموديول 1) — تأشيرها هنا يُحدّث حالتها هناك مباشرة.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// اجتماعات الخبرة — قائمة (قد تُعقد أكثر من اجتماع)، مع جدولة اجتماع جديد.
// ---------------------------------------------------------------------------
function HearingSessionsCard({
  caseDetail,
  onChanged,
}: {
  caseDetail: CaseDetail;
  onChanged: () => void;
}) {
  const caseId = caseDetail.id;
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(caseDetail.hearingSessions.length === 0);
  const [label, setLabel] = useState(`الاجتماع ${caseDetail.hearingSessions.length + 1}`);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [meetingMethod, setMeetingMethod] = useState("تقنية الاتصال المرئي بواسطة تطبيق ZOOM MEETING");
  const [meetingLink, setMeetingLink] = useState("");

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/hearing-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || "اجتماع جديد",
          meetingDate: meetingDate ? new Date(meetingDate).toISOString() : null,
          meetingTime: meetingTime.trim() || null,
          meetingMethod: meetingMethod.trim() || null,
          meetingLink: meetingLink.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إنشاء الاجتماع");
      toast.success("تم إنشاء الاجتماع");
      setShowForm(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إنشاء الاجتماع");
    } finally {
      setCreating(false);
    }
  }

  function handleExportIcs(session: CaseDetail["hearingSessions"][number]) {
    if (!session.meetingDate) {
      toast.error("لا يوجد تاريخ محدد لهذا الاجتماع");
      return;
    }
    const blob = buildHearingIcsBlob({
      caseNumber: caseDetail.caseNumber,
      label: session.label,
      meetingDate: session.meetingDate,
      meetingTime: session.meetingTime,
      meetingMethod: session.meetingMethod,
      meetingLink: session.meetingLink,
      court: caseDetail.court,
    });
    downloadBlob(blob, `${session.label}-${caseDetail.caseNumber}.ics`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>اجتماعات الخبرة</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {caseDetail.hearingSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد اجتماعات مجدولة بعد</p>
        ) : (
          <div className="flex flex-col gap-2">
            {caseDetail.hearingSessions.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.meetingDate ? formatDate(s.meetingDate) : "لم يُحدَّد تاريخ"}
                    {s.meetingTime ? ` — ${s.meetingTime}` : ""}
                    {s.meetingMethod ? ` · ${s.meetingMethod}` : ""}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    s.status === "COMPLETED"
                      ? "gap-1 border-primary/30 bg-primary/10 text-primary"
                      : "gap-1"
                  }
                >
                  {HEARING_STATUS_LABELS[s.status as HearingStatus]}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => handleExportIcs(s)}>
                  <CalendarPlus className="size-4" />
                  تصدير .ics
                </Button>
                <Button asChild size="sm">
                  <Link href={`/cases/${caseId}/module-2/hearing/${s.id}`}>
                    <DoorOpen className="size-4" />
                    فتح غرفة الاجتماع
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}

        {showForm ? (
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sessionLabel">اسم الاجتماع</Label>
              <Input id="sessionLabel" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sessionDate">تاريخ الاجتماع</Label>
              <Input
                id="sessionDate"
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sessionTime">الوقت</Label>
              <Input
                id="sessionTime"
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                placeholder="مثال: 12:30 ظهراً"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sessionMethod">طريقة الانعقاد</Label>
              <Input
                id="sessionMethod"
                value={meetingMethod}
                onChange={(e) => setMeetingMethod(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="sessionLink">رابط الاجتماع (اختياري)</Label>
              <Input
                id="sessionLink"
                dir="ltr"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                إنشاء الاجتماع
              </Button>
              {caseDetail.hearingSessions.length > 0 && (
                <Button variant="ghost" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setShowForm(true)}>
            <Plus className="size-4" />
            إضافة اجتماع
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// سجل الحضور والوكلاء (POA)
// ---------------------------------------------------------------------------
function AttendeeRegistryCard({
  caseDetail,
  onChanged,
}: {
  caseDetail: CaseDetail;
  onChanged: () => void;
}) {
  const caseId = caseDetail.id;
  const [adding, setAdding] = useState(false);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<MeetingAttendeeRole>("POA");
  const [representingParty, setRepresentingParty] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

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

  async function handleBulkAddParties() {
    const existingNames = new Set(caseDetail.meetingAttendees.map((a) => a.name));
    const toAdd = caseDetail.parties.filter((p) => !existingNames.has(p.name));
    if (toAdd.length === 0) {
      toast.info("جميع أطراف الدعوى مضافون بالفعل");
      return;
    }
    setBulkAdding(true);
    try {
      let order = caseDetail.meetingAttendees.length;
      for (const p of toAdd) {
        const res = await fetch(`/api/cases/${caseId}/meeting-attendees`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: p.name, role: p.role, order: order++ }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "فشل إضافة أحد الأطراف");
      }
      toast.success(`تمت إضافة ${toAdd.length} من أطراف الدعوى`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة أطراف الدعوى");
    } finally {
      setBulkAdding(false);
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

  async function handlePoaUpload(attendeeId: string, file: File) {
    setUploadingId(attendeeId);
    try {
      const fd = new FormData();
      fd.append("files", file);
      fd.append("docCategory", "OTHER_JUDICIAL");
      const uploadRes = await fetch(`/api/cases/${caseId}/documents`, { method: "POST", body: fd });
      const uploadData = await uploadRes.json();
      const uploaded = uploadData.results?.[0];
      if (!uploadRes.ok || !uploaded?.document) {
        throw new Error(uploaded?.error || "فشل رفع مستند التوكيل");
      }
      const linkRes = await fetch(`/api/cases/${caseId}/meeting-attendees/${attendeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: uploaded.document.id }),
      });
      if (!linkRes.ok) throw new Error((await linkRes.json()).error || "فشل ربط المستند");
      toast.success("تم إرفاق مستند التوكيل");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل رفع مستند التوكيل");
    } finally {
      setUploadingId(null);
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
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>سجل الحضور والوكلاء (POA)</CardTitle>
        <Button variant="outline" size="sm" onClick={handleBulkAddParties} disabled={bulkAdding}>
          {bulkAdding ? <Loader2 className="size-4 animate-spin" /> : <Users2 className="size-4" />}
          إضافة كل أطراف الدعوى
        </Button>
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
                    {a.document ? ` · مرفق: ${a.document.fileName}` : ""}
                  </div>
                </div>
                <input
                  type="file"
                  className="hidden"
                  ref={(el) => {
                    fileInputs.current[a.id] = el;
                  }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePoaUpload(a.id, file);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={uploadingId === a.id}
                  onClick={() => fileInputs.current[a.id]?.click()}
                  title="إرفاق مستند التوكيل"
                >
                  {uploadingId === a.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Paperclip className="size-4" />
                  )}
                </Button>
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

// ---------------------------------------------------------------------------
// الإخطارات الرسمية + تتبّع التسليم لكل حاضر
// ---------------------------------------------------------------------------
function NoticesCard({
  caseDetail,
  onChanged,
}: {
  caseDetail: CaseDetail;
  onChanged: () => void;
}) {
  const [expandedNoticeId, setExpandedNoticeId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const caseId = caseDetail.id;

  async function toggleDelivery(noticeId: string, attendeeId: string, status: NoticeDeliveryStatus) {
    const key = `${noticeId}:${attendeeId}`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/cases/${caseId}/notices/${noticeId}/deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendeeId, status }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل تحديث حالة التسليم");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تحديث حالة التسليم");
    } finally {
      setBusyKey(null);
    }
  }

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
            <Link href={`/cases/${caseId}/notices/new`}>
              <Plus className="size-4" />
              إنشاء إخطار جديد
            </Link>
          </Button>
        </div>

        {caseDetail.notices.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-medium">الإخطارات السابقة</p>
            {caseDetail.notices.map((n) => {
              const deliveryByAttendee = new Map(n.deliveries.map((d) => [d.attendeeId, d]));
              const isExpanded = expandedNoticeId === n.id;
              return (
                <div key={n.id} className="rounded-md border">
                  <div className="flex items-center gap-3 p-3">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <Link
                      href={`/cases/${caseId}/notices/${n.id}`}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <div className="truncate text-sm font-medium">
                        إخطار اجتماع الخبرة {n.noticeLabel} — {n.subjectLine}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        موعد الاجتماع: {formatDate(n.meetingDate)} · تم الإنشاء: {formatDate(n.createdAt)}
                      </div>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedNoticeId(isExpanded ? null : n.id)}
                    >
                      حالة التسليم ({n.deliveries.filter((d) => d.status === "ACKNOWLEDGED").length}/
                      {caseDetail.meetingAttendees.length})
                    </Button>
                  </div>
                  {isExpanded && (
                    <div className="flex flex-col gap-1.5 border-t p-3">
                      {caseDetail.meetingAttendees.length === 0 ? (
                        <p className="text-xs text-muted-foreground">لا يوجد حاضرون مسجَّلون لتتبّع التسليم</p>
                      ) : (
                        caseDetail.meetingAttendees.map((a) => {
                          const delivery = deliveryByAttendee.get(a.id);
                          const status: NoticeDeliveryStatus = (delivery?.status as NoticeDeliveryStatus) ?? "SENT";
                          const key = `${n.id}:${a.id}`;
                          return (
                            <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                              <span>{a.name}</span>
                              <div className="flex items-center gap-2">
                                {delivery ? (
                                  <Badge
                                    variant="outline"
                                    className={
                                      delivery.status === "ACKNOWLEDGED"
                                        ? "border-primary/30 bg-primary/10 text-primary"
                                        : undefined
                                    }
                                  >
                                    {NOTICE_DELIVERY_STATUS_LABELS[status]}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    لم يُرسَل بعد
                                  </Badge>
                                )}
                                {NOTICE_DELIVERY_STATUSES.map((s) => (
                                  <Button
                                    key={s}
                                    variant="outline"
                                    size="sm"
                                    disabled={busyKey === key}
                                    onClick={() => toggleDelivery(n.id, a.id, s)}
                                  >
                                    {busyKey === key ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      NOTICE_DELIVERY_STATUS_LABELS[s]
                                    )}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
