import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { CaseWorkspace } from "@/components/CaseWorkspace";
import { getCaseDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseDetail = await getCaseDetail(id);

  if (!caseDetail) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <CaseWorkspace caseDetail={caseDetail} />
      </main>
    </div>
  );
}
