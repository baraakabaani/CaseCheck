"use client";

import { useEffect, useRef, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Play,
  Save,
  Plus,
  Trash2,
  Upload,
  Sparkles,
  FileDown,
  CheckCircle2,
  Mic,
  Square,
  FileAudio,
  ListPlus,
  Quote,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { buildHearingMinutesDocxBlob, downloadBlob } from "@/lib/docx-export";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import type { SuggestedTask } from "@/lib/hearing-task-suggester";
import {
  ATTENDANCE_STATUSES,
  HEARING_QUESTION_PARTY_ROLES,
  HEARING_QUESTION_STATUSES,
  DOCUMENT_DEMAND_STATUSES,
  type AttendanceStatus,
  type HearingStatus,
  type HearingQuestionPartyRole,
  type HearingQuestionStatus,
  type DocumentDemandStatus,
} from "@/lib/hub-schemas";
import {
  ATTENDANCE_STATUS_LABELS,
  HEARING_QUESTION_STATUS_LABELS,
  DOCUMENT_DEMAND_STATUS_LABELS,
} from "@/lib/case-hub-labels";
import type {
  CasePartyDetail,
  HearingSessionDetail,
  MeetingAttendeeDetail,
} from "@/lib/queries";

const OPENING_STATEMENT_TEMPLATE = `بسم الله الرحمن الرحيم،

افتتح الخبير المنتدب الاجتماع بالترحيب بالحضور، وتلا نص قرار/حكم ندب الخبرة ومأمورية الخبرة المكلَّف بها، وأوضح للأطراف الطبيعة الإجرائية للاجتماع وأنه لا يُعد جلسة قضائية، وأن كل ما يُثار فيه من أقوال أو مستندات سيُثبت في محضر الاجتماع ويُرفق بتقرير الخبرة.`;

export function HearingRoom({
  caseId,
  caseNumber,
  parties,
  attendees,
  session,
}: {
  caseId: string;
  caseNumber: string;
  parties: CasePartyDetail[];
  attendees: MeetingAttendeeDetail[];
  session: HearingSessionDetail;
}) {
  const router = useRouter();
  function refresh() {
    router.refresh();
  }

  const locked = session.status === "COMPLETED";

  return (
    <div className="flex flex-col gap-4">
      {locked && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
          تم عقد هذا الاجتماع ({session.endedAt ? formatDateTime(session.endedAt) : ""}) — يمكن
          تعديل البيانات أدناه، لكن يجب إعادة توليد المحضر يدوياً بعد أي تعديل.
        </div>
      )}

      <StatusCard caseId={caseId} session={session} onChanged={refresh} />
      <OpeningStatementCard caseId={caseId} session={session} onChanged={refresh} />
      <RollCallCard caseId={caseId} session={session} attendees={attendees} onChanged={refresh} />
      <QuestionsCard caseId={caseId} session={session} onChanged={refresh} />
      <TranscriptCard caseId={caseId} session={session} onChanged={refresh} />
      <DocumentDemandsCard caseId={caseId} session={session} parties={parties} onChanged={refresh} />
      <FinishCard caseId={caseId} caseNumber={caseNumber} session={session} onChanged={refresh} />
    </div>
  );
}

