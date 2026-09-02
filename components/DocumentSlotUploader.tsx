"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  FileImage,
  File as FileIcon,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { formatFileSize } from "@/lib/format";
import type { DocumentDetail } from "@/lib/queries";
import type { DocCategory } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const ACCEPTED = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

const KIND_ICON: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: FileText,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  image: FileImage,
  other: FileIcon,
};

/** One of the 5 fixed Phase-3 upload slots — matches lib/schemas.ts
 * DOC_CATEGORIES (minus UNSPECIFIED, which is never chosen at upload time). */
export function DocumentSlotUploader({
  caseId,
  docCategory,
  title,
  multiple,
  documents,
  onChanged,
}: {
  caseId: string;
  docCategory: DocCategory;
  title: string;
  multiple: boolean;
  documents: DocumentDetail[];
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const atCapacity = !multiple && documents.length >= 1;

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejections: { file: File }[]) => {
      if (rejections.length > 0) {
        toast.error(`تم رفض ${rejections.length} ملف(ات) لعدم دعم نوعها`);
      }
      if (acceptedFiles.length === 0) return;

      const files = multiple ? acceptedFiles : acceptedFiles.slice(0, 1);
      setUploading(true);
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      formData.append("docCategory", docCategory);

      try {
        const res = await fetch(`/api/cases/${caseId}/documents`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "فشل رفع الملفات");

        const failed = (data.results as Array<{ fileName: string; error?: string }>).filter(
          (r) => r.error,
        );
        const succeeded = data.results.length - failed.length;
        if (succeeded > 0) toast.success(`تم رفع ${succeeded} ملف(ات) بنجاح — ${title}`);
        for (const f of failed) toast.error(`${f.fileName}: ${f.error}`);

        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "فشل رفع الملفات");
      } finally {
        setUploading(false);
      }
    },
    [caseId, docCategory, multiple, title, onChanged],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    disabled: uploading || atCapacity,
    multiple,
    noClick: true,
    noKeyboard: true,
  });

  async function handleDelete(docId: string) {
    setDeletingId(docId);
    try {
      const res = await fetch(`/api/cases/${caseId}/documents/${docId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل حذف الملف");
      }
      toast.success("تم حذف الملف");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حذف الملف");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold">{title}</p>

      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          isDragActive && "border-primary bg-primary/5",
          !isDragActive && "border-muted-foreground/25",
          (uploading || atCapacity) && "opacity-60",
        )}
      >
        <input {...getInputProps()} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={open}
          disabled={uploading || atCapacity}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UploadCloud className="size-4" />
          )}
          {multiple ? "رفع ملفات" : "رفع ملف"}
        </Button>
        {atCapacity && (
          <p className="text-xs text-muted-foreground">
            احذف الملف الحالي لرفع بديل عنه
          </p>
        )}
      </div>

      {documents.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {documents.map((doc) => {
            const Icon = KIND_ICON[doc.fileKind] ?? FileIcon;
            const failed = doc.parseStatus === "FAILED";
            return (
              <div key={doc.id} className="flex flex-col gap-1 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{doc.fileName}</div>
                    <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                      <span>{formatFileSize(doc.fileSize)}</span>
                      {doc.pageCount != null && (
                        <>
                          <span>·</span>
                          <span>{doc.pageCount} صفحة</span>
                        </>
                      )}
                      {failed && (
                        <>
                          <span>·</span>
                          <span className="text-red-600">فشلت المعالجة</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    disabled={deletingId === doc.id}
                    onClick={() => handleDelete(doc.id)}
                  >
                    {deletingId === doc.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5 text-destructive" />
                    )}
                  </Button>
                </div>
                {failed && doc.parseError && (
                  <p className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-500">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    <span>{doc.parseError}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
