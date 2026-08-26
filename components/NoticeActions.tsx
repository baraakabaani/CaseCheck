"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Printer, Copy, Mail, Trash2, Loader2 } from "lucide-react";
import { buildNoticeEmailContent, type NoticeContext, type NoticeCaseContext } from "@/lib/notice-templates";
import type { NoticeAddressee } from "@/lib/notice-schemas";
import type { NoticeDetail } from "@/lib/queries";

export function NoticeActions({
  caseId,
  notice,
  caseCtx,
}: {
  caseId: string;
  notice: NoticeDetail;
  caseCtx: NoticeCaseContext;
}) {
  const router = useRouter();
  const [showEmail, setShowEmail] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const parsed: NoticeContext = {
    ...notice,
    addressees: JSON.parse(notice.addressees) as NoticeAddressee[],
    requestedItems: JSON.parse(notice.requestedItems) as string[],
  };
  const email = buildNoticeEmailContent(parsed, caseCtx);

  async function handleCopy() {
    await navigator.clipboard.writeText(`${email.subject}\n\n${email.bodyAr}`);
    toast.success("تم نسخ نص البريد الإلكتروني");
  }

  async function handleDelete() {
    if (!confirm("هل أنت متأكد من حذف هذا الإخطار؟")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/notices/${notice.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل حذف الإخطار");
      }
      toast.success("تم حذف الإخطار");
      router.push(`/cases/${caseId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حذف الإخطار");
      setDeleting(false);
    }
  }

  return (
    <div className="no-print flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          طباعة / حفظ PDF
        </Button>
        <Button variant="outline" onClick={() => setShowEmail((v) => !v)}>
          <Mail className="size-4" />
          {showEmail ? "إخفاء نص البريد" : "عرض نص البريد الإلكتروني"}
        </Button>
        <Button variant="outline" onClick={handleCopy}>
          <Copy className="size-4" />
          نسخ نص البريد
        </Button>
        <Button variant="outline" onClick={handleDelete} disabled={deleting}>
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4 text-destructive" />}
          حذف الإخطار
        </Button>
      </div>

      {showEmail && (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-4">
          <div className="font-semibold">{email.subject}</div>
          <div className="whitespace-pre-wrap text-sm leading-7">{email.bodyAr}</div>
        </div>
      )}
    </div>
  );
}
