"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, ArrowRight } from "lucide-react";
import { LITIGATION_DEGREES, CASE_CATEGORIES, type LitigationDegree, type CaseCategory } from "@/lib/schemas";
import { LITIGATION_DEGREE_LABELS, CASE_CATEGORY_LABELS } from "@/lib/case-intake-labels";
import { loadFormDraft, saveFormDraft, clearFormDraft } from "@/lib/form-draft";
import { CaseBasicsAutoFillUpload } from "@/components/CaseBasicsAutoFillUpload";
import { cn } from "@/lib/utils";
import type { ExtractedCaseBasics } from "@/lib/case-basics-schemas";

const DRAFT_KEY = "case-intake-step1-draft";

/** حدود الحقول المقترَحة تلقائياً (خانة "تعبئة تلقائية من مستند" أعلى
 * النموذج) — تختفي بمجرد أن يضغط المستخدم داخل الحقل (مراجعة ضمنية)، لا
 * فقط عند تعديل قيمته، حتى لا يُطالَب بتعديل حقل صحيح أصلاً ليُعتبر
 * "مراجَعاً". */
const AUTO_FILLED_CLASS = "border-purple-400 ring-1 ring-purple-300/60 dark:border-purple-600";

export interface PartyDraft {
  name: string;
  /** الصفة كما تُطبع في غلاف تقرير الخبرة (الموديول 4): "شريك بنسبة 68%
   * ومدير الشركة" — اختيارية. */
  capacityNote: string;
}

export interface CaseIntakeStep1InitialData {
  caseNumber: string;
  court: string;
  circuit: string | null;
  litigationDegree: LitigationDegree;
  caseCategory: CaseCategory;
  title: string | null;
  claimants: PartyDraft[];
  respondents: PartyDraft[];
  notes: string | null;
  clientName: string | null;
  clientEmail: string | null;
}

interface Step1Draft {
  caseNumber: string;
  court: string;
  circuit: string;
  litigationDegree: LitigationDegree;
  caseCategory: CaseCategory;
  title: string;
  // مصفوفة نصوص هي الصيغة القديمة لهذا الحقل (قبل إضافة الصفة) — قد تبقى
  // محفوظة في متصفح مستخدم لم يزر الصفحة منذ هذا التعديل.
  claimants: PartyDraft[] | string[];
  respondents: PartyDraft[] | string[];
  notes: string;
  clientName: string;
  clientEmail: string;
}

function normalizeDraftParties(parties: PartyDraft[] | string[] | undefined): PartyDraft[] | null {
  if (!parties?.length) return null;
  return parties.map((p) => (typeof p === "string" ? { name: p, capacityNote: "" } : p));
}

