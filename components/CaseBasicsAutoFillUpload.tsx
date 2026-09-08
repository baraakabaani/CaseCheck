"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadCloud, FileText, Loader2, X, Sparkles } from "lucide-react";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import { cn } from "@/lib/utils";
import type { ExtractedCaseBasics } from "@/lib/case-basics-schemas";

const ACCEPTED = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};

/** أعلى نموذج المرحلة 1 من معالج فتح الملف — رفع اختياري لمستند "الحكم
 * التمهيدي / قرار ندب الخبرة" لتعبئة حقول القضية الأساسية تلقائياً بدل
 * كتابتها يدوياً بالكامل. الملف نفسه يُمرَّر للأعلى (onExtracted) ليُحفَظ
 * في حالة النموذج ويُرفَع فعلياً كخانة "الحكم التمهيدي" في المرحلة 3 بعد
 * إنشاء الدعوى — لا حاجة لرفعه مرتين. لا شيء هنا يُخزَّن على الخادم؛
 * الاستخراج مؤقت بالكامل ويُراجعه الخبير قبل الحفظ الفعلي. */
export function CaseBasicsAutoFillUpload({
  onExtracted,
}: {
  onExtracted: (result: ExtractedCaseBasics, file: File) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[], rejections: { file: File }[]) => {
    if (rejections.length > 0) {
      toast.error("نوع الملف غير مدعوم — يُقبل PDF أو Word فقط");
    }
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/case-intake/extract-basics", {
        method: "POST",
        headers: buildClientApiKeyHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشلت التعبئة التلقائية");

      setFileName(file.name);
      onExtracted(data.result as ExtractedCaseBasics, file);

      if (data.warning) {
        toast.warning(data.warning);
      } else if (data.mode === "AI") {
        toast.success("تمت تعبئة الحقول تلقائياً — راجعها ثم عدّل ما يلزم قبل المتابعة");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشلت التعبئة التلقائية");
    } finally {
      setUploading(false);
    }
  }, [onExtracted]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    disabled: uploading,
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-2">
        <div>
          <p className="text-sm font-bold">تعبئة تلقائية من مستند (اختياري)</p>
          <p className="text-xs text-muted-foreground">
            ارفع الحكم التمهيدي أو قرار ندب الخبرة ليقترح النظام قيماً للحقول أدناه — أو تجاهل هذا
            وابدأ الكتابة يدوياً مباشرة. الحقول المقترَحة تُعلَّم بلون مميز حتى تراجعها.
          </p>
        </div>
        <div
          {...getRootProps()}
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border-2 border-dashed p-3 transition-colors",
            isDragActive && "border-primary bg-primary/5",
            !isDragActive && "border-muted-foreground/25",
            uploading && "opacity-60",
          )}
        >
          <input {...getInputProps()} />
          {fileName ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{fileName}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">اسحب الملف هنا أو اختره من جهازك</span>
          )}
          <div className="flex shrink-0 gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={open} disabled={uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
              {fileName ? "استبدال الملف" : "رفع ملف"}
            </Button>
            {fileName && !uploading && (
              <Button type="button" variant="ghost" size="icon" onClick={() => setFileName(null)}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {fileName && (
          <p className="flex items-center gap-1 text-xs text-purple-700 dark:text-purple-300">
            <Sparkles className="size-3.5" />
            سيُضاف هذا الملف تلقائياً كخانة «الحكم التمهيدي / قرار الندب» في مرحلة رفع المستندات.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
