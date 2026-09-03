import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { HearingRoom } from "@/components/HearingRoom";
import { prisma } from "@/lib/db";
import { getHearingSessionDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HearingRoomPage({
  params,
}: {
  params: Promise<{ id: string; hearingId: string }>;
}) {
  const { id, hearingId } = await params;

  const [caseRecord, session] = await Promise.all([
    prisma.case.findUnique({
      where: { id },
      include: {
        parties: { orderBy: { order: "asc" } },
        meetingAttendees: { orderBy: { order: "asc" }, include: { document: true } },
      },
    }),
    getHearingSessionDetail(id, hearingId),
  ]);
  if (!caseRecord || !session) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader activeCaseLabel={`الدعوى رقم ${caseRecord.caseNumber}`} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6">
          <Link
            href={`/cases/${id}/module-2`}
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="size-4" />
            رجوع إلى إدارة الاجتماع
          </Link>
          <div className="text-xs font-medium text-muted-foreground">
            الموديول 2 — غرفة إدارة الاجتماع
          </div>
          <h1 className="text-2xl font-bold text-foreground">{session.label}</h1>
        </div>
        <HearingRoom
          caseId={id}
          caseNumber={caseRecord.caseNumber}
          parties={caseRecord.parties}
          attendees={caseRecord.meetingAttendees}
          session={session}
        />
      </main>
    </div>
  );
}
