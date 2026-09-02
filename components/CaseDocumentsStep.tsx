"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2 } from "lucide-react";
import { FileUploader } from "@/components/FileUploader";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import type { DocumentDetail } from "@/lib/queries";

// إرشاد بصري فقط — لا يترتب عليه أي تصنيف يدوي عند الرفع (يقوم الذكاء
// الاصطناعي بالتصنيف تلقائياً في المرحلة التالية).
const DOCUMENT_CATEGORY_HINTS = [
  "الحكم التمهيدي / قرار الندب",
  "لائحة / صحيفة الدعوى",
  "مذكرات الأطراف (المدعي، المدعى عليه، والمذكرات التعقيبية)",
  "مستندات الأطراف وحوافظ المستندات",
  "مستندات قضائية أخرى (أحكام سابقة، محاضر جلسات، تقارير سابقة)",
];

export function CaseDocumentsStep({
  caseId,
  documents,
}: {
  caseId: string;
  documents: DocumentDetail[];
}) {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);

  function refresh() {
    router.refresh();
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/analysis`, {
        method: "POST",
        headers: buildClientApiKeyHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحليل ملف الدعوى");

      if (data.warning) toast.warning(data.warning);
      else if (data.mode === "OFFLINE") {
        toast.success("تم إعداد تقرير أولي محدود (بدون مفتاح API)");
      } else {
        toast.success("تم إعداد التحليل الأولي بالذكاء الاصطناعي");
      }
      router.push(`/cases/${caseId}/setup/analysis`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تحليل ملف الدعوى");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            ارفع جميع المستندات المتاحة في نظام المحكمة عند استلام المأمورية. لا حاجة لتصنيف كل
            ملف يدوياً؛ سيقوم الذكاء الاصطناعي بذلك في المرحلة التالية — القائمة أدناه للاسترشاد
            فقط بأنواع المستندات المطلوبة:
          </p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {DOCUMENT_CATEGORY_HINTS.map((label) => (
              <Badge key={label} variant="outline" className="font-normal text-muted-foreground">
                {label}
              </Badge>
            ))}
          </div>
          <FileUploader caseId={caseId} documents={documents} onChanged={refresh} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={handleAnalyze} disabled={analyzing || documents.length === 0} size="lg">
          {analyzing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          تحليل ملف الدعوى بالذكاء الاصطناعي
        </Button>
      </div>
    </div>
  );
}
