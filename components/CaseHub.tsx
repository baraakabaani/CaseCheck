"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck,
  Users,
  MapPinned,
  FileSignature,
  Lock,
  ArrowLeft,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HEARING_STATUS_LABELS } from "@/lib/case-hub-labels";
import type { CaseDetail } from "@/lib/queries";
import type { HearingStatus, CourtReportStatus } from "@/lib/hub-schemas";

const CASE_TYPE_LABELS: Record<string, string> = {
  LITIGATION: "دعوى قضائية",
  ACCOUNTING_EXPERT: "خبرة محاسبية",
};

interface MilestoneCard {
  key: string;
  index: number;
  title: string;
  description: string;
  Icon: typeof ClipboardCheck;
  href: string;
  locked: boolean;
  badgeLabel: string;
  badgeTone: "complete" | "progress" | "neutral";
}

export function CaseHub({ caseDetail }: { caseDetail: CaseDetail }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const claimants = caseDetail.parties.filter((p) => p.role === "CLAIMANT");
  const respondents = caseDetail.parties.filter((p) => p.role === "RESPONDENT");

  const module1Complete = caseDetail.intakeStatus === "ACTIVE";
  const laterModulesUnlocked = module1Complete;

  // أعلى حالة اجتماع بين كل اجتماعات الدعوى (قد تُعقد أكثر من مرة).
  const HEARING_STATUS_PRIORITY: Record<HearingStatus, number> = {
    NOT_SCHEDULED: 0,
    SCHEDULED: 1,
    IN_PROGRESS: 2,
    COMPLETED: 3,
  };
  const hearingStatus = caseDetail.hearingSessions.reduce<HearingStatus>((best, s) => {
    const status = s.status as HearingStatus;
    return HEARING_STATUS_PRIORITY[status] > HEARING_STATUS_PRIORITY[best] ? status : best;
  }, "NOT_SCHEDULED");

  const requirementsTotal = caseDetail.requirements.length;
  const requirementsProvided = caseDetail.requirements.filter(
    (r) => r.status === "PROVIDED",
  ).length;
  const module3Complete = requirementsTotal > 0 && requirementsProvided === requirementsTotal;

  const reportStatus = (caseDetail.courtReport?.status ?? null) as CourtReportStatus | null;
  const reportHasContent = Boolean(
    caseDetail.courtReport &&
      (caseDetail.courtReport.introductionMandate ||
        caseDetail.courtReport.partiesAndProcedures ||
        caseDetail.courtReport.taskAnalysis ||
        caseDetail.courtReport.conclusionSettlement ||
        caseDetail.courtReport.documentsIndex),
  );

  const milestones: MilestoneCard[] = [
    {
      key: "module-1",
      index: 1,
      title: "التأسيس والتدقيق الأولي",
      description: "بيانات القضية، مأمورية الخبرة، رفع المستندات، والتحليل الأولي",
      Icon: ClipboardCheck,
      href: module1Complete
        ? `/cases/${caseDetail.id}/module-1`
        : `/cases/${caseDetail.id}/setup/documents`, // intake wizard resumes itself per intakeStatus
      locked: false,
      badgeLabel: module1Complete ? "مكتمل" : "قيد الفحص",
      badgeTone: module1Complete ? "complete" : "progress",
    },
    {
      key: "module-2",
      index: 2,
      title: "إدارة الاجتماع والتواصل",
      description: "الدعوة لاجتماع الخبرة الأول، سجل الحضور والوكلاء، ومحضر الجلسة",
      Icon: Users,
      href: `/cases/${caseDetail.id}/module-2`,
      locked: !laterModulesUnlocked,
      badgeLabel: laterModulesUnlocked ? HEARING_STATUS_LABELS[hearingStatus] : "بانتظار الموديول 1",
      badgeTone: hearingStatus === "COMPLETED" ? "complete" : "progress",
    },
    {
      key: "module-3",
      index: 3,
      title: "المتابعة والمعاينة الميدانية",
      description: "متابعة استيفاء المستندات الناقصة وتسجيل زيارات المعاينة",
      Icon: MapPinned,
      href: `/cases/${caseDetail.id}/module-3`,
      locked: !laterModulesUnlocked,
      badgeLabel: !laterModulesUnlocked
        ? "بانتظار الموديول 1"
        : module3Complete
          ? "المستندات مكتملة"
          : "جاري الاستيفاء",
      badgeTone: module3Complete ? "complete" : "progress",
    },
    {
      key: "module-4",
      index: 4,
      title: "صياغة التقرير القضائي",
      description: "إعداد تقرير الخبرة النهائي وفق البيانات المعتمدة من الموديولات السابقة",
      Icon: FileSignature,
      href: `/cases/${caseDetail.id}/module-4`,
      locked: !laterModulesUnlocked,
      badgeLabel: !laterModulesUnlocked
        ? "بانتظار الموديول 1"
        : reportStatus === "FINAL"
          ? "معتمد"
          : reportHasContent
            ? "مسودة جاهزة"
            : "بانتظار الاعتماد",
      badgeTone: reportStatus === "FINAL" ? "complete" : "progress",
    },
  ];

  async function handleDeleteCase() {
    if (!confirm("هل أنت متأكد من حذف ملف الدعوى بالكامل؟ لا يمكن التراجع عن هذا الإجراء.")) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/cases/${caseDetail.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل حذف ملف الدعوى");
      }
      toast.success("تم حذف ملف الدعوى");
      router.push("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حذف ملف الدعوى");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          العودة إلى لوحة القضايا
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{caseDetail.title}</h1>
              <Badge variant="secondary">
                {CASE_TYPE_LABELS[caseDetail.caseType] ?? caseDetail.caseType}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              رقم الدعوى: {caseDetail.caseNumber}
              {caseDetail.court ? ` · ${caseDetail.court}` : ""}
            </p>
            {(claimants.length > 0 || respondents.length > 0) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {claimants.length > 0 && <>المدعي: {claimants.map((p) => p.name).join("، ")}</>}
                {claimants.length > 0 && respondents.length > 0 && " · "}
                {respondents.length > 0 && (
                  <>المدعى عليه: {respondents.map((p) => p.name).join("، ")}</>
                )}
              </p>
            )}
          </div>
          <Button variant="outline" onClick={handleDeleteCase} disabled={deleting}>
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4 text-destructive" />
            )}
            حذف ملف الدعوى
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {milestones.map((m) => {
          const cardInner = (
            <Card
              className={cn(
                "h-full transition-colors",
                m.locked
                  ? "opacity-60"
                  : "hover:border-primary/50 hover:bg-accent/30",
                !m.locked && m.badgeTone === "complete" && "border-primary/40",
              )}
            >
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full",
                        m.locked
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {m.locked ? <Lock className="size-4.5" /> : <m.Icon className="size-4.5" />}
                    </span>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">
                        الموديول {m.index}
                      </div>
                      <div className="font-semibold text-foreground">{m.title}</div>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">{m.description}</p>

                <div className="mt-auto flex items-center justify-between border-t pt-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      m.badgeTone === "complete" &&
                        "border-primary/30 bg-primary/10 text-primary",
                      m.badgeTone === "progress" &&
                        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
                      m.badgeTone === "neutral" && "text-muted-foreground",
                    )}
                  >
                    {m.badgeLabel}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );

          return m.locked ? (
            <div key={m.key}>{cardInner}</div>
          ) : (
            <Link key={m.key} href={m.href}>
              {cardInner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