function StatusCard({
  caseId,
  session,
  onChanged,
}: {
  caseId: string;
  session: HearingSessionDetail;
  onChanged: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const status = session.status as HearingStatus;

  async function handleStart() {
    setStarting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/hearing-sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل بدء الاجتماع");
      toast.success("بدأ الاجتماع");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل بدء الاجتماع");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={status === "IN_PROGRESS" ? "gap-1 border-primary/30 bg-primary/10 text-primary" : "gap-1"}
          >
            {status === "IN_PROGRESS" && <span className="size-2 animate-pulse rounded-full bg-primary" />}
            {status === "NOT_SCHEDULED" && "بانتظار الحضور"}
            {status === "SCHEDULED" && "بانتظار الحضور"}
            {status === "IN_PROGRESS" && "الاجتماع جارٍ"}
            {status === "COMPLETED" && "انتهى الاجتماع"}
          </Badge>
          {session.startedAt && (
            <span className="text-xs text-muted-foreground">بدأ: {formatDateTime(session.startedAt)}</span>
          )}
          {session.endedAt && (
            <span className="text-xs text-muted-foreground">انتهى: {formatDateTime(session.endedAt)}</span>
          )}
        </div>
        {(status === "NOT_SCHEDULED" || status === "SCHEDULED") && (
          <Button onClick={handleStart} disabled={starting}>
            {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            بدء الاجتماع الآن
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function OpeningStatementCard({
  caseId,
  session,
  onChanged,
}: {
  caseId: string;
  session: HearingSessionDetail;
  onChanged: () => void;
}) {
  const [text, setText] = useState(session.openingNotes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/hearing-sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingNotes: text.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل الحفظ");
      toast.success("تم حفظ الكلمة الافتتاحية");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>الكلمة الافتتاحية</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            حفظ
          </Button>
          {!text && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setText(OPENING_STATEMENT_TEMPLATE)}
            >
              إدراج النص الافتراضي
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RollCallCard({
  caseId,
  session,
  attendees,
  onChanged,
}: {
  caseId: string;
  session: HearingSessionDetail;
  attendees: MeetingAttendeeDetail[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const recordByAttendee = new Map(session.attendanceRecords.map((r) => [r.attendeeId, r]));

  async function handleChange(attendeeId: string, status: AttendanceStatus) {
    setBusyId(attendeeId);
    try {
      const res = await fetch(
        `/api/cases/${caseId}/hearing-sessions/${session.id}/attendance/${attendeeId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error || "فشل تسجيل الحضور");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تسجيل الحضور");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>الحضور الفعلي (Roll Call)</CardTitle>
      </CardHeader>
      <CardContent>
        {attendees.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا يوجد حاضرون مسجَّلون — أضفهم من تبويب «سجل الحضور والوكلاء».
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {attendees.map((a) => {
              const record = recordByAttendee.get(a.id);
              const status: AttendanceStatus = (record?.status as AttendanceStatus) ?? "PENDING";
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-md border p-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                  <Select
                    value={status}
                    onValueChange={(v) => handleChange(a.id, v as AttendanceStatus)}
                    disabled={busyId === a.id}
                  >
                    <SelectTrigger className="w-32">
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
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionsCard({
  caseId,
  session,
  onChanged,
}: {
  caseId: string;
  session: HearingSessionDetail;
  onChanged: () => void;
}) {
  const [seeding, setSeeding] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newRole, setNewRole] = useState<HearingQuestionPartyRole>("CLAIMANT");
  const [newText, setNewText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const hasGenerated = session.questions.some((q) => q.sourceType === "GENERATED");

  async function handleSeed() {
    setSeeding(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/hearing-sessions/${session.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل استيراد الأسئلة");
      if (data.seeded > 0) toast.success(`تم استيراد ${data.seeded} سؤال من التحليل الأولي`);
      else toast.info("لا توجد أسئلة مُولَّدة من التحليل الأولي لاستيرادها");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل استيراد الأسئلة");
    } finally {
      setSeeding(false);
    }
  }

  async function handleAdd() {
    if (!newText.trim()) {
      toast.error("الرجاء إدخال نص السؤال");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/hearing-sessions/${session.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyRole: newRole, questionText: newText.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل إضافة السؤال");
      setNewText("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة السؤال");
    } finally {
      setAdding(false);
    }
  }

  async function updateQuestion(
    questionId: string,
    data: { answerText?: string; status?: HearingQuestionStatus },
  ) {
    setBusyId(questionId);
    try {
      const res = await fetch(
        `/api/cases/${caseId}/hearing-sessions/${session.id}/questions/${questionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!res.ok) throw new Error((await res.json()).error || "فشل التحديث");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحديث");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteQuestion(questionId: string) {
    setBusyId(questionId);
    try {
      const res = await fetch(
        `/api/cases/${caseId}/hearing-sessions/${session.id}/questions/${questionId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error((await res.json()).error || "فشل الحذف");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحذف");
    } finally {
      setBusyId(null);
    }
  }

  function QuestionRow({ q }: { q: HearingSessionDetail["questions"][number] }) {
    const [answer, setAnswer] = useState(q.answerText ?? "");
    return (
      <div className="flex flex-col gap-2 rounded-md border p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">{q.questionText}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busyId === q.id}
            onClick={() => deleteQuestion(q.id)}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
        <Textarea
          rows={2}
          placeholder="الإجابة..."
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onBlur={() => {
            if (answer !== (q.answerText ?? "")) updateQuestion(q.id, { answerText: answer || undefined });
          }}
        />
        <div className="flex items-center justify-between">
          <Select
            value={q.status}
            onValueChange={(v) => updateQuestion(q.id, { status: v as HearingQuestionStatus })}
            disabled={busyId === q.id}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEARING_QUESTION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {HEARING_QUESTION_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {q.sourceType === "GENERATED" && (
            <Badge variant="secondary" className="text-xs">
              من التحليل الأولي
            </Badge>
          )}
          {q.sourceType === "EXTRACTED" && (
            <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 text-xs text-primary">
              <Sparkles className="size-3" />
              مستخرج من نص التفريغ
            </Badge>
          )}
        </div>
      </div>
    );
  }

  const claimantQuestions = session.questions.filter((q) => q.partyRole === "CLAIMANT");
  const respondentQuestions = session.questions.filter((q) => q.partyRole === "RESPONDENT");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>الأسئلة والأجوبة</CardTitle>
        {!hasGenerated && (
          <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding}>
            {seeding ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            استيراد أسئلة التحليل الأولي
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">أسئلة للمدعي</p>
            {claimantQuestions.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا يوجد</p>
            ) : (
              claimantQuestions.map((q) => <QuestionRow key={q.id} q={q} />)
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">أسئلة للمدعى عليه</p>
            {respondentQuestions.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا يوجد</p>
            ) : (
              respondentQuestions.map((q) => <QuestionRow key={q.id} q={q} />)
            )}
          </div>
        </div>

        <div className="grid gap-2 border-t pt-4 sm:grid-cols-[1fr_2fr_auto]">
          <Select value={newRole} onValueChange={(v) => setNewRole(v as HearingQuestionPartyRole)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEARING_QUESTION_PARTY_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r === "CLAIMANT" ? "سؤال للمدعي" : "سؤال للمدعى عليه"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="نص السؤال..."
          />
          <Button onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            إضافة سؤال
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TranscriptCard({
  caseId,
  session,
  onChanged,
}: {
  caseId: string;
  session: HearingSessionDetail;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const audioFileInput = useRef<HTMLInputElement>(null);

  // --- استخراج مهام جديدة من المحضر المصحَّح (تُضاف فقط، لا تُعدَّل أي
  // مهمة موجودة — انظر lib/hearing-task-suggester.ts) ---
  const [suggesting, setSuggesting] = useState(false);
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);
  const [suggestAnalysisId, setSuggestAnalysisId] = useState<string | null>(null);
  const [suggestExistingTasks, setSuggestExistingTasks] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedTask[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [addingTasks, setAddingTasks] = useState(false);

  async function handleSuggestTasks() {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/hearing-sessions/${session.id}/suggest-tasks`, {
        method: "POST",
        headers: buildClientApiKeyHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل استخراج المهام من المحضر");

      if (data.warning) toast.warning(data.warning);
      setSuggestAnalysisId(data.analysisId);
      setSuggestExistingTasks(data.existingTasks);
      setSuggestions(data.suggestions);
      setSelectedSuggestions(new Set((data.suggestions as SuggestedTask[]).map((_, i) => i)));
      if (data.suggestions.length === 0 && !data.warning) {
        toast.success("لم يستجد أي مهمة جديدة لم تكن مغطاة بالفعل في مهام المأمورية الحالية");
      } else if (data.suggestions.length > 0) {
        setSuggestDialogOpen(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل استخراج المهام من المحضر");
    } finally {
      setSuggesting(false);
    }
  }

  function toggleSuggestion(i: number) {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleAddSelectedTasks() {
    if (!suggestAnalysisId || selectedSuggestions.size === 0) return;
    setAddingTasks(true);
    try {
      const tasksToAdd = suggestions.filter((_, i) => selectedSuggestions.has(i)).map((s) => s.taskText);
      const res = await fetch(`/api/cases/${caseId}/analysis/${suggestAnalysisId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mandateTasks: [...suggestExistingTasks, ...tasksToAdd] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إضافة المهام");

      toast.success(`تمت إضافة ${tasksToAdd.length} مهمة إلى مأمورية الخبرة`);
      setSuggestDialogOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة المهام");
    } finally {
      setAddingTasks(false);
    }
  }

  // --- تسجيل الاجتماع مباشرة من المتصفح (MediaRecorder) ---
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "recorded">("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recordingSupported =
    typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!window.MediaRecorder;

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function releaseMic() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // تنظيف عند إغلاق البطاقة أثناء تسجيل جارٍ — يُطفئ الميكروفون ويحرر الذاكرة
  // بدل تركهما معلَّقين.
  useEffect(() => {
    return () => {
      stopTimer();
      releaseMic();
    };
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      // معدّل بت منخفض عمداً (كلام وليس موسيقى) — يبقي حجم التسجيل صغيراً
      // حتى لاجتماعات تمتد ساعة أو أكثر، تجنباً لتجاوز حد حجم الملف لدى
      // مزود خدمة التفريغ.
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        setRecordingState("recorded");
        releaseMic();
        stopTimer();
      };
      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setElapsedSeconds(0);
      setRecordingState("recording");
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("تعذر الوصول إلى الميكروفون — تأكد من منح المتصفح إذن استخدامه");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function discardRecording() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingState("idle");
    setElapsedSeconds(0);
  }

  function formatElapsed(totalSeconds: number) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  async function submitTranscript(payload: { text: string } | { file: File }) {
    setCorrecting(true);
    try {
      let res: Response;
      if ("file" in payload) {
        const fd = new FormData();
        fd.append("file", payload.file);
        res = await fetch(`/api/cases/${caseId}/hearing-sessions/${session.id}/transcript`, {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch(`/api/cases/${caseId}/hearing-sessions/${session.id}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: payload.text }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تصحيح النص");
      if (data.warning) toast.warning(data.warning);
      else if (data.mode === "OFFLINE") toast.success("تم حفظ النص (بدون تصحيح — لا يوجد مفتاح API)");
      else {
        const parts: string[] = [];
        if (data.matchedAnswersCount > 0) parts.push(`مطابقة ${data.matchedAnswersCount} إجابة`);
        if (data.extractedQuestionsCount > 0) parts.push(`استخراج ${data.extractedQuestionsCount} سؤال جديد`);
        const base = data.transcribedFromAudio ? "تم تفريغ التسجيل الصوتي وتصحيح نصه" : "تم تصحيح النص";
        toast.success(`${base}${parts.length > 0 ? ` و${parts.join(" و")}` : ""}`);
      }
      setText("");
      if (recordingState === "recorded") discardRecording();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تصحيح النص");
    } finally {
      setCorrecting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>نص تفريغ الاجتماع</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          سجّل صوت الاجتماع مباشرة، أو ارفع تسجيلاً صوتياً جاهزاً، أو ارفع/الصق نص تفريغ
          آلي جاهز — في كل الحالات يُصحَّح النص تلقائياً بالذكاء الاصطناعي بالاستعانة بسياق
          الدعوى (أسماء الأطراف، ملخص الدعوى)، وتُطابَق الإجابات الفعلية مع الأسئلة المُعدّة
          أعلاه، مع استخراج أي أسئلة وأجوبة ارتجالية أخرى وردت فعلياً في النص ولم تكن ضمن
          الأسئلة المُعدّة مسبقاً — تُضاف تلقائياً كأسئلة جديدة (موسومة «مستخرج من نص
          التفريغ» أعلاه).
        </p>

        <div className="flex flex-col gap-2 rounded-md border p-3">
          <Label className="text-xs">تسجيل صوتي</Label>
          <div className="flex flex-wrap items-center gap-2">
            {recordingState === "idle" && (
              <Button
                type="button"
                variant="outline"
                onClick={startRecording}
                disabled={!recordingSupported || correcting}
              >
                <Mic className="size-4" />
                تسجيل الاجتماع مباشرة
              </Button>
            )}
            {recordingState === "recording" && (
              <Button type="button" variant="destructive" onClick={stopRecording}>
                <span className="size-2 animate-pulse rounded-full bg-white" />
                <Square className="size-4 fill-current" />
                إيقاف التسجيل — {formatElapsed(elapsedSeconds)}
              </Button>
            )}
            <input
              type="file"
              ref={audioFileInput}
              className="hidden"
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) submitTranscript({ file });
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              onClick={() => audioFileInput.current?.click()}
              disabled={correcting || recordingState === "recording"}
            >
              <FileAudio className="size-4" />
              رفع تسجيل صوتي
            </Button>
          </div>

          {!recordingSupported && (
            <p className="text-xs text-amber-600">
              التسجيل المباشر غير مدعوم في هذا المتصفح (أو يتطلب اتصالاً آمناً HTTPS) — يمكن
              رفع تسجيل صوتي جاهز بدلاً من ذلك.
            </p>
          )}

          {recordingState === "recorded" && recordedUrl && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/30 p-2">
              <audio controls src={recordedUrl} className="h-9 max-w-full" />
              <Button
                size="sm"
                onClick={() => recordedBlob && submitTranscript({ file: new File([recordedBlob], `hearing-recording-${Date.now()}.webm`, { type: recordedBlob.type }) })}
                disabled={correcting}
              >
                {correcting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                استخدام هذا التسجيل وتفريغه
              </Button>
              <Button size="sm" variant="ghost" onClick={discardRecording} disabled={correcting}>
                <Trash2 className="size-4" />
                تسجيل من جديد
              </Button>
            </div>
          )}
        </div>

        <Textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="الصق نص التفريغ هنا..."
        />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => submitTranscript({ text })}
            disabled={correcting || !text.trim()}
          >
            {correcting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            تصحيح النص الملصق بالذكاء الاصطناعي
          </Button>
          <input
            type="file"
            ref={fileInput}
            className="hidden"
            accept=".txt,.pdf,.docx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) submitTranscript({ file });
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={correcting}>
            <Upload className="size-4" />
            رفع ملف التفريغ
          </Button>
        </div>

        {session.correctedTranscript && (
          <div className="flex flex-col gap-1.5 border-t pt-4">
            <Label>النص المصحَّح</Label>
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              {session.correctedTranscript}
            </div>
            <div>
              <Button variant="outline" size="sm" onClick={handleSuggestTasks} disabled={suggesting}>
                {suggesting ? <Loader2 className="size-4 animate-spin" /> : <ListPlus className="size-4" />}
                استخراج مهام من المحضر
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={suggestDialogOpen} onOpenChange={setSuggestDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>مهام مقترَحة من المحضر</DialogTitle>
            <DialogDescription>
              راجع كل اقتراح واقتباسه من المحضر، وحدد ما تريد إضافته فعلياً إلى مأمورية
              الخبرة — لن يُعدَّل أو يُحذَف أي شيء من المهام المعتمدة حالياً، فقط إضافة ما
              تختاره أنت.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {suggestions.map((s, i) => (
              <label
                key={i}
                className="flex cursor-pointer flex-col gap-1.5 rounded-md border p-3 hover:bg-muted/30"
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedSuggestions.has(i)}
                    onCheckedChange={() => toggleSuggestion(i)}
                    className="mt-0.5"
                  />
                  <span className="text-sm font-medium">{s.taskText}</span>
                </div>
                <div className="flex items-start gap-1.5 ps-6 text-xs text-muted-foreground">
                  <Quote className="size-3.5 shrink-0" />
                  <span className="italic">{s.groundingExcerpt}</span>
                </div>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAddSelectedTasks} disabled={addingTasks || selectedSuggestions.size === 0}>
              {addingTasks ? <Loader2 className="size-4 animate-spin" /> : <ListPlus className="size-4" />}
              إضافة المحدد ({selectedSuggestions.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DocumentDemandsCard({
  caseId,
  session,
  parties,
  onChanged,
}: {
  caseId: string;
  session: HearingSessionDetail;
  parties: CasePartyDetail[];
  onChanged: () => void;
}) {
  const [item, setItem] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selectedParties, setSelectedParties] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    setAdding(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/document-demands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hearingSessionId: session.id,
          item: item.trim(),
          requestedFromPartyIds: Array.from(selectedParties),
          deadline: new Date(deadline).toISOString(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل إضافة المطالبة");
      setItem("");
      setDeadline("");
      setSelectedParties(new Set());
      toast.success("تمت إضافة المطالبة");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إضافة المطالبة");
    } finally {
      setAdding(false);
    }
  }

  async function updateStatus(demandId: string, status: DocumentDemandStatus) {
    setBusyId(demandId);
    try {
      const res = await fetch(`/api/cases/${caseId}/document-demands/${demandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل التحديث");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحديث");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(demandId: string) {
    setBusyId(demandId);
    try {
      const res = await fetch(`/api/cases/${caseId}/document-demands/${demandId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل الحذف");
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
        <CardTitle>المستندات المطلوبة عقب الاجتماع</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {session.documentDemands.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد مطالبات مستندات بعد</p>
        ) : (
          <div className="flex flex-col gap-2">
            {session.documentDemands.map((d) => {
              const requestedFrom: string[] = (() => {
                try {
                  const ids = JSON.parse(d.requestedFromPartyIds) as string[];
                  return ids.map((id) => parties.find((p) => p.id === id)?.name ?? id);
                } catch {
                  return [];
                }
              })();
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{d.item}</div>
                    <div className="text-xs text-muted-foreground">
                      من: {requestedFrom.join("، ") || "غير محدد"} · الموعد النهائي:{" "}
                      {new Date(d.deadline).toLocaleDateString("ar-EG-u-ca-gregory")}
                    </div>
                  </div>
                  <Select
                    value={d.status}
                    onValueChange={(v) => updateStatus(d.id, v as DocumentDemandStatus)}
                    disabled={busyId === d.id}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_DEMAND_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {DOCUMENT_DEMAND_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" disabled={busyId === d.id} onClick={() => handleDelete(d.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="demandItem">المستند المطلوب</Label>
            <Input id="demandItem" value={item} onChange={(e) => setItem(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="demandDeadline">الموعد النهائي</Label>
            <Input
              id="demandDeadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>من (طرف أو أكثر)</Label>
            <div className="flex flex-wrap gap-3">
              {parties.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={selectedParties.has(p.id)}
                    onCheckedChange={() => toggleParty(p.id)}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              إضافة مطالبة
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FinishCard({
  caseId,
  caseNumber,
  session,
  onChanged,
}: {
  caseId: string;
  caseNumber: string;
  session: HearingSessionDetail;
  onChanged: () => void;
}) {
  const [finishing, setFinishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [minutes, setMinutes] = useState(session.minutesDraft ?? "");
  const [savingMinutes, setSavingMinutes] = useState(false);

  async function handleFinish() {
    setFinishing(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/hearing-sessions/${session.id}/finish`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إنهاء الاجتماع");
      setMinutes(data.hearingSession.minutesDraft ?? "");
      toast.success("تم إنهاء الاجتماع وتوليد مسودة المحضر");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إنهاء الاجتماع");
    } finally {
      setFinishing(false);
    }
  }

  async function handleSaveMinutes() {
    setSavingMinutes(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/hearing-sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutesDraft: minutes }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل حفظ المحضر");
      toast.success("تم حفظ المحضر");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ المحضر");
    } finally {
      setSavingMinutes(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await buildHearingMinutesDocxBlob({
        caseNumber,
        label: session.label,
        minutesText: minutes || "لم يتم توليد المحضر بعد.",
      });
      downloadBlob(blob, `محضر-${session.label}-${caseNumber}.docx`);
      toast.success("تم تصدير المحضر بصيغة Word");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تصدير المحضر");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>إنهاء الاجتماع ومحضر الجلسة</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleFinish} disabled={finishing}>
            {finishing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            إنهاء الاجتماع وتوليد مسودة محضر الجلسة
          </Button>
        </div>

        {minutes && (
          <div className="flex flex-col gap-2 border-t pt-4">
            <Label>مسودة المحضر (قابلة للتعديل قبل التصدير)</Label>
            <Textarea rows={14} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="font-mono text-sm" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleSaveMinutes} disabled={savingMinutes}>
                {savingMinutes ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                حفظ التعديلات
              </Button>
              <Button onClick={handleExport} disabled={exporting}>
                {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
                تصدير المحضر كملف Word
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
