import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { WizardSteps } from "@/components/WizardSteps";
import { CaseIntakeStep2Form } from "@/components/CaseIntakeStep2Form";
import { prisma } from "@/lib/db";

export default async function CaseMandateSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseRecord = await prisma.case.findUnique({ where: { id } });
  if (!caseRecord) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">بيانات مأمورية الخبرة</h1>
          <p className="text-sm text-muted-foreground">
            المرحلة 2 من 4 — الدعوى رقم {caseRecord.caseNumber}
          </p>
        </div>
        <WizardSteps current={2} />
        <CaseIntakeStep2Form caseId={id} />
      </main>
    </div>
  );
}
