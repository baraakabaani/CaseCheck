"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  FileImage,
  File as FileIcon,
  Trash2,
  Loader2,
  Download,
  AlertTriangle,
} from "lucide-react";
import { formatDateTime, formatFileSize } from "@/lib/format";
import type { DocumentDetail } from "@/lib/queries";
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

const PARSE_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  PARSED: { label: "تمت المعالجة", className: "text-emerald-600" },
  PENDING: { label: "قيد المعالجة", className: "text-muted-foreground" },
  FAILED: { label: "فشلت المعالجة", className: "text-red-600" },
  UNSUPPORTED: { label: "نوع غير مدعوم", className: "text-amber-600" },
};

export function FileUploader({
  caseId,
  documents,
  onChanged,
}: {
  caseId: string;
  documents: DocumentDetail[];
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejections: { file: File }[]) => {
      if (rejections.length > 0) {
        toast.error(`تم رفض ${rejections.length} ملف(ات) لعدم دعم نوعها`);
      }
      if (acceptedFiles.length === 0) return;

      setUploading(true);
      const formData = new FormData();
      for (const file of acceptedFiles) formData.append("files", file);

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
        if (succeeded > 0) toast.success(`تم رفع ${succeeded} ملف(ات) بنجاح`);
        for (const f of failed) toast.error(`${f.fileName}: ${f.error}`);

        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "فشل رفع الملفات");
      } finally {
        setUploading(false);
      }
    },
    [caseId, onChanged],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    disabled: uploading,
  });

  async function handleDelete(docId: string) {
    setDeletingId(docId);
    try {
      const res = await fetch(`/api/cases/${caseId}/documents/${docId}`, {
        method: "DELETE",
      });
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
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        ) : (
          <UploadCloud className="size-8 text-muted-foreground" />
        )}
        <p className="font-medium">اسحب الملفات هنا أو اضغط للاختيار</p>
        <p className="text-xs text-muted-foreground">
          PDF، Word، Excel، CSV، صور (PNG/JPG) — بحد أقصى 25 ميجابايت لكل ملف
        </p>
      </div>

      {documents.length > 0 && (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => {
            const Icon = KIND_ICON[doc.fileKind] ?? FileIcon;
            const status = PARSE_STATUS_LABEL[doc.parseStatus];
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-md border p-3"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{doc.fileName}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(doc.fileSize)}</span>
                    <span>·</span>
                    <span>{formatDateTime(doc.uploadedAt)}</span>
                    <span>·</span>
                    <span className={status?.className}>{status?.label}</span>
                    {doc.detectedPeriod && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="size-3" />
                          {doc.detectedPeriod}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
                  {doc.fileKind}
                </Badge>
                <Button variant="ghost" size="icon" asChild>
                  <a
                    href={`/api/cases/${caseId}/documents/${doc.id}?download=1`}
                    download={doc.fileName}
                  >
                    <Download className="size-4" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={deletingId === doc.id}
                  onClick={() => handleDelete(doc.id)}
                >
                  {deletingId === doc.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4 text-destructive" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
