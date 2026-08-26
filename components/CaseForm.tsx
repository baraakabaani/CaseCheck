"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { REQUIREMENT_PRESETS } from "@/lib/presets";
import type { CaseType } from "@/lib/schemas";

interface CustomRequirement {
  id: string;
  labelAr: string;
  category: string;
}

export function CaseForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [caseNumber, setCaseNumber] = useState("");
  const [title, setTitle] = useState("");
  const [court, setCourt] = useState("");
  const [caseType, setCaseType] = useState<CaseType>("LITIGATION");
  const [claimantName, setClaimantName] = useState("");
  const [respondentName, setRespondentName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");

  const presetGroup = useMemo(
    () => REQUIREMENT_PRESETS.find((g) => g.id === caseType),
    [caseType],
  );

  const [selectedPresetKeys, setSelectedPresetKeys] = useState<Set<string>>(
    () => new Set(REQUIREMENT_PRESETS.find((g) => g.id === "LITIGATION")?.items.map((i) => i.key)),
  );
  const [customRequirements, setCustomRequirements] = useState<CustomRequirement[]>([]);

  function handleCaseTypeChange(next: CaseType) {
    setCaseType(next);
    const group = REQUIREMENT_PRESETS.find((g) => g.id === next);
    setSelectedPresetKeys(new Set(group?.items.map((i) => i.key)));
  }

  function togglePreset(key: string, checked: boolean) {
    setSelectedPresetKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function addCustomRequirement() {
    setCustomRequirements((prev) => [
      ...prev,
      { id: crypto.randomUUID(), labelAr: "", category: "" },
    ]);
  }

  function updateCustomRequirement(id: string, field: "labelAr" | "category", value: string) {
    setCustomRequirements((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  }

  function removeCustomRequirement(id: string) {
    setCustomRequirements((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!caseNumber.trim() || !title.trim()) {
      toast.error("الرجاء تعبئة رقم الدعوى وعنوانها");
      return;
    }

    const validCustom = customRequirements.filter((r) => r.labelAr.trim());
    const requirements = [
      ...(presetGroup?.items
        .filter((item) => selectedPresetKeys.has(item.key))
        .map((item, index) => ({
          presetKey: item.key,
          labelAr: item.labelAr,
          labelEn: item.labelEn,
          category: item.category,
          description: item.description ?? null,
          isRequired: true,
          order: index,
        })) ?? []),
      ...validCustom.map((r, index) => ({
        presetKey: null,
        labelAr: r.labelAr.trim(),
        category: r.category.trim() || null,
        isRequired: true,
        order: (presetGroup?.items.length ?? 0) + index,
      })),
    ];

    setSubmitting(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseNumber: caseNumber.trim(),
          title: title.trim(),
          court: court.trim() || null,
          caseType,
          claimantName: claimantName.trim() || null,
          respondentName: respondentName.trim() || null,
          clientName: clientName.trim() || null,
          clientEmail: clientEmail.trim() || null,
          notes: notes.trim() || null,
          requirements,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "فشل إنشاء ملف الدعوى");
      }

      toast.success("تم إنشاء ملف الدعوى بنجاح");
      router.push(`/cases/${data.case.id}`);
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
          <CardTitle>بيانات الدعوى</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caseNumber">رقم الدعوى *</Label>
            <Input
              id="caseNumber"
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              placeholder="مثال: 1234/2026 تجاري كلي"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">عنوان / موضوع الدعوى *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: نزاع تجاري - مطالبة مالية"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="caseType">نوع الملف</Label>
            <Select value={caseType} onValueChange={(v) => handleCaseTypeChange(v as CaseType)}>
              <SelectTrigger id="caseType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LITIGATION">دعوى قضائية</SelectItem>
                <SelectItem value="ACCOUNTING_EXPERT">خبرة محاسبية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="court">المحكمة / الجهة القضائية</Label>
            <Input
              id="court"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder="مثال: محكمة دبي التجارية"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="claimantName">اسم المدعي</Label>
            <Input
              id="claimantName"
              value={claimantName}
              onChange={(e) => setClaimantName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="respondentName">اسم المدعى عليه</Label>
            <Input
              id="respondentName"
              value={respondentName}
              onChange={(e) => setRespondentName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clientName">اسم المتعامل (جهة المراسلة)</Label>
            <Input
              id="clientName"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
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
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">ملاحظات</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>متطلبات ملف الدعوى</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            حدد المستندات المطلوبة من القائمة المقترحة، ويمكنك إضافة متطلبات مخصصة
            إضافية أدناه. يمكن تعديل القائمة لاحقاً من صفحة الدعوى.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {presetGroup?.items.map((item) => (
              <label
                key={item.key}
                className="flex items-start gap-2 rounded-md border p-3 text-sm hover:bg-accent/40"
              >
                <Checkbox
                  checked={selectedPresetKeys.has(item.key)}
                  onCheckedChange={(checked) => togglePreset(item.key, checked === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">{item.labelAr}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.category}
                    {item.description ? ` · ${item.description}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>متطلبات مخصصة إضافية</Label>
              <Button type="button" variant="outline" size="sm" onClick={addCustomRequirement}>
                <Plus className="size-4" />
                إضافة متطلب
              </Button>
            </div>
            {customRequirements.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <Input
                  placeholder="اسم المتطلب"
                  value={r.labelAr}
                  onChange={(e) => updateCustomRequirement(r.id, "labelAr", e.target.value)}
                />
                <Input
                  placeholder="التصنيف (اختياري)"
                  value={r.category}
                  onChange={(e) => updateCustomRequirement(r.id, "category", e.target.value)}
                  className="w-48"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCustomRequirement(r.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitting} size="lg">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          إنشاء ملف الدعوى
        </Button>
      </div>
    </form>
  );
}
