"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2 } from "lucide-react";
import { FileUploader } from "@/components/FileUploader";
import { getStoredGroqApiKey } from "@/lib/client-api-key";
import { GROQ_API_KEY_HEADER } from "@/lib/api-key-header";
import type { DocumentDetail } from "@/lib/queries";

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
      const storedKey = getStoredGroqApiKey();
      const res = await fetch(`/api/cases/${caseId}/analysis`, {
        method: "POST",
        headers: storedKey ? { [GROQ_API_KEY_HEADER]: storedKey } : undefined,
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
          <p className="mb-4 text-sm text-muted-foreground">
            ارفع جميع المستندات المتاحة في نظام المحكمة عند استلام المأمورية — الحكم التمهيدي/قرار
            الندب، لائحة الدعوى، مذكرات الأطراف، مرفقاتهم، وأي مستندات قضائية أخرى. لا حاجة لتصنيف
            كل ملف يدوياً؛ سيقوم الذكاء الاصطناعي بذلك في المرحلة التالية.
          </p>
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
