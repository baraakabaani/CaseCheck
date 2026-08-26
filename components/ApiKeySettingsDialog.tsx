"use client";

import { useState, useSyncExternalStore } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Check } from "lucide-react";
import {
  clearStoredGroqApiKey,
  getStoredGroqApiKey,
  setStoredGroqApiKey,
  subscribeToStoredGroqApiKey,
} from "@/lib/client-api-key";

function getServerSnapshot() {
  return null;
}

export function ApiKeySettingsDialog() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  // Reads localStorage reactively without an effect — matches the SSR
  // snapshot (null) on first paint, then reconciles to the real value on
  // the client, and re-renders on same-tab or cross-tab changes.
  const storedKey = useSyncExternalStore(
    subscribeToStoredGroqApiKey,
    getStoredGroqApiKey,
    getServerSnapshot,
  );
  const hasStoredKey = Boolean(storedKey);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setValue(storedKey ?? "");
  }

  function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      clearStoredGroqApiKey();
      toast.success("تم حذف مفتاح API المحفوظ من هذا المتصفح");
      setOpen(false);
      return;
    }
    setStoredGroqApiKey(trimmed);
    toast.success("تم حفظ مفتاح Groq API في هذا المتصفح");
    setOpen(false);
  }

  function handleClear() {
    clearStoredGroqApiKey();
    setValue("");
    toast.success("تم حذف مفتاح API المحفوظ من هذا المتصفح");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="size-4" />
          مفتاح Groq API
          {hasStoredKey && <Check className="size-3.5 text-emerald-600" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>مفتاح Groq API الخاص بك</DialogTitle>
          <DialogDescription>
            استخدم مفتاح Groq API الخاص بك لتفعيل المطابقة الذكية وتوليد الخطابات بالذكاء
            الاصطناعي. يُحفظ المفتاح في متصفحك فقط (localStorage) ولا يُرسل إلا إلى خادم هذا
            التطبيق عند تشغيل المطابقة أو توليد الخطاب.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="groqApiKey">مفتاح API</Label>
          <Input
            id="groqApiKey"
            type="password"
            dir="ltr"
            placeholder="gsk_..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            إن تركت هذا الحقل فارغاً، سيحاول التطبيق استخدام مفتاح مُهيأ على الخادم إن وُجد،
            وإلا سيتم اعتماد المطابقة الآلية الاحتياطية (بدون ذكاء اصطناعي) تلقائياً.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={handleClear} disabled={!hasStoredKey}>
            حذف المفتاح المحفوظ
          </Button>
          <Button onClick={handleSave}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
