"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Quote, Sparkles, ShieldCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROVENANCE_LABELS, PROVENANCE_SHORT_LABELS, PROVENANCE_TONE } from "@/lib/case-hub-labels";
import type { ProvenanceState } from "@/lib/hub-schemas";

const PROVENANCE_ICON: Record<ProvenanceState, typeof Quote> = {
  EXTRACT: Quote,
  AI_DRAFT: Sparkles,
  EXPERT_CERTIFIED: ShieldCheck,
};

export function ProvenanceBadge({ state, short }: { state: ProvenanceState; short?: boolean }) {
  const Icon = PROVENANCE_ICON[state];
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", PROVENANCE_TONE[state].badge)}>
      <Icon className="size-3" />
      {short ? PROVENANCE_SHORT_LABELS[state] : PROVENANCE_LABELS[state]}
    </Badge>
  );
}

/** كتلة نصية بحدود ملوّنة بحسب مصدرها (provenance) — هذا هو "تتبّع المصدر"
 * على مستوى الكتلة الكاملة (لا تلوين داخل النص نفسه)، مع حفظ تلقائي عند
 * فقدان التركيز وترقية الحالة تلقائياً إلى "معتمد من الخبير" بمجرد التعديل. */
export function ProvenanceField({
  label,
  value,
  provenance,
  placeholder,
  rows = 6,
  readOnly,
  onChange,
  onBlurSave,
  onInsertQuote,
  onCertify,
  certifyLabel = "اعتماد",
  saving,
}: {
  label: string;
  value: string;
  provenance: ProvenanceState;
  placeholder?: string;
  rows?: number;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onBlurSave?: () => void;
  onInsertQuote?: () => void;
  onCertify?: () => void;
  certifyLabel?: string;
  saving?: boolean;
}) {
  return (
    <div className={cn("rounded-md border bg-card p-3", PROVENANCE_TONE[provenance].border)}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <ProvenanceBadge state={provenance} />
          {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {onInsertQuote && (
            <Button type="button" size="sm" variant="ghost" onClick={onInsertQuote} disabled={readOnly}>
              <Quote className="size-3.5" />
              إدراج اقتباس
            </Button>
          )}
          {onCertify && provenance !== "EXPERT_CERTIFIED" && (
            <Button type="button" size="sm" variant="outline" onClick={onCertify} disabled={readOnly}>
              <ShieldCheck className="size-3.5" />
              {certifyLabel}
            </Button>
          )}
        </div>
      </div>
      {readOnly ? (
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{value || placeholder}</p>
      ) : (
        <Textarea
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={onBlurSave}
          className="text-justify leading-6"
        />
      )}
      {provenance === "AI_DRAFT" && !readOnly && (
        <p className="mt-1.5 text-xs text-purple-700 dark:text-purple-300">
          مسودة ذكاء اصطناعي — لم يراجعها الخبير بعد.
        </p>
      )}
    </div>
  );
}
