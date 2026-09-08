"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderUp, Loader2, FileText, X, AlertTriangle, UploadCloud } from "lucide-react";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import { DOC_CATEGORY_LABELS } from "@/lib/case-intake-labels";
import { DOCUMENT_UPLOAD_SLOTS } from "@/lib/document-slots";
import { CLASSIFIABLE_CATEGORIES, type ClassifiableCategory } from "@/lib/document-classifier";
import { cn } from "@/lib/utils";
import type { DocumentDetail } from "@/lib/queries";
import type { DocCategory } from "@/lib/schemas";

const SLOT_BY_CATEGORY = new Map(DOCUMENT_UPLOAD_SLOTS.map((s) => [s.category, s]));

interface ReviewRow {
  file: File;
  category: ClassifiableCategory;
  reasoning: string;
}

/** خيار ثانٍ لرفع مستندات المرحلة 3، بديل عن رفع كل خانة على حدة: اسحب
 * مجلداً كاملاً (أو عدة ملفات معاً) فيقترح النظام خانة كل ملف تلقائياً، ثم
 * يراجع الخبير الاقتراحات (وتظل كل خانة قابلة للتعديل قبل التأكيد) قبل
 * الرفع الفعلي — لا يُرفَع أي ملف قبل الضغط على "تأكيد الرفع". */
