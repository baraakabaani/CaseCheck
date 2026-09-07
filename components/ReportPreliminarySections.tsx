"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ProvenanceField } from "@/components/ProvenanceBadge";
import { REPORT_SECTION_LABELS, TIMELINE_EVENT_LABELS } from "@/lib/case-hub-labels";
import { formatDate } from "@/lib/format";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import type { ProvenanceState } from "@/lib/hub-schemas";
import type { CourtReportDetail } from "@/lib/queries";
import type { ProceduralTimelineEvent } from "@/lib/reports/report-aggregator";

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

type SectionKey =
  | "introduction"
  | "mandateSummary"
  | "partiesOverview"
  | "proceduralHistory"
  | "documentInventory"
  | "scopeNarrative";

export function ReportPreliminarySections({
  caseId,
  report,
}: {
  caseId: string;
  report: NonNullable<CourtReportDetail>;
}) {
  const [fields, setFields] = useState<Record<SectionKey, string>>({
    introduction: report.introduction ?? "",
    mandateSummary: report.mandateSummary ?? "",
    partiesOverview: report.partiesOverview ?? "",
    proceduralHistory: report.proceduralHistory ?? "",
    documentInventory: report.documentInventory ?? "",
    scopeNarrative: report.scopeNarrative ?? "",
  });
  const [saving, setSaving] = useState<SectionKey | null>(null);

  const timeline = safeParseJson<ProceduralTimelineEvent[]>(report.timelineJson, []);

  async function save(key: SectionKey) {
    setSaving(key);
    try {
      // نص فارغ لا يُعتبر "اعتماداً من الخبير" — لو وُسم كذلك سيمنع التوليد
      // من ملء هذا الحقل إلى الأبد رغم عدم وجود محتوى حقيقي فيه.
      const isEmpty = !fields[key].trim();
      const res = await fetch(`/api/cases/${caseId}/court-report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...buildClientApiKeyHeaders() },
        body: JSON.stringify({
          [key]: fields[key],
          ...(isEmpty ? {} : { [`${key}Provenance`]: "EXPERT_CERTIFIED" }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حفظ التعديل");
      toast.success("تم الحفظ");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ التعديل");
    } finally {
      setSaving(null);
    }
  }

  const provenanceByKey = report as unknown as Record<`${SectionKey}Provenance`, string>;

  return (
    <div className="flex flex-col gap-4">
      {(Object.keys(REPORT_SECTION_LABELS) as SectionKey[]).map((key) => (
        <div key={key} className="flex flex-col gap-2">
          <ProvenanceField
            label={REPORT_SECTION_LABELS[key]}
            value={fields[key]}
            provenance={provenanceByKey[`${key}Provenance`] as ProvenanceState}
            rows={key === "proceduralHistory" || key === "documentInventory" ? 5 : 8}
            onChange={(v) => setFields((p) => ({ ...p, [key]: v }))}
            onBlurSave={() => save(key)}
            saving={saving === key}
          />
          {key === "proceduralHistory" && timeline.length > 0 && (
            <TimelineList events={timeline} />
          )}
        </div>
      ))}
    </div>
  );
}

function TimelineList({ events }: { events: ProceduralTimelineEvent[] }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        الجدول الزمني الكامل (مُجمَّع آلياً من سجلات النظام):
      </p>
      <ol className="flex flex-col gap-2">
        {events.map((e, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDate(e.at)}</span>
            <span className="font-medium">{TIMELINE_EVENT_LABELS[e.kind]}</span>
            {e.isEstimated && (
              <Badge variant="outline" className="font-normal">
                تاريخ تقريبي
              </Badge>
            )}
            {e.isFuture && (
              <Badge variant="outline" className="font-normal">
                لم يحن بعد
              </Badge>
            )}
            {e.detail && <span className="text-muted-foreground">— {e.detail}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
