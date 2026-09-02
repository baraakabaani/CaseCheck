import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ModuleTopBar } from "@/components/ModuleTopBar";
import { Module3Hub } from "@/components/Module3Hub";
import { getCaseDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Module3Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseDetail = await getCaseDetail(id);
  if (!caseDetail) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader activeCaseLabel={`الدعوى رقم ${caseDetail.caseNumber}`} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <ModuleTopBar caseId={id} moduleIndex={3} title="المتابعة والمعاينة الميدانية" />
        <Module3Hub caseDetail={caseDetail} />
      </main>
    </div>
  );
}
