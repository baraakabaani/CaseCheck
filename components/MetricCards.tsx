import { Card, CardContent } from "@/components/ui/card";
import { FileCheck2, FileClock, FileX2, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";

export interface RequirementMetrics {
  total: number;
  provided: number;
  partial: number;
  missing: number;
}

const ITEMS = [
  {
    key: "total" as const,
    label: "إجمالي المتطلبات",
    Icon: ListChecks,
    accent: "text-foreground bg-muted",
  },
  {
    key: "provided" as const,
    label: "مقدمة بالكامل",
    Icon: FileCheck2,
    accent:
      "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950",
  },
  {
    key: "partial" as const,
    label: "مقدمة جزئياً",
    Icon: FileClock,
    accent: "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950",
  },
  {
    key: "missing" as const,
    label: "غير مقدمة",
    Icon: FileX2,
    accent: "text-[#c8102e] bg-[#c8102e0d] dark:text-[#e2334f] dark:bg-[#e2334f1a]",
  },
];

export function MetricCards({ metrics }: { metrics: RequirementMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ITEMS.map(({ key, label, Icon, accent }) => (
        <Card key={key}>
          <CardContent className="flex items-center gap-3 py-1">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                accent,
              )}
            >
              <Icon className="size-5" />
            </span>
            <div>
              <div className="text-2xl font-bold tabular-nums">{metrics[key]}</div>
              <div className="text-xs text-muted-foreground">
                {label}
                {key !== "total" && metrics.total > 0
                  ? ` · ${formatPercent(metrics[key], metrics.total)}`
                  : ""}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
