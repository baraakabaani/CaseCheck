"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Loader2, Plus, Trash2 } from "lucide-react";
import { LITIGATION_DEGREES, CASE_CATEGORIES, type LitigationDegree, type CaseCategory } from "@/lib/schemas";
import { LITIGATION_DEGREE_LABELS, CASE_CATEGORY_LABELS } from "@/lib/case-intake-labels";
import { loadFormDraft, saveFormDraft, clearFormDraft } from "@/lib/form-draft";

const DRAFT_KEY = "case-intake-step1-draft";

interface Step1Draft {
  caseNumber: string;
  court: string;
  circuit: string;
  litigationDegree: LitigationDegree;
  caseCategory: CaseCategory;
  title: string;
  claimants: string[];
  respondents: string[];
  notes: string;
  clientName: string;
  clientEmail: string;
}

function PartyListEditor({
  label,
  placeholder,
  names,
  onChange,
}: {
  label: string;
  placeholder: string;
  names: string[];
  onChange: (next: string[]) => void;
}) {
  function update(i: number, value: string) {
    onChange(names.map((n, idx) => (idx === i ? value : n)));
  }
  function remove(i: number) {
    onChange(names.filter((_, idx) => idx !== i));
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label} *</Label>
      {names.map((name, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={name} onChange={(e) => update(i, e.target.value)} placeholder={placeholder} />
          {names.length > 1 && (
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
        onClick={() => onChange([...names, ""])}
      >
        <Plus className="size-4" />
        إضافة طرف
      </Button>
    </div>
  );
}

export function CaseIntakeStep1Form() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [caseNumber, setCaseNumber] = useState("");
  const [court, setCourt] = useState("");
  const [circuit, setCircuit] = useState("");
  const [litigationDegree, setLitigationDegree] = useState<LitigationDegree>("FIRST_INSTANCE");
  const [caseCategory, setCaseCategory] = useState<CaseCategory>("COMMERCIAL");
  const [title, setTitle] = useState("");
  const [claimants, setClaimants] = useState<string[]>([""]);
  const [respondents, setRespondents] = useState<string[]>([""]);
  const [notes, setNotes] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  // استعادة المسودة المحفوظة محلياً (إن وُجدت) بعد التحميل الأول فقط، لتفادي
  // أي تعارض بين عرض الخادم وعرض المتصفح الأول. مضبوطة بمرجع (ref) فلا تُنفَّذ
  // إلا مرة واحدة عند التركيب — لا تعتمد على أي حالة متغيّرة تسبب حلقة تحديث.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
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
    if (draft.claimants?.length) setClaimants(draft.claimants);
    if (draft.respondents?.length) setRespondents(draft.respondents);
    if (draft.notes) setNotes(draft.notes);
    if (draft.clientName) setClientName(draft.clientName);
    if (draft.clientEmail) setClientEmail(draft.clientEmail);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!restored.current) return;
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
    const cleanedClaimants = claimants.map((n) => n.trim()).filter(Boolean);
    const cleanedRespondents = respondents.map((n) => n.trim()).filter(Boolean);
    if (cleanedClaimants.length === 0 || cleanedRespondents.length === 0) {
      toast.error("الرجاء إدخال اسم مدعٍ واحد على الأقل ومدعى عليه واحد على الأقل");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إنشاء ملف الدعوى");

      clearFormDraft(DRAFT_KEY);
      toast.success("تم حفظ بيانات القضية الأساسية");
      router.push(`/cases/${data.case.id}/setup/mandate`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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
              placeholder="مثال: 4360 لسنة 2026 تجاري"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="court">المحكمة / الجهة القضائية *</Label>
            <Input
              id="court"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder="مثال: محكمة الشارقة الابتدائية"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="circuit">الدائرة</Label>
            <Input
              id="circuit"
              value={circuit}
              onChange={(e) => setCircuit(e.target.value)}
              placeholder="مثال: الدائرة التجارية الرابعة"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>درجة التقاضي *</Label>
            <Select
              value={litigationDegree}
              onValueChange={(v) => setLitigationDegree(v as LitigationDegree)}
            >
              <SelectTrigger className="w-full">
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
              onValueChange={(v) => setCaseCategory(v as CaseCategory)}
            >
              <SelectTrigger className="w-full">
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
              placeholder="مثال: مطالبة مالية ناشئة عن عقد توريد"
            />
          </div>

          <PartyListEditor
            label="اسم المدعي / المستأنف"
            placeholder="اسم المدعي"
            names={claimants}
            onChange={setClaimants}
          />
          <PartyListEditor
            label="اسم المدعى عليه / المستأنف ضده"
            placeholder="اسم المدعى عليه"
            names={respondents}
            onChange={setRespondents}
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

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitting} size="lg">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          التالي: بيانات مأمورية الخبرة
        </Button>
      </div>
    </form>
  );
}
