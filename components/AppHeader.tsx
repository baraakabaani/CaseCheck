import Link from "next/link";
import { ApiKeySettingsDialog } from "@/components/ApiKeySettingsDialog";

export function AppHeader({
  activeCaseLabel,
}: {
  /** Shown centered when rendered from within a case's routes (Case Hub +
   * its 4 modules) — the active case's number/title, in Slate Navy. */
  activeCaseLabel?: string;
}) {
  return (
    <header className="border-b border-[#E2E8F0] bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed static asset, no next/image optimization needed for a small header mark */}
          <img src="/parker-russell-logo.png" alt="Parker Russell" className="h-8 w-auto" />
          <div className="hidden border-s ps-3 leading-tight sm:block">
            <div className="text-sm font-semibold text-foreground">
              بوابة تدقيق ومأموريات الخبرة الحسابية القضائية
            </div>
            <div className="text-xs text-muted-foreground">
              مراجعة المستندات وتدقيقها بالذكاء الاصطناعي
            </div>
          </div>
        </Link>

        {activeCaseLabel && (
          <div className="hidden flex-1 truncate text-center text-sm font-medium text-foreground md:block">
            {activeCaseLabel}
          </div>
        )}

        <div className="shrink-0">
          <ApiKeySettingsDialog />
        </div>
      </div>
    </header>
  );
}
