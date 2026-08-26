import Link from "next/link";
import { Scale } from "lucide-react";
import { ApiKeySettingsDialog } from "@/components/ApiKeySettingsDialog";

export function AppHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Scale className="size-5" />
          </span>
          <div className="leading-tight">
            <div className="text-base font-semibold">تدقيق ملفات الدعاوى</div>
            <div className="text-xs text-muted-foreground">
              مراجعة المستندات وتدقيقها بالذكاء الاصطناعي
            </div>
          </div>
        </Link>
        <ApiKeySettingsDialog />
      </div>
    </header>
  );
}
