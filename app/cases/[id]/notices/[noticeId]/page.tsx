import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { NoticeDocument } from "@/components/NoticeDocument";
import { NoticeActions } from "@/components/NoticeActions";
import { getNoticeDetail } from "@/lib/queries";
import { prisma } from "@/lib/db";

export default async function NoticeViewPage({
  params,
}: {
  params: Promise<{ id: string; noticeId: string }>;
}) {
  const { id: caseId, noticeId } = await params;

  const [notice, caseRecord] = await Promise.all([
    getNoticeDetail(caseId, noticeId),
    prisma.case.findUnique({ where: { id: caseId } }),
  ]);

  if (!notice || !caseRecord) notFound();

  const caseCtx = {
    caseNumber: caseRecord.caseNumber,
    title: caseRecord.title,
    court: caseRecord.court,
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="no-print">
        <AppHeader />
      </div>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="no-print mb-6">
          <Link
            href={`/cases/${caseId}`}
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="size-4" />
            العودة إلى ملف الدعوى
          </Link>
          <h1 className="text-2xl font-bold">
            إخطار اجتماع الخبرة {notice.noticeLabel}
          </h1>
          <p className="text-sm text-muted-foreground">
            الدعوى رقم {caseRecord.caseNumber} — {caseRecord.title}
          </p>
        </div>

        <div className="no-print mb-6">
          <NoticeActions caseId={caseId} notice={notice} caseCtx={caseCtx} />
        </div>

        <div className="notice-print-area">
          <NoticeDocument notice={notice} caseCtx={caseCtx} />
        </div>
      </main>
    </div>
  );
}
