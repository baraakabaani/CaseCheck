"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, Trash2, Plus, FileText } from "lucide-react";
import { MetricCards } from "@/components/MetricCards";
import { FileUploader } from "@/components/FileUploader";
import { ChecklistTable } from "@/components/ChecklistTable";
import { EmailPreviewModal } from "@/components/EmailPreviewModal";
import { CaseAnalysisReview } from "@/components/CaseAnalysisReview";
import { formatDate } from "@/lib/format";
import type { CaseDetail } from "@/lib/queries";

const CASE_TYPE_LABELS: Record<string, string> = {
  LITIGATION: "دعوى قضائية",
  ACCOUNTING_EXPERT: "خبرة محاسبية",
};

export function CaseWorkspace({ caseDetail }: { caseDetail: CaseDetail }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const metrics = useMemo(() => {
    const total = caseDetail.requirements.length;
    const provided = caseDetail.requirements.filter((r) => r.status === "PROVIDED").length;
    const partial = caseDetail.requirements.filter(
      (r) => r.status === "PARTIALLY_PROVIDED",
    ).length;
    const missing = caseDetail.requirements.filter((r) => r.status === "MISSING").length;
    return { total, provided, partial, missing };
  }, [caseDetail.requirements]);

  const pendingRequirements = caseDetail.requirements.filter(
    (r) => r.status === "MISSING" || r.status === "PARTIALLY_PROVIDED",
  );

  const claimants = caseDetail.parties.filter((p) => p.role === "CLAIMANT");
  const respondents = caseDetail.parties.filter((p) => p.role === "RESPONDENT");
  const latestAnalysis = caseDetail.analyses[0] ?? null;

  function refresh() {
    router.refresh();
  }

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
          <ArrowRight className="size-4" />
          العودة إلى لوحة القضايا
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{caseDetail.title}</h1>
              <Badge variant="secondary">
                {CASE_TYPE_LABELS[caseDetail.caseType] ?? caseDetail.caseType}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              رقم الدعوى: {caseDetail.caseNumber}
              {caseDetail.court ? ` · ${caseDetail.court}` : ""}
              {caseDetail.clientName ? ` · المتعامل: ${caseDetail.clientName}` : ""}
            </p>
            {(claimants.length > 0 || respondents.length > 0) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {claimants.length > 0 && (
                  <>المدعي: {claimants.map((p) => p.name).join("، ")}</>
                )}
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

      <MetricCards metrics={metrics} />

      <Tabs defaultValue="checklist" className="gap-4">
        <TabsList>
          <TabsTrigger value="checklist">قائمة المتطلبات والمطابقة</TabsTrigger>
          <TabsTrigger value="documents">
            المستندات المرفوعة ({caseDetail.documents.length})
          </TabsTrigger>
          <TabsTrigger value="email">خطاب المتعامل</TabsTrigger>
          <TabsTrigger value="notices">
            إخطارات اجتماع الخبرة ({caseDetail.notices.length})
          </TabsTrigger>
          {latestAnalysis && <TabsTrigger value="analysis">التحليل الأولي</TabsTrigger>}
        </TabsList>

        <TabsContent value="checklist">
          <Card>
            <CardContent>
              <ChecklistTable
                caseId={caseDetail.id}
                requirements={caseDetail.requirements}
                hasDocuments={caseDetail.documents.length > 0}
                onChanged={refresh}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardContent>
              <FileUploader
                caseId={caseDetail.id}
                documents={caseDetail.documents}
                onChanged={refresh}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                يقوم النظام بإنشاء مسودة بريد إلكتروني رسمي بالعربية موجهة إلى المتعامل، تسرد
                المستندات الناقصة أو غير المكتملة وتطلب استكمالها خلال مهلة محددة.
              </p>
              <div>
                <EmailPreviewModal
                  caseId={caseDetail.id}
                  caseNumber={caseDetail.caseNumber}
                  pendingCount={pendingRequirements.length}
                  latestDraft={caseDetail.emailDrafts[0] ?? null}
                  onGenerated={refresh}
                />
              </div>

              {caseDetail.emailDrafts.length > 0 && (
                <div className="flex flex-col gap-2 border-t pt-4">
                  <p className="text-sm font-medium">مسودات سابقة</p>
                  {caseDetail.emailDrafts.map((d) => (
                    <div key={d.id} className="rounded-md border p-3 text-sm">
                      <div className="font-medium">{d.subject}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {d.bodyAr}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notices">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                إخطار رسمي بموعد اجتماع الخبرة موجّه إلى وكلاء الأطراف، يطلب استكمال مستندات
                محددة قبل الموعد — بنفس تنسيق خطاب الشركة (ترويسة وعلامة مائية وتذييل)، قابل
                للطباعة أو الإرسال كبريد إلكتروني.
              </p>
              <div>
                <Button asChild>
                  <Link href={`/cases/${caseDetail.id}/notices/new`}>
                    <Plus className="size-4" />
                    إنشاء إخطار جديد
                  </Link>
                </Button>
              </div>

              {caseDetail.notices.length > 0 && (
                <div className="flex flex-col gap-2 border-t pt-4">
                  <p className="text-sm font-medium">الإخطارات السابقة</p>
                  {caseDetail.notices.map((n) => (
                    <Link
                      key={n.id}
                      href={`/cases/${caseDetail.id}/notices/${n.id}`}
                      className="flex items-center gap-3 rounded-md border p-3 text-sm hover:bg-accent/40"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          إخطار اجتماع الخبرة {n.noticeLabel} — {n.subjectLine}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          موعد الاجتماع: {formatDate(n.meetingDate)} · تم الإنشاء:{" "}
                          {formatDate(n.createdAt)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {latestAnalysis && (
          <TabsContent value="analysis">
            <CaseAnalysisReview
              caseId={caseDetail.id}
              analysis={latestAnalysis}
              documents={caseDetail.documents}
              parties={caseDetail.parties}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
