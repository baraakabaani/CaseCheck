import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { NoticeForm } from "@/components/NoticeForm";
import { prisma } from "@/lib/db";

export default async function NewNoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      requirements: {
        where: { status: { in: ["MISSING", "PARTIALLY_PROVIDED"] } },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!caseRecord) notFound();

  const suggestedItems = caseRecord.requirements.map((r) => {
    const note = r.overrideNotes ?? r.aiNotes;
    return note ? `${r.labelAr} — ${note}` : r.labelAr;
  });

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">إنشاء إخطار اجتماع خبرة</h1>
          <p className="text-sm text-muted-foreground">
            الدعوى رقم {caseRecord.caseNumber} — {caseRecord.title}
          </p>
        </div>
        <NoticeForm
          caseId={caseId}
          caseNumber={caseRecord.caseNumber}
          suggestedItems={suggestedItems}
        />
      </main>
    </div>
  );
}
