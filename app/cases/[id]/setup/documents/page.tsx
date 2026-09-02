import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { WizardSteps } from "@/components/WizardSteps";
import { CaseDocumentsStep } from "@/components/CaseDocumentsStep";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CaseDocumentsSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseRecord = await prisma.case.findUnique({
    where: { id },
    include: { documents: { orderBy: { uploadedAt: "desc" } } },
  });
  if (!caseRecord) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">رفع ملف الدعوى والمستندات القضائية</h1>
          <p className="text-sm text-muted-foreground">
            المرحلة 3 من 4 — الدعوى رقم {caseRecord.caseNumber}
          </p>
        </div>
        <WizardSteps current={3} />
        <CaseDocumentsStep caseId={id} documents={caseRecord.documents} />
      </main>
    </div>
  );
}
