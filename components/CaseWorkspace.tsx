"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCards } from "@/components/MetricCards";
import { FileUploader } from "@/components/FileUploader";
import { ChecklistTable } from "@/components/ChecklistTable";
import { EmailPreviewModal } from "@/components/EmailPreviewModal";
import { CaseAnalysisReview } from "@/components/CaseAnalysisReview";
import type { CaseDetail } from "@/lib/queries";

// موديول 1 — التأسيس والتدقيق الأولي: يستمر هنا بعد اعتماد التحليل الأولي
// (المرحلة 4) — قائمة المتطلبات والمطابقة، المستندات، وخطاب المتعامل.
// إخطارات اجتماع الخبرة انتقلت إلى الموديول 2 (إدارة الاجتماع والتواصل).
export function CaseWorkspace({ caseDetail }: { caseDetail: CaseDetail }) {
  const router = useRouter();

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

  const latestAnalysis = caseDetail.analyses[0] ?? null;

  function refresh() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <MetricCards metrics={metrics} />

      <Tabs defaultValue="checklist" className="gap-4">
        <TabsList>
          <TabsTrigger value="checklist">قائمة المتطلبات والمطابقة</TabsTrigger>
          <TabsTrigger value="documents">
            المستندات المرفوعة ({caseDetail.documents.length})
          </TabsTrigger>
          <TabsTrigger value="email">خطاب المتعامل</TabsTrigger>
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
