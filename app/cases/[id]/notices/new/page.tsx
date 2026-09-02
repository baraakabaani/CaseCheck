import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { NoticeForm } from "@/components/NoticeForm";
import { prisma } from "@/lib/db";
import type { MissingDocumentItem } from "@/lib/case-analysis-schemas";

export default async function NewNoticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fromAnalysisId?: string }>;
}) {
  const { id: caseId } = await params;
  const { fromAnalysisId } = await searchParams;

  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      requirements: {
        where: { status: { in: ["MISSING", "PARTIALLY_PROVIDED"] } },
        orderBy: { order: "asc" },
      },
      parties: { orderBy: { order: "asc" } },
    },
  });

  if (!caseRecord) notFound();

  let suggestedItems: string[];

  const analysis = fromAnalysisId
    ? await prisma.caseAnalysis.findFirst({ where: { id: fromAnalysisId, caseId } })
    : null;

  if (analysis) {
    // إشعار النواقص — مُولَّد مباشرة من المستندات الناقصة في التحليل الأولي
    // (قد يسبق اعتماد التحليل، فلا نعتمد فقط على قائمة المتطلبات).
    const partyById = new Map(caseRecord.parties.map((p) => [p.id, p.name]));
    const missingDocuments = JSON.parse(analysis.missingDocuments) as MissingDocumentItem[];
    suggestedItems = missingDocuments.map((m) => {
      const fromNames = m.requestedFromPartyIds
        .map((id) => partyById.get(id))
        .filter(Boolean)
        .join("، ");
      return fromNames ? `${m.item} (من: ${fromNames}) — ${m.reason}` : `${m.item} — ${m.reason}`;
    });
  } else {
    suggestedItems = caseRecord.requirements.map((r) => {
      const note = r.overrideNotes ?? r.aiNotes;
      return note ? `${r.labelAr} — ${note}` : r.labelAr;
    });
  }

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
          defaultMeetingDate={caseRecord.nextHearingDate?.toISOString().slice(0, 10) ?? null}
        />
      </main>
    </div>
  );
}