export function BulkDocumentUpload({
  caseId,
  existingCounts,
  onChanged,
}: {
  caseId: string;
  existingCounts: Map<DocCategory, DocumentDetail[]>;
  onChanged: () => void;
}) {
  const [classifying, setClassifying] = useState(false);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  async function classifyFiles(files: File[]) {
    setClassifying(true);
    try {
      const formData = new FormData();
      for (const f of files) formData.append("files", f);
      const res = await fetch("/api/documents/classify", {
        method: "POST",
        headers: buildClientApiKeyHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تصنيف الملفات");

      const byFileName = new Map(files.map((f) => [f.name, f]));
      const newRows: ReviewRow[] = data.results
        .map((r: { fileName: string; category: ClassifiableCategory; reasoning: string }) => {
          const file = byFileName.get(r.fileName);
          return file ? { file, category: r.category, reasoning: r.reasoning } : null;
        })
        .filter((r: ReviewRow | null): r is ReviewRow => r !== null);

      setRows(newRows);
      if (data.warning) toast.warning(data.warning);
      else toast.success(`تم اقتراح تصنيف ${newRows.length} ملف(ات) — راجعها قبل التأكيد`);
      if (data.skipped?.length > 0) {
        for (const s of data.skipped) toast.error(`${s.fileName}: ${s.error}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تصنيف الملفات");
    } finally {
      setClassifying(false);
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) classifyFiles(acceptedFiles);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: classifying || uploading,
    noKeyboard: true,
  });

  function handleFolderPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // يسمح باختيار نفس المجلد مرة أخرى لاحقاً
    if (files.length > 0) classifyFiles(files);
  }

  function updateCategory(index: number, category: ClassifiableCategory) {
    setRows((prev) => prev?.map((r, i) => (i === index ? { ...r, category } : r)) ?? null);
  }
  function removeRow(index: number) {
    setRows((prev) => prev?.filter((_, i) => i !== index) ?? null);
  }

  // خانة "ملف واحد فقط" (الحكم التمهيدي / لائحة الدعوى) لا تقبل أكثر من
  // ملف — سواء بين ملفات هذه الدفعة نفسها، أو مع ملف مرفوع مسبقاً يدوياً.
  const conflicts = useMemo(() => {
    if (!rows) return new Set<number>();
    const countByCategory = new Map<ClassifiableCategory, number>();
    for (const r of rows) countByCategory.set(r.category, (countByCategory.get(r.category) ?? 0) + 1);
    const conflictIndexes = new Set<number>();
    rows.forEach((r, i) => {
      const slot = SLOT_BY_CATEGORY.get(r.category);
      if (!slot || slot.multiple) return;
      const alreadyUploaded = (existingCounts.get(r.category)?.length ?? 0) > 0;
      const inThisBatch = countByCategory.get(r.category) ?? 0;
      if (alreadyUploaded || inThisBatch > 1) conflictIndexes.add(i);
    });
    return conflictIndexes;
  }, [rows, existingCounts]);

  async function handleConfirm() {
    if (!rows || rows.length === 0) return;
    if (conflicts.size > 0) {
      toast.error("عدّل تصنيف الملفات المتعارضة أولاً (خانة تقبل ملفاً واحداً فقط)");
      return;
    }

    setUploading(true);
    try {
      const byCategory = new Map<ClassifiableCategory, File[]>();
      for (const r of rows) {
        const list = byCategory.get(r.category) ?? [];
        list.push(r.file);
        byCategory.set(r.category, list);
      }

      let succeeded = 0;
      let failed = 0;
      for (const [category, files] of byCategory) {
        const formData = new FormData();
        for (const f of files) formData.append("files", f);
        formData.append("docCategory", category);
        const res = await fetch(`/api/cases/${caseId}/documents`, { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          failed += files.length;
          toast.error(`${DOC_CATEGORY_LABELS[category]}: ${data.error || "فشل الرفع"}`);
          continue;
        }
        const results = data.results as { fileName: string; error?: string }[];
        for (const r of results) {
          if (r.error) {
            failed++;
            toast.error(`${r.fileName}: ${r.error}`);
          } else {
            succeeded++;
          }
        }
      }

      if (succeeded > 0) toast.success(`تم رفع ${succeeded} ملف(ات) بنجاح`);
      if (failed === 0) setRows(null);
      onChanged();
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-bold">رفع دفعة واحدة (مجلد كامل) — اختياري</p>
          <p className="text-xs text-muted-foreground">
            اسحب مجلد الدعوى بالكامل أو عدة ملفات معاً، ويقترح النظام خانة كل ملف تلقائياً — راجع
            الاقتراحات وعدّل ما يلزم قبل التأكيد. أو تجاهل هذا وارفع كل خانة يدوياً كما في الأسفل.
          </p>
        </div>

        {!rows && (
          <div
            {...getRootProps()}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-center transition-colors",
              isDragActive && "border-primary bg-primary/5",
              !isDragActive && "border-muted-foreground/25",
              classifying && "opacity-60",
            )}
          >
            <input {...getInputProps()} />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              // @ts-expect-error -- سمة غير قياسية لكن مدعومة في كل المتصفحات الحديثة (Chrome/Edge/Firefox) لاختيار مجلد كامل
              webkitdirectory=""
              directory=""
              className="hidden"
              onChange={handleFolderPick}
            />
            {classifying ? (
              <>
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">جارٍ تصنيف الملفات بالذكاء الاصطناعي...</p>
              </>
            ) : (
              <>
                <FolderUp className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">اسحب المجلد أو الملفات هنا</p>
                <Button type="button" variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}>
                  <FolderUp className="size-4" />
                  اختيار مجلد
                </Button>
              </>
            )}
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              {rows.map((row, i) => (
                <div
                  key={`${row.file.name}-${i}`}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-md border p-2 sm:flex-row sm:items-center sm:gap-3",
                    conflicts.has(i) && "border-destructive/50 bg-destructive/5",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{row.file.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{row.reasoning}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {conflicts.has(i) && <AlertTriangle className="size-3.5 shrink-0 text-destructive" />}
                    <Select value={row.category} onValueChange={(v) => updateCategory(i, v as ClassifiableCategory)}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASSIFIABLE_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {DOC_CATEGORY_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)}>
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {conflicts.size > 0 && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="size-3.5" />
                خانات &quot;الحكم التمهيدي&quot; و&quot;لائحة الدعوى&quot; تقبل ملفاً واحداً فقط — عدّل تصنيف الملفات
                المتعارضة (محدَّدة أعلاه) قبل المتابعة.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRows(null)} disabled={uploading}>
                إلغاء
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={uploading || conflicts.size > 0}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                تأكيد الرفع ({rows.length})
              </Button>
            </div>
          </div>
        )}

        {rows && rows.length === 0 && (
          <Badge variant="outline" className="w-fit font-normal text-muted-foreground">
            لا توجد ملفات صالحة في هذه الدفعة
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
