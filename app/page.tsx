import Link from "next/link";
import { prisma } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { MetricCards } from "@/components/MetricCards";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileStack, FolderOpen } from "lucide-react";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const CASE_TYPE_LABELS: Record<string, string> = {
  LITIGATION: "دعوى قضائية",
  ACCOUNTING_EXPERT: "خبرة محاسبية",
};

export default async function DashboardPage() {
  const cases = await prisma.case.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { documents: true } },
      requirements: { select: { status: true } },
    },
  });

  const overall = cases.reduce(
    (acc, c) => {
      acc.total += c.requirements.length;
      acc.provided += c.requirements.filter((r) => r.status === "PROVIDED").length;
      acc.partial += c.requirements.filter(
        (r) => r.status === "PARTIALLY_PROVIDED",
      ).length;
      acc.missing += c.requirements.filter((r) => r.status === "MISSING").length;
      return acc;
    },
    { total: 0, provided: 0, partial: 0, missing: 0 },
  );

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">لوحة القضايا</h1>
            <p className="text-sm text-muted-foreground">
              إدارة ملفات الدعاوى والخبرة المحاسبية ومتابعة اكتمال المستندات
            </p>
          </div>
          <Button asChild>
            <Link href="/cases/new">
              <Plus className="size-4" />
              إنشاء ملف دعوى جديد
            </Link>
          </Button>
        </div>

        {cases.length > 0 && (
          <div className="mb-8">
            <MetricCards metrics={overall} />
          </div>
        )}

        {cases.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <FolderOpen className="size-10 text-muted-foreground" />
              <div>
                <p className="font-medium">لا توجد ملفات دعاوى بعد</p>
                <p className="text-sm text-muted-foreground">
                  ابدأ بإنشاء ملف دعوى جديد وتحديد قائمة المستندات المطلوبة
                </p>
              </div>
              <Button asChild className="mt-2">
                <Link href="/cases/new">
                  <Plus className="size-4" />
                  إنشاء ملف دعوى جديد
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cases.map((c) => {
              const total = c.requirements.length;
              const provided = c.requirements.filter(
                (r) => r.status === "PROVIDED",
              ).length;
              return (
                <Link key={c.id} href={`/cases/${c.id}`}>
                  <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                    <CardContent className="flex h-full flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{c.title}</div>
                          <div className="text-xs text-muted-foreground">
                            رقم الدعوى: {c.caseNumber}
                          </div>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {CASE_TYPE_LABELS[c.caseType] ?? c.caseType}
                        </Badge>
                      </div>

                      {c.clientName && (
                        <div className="text-sm text-muted-foreground">
                          المتعامل: {c.clientName}
                        </div>
                      )}

                      <div className="mt-auto flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileStack className="size-3.5" />
                          {c._count.documents} مستند
                        </span>
                        <span>
                          {total > 0 ? `${provided} / ${total} مكتمل` : "بلا متطلبات"}
                        </span>
                        <span>{formatDate(c.updatedAt)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
