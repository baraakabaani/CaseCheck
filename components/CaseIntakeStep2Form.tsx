"use client";

import { useState } from "react";
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
import {
  APPOINTMENT_CAPACITIES,
  MANDATE_NATURE_OPTIONS,
  type AppointmentCapacity,
  type MandateNatureOption,
} from "@/lib/schemas";
import { APPOINTMENT_CAPACITY_LABELS, MANDATE_NATURE_LABELS } from "@/lib/case-intake-labels";

interface CommitteeMemberDraft {
  key: string;
  name: string;
  specialization: string;
}

export function CaseIntakeStep2Form({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [mandateDecisionDate, setMandateDecisionDate] = useState("");
  const [mandateReceivedDate, setMandateReceivedDate] = useState("");
  const [mandateAcceptedDate, setMandateAcceptedDate] = useState("");
  const [nextHearingDate, setNextHearingDate] = useState("");
  const [reportDeadlineDate, setReportDeadlineDate] = useState("");
  const [appointmentCapacity, setAppointmentCapacity] =
    useState<AppointmentCapacity>("SOLE_EXPERT");
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMemberDraft[]>([]);
  const [mandateNature, setMandateNature] = useState<Set<MandateNatureOption>>(new Set());
  const [mandateNotes, setMandateNotes] = useState("");

  const isCommittee = appointmentCapacity !== "SOLE_EXPERT";

  function toggleNature(option: MandateNatureOption, checked: boolean) {
    setMandateNature((prev) => {
      const next = new Set(prev);
      if (checked) next.add(option);
      else next.delete(option);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mandateDecisionDate) {
      toast.error("الرجاء تحديد تاريخ قرار / حكم ندب الخبرة");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mandateDecisionDate: new Date(mandateDecisionDate).toISOString(),
          mandateReceivedDate: mandateReceivedDate
            ? new Date(mandateReceivedDate).toISOString()
            : null,
          mandateAcceptedDate: mandateAcceptedDate
            ? new Date(mandateAcceptedDate).toISOString()
            : null,
          nextHearingDate: nextHearingDate ? new Date(nextHearingDate).toISOString() : null,
          reportDeadlineDate: reportDeadlineDate
            ? new Date(reportDeadlineDate).toISOString()
            : null,
          appointmentCapacity,
          committeeMembers: isCommittee
            ? committeeMembers
                .filter((m) => m.name.trim())
                .map((m) => ({ name: m.name.trim(), specialization: m.specialization.trim() || null }))
            : [],
          mandateNature: Array.from(mandateNature),
          mandateNotes: mandateNotes.trim() || null,
          intakeStatus: "DRAFT_PHASE_3",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حفظ بيانات المأمورية");

      toast.success("تم حفظ بيانات مأمورية الخبرة");
      router.push(`/cases/${caseId}/setup/documents`);
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
          <CardTitle>بيانات قرار الندب</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mandateDecisionDate">تاريخ قرار / حكم ندب الخبرة *</Label>
            <Input
              id="mandateDecisionDate"
              type="date"
              value={mandateDecisionDate}
              onChange={(e) => setMandateDecisionDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mandateReceivedDate">تاريخ استلام المأمورية</Label>
            <Input
              id="mandateReceivedDate"
              type="date"
              value={mandateReceivedDate}
              onChange={(e) => setMandateReceivedDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mandateAcceptedDate">تاريخ قبول المأمورية</Label>
            <Input
              id="mandateAcceptedDate"
              type="date"
              value={mandateAcceptedDate}
              onChange={(e) => setMandateAcceptedDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nextHearingDate">تاريخ الجلسة القادمة</Label>
            <Input
              id="nextHearingDate"
              type="date"
              value={nextHearingDate}
              onChange={(e) => setNextHearingDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reportDeadlineDate">آخر موعد لإيداع تقرير الخبرة</Label>
            <Input
              id="reportDeadlineDate"
              type="date"
              value={reportDeadlineDate}
              onChange={(e) => setReportDeadlineDate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>صفة الندب</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 sm:w-72">
            <Select
              value={appointmentCapacity}
              onValueChange={(v) => setAppointmentCapacity(v as AppointmentCapacity)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPOINTMENT_CAPACITIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {APPOINTMENT_CAPACITY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCommittee && (
            <div className="flex flex-col gap-2 border-t pt-4">
              <Label>أسماء أعضاء اللجنة وتخصصاتهم</Label>
              {committeeMembers.map((m) => (
                <div key={m.key} className="flex items-center gap-2">
                  <Input
                    placeholder="اسم العضو"
                    value={m.name}
                    onChange={(e) =>
                      setCommitteeMembers((prev) =>
                        prev.map((x) => (x.key === m.key ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    placeholder="التخصص"
                    value={m.specialization}
                    onChange={(e) =>
                      setCommitteeMembers((prev) =>
                        prev.map((x) =>
                          x.key === m.key ? { ...x, specialization: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setCommitteeMembers((prev) => prev.filter((x) => x.key !== m.key))
                    }
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  setCommitteeMembers((prev) => [
                    ...prev,
                    { key: crypto.randomUUID(), name: "", specialization: "" },
                  ])
                }
              >
                <Plus className="size-4" />
                إضافة عضو
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>طبيعة المأمورية الحسابية</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">اختر واحداً أو أكثر</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {MANDATE_NATURE_OPTIONS.map((option) => (
              <label
                key={option}
                className="flex items-start gap-2 rounded-md border p-3 text-sm hover:bg-accent/40"
              >
                <Checkbox
                  checked={mandateNature.has(option)}
                  onCheckedChange={(checked) => toggleNature(option, checked === true)}
                  className="mt-0.5"
                />
                {MANDATE_NATURE_LABELS[option]}
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mandateNotes">ملاحظات على المأمورية</Label>
            <Textarea
              id="mandateNotes"
              value={mandateNotes}
              onChange={(e) => setMandateNotes(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitting} size="lg">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          التالي: رفع المستندات
        </Button>
      </div>
    </form>
  );
}
