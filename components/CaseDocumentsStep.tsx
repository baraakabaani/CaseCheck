"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2, Zap } from "lucide-react";
import { DocumentSlotUploader } from "@/components/DocumentSlotUploader";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import type { DocumentDetail } from "@/lib/queries";
import type { DocCategory } from "@/lib/schemas";

// الخانات الخمس الثابتة (المرحلة 3) — التصنيف يُحدَّد عند الرفع نفسه، لا
// يُترك للذكاء الاصطناعي لاحقاً (كان ذلك سبباً رئيسياً في تضخم حجم الطلب).
const SLOTS: { category: DocCategory; title: string; multiple: boolean }[] = [
  { category: "PRELIMINARY_RULING", title: "الحكم التمهيدي / قرار الندب", multiple: false },
  { category: "STATEMENT_OF_CLAIM", title: "لائحة / صحيفة الدعوى", multiple: false },
  { category: "PARTY_MEMO", title: "مذكرات الأطراف", multiple: true },
  { category: "PARTY_ATTACHMENT", title: "مستندات الأطراف وحوافظ المستندات", multiple: true },
  { category: "OTHER_JUDICIAL", title: "مستندات قضائية أخرى", multiple: true },
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

  const byCategory = useMemo(() => {
    const map = new Map<DocCategory, DocumentDetail[]>();
    for (const doc of documents) {
      const key = (doc.docCategory as DocCategory | null) ?? "UNSPECIFIED";
      const list = map.get(key) ?? [];
      list.push(doc);
      map.set(key, list);
    }
    return map;
  }, [documents]);

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
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {SLOTS.map((slot) => (
            <DocumentSlotUploader
              key={slot.category}
              caseId={caseId}
              docCategory={slot.category}
              title={slot.title}
              multiple={slot.multiple}
              documents={byCategory.get(slot.category) ?? []}
              onChanged={refresh}
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col items-end gap-2">
        <Button onClick={handleAnalyze} disabled={analyzing || documents.length === 0} size="lg">
          {analyzing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          بدء التحليل الأولي بالذكاء الاصطناعي
        </Button>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Zap className="size-3.5 text-amber-500" />
          نظام الضغط الذكي مفعّل: يتم تلخيص الحسابات والمستندات محلياً قبل الإرسال لتوفير
          الاستهلاك.
        </p>
      </div>
    </div>
  );
}
