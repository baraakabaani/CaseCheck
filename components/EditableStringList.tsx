"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";

/** قائمة نصوص قابلة للتعديل: كل عنصر بحقل نص + زر حذف، وزر "إضافة" في
 * الأسفل لإضافة عنصر جديد فارغ — مستخدَمة في كل مكان بالتطبيق يحتاج
 * الخبير فيه إدخال أكثر من نص حر بعدد غير محدد (مهام مأمورية، نقاط غير
 * واضحة، أسئلة، أو بنود "أخرى" مخصصة). كانت معرَّفة محلياً داخل
 * CaseAnalysisReview.tsx فقط — استُخرجت هنا لإعادة استخدامها في
 * CaseIntakeStep2Form.tsx أيضاً دون تكرار. */
export function EditableStringList({
  items,
  onChange,
  placeholder,
  ordered,
  compact,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ordered?: boolean;
  /** عناصر قصيرة (بند "أخرى" مثلاً) — حقل سطر واحد بدل Textarea متعددة الأسطر. */
  compact?: boolean;
}) {
  function update(i: number, value: string) {
    onChange(items.map((it, idx) => (idx === i ? value : it)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          {ordered && <span className="mt-2 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>}
          {compact ? (
            <Input
              value={item}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1"
            />
          ) : (
            <Textarea
              rows={2}
              value={item}
              onChange={(e) => update(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1 text-justify leading-6"
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={compact ? "shrink-0" : "mt-1 shrink-0"}
            onClick={() => remove(i)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onChange([...items, ""])}>
        <Plus className="size-4" />
        إضافة
      </Button>
    </div>
  );
}
