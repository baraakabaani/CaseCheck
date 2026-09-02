import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CircleDashed, CircleAlert, HelpCircle } from "lucide-react";
import type { RequirementStatus } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  RequirementStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  PROVIDED: {
    label: "مقدم",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900",
    Icon: CheckCircle2,
  },
  PARTIALLY_PROVIDED: {
    label: "مقدم جزئياً",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900",
    Icon: CircleAlert,
  },
  MISSING: {
    label: "غير مقدم",
    className: "bg-[#c8102e0d] text-[#c8102e] border-[#c8102e33] dark:bg-[#e2334f1a] dark:text-[#e2334f] dark:border-[#e2334f4d]",
    Icon: CircleDashed,
  },
  NOT_ANALYZED: {
    label: "لم تتم المطابقة بعد",
    className:
      "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800",
    Icon: HelpCircle,
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: RequirementStatus;
  className?: string;
}) {
  const config = STATUS_CONFIG[status];
  const { Icon } = config;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium", config.className, className)}
    >
      <Icon className="size-3.5" />
      {config.label}
    </Badge>
  );
}
