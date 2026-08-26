"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Loader2, Copy, FileDown, Printer, Sparkles } from "lucide-react";
import type { EmailDraftDetail } from "@/lib/queries";
import { buildEmailDocxBlob, downloadBlob } from "@/lib/docx-export";
import { formatDateTime } from "@/lib/format";
import { getStoredGroqApiKey } from "@/lib/client-api-key";
import { GROQ_API_KEY_HEADER } from "@/lib/api-key-header";

type Tone = "FORMAL" | "URGENT" | "FRIENDLY_REMINDER";

export function EmailPreviewModal({
  caseId,
  caseNumber,
  pendingCount,
  latestDraft,
  onGenerated,
}: {
  caseId: string;
  caseNumber: string;
  pendingCount: number;
  latestDraft: EmailDraftDetail | null;
  onGenerated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [tone, setTone] = useState<Tone>("FORMAL");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [draft, setDraft] = useState<EmailDraftDetail | null>(latestDraft);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const storedKey = getStoredGroqApiKey();
      const res = await fetch(`/api/cases/${caseId}/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(storedKey ? { [GROQ_API_KEY_HEADER]: storedKey } : {}),
        },
        body: JSON.stringify({ deadlineDays, tone, extraInstructions: extraInstructions || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إنشاء مسودة البريد");
      setDraft(data.draft);
      onGenerated();

      if (data.warning) {
        toast.warning(data.warning);
      } else if (data.mode === "OFFLINE") {
        toast.success("تم إنشاء المسودة من القالب الاحتياطي (بدون مفتاح API)");
      } else {
        toast.success("تم إنشاء مسودة البريد الإلكتروني بالذكاء الاصطناعي");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إنشاء مسودة البريد");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!draft) return;
    await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.bodyAr}`);
    toast.success("تم نسخ النص إلى الحافظة");
  }

  async function handleDownloadWord() {
    if (!draft) return;
    const blob = await buildEmailDocxBlob({ subject: draft.subject, bodyAr: draft.bodyAr });
    downloadBlob(blob, `خطاب-${caseNumber}.docx`);
  }

  function handlePrint() {
    if (!draft) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>${escapeHtml(draft.subject)}</title>
<style>body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:2.5rem;line-height:2;white-space:pre-wrap}h1{font-size:1.25rem}</style>
</head><body><h1>${escapeHtml(draft.subject)}</h1><div>${escapeHtml(draft.bodyAr)}</div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={pendingCount === 0}>
          <Mail className="size-4" />
          إنشاء خطاب للمتعامل
          {pendingCount > 0 && (
            <span className="ms-1 rounded-full bg-primary-foreground/20 px-1.5 text-xs">
              {pendingCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>مسودة خطاب طلب استكمال المستندات</DialogTitle>
          <DialogDescription>
            سيتم إنشاء خطاب رسمي بالعربية يسرد المستندات الناقصة أو غير المكتملة ({pendingCount})
            ويطلب من المتعامل استكمالها.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deadlineDays">مهلة الرد (أيام)</Label>
            <Input
              id="deadlineDays"
              type="number"
              min={1}
              max={90}
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(Number(e.target.value) || 7)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="tone">نبرة الخطاب</Label>
            <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
              <SelectTrigger id="tone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FORMAL">رسمي</SelectItem>
                <SelectItem value="URGENT">رسمي مستعجل</SelectItem>
                <SelectItem value="FRIENDLY_REMINDER">تذكير ودي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor="extra">تعليمات إضافية (اختياري)</Label>
            <Textarea
              id="extra"
              rows={2}
              value={extraInstructions}
              onChange={(e) => setExtraInstructions(e.target.value)}
              placeholder="مثال: أضف إشارة إلى جلسة قادمة بتاريخ محدد"
            />
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={generating} className="w-full">
          {generating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {draft ? "إعادة توليد المسودة" : "توليد المسودة"}
        </Button>

        {draft && (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-4">
            <div className="text-xs text-muted-foreground">
              آخر توليد: {formatDateTime(draft.createdAt)}
            </div>
            <div className="font-semibold">{draft.subject}</div>
            <div className="whitespace-pre-wrap text-sm leading-7">{draft.bodyAr}</div>
          </div>
        )}

        <DialogFooter className="flex-row justify-start gap-2 sm:justify-start">
          <Button variant="outline" onClick={handleCopy} disabled={!draft}>
            <Copy className="size-4" />
            نسخ النص
          </Button>
          <Button variant="outline" onClick={handleDownloadWord} disabled={!draft}>
            <FileDown className="size-4" />
            تنزيل Word
          </Button>
          <Button variant="outline" onClick={handlePrint} disabled={!draft}>
            <Printer className="size-4" />
            طباعة / حفظ PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
