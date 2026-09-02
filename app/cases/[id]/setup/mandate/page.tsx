import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { WizardSteps } from "@/components/WizardSteps";
import {
  CaseIntakeStep2Form,
  type CaseIntakeStep2InitialData,
} from "@/components/CaseIntakeStep2Form";
import { prisma } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";
import type { AppointmentCapacity, MandateNatureOption } from "@/lib/schemas";

export const dynamic = "force-dynamic";

interface CommitteeMemberRecord {
  name: string;
  specialization: string | null;
}

function safeParseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export default async function CaseMandateSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseRecord = await prisma.case.findUnique({ where: { id } });
  if (!caseRecord) notFound();

  // مرحلة 2 مكتملة سابقاً (وصلت الدعوى لمرحلة لاحقة) — نعرض القيم الحقيقية
  // المحفوظة بدل نموذج فارغ، وهذا يتيح أيضاً تعديلها من "رجوع" في المرحلة 3.
  const alreadyCompleted = caseRecord.intakeStatus !== "DRAFT_PHASE_2";
  const initialData: CaseIntakeStep2InitialData | undefined = alreadyCompleted
    ? {
        mandateDecisionDate: toDateInputValue(caseRecord.mandateDecisionDate),
        mandateReceivedDate: toDateInputValue(caseRecord.mandateReceivedDate),
        mandateAcceptedDate: toDateInputValue(caseRecord.mandateAcceptedDate),
        nextHearingDate: toDateInputValue(caseRecord.nextHearingDate),
        reportDeadlineDate: toDateInputValue(caseRecord.reportDeadlineDate),
        appointmentCapacity: (caseRecord.appointmentCapacity as AppointmentCapacity) ?? "SOLE_EXPERT",
        committeeMembers: safeParseJson<CommitteeMemberRecord[]>(caseRecord.committeeMembers, []),
        mandateNature: safeParseJson<MandateNatureOption[]>(caseRecord.mandateNature, []),
        mandateNotes: caseRecord.mandateNotes,
      }
    : undefined;

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
        <CaseIntakeStep2Form caseId={id} initialData={initialData} />
      </main>
    </div>
  );
}