function PartyListEditor({
  label,
  placeholder,
  parties,
  onChange,
  isAutoFilled,
  onFieldReviewed,
}: {
  label: string;
  placeholder: string;
  parties: PartyDraft[];
  onChange: (next: PartyDraft[]) => void;
  /** هل هذا الحقل (بفهرس الطرف واسم الحقل) لا يزال مُقترَحاً تلقائياً ولم
   * يراجعه المستخدم بعد؟ اختياري — النماذج التي لا تدعم التعبئة التلقائية
   * (لا يوجد لها حالياً غير هذا النموذج) تتجاهله. */
  isAutoFilled?: (index: number, field: "name" | "capacityNote") => boolean;
  onFieldReviewed?: (index: number, field: "name" | "capacityNote") => void;
}) {
  function update(i: number, patch: Partial<PartyDraft>) {
    onChange(parties.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function remove(i: number) {
    onChange(parties.filter((_, idx) => idx !== i));
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label} *</Label>
      {parties.map((party, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
          <Input
            value={party.name}
            onChange={(e) => update(i, { name: e.target.value })}
            onFocus={() => onFieldReviewed?.(i, "name")}
            placeholder={placeholder}
            className={cn(isAutoFilled?.(i, "name") && AUTO_FILLED_CLASS)}
          />
          <Input
            value={party.capacityNote}
            onChange={(e) => update(i, { capacityNote: e.target.value })}
            onFocus={() => onFieldReviewed?.(i, "capacityNote")}
            placeholder="الصفة (اختياري) — مثال: شريك بنسبة 68% ومدير الشركة"
            className={cn(isAutoFilled?.(i, "capacityNote") && AUTO_FILLED_CLASS)}
          />
          {parties.length > 1 && (
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => onChange([...parties, { name: "", capacityNote: "" }])}
      >
        <Plus className="size-4" />
        إضافة طرف
      </Button>
    </div>
  );
}

export function CaseIntakeStep1Form({
  caseId,
  initialData,
}: {
  /** Set when editing an already-created case's Phase-1 data (reached via
   * a "رجوع" link from a later phase, or /cases/new?resume=<id>) — switches
   * the submit action from create (POST) to update (PATCH) and skips the
   * localStorage draft mechanism in favor of the real saved values. */
  caseId?: string;
  initialData?: CaseIntakeStep1InitialData;
}) {
  const router = useRouter();
  const isEditing = Boolean(caseId);
  const [submitting, setSubmitting] = useState(false);

  const [caseNumber, setCaseNumber] = useState(initialData?.caseNumber ?? "");
  const [court, setCourt] = useState(initialData?.court ?? "");
  const [circuit, setCircuit] = useState(initialData?.circuit ?? "");
  const [litigationDegree, setLitigationDegree] = useState<LitigationDegree>(
    initialData?.litigationDegree ?? "FIRST_INSTANCE",
  );
  const [caseCategory, setCaseCategory] = useState<CaseCategory>(
    initialData?.caseCategory ?? "COMMERCIAL",
  );
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [claimants, setClaimants] = useState<PartyDraft[]>(
    initialData?.claimants.length ? initialData.claimants : [{ name: "", capacityNote: "" }],
  );
  const [respondents, setRespondents] = useState<PartyDraft[]>(
    initialData?.respondents.length ? initialData.respondents : [{ name: "", capacityNote: "" }],
  );
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [clientName, setClientName] = useState(initialData?.clientName ?? "");
  const [clientEmail, setClientEmail] = useState(initialData?.clientEmail ?? "");

  // خانة "تعبئة تلقائية من مستند" أعلى النموذج — حقول تحمل قيماً مقترَحة لم
  // يراجعها المستخدم بعد (حدود بنفسجية، تختفي بمجرد الضغط داخل الحقل)،
  // والملف الأصلي نفسه (يُرفَع فعلياً كخانة "الحكم التمهيدي" في المرحلة 3
  // بعد إنشاء الدعوى بنجاح — لا حاجة لرفعه مرتين). غير مُفعَّلة في وضع
  // التعديل (isEditing): بيانات دعوى موجودة فعلاً لا تُعرَض عليها تعبئة
  // تلقائية من مستند جديد.
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const [rulingFile, setRulingFile] = useState<File | null>(null);

  function reviewField(key: string) {
    setAutoFilledFields((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }
  function isAuto(key: string) {
    return autoFilledFields.has(key);
  }

  function handleExtracted(result: ExtractedCaseBasics, file: File) {
    setRulingFile(file);
    const next = new Set<string>();
    if (result.caseNumber) {
      setCaseNumber(result.caseNumber);
      next.add("caseNumber");
    }
    if (result.court) {
      setCourt(result.court);
      next.add("court");
    }
    if (result.circuit) {
      setCircuit(result.circuit);
      next.add("circuit");
    }
    if (result.litigationDegree) {
      setLitigationDegree(result.litigationDegree);
      next.add("litigationDegree");
    }
    if (result.caseCategory) {
      setCaseCategory(result.caseCategory);
      next.add("caseCategory");
    }
    if (result.title) {
      setTitle(result.title);
      next.add("title");
    }
    if (result.claimants.length > 0) {
      setClaimants(result.claimants.map((p) => ({ name: p.name, capacityNote: p.capacityNote ?? "" })));
      result.claimants.forEach((p, i) => {
        next.add(`claimant-name-${i}`);
        if (p.capacityNote) next.add(`claimant-capacityNote-${i}`);
      });
    }
    if (result.respondents.length > 0) {
      setRespondents(result.respondents.map((p) => ({ name: p.name, capacityNote: p.capacityNote ?? "" })));
      result.respondents.forEach((p, i) => {
        next.add(`respondent-name-${i}`);
        if (p.capacityNote) next.add(`respondent-capacityNote-${i}`);
      });
    }
    setAutoFilledFields(next);
  }

  // استعادة المسودة المحفوظة محلياً (إن وُجدت) بعد التحميل الأول فقط، لتفادي
  // أي تعارض بين عرض الخادم وعرض المتصفح الأول. مضبوطة بمرجع (ref) فلا تُنفَّذ
  // إلا مرة واحدة عند التركيب — لا تعتمد على أي حالة متغيّرة تسبب حلقة تحديث.
  // في وضع التعديل (isEditing) تُستبعد هذه الآلية تماماً — القيم الحقيقية
  // المحفوظة في قاعدة البيانات هي المصدر الموثوق، لا مسودة محلية قديمة.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || isEditing) return;
    restored.current = true;
    const draft = loadFormDraft<Step1Draft>(DRAFT_KEY);
    if (!draft) return;
    // One-time mount-only localStorage hydration, guarded by `restored`
    // above; not reactive to any prop/state so it cannot cascade.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (draft.caseNumber) setCaseNumber(draft.caseNumber);
    if (draft.court) setCourt(draft.court);
    if (draft.circuit) setCircuit(draft.circuit);
    if (draft.litigationDegree) setLitigationDegree(draft.litigationDegree);
    if (draft.caseCategory) setCaseCategory(draft.caseCategory);
    if (draft.title) setTitle(draft.title);
    const normalizedClaimants = normalizeDraftParties(draft.claimants);
    if (normalizedClaimants) setClaimants(normalizedClaimants);
    const normalizedRespondents = normalizeDraftParties(draft.respondents);
    if (normalizedRespondents) setRespondents(normalizedRespondents);
    if (draft.notes) setNotes(draft.notes);
    if (draft.clientName) setClientName(draft.clientName);
    if (draft.clientEmail) setClientEmail(draft.clientEmail);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isEditing]);

  useEffect(() => {
    if (!restored.current || isEditing) return;
    saveFormDraft<Step1Draft>(DRAFT_KEY, {
      caseNumber,
      court,
      circuit,
      litigationDegree,
      caseCategory,
      title,
      claimants,
      respondents,
      notes,
      clientName,
      clientEmail,
    });
  }, [
    isEditing,
    caseNumber,
    court,
    circuit,
    litigationDegree,
    caseCategory,
    title,
    claimants,
    respondents,
    notes,
    clientName,
    clientEmail,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!caseNumber.trim() || !court.trim()) {
      toast.error("الرجاء تعبئة رقم الدعوى والمحكمة");
      return;
    }
    const cleanParty = (p: PartyDraft) => ({ name: p.name.trim(), capacityNote: p.capacityNote.trim() || null });
    const cleanedClaimants = claimants.map(cleanParty).filter((p) => p.name);
    const cleanedRespondents = respondents.map(cleanParty).filter((p) => p.name);
    if (cleanedClaimants.length === 0 || cleanedRespondents.length === 0) {
      toast.error("الرجاء إدخال اسم مدعٍ واحد على الأقل ومدعى عليه واحد على الأقل");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        caseNumber: caseNumber.trim(),
        court: court.trim(),
        circuit: circuit.trim() || null,
        litigationDegree,
        caseCategory,
        title: title.trim() || null,
        claimants: cleanedClaimants,
        respondents: cleanedRespondents,
        notes: notes.trim() || null,
        clientName: clientName.trim() || null,
        clientEmail: clientEmail.trim() || null,
      };

      const res = await fetch(isEditing ? `/api/cases/${caseId}` : "/api/cases", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حفظ بيانات القضية");

      if (!isEditing) clearFormDraft(DRAFT_KEY);

      // الملف المرفوع للتعبئة التلقائية (إن وُجد) يُرفَع الآن فعلياً كخانة
      // "الحكم التمهيدي / قرار الندب" — بعد إنشاء الدعوى مباشرة، فلا يحتاج
      // الخبير لرفعه مرة أخرى يدوياً في المرحلة 3. فشل هذه الخطوة لا يوقف
      // المتابعة إلى المرحلة التالية — الدعوى نفسها أُنشئت بنجاح فعلاً،
      // ويبقى بإمكان الخبير رفع الملف يدوياً لاحقاً.
      if (!isEditing && rulingFile) {
        try {
          const docForm = new FormData();
          docForm.append("files", rulingFile);
          docForm.append("docCategory", "PRELIMINARY_RULING");
          const docRes = await fetch(`/api/cases/${data.case.id}/documents`, {
            method: "POST",
            body: docForm,
          });
          if (docRes.ok) {
            toast.success("تم حفظ بيانات القضية، وأُضيف ملف الحكم التمهيدي تلقائياً");
          } else {
            toast.success("تم حفظ بيانات القضية الأساسية");
            toast.warning("تعذّر إضافة ملف الحكم التمهيدي تلقائياً — ارفعه يدوياً في مرحلة المستندات");
          }
        } catch {
          toast.success("تم حفظ بيانات القضية الأساسية");
          toast.warning("تعذّر إضافة ملف الحكم التمهيدي تلقائياً — ارفعه يدوياً في مرحلة المستندات");
        }
      } else {
        toast.success("تم حفظ بيانات القضية الأساسية");
      }

      router.push(`/cases/${isEditing ? caseId : data.case.id}/setup/mandate`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {!isEditing && <CaseBasicsAutoFillUpload onExtracted={handleExtracted} />}

      <Card>
        <CardHeader>
          <CardTitle>بيانات القضية الأساسية</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caseNumber">رقم الدعوى *</Label>
            <Input
              id="caseNumber"
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              onFocus={() => reviewField("caseNumber")}
              placeholder="مثال: 4360 لسنة 2026 تجاري"
              required
              className={cn(isAuto("caseNumber") && AUTO_FILLED_CLASS)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="court">المحكمة / الجهة القضائية *</Label>
            <Input
              id="court"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              onFocus={() => reviewField("court")}
              placeholder="مثال: محكمة الشارقة الابتدائية"
              required
              className={cn(isAuto("court") && AUTO_FILLED_CLASS)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="circuit">الدائرة</Label>
            <Input
              id="circuit"
              value={circuit}
              onChange={(e) => setCircuit(e.target.value)}
              onFocus={() => reviewField("circuit")}
              placeholder="مثال: الدائرة التجارية الرابعة"
              className={cn(isAuto("circuit") && AUTO_FILLED_CLASS)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>درجة التقاضي *</Label>
            <Select
              value={litigationDegree}
              onValueChange={(v) => {
                setLitigationDegree(v as LitigationDegree);
                reviewField("litigationDegree");
              }}
            >
              <SelectTrigger
                className={cn("w-full", isAuto("litigationDegree") && AUTO_FILLED_CLASS)}
                onFocus={() => reviewField("litigationDegree")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LITIGATION_DEGREES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {LITIGATION_DEGREE_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>نوع الدعوى *</Label>
            <Select
              value={caseCategory}
              onValueChange={(v) => {
                setCaseCategory(v as CaseCategory);
                reviewField("caseCategory");
              }}
            >
              <SelectTrigger
                className={cn("w-full", isAuto("caseCategory") && AUTO_FILLED_CLASS)}
                onFocus={() => reviewField("caseCategory")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CASE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CASE_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">عنوان مختصر للقضية</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => reviewField("title")}
              placeholder="مثال: مطالبة مالية ناشئة عن عقد توريد"
              className={cn(isAuto("title") && AUTO_FILLED_CLASS)}
            />
          </div>

          <PartyListEditor
            label="اسم المدعي / المستأنف"
            placeholder="اسم المدعي"
            parties={claimants}
            onChange={setClaimants}
            isAutoFilled={(i, field) => isAuto(`claimant-${field}-${i}`)}
            onFieldReviewed={(i, field) => reviewField(`claimant-${field}-${i}`)}
          />
          <PartyListEditor
            label="اسم المدعى عليه / المستأنف ضده"
            placeholder="اسم المدعى عليه"
            parties={respondents}
            onChange={setRespondents}
            isAutoFilled={(i, field) => isAuto(`respondent-${field}-${i}`)}
            onFieldReviewed={(i, field) => reviewField(`respondent-${field}-${i}`)}
          />

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">ملاحظات أولية</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>مراسلة المتعامل (اختياري)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <p className="text-sm text-muted-foreground sm:col-span-2">
            جهة الاتصال التي سيُرسل إليها خطاب طلب استكمال المستندات — منفصلة عن وكلاء الأطراف
            الذين يخاطَبون في إخطار اجتماع الخبرة.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clientName">اسم المتعامل</Label>
            <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clientEmail">البريد الإلكتروني للمتعامل</Label>
            <Input
              id="clientEmail"
              type="email"
              dir="ltr"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@example.com"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href="/">
            <ArrowRight className="size-4" />
            رجوع إلى لوحة القضايا
          </Link>
        </Button>

        <Button type="submit" disabled={submitting} size="lg">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {isEditing ? "حفظ ومتابعة" : "التالي: بيانات مأمورية الخبرة"}
        </Button>
      </div>
    </form>
  );
}
