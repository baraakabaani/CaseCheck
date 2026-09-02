import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { WizardSteps } from "@/components/WizardSteps";
import { CaseAnalysisReview } from "@/components/CaseAnalysisReview";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CaseAnalysisSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseRecord = await prisma.case.findUnique({
    where: { id },
    include: {
      documents: true,
      parties: { orderBy: { order: "asc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!caseRecord) notFound();

  const analysis = caseRecord.analyses[0];
  if (!analysis) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">ملخص التحليل الأولي</h1>
          <p className="text-sm text-muted-foreground">
            المرحلة 4 من 4 — الدعوى رقم {caseRecord.caseNumber}
          </p>
        </div>
        <WizardSteps current={4} />
        <CaseAnalysisReview
          caseId={id}
          analysis={analysis}
          documents={caseRecord.documents}
          parties={caseRecord.parties}
        />
      </main>
    </div>
  );
}
