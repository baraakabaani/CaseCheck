"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExpertProfileDialog } from "@/components/ExpertProfileDialog";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import { toDateInputValue } from "@/lib/format";
import type { CourtReportDetail, ExpertProfileDetail } from "@/lib/queries";

/** غلاف التقرير: بيانات القاضي/تاريخ الخطاب (خاصة بهذه الدعوى)، وملخص
 * للملف التعريفي للخبير (سجل واحد ثابت للتطبيق كله، انظر ExpertProfileDialog)
 * مع اختصار لتعديله دون مغادرة صفحة التقرير. */
export function ReportCoverSettings({
  caseId,
  report,
  expertProfile,
  onChanged,
}: {
  caseId: string;
  report: NonNullable<CourtReportDetail>;
  expertProfile: ExpertProfileDetail;
  onChanged: () => void;
}) {
  const [judgeName, setJudgeName] = useState(report.judgeName ?? "");
  const [judgeTitle, setJudgeTitle] = useState(report.judgeTitle ?? "");
  const [letterDate, setLetterDate] = useState(toDateInputValue(report.letterDate));

  async function save() {
    try {
      const res = await fetch(`/api/cases/${caseId}/court-report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...buildClientApiKeyHeaders() },
        body: JSON.stringify({
          judgeName: judgeName || null,
          judgeTitle: judgeTitle || null,
          letterDate: letterDate ? new Date(letterDate).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    }
  }

  const expertComplete = Boolean(expertProfile?.expertName && expertProfile?.registrationNumber);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Label className="mb-2 block text-sm font-medium">بيانات خطاب الغلاف الموجَّه للقاضي</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">اسم القاضي</Label>
              <Input value={judgeName} onChange={(e) => setJudgeName(e.target.value)} onBlur={save} placeholder="سعادة القاضي / ..." />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">صفة القاضي والمحكمة</Label>
              <Input value={judgeTitle} onChange={(e) => setJudgeTitle(e.target.value)} onBlur={save} />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">تاريخ الخطاب</Label>
              <Input type="date" value={letterDate} onChange={(e) => setLetterDate(e.target.value)} onBlur={save} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 p-3">
          <div className="text-sm">
            {expertComplete ? (
              <>
                <span className="font-medium">{expertProfile!.expertName}</span> — {expertProfile!.expertTitle} — رقم
                القيد: {expertProfile!.registrationNumber}
              </>
            ) : (
              <span className="text-muted-foreground">
                لم تُعرَّف بيانات الخبير بعد — مطلوبة قبل الاعتماد النهائي (تظهر في ختام التقرير وتوقيعه).
              </span>
            )}
          </div>
          <ExpertProfileDialog />
        </div>
      </CardContent>
    </Card>
  );
}
