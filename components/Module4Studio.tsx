"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, FileDown, CheckCircle2 } from "lucide-react";
import { buildCourtReportDocxBlob, downloadBlob } from "@/lib/docx-export";
import { COURT_REPORT_STATUS_LABELS } from "@/lib/case-hub-labels";
import type { CaseDetail } from "@/lib/queries";
import type { CourtReportStatus } from "@/lib/hub-schemas";

const TABS: { key: keyof FieldsState; label: string; placeholder: string }[] = [
  {
    key: "introductionMandate",
    label: "المقدمة والمأمورية",
    placeholder: "تمهيد الدعوى، قرار الندب، ونص مأمورية الخبرة...",
  },
  {
    key: "partiesAndProcedures",
    label: "الأطراف والإجراءات",
    placeholder: "أطراف الدعوى، إجراءات الخبرة، الاجتماعات المنعقدة...",
  },
  {
    key: "taskAnalysis",
    label: "البحث والدراسة (المهام)",
    placeholder: "تحليل كل مهمة من مهام المأمورية: دفوع الأطراف، المستندات المفحوصة، الاحتساب...",
  },
  {
    key: "conclusionSettlement",
    label: "الخلاصة وتصفية الحساب",
    placeholder: "خلاصة النتائج وتصفية الحساب بين الأطراف...",
  },
  {
    key: "documentsIndex",
    label: "حافظة المستندات",
    placeholder: "فهرس مستندات ملف الخبرة المرفقة بالتقرير...",
  },
];

interface FieldsState {
  introductionMandate: string;
  partiesAndProcedures: string;
  taskAnalysis: string;
  conclusionSettlement: string;
  documentsIndex: string;
}

export function Module4Studio({ caseDetail }: { caseDetail: CaseDetail }) {
  const router = useRouter();
  const report = caseDetail.courtReport;

  const [fields, setFields] = useState<FieldsState>({
    introductionMandate: report?.introductionMandate ?? "",
    partiesAndProcedures: report?.partiesAndProcedures ?? "",
    taskAnalysis: report?.taskAnalysis ?? "",
    conclusionSettlement: report?.conclusionSettlement ?? "",
    documentsIndex: report?.documentsIndex ?? "",
  });
  const [status, setStatus] = useState<CourtReportStatus>(
    (report?.status as CourtReportStatus) ?? "DRAFT",
  );
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function handleSave(nextStatus?: CourtReportStatus) {
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseDetail.id}/court-report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, status: nextStatus ?? status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حفظ التقرير");
      if (nextStatus) setStatus(nextStatus);
      toast.success("تم حفظ مسودة التقرير");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ التقرير");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await buildCourtReportDocxBlob({
        caseNumber: caseDetail.caseNumber,
        caseTitle: caseDetail.title,
        sections: TABS.map((t) => ({ title: t.label, content: fields[t.key] })),
      });
      downloadBlob(blob, `تقرير-الخبرة-${caseDetail.caseNumber}.docx`);
      toast.success("تم تصدير التقرير بصيغة Word");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تصدير التقرير");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={
            status === "FINAL"
              ? "gap-1 border-primary/30 bg-primary/10 text-primary"
              : "gap-1"
          }
        >
          {status === "FINAL" && <CheckCircle2 className="size-3.5" />}
          {COURT_REPORT_STATUS_LABELS[status]}
        </Badge>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            تصدير كملف Word
          </Button>
          {status === "DRAFT" && (
            <Button variant="outline" onClick={() => handleSave("FINAL")} disabled={saving}>
              اعتماد التقرير
            </Button>
          )}
          <Button onClick={() => handleSave()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            حفظ المسودة
          </Button>
        </div>
      </div>

      <Tabs defaultValue={TABS[0].key} className="gap-4">
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <Card>
              <CardContent>
                <Textarea
                  rows={16}
                  value={fields[t.key]}
                  onChange={(e) => setFields((prev) => ({ ...prev, [t.key]: e.target.value }))}
                  placeholder={t.placeholder}
                  className="text-justify leading-7"
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <p className="text-xs text-muted-foreground">
        نسخة أولى: حقول نصية حرة لكل تبويب. التجميع الآلي من الموديولات 1-3، تقسيم البحث والدراسة
        إلى أقسام مستقلة لكل مهمة من مهام المأمورية، والتلوين حسب مصدر كل فقرة (اقتباس من
        اللوائح 🟦، احتساب بالذكاء الاصطناعي 🟪، استنتاج معتمد من الخبير 🟩) — تطوير لاحق.
      </p>
    </div>
  );
}
