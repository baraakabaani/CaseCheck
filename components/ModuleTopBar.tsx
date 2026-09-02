import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function ModuleTopBar({
  caseId,
  moduleIndex,
  title,
}: {
  caseId: string;
  moduleIndex: 1 | 2 | 3 | 4;
  title: string;
}) {
  return (
    <div className="mb-6">
      <Link
        href={`/cases/${caseId}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" />
        رجوع إلى لوحة القضية
      </Link>
      <div className="text-xs font-medium text-muted-foreground">الموديول {moduleIndex}</div>
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
    </div>
  );
}
