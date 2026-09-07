"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, ShieldCheck, Loader2 } from "lucide-react";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import { cn } from "@/lib/utils";
import { PROVENANCE_TONE } from "@/lib/case-hub-labels";
import type { ProvenanceState } from "@/lib/hub-schemas";
import type { CourtReportDetail } from "@/lib/queries";

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** ثامناً: الخلاصة — تُبذَر عند التوليد من "رأي الخبرة" المعتمَد لكل مهمة
 * (بند واحد لكل مهمة معتمدة)، ويبقى للخبير تحرير المقدمة/البنود/الختام
 * يدوياً قبل الاعتماد النهائي. حقل provenance واحد يحرس الثلاثة معاً — هذا
 * أهم قسم في التقرير قانونياً، فاعتماده فعل واحد مقصود، لا اعتماد حقل
 * بمعزل عن آخر. */
export function ReportConclusionSection({
  caseId,
  report,
  onChanged,
}: {
  caseId: string;
  report: NonNullable<CourtReportDetail>;
  onChanged: () => void;
}) {
  const [intro, setIntro] = useState(report.conclusionIntro ?? "");
  const [items, setItems] = useState<string[]>(safeParseJson<string[]>(report.conclusionItemsJson, []));
  const [closing, setClosing] = useState(report.conclusionClosing ?? "");
  const [saving, setSaving] = useState(false);

  const provenance = (report.conclusionProvenance ?? "AI_DRAFT") as ProvenanceState;

  async function save(extra?: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/court-report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...buildClientApiKeyHeaders() },
        body: JSON.stringify({
          conclusionIntro: intro,
          conclusionItemsJson: JSON.stringify(items),
          conclusionClosing: closing,
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  function updateItem(index: number, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? value : it)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, ""]);
  }

  function certify() {
    const realItems = items.filter((it) => it.trim());
    if (realItems.length === 0) {
      toast.error("لا يمكن اعتماد خلاصة بلا بنود فعلية — أضف بنداً واحداً على الأقل");
      return;
    }
    save({ conclusionProvenance: "EXPERT_CERTIFIED" });
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-md border bg-card p-3", PROVENANCE_TONE[provenance].border)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">ثامناً: الخلاصة</span>
          <ProvenanceBadge state={provenance} />
          {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>
        {provenance !== "EXPERT_CERTIFIED" && (
          <Button type="button" size="sm" variant="outline" onClick={certify}>
            <ShieldCheck className="size-3.5" />
            اعتماد الخلاصة
          </Button>
        )}
      </div>

      <div>
        <Label className="mb-1 block text-xs text-muted-foreground">المقدمة</Label>
        <Textarea rows={2} value={intro} onChange={(e) => setIntro(e.target.value)} onBlur={() => save()} className="text-justify leading-6" />
      </div>

      <div>
        <Label className="mb-1 block text-xs text-muted-foreground">البنود (بند واحد لكل مهمة اعتمَد رأي الخبرة فيها، قابلة للتعديل)</Label>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا توجد بنود بعد — تُملأ تلقائياً من &ldquo;رأي الخبرة&rdquo; المعتمَد لكل مهمة عند التوليد، أو أضفها يدوياً.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                <Textarea
                  rows={2}
                  value={item}
                  onChange={(e) => updateItem(i, e.target.value)}
                  onBlur={() => save()}
                  className="flex-1 text-justify leading-6"
                />
                <button
                  type="button"
                  onClick={() => {
                    removeItem(i);
                    save();
                  }}
                  className="mt-2 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ol>
        )}
        <Button type="button" size="sm" variant="ghost" className="mt-1.5" onClick={addItem}>
          <Plus className="size-3.5" />
          إضافة بند
        </Button>
      </div>

      <div>
        <Label className="mb-1 block text-xs text-muted-foreground">الختام والتوقيع</Label>
        <Textarea rows={4} value={closing} onChange={(e) => setClosing(e.target.value)} onBlur={() => save()} className="text-justify leading-6" />
      </div>
    </div>
  );
}
