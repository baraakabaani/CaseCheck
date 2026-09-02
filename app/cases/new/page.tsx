import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { WizardSteps } from "@/components/WizardSteps";
import { CaseIntakeStep1Form, type CaseIntakeStep1InitialData } from "@/components/CaseIntakeStep1Form";
import { prisma } from "@/lib/db";
import type { CaseCategory, LitigationDegree } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>;
}) {
  const { resume } = await searchParams;

  let caseId: string | undefined;
  let initialData: CaseIntakeStep1InitialData | undefined;
  let caseNumberLabel: string | null = null;

  if (resume) {
    const caseRecord = await prisma.case.findUnique({
      where: { id: resume },
      include: { parties: { orderBy: { order: "asc" } } },
    });
    if (!caseRecord) notFound();

    caseId = caseRecord.id;
    caseNumberLabel = caseRecord.caseNumber;
    initialData = {
      caseNumber: caseRecord.caseNumber,
      court: caseRecord.court ?? "",
      circuit: caseRecord.circuit,
      litigationDegree: (caseRecord.litigationDegree as LitigationDegree) ?? "FIRST_INSTANCE",
      caseCategory: (caseRecord.caseCategory as CaseCategory) ?? "COMMERCIAL",
      title: caseRecord.title,
      claimants: caseRecord.parties.filter((p) => p.role === "CLAIMANT").map((p) => p.name),
      respondents: caseRecord.parties.filter((p) => p.role === "RESPONDENT").map((p) => p.name),
      notes: caseRecord.notes,
      clientName: caseRecord.clientName,
      clientEmail: caseRecord.clientEmail,
    };
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">
            {caseId ? "تعديل بيانات القضية الأساسية" : "فتح ملف دعوى جديد"}
          </h1>
          <p className="text-sm text-muted-foreground">
            المرحلة 1 من 4 — بيانات القضية الأساسية
            {caseNumberLabel ? ` — الدعوى رقم ${caseNumberLabel}` : ""}
          </p>
        </div>
        <WizardSteps current={1} />
        <CaseIntakeStep1Form caseId={caseId} initialData={initialData} />
      </main>
    </div>
  );
}
