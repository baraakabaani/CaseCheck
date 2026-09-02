import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1, label: "بيانات القضية" },
  { n: 2, label: "مأمورية الخبرة" },
  { n: 3, label: "رفع المستندات" },
  { n: 4, label: "التحليل الأولي" },
];

export function WizardSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="mb-6 flex items-center gap-2 sm:gap-4">
      {STEPS.map((step, i) => {
        const state = step.n < current ? "done" : step.n === current ? "current" : "upcoming";
        return (
          <li key={step.n} className="flex flex-1 items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  state === "done" && "bg-primary text-primary-foreground",
                  state === "current" && "border-2 border-primary text-primary",
                  state === "upcoming" && "border border-muted-foreground/30 text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="size-4" /> : step.n}
              </span>
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  state === "upcoming" ? "text-muted-foreground" : "font-medium",
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1",
                  state === "done" ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
