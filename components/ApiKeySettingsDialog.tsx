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
  clearStoredGeminiApiKey,
  clearStoredGroqApiKey,
  getStoredGeminiApiKey,
  getStoredGroqApiKey,
  setStoredGeminiApiKey,
  setStoredGroqApiKey,
  subscribeToStoredGeminiApiKey,
  subscribeToStoredGroqApiKey,
} from "@/lib/client-api-key";

function getServerSnapshot() {
  return null;
}

export function ApiKeySettingsDialog() {
  const [open, setOpen] = useState(false);
  const [geminiValue, setGeminiValue] = useState("");
  const [groqValue, setGroqValue] = useState("");

  // Reads localStorage reactively without an effect — matches the SSR
  // snapshot (null) on first paint, then reconciles to the real value on
  // the client, and re-renders on same-tab or cross-tab changes.
  const storedGeminiKey = useSyncExternalStore(
    subscribeToStoredGeminiApiKey,
    getStoredGeminiApiKey,
    getServerSnapshot,
  );
  const storedGroqKey = useSyncExternalStore(
    subscribeToStoredGroqApiKey,
    getStoredGroqApiKey,
    getServerSnapshot,
  );
  const hasAnyStoredKey = Boolean(storedGeminiKey || storedGroqKey);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setGeminiValue(storedGeminiKey ?? "");
      setGroqValue(storedGroqKey ?? "");
    }
  }

  function handleSave() {
    const trimmedGemini = geminiValue.trim();
    if (trimmedGemini) setStoredGeminiApiKey(trimmedGemini);
    else clearStoredGeminiApiKey();

    const trimmedGroq = groqValue.trim();
    if (trimmedGroq) setStoredGroqApiKey(trimmedGroq);
    else clearStoredGroqApiKey();

    if (trimmedGemini || trimmedGroq) {
      toast.success("تم حفظ مفتاح API في هذا المتصفح");
    } else {
      toast.success("تم حذف مفاتيح API المحفوظة من هذا المتصفح");
    }
    setOpen(false);
  }

  function handleClear() {
    clearStoredGeminiApiKey();
    clearStoredGroqApiKey();
    setGeminiValue("");
    setGroqValue("");
    toast.success("تم حذف مفاتيح API المحفوظة من هذا المتصفح");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="size-4" />
          مفتاح الذكاء الاصطناعي
          {hasAnyStoredKey && <Check className="size-3.5 text-emerald-600" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>مفاتيح API الخاصة بك</DialogTitle>
          <DialogDescription>
            استخدم مفتاح Gemini أو Groq الخاص بك لتفعيل المطابقة الذكية والتحليل الأولي وتوليد
            الخطابات بالذكاء الاصطناعي. تُحفظ المفاتيح في متصفحك فقط (localStorage) ولا تُرسل إلا
            إلى خادم هذا التطبيق عند تشغيل هذه الميزات.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="groqApiKey">
            مفتاح Groq API <span className="text-muted-foreground">(موصى به)</span>
          </Label>
          <Input
            id="groqApiKey"
            type="password"
            dir="ltr"
            placeholder="gsk_..."
            value={groqValue}
            onChange={(e) => setGroqValue(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            يُستخدم أولاً عند توفره. احصل عليه من{" "}
            <span dir="ltr">console.groq.com/keys</span>.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="geminiApiKey">مفتاح Gemini API (اختياري)</Label>
          <Input
            id="geminiApiKey"
            type="password"
            dir="ltr"
            placeholder="AQ...."
            value={geminiValue}
            onChange={(e) => setGeminiValue(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            يُستخدم فقط إن لم يتوفر مفتاح Groq. إن تركت كلا الحقلين فارغَين، سيحاول التطبيق
            استخدام مفتاح مُهيأ على الخادم إن وُجد، وإلا سيتم اعتماد المطابقة الآلية الاحتياطية
            (بدون ذكاء اصطناعي) تلقائياً.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={handleClear} disabled={!hasAnyStoredKey}>
            حذف المفاتيح المحفوظة
          </Button>
          <Button onClick={handleSave}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
