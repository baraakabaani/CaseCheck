"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Loader2,
  Save,
  FileDown,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { buildCourtReportDocxBlob, downloadBlob } from "@/lib/docx-export";
import { buildClientApiKeyHeaders } from "@/lib/client-api-key";
import { COURT_REPORT_STATUS_LABELS, TIMELINE_EVENT_LABELS } from "@/lib/case-hub-labels";
import { CASE_PARTY_ROLE_LABELS } from "@/lib/case-intake-labels";
import { computeLiquidation, formatAed, beneficiaryLabel } from "@/lib/reports/liquidation";
import { isExportBlocked } from "@/lib/reports/provenance";
import { buildAttachmentPlan } from "@/lib/reports/attachments";
import { formatDate } from "@/lib/format";
import { ReportPreliminarySections } from "@/components/ReportPreliminarySections";
import { ReportCoverSettings } from "@/components/ReportCoverSettings";
import { ReportTaskSection } from "@/components/ReportTaskSection";
import { ForensicLiquidationTable } from "@/components/ForensicLiquidationTable";
import { ReportDocumentsIndex } from "@/components/ReportDocumentsIndex";
import { ReportObjectionsPanel } from "@/components/ReportObjectionsPanel";
import { ReportConclusionSection } from "@/components/ReportConclusionSection";
import type { CaseDetail, ExpertProfileDetail } from "@/lib/queries";
import type { CourtReportStatus } from "@/lib/hub-schemas";
import type { ProceduralTimelineEvent } from "@/lib/reports/report-aggregator";
import type { CourtReportDocxTableRow, CourtReportDocxFinancialTable } from "@/lib/docx-export";

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

interface StoredTableColumn {
  key: string;
  label: string;
}

function toDocxTable(table: {
  title: string;
  subtitle: string | null;
  columnsJson: string;
  rowsJson: string;
  basisNote: string | null;
}): CourtReportDocxFinancialTable {
  return {
    title: table.title,
    subtitle: table.subtitle,
    columnLabels: safeParseJson<StoredTableColumn[]>(table.columnsJson, []).map((c) => c.label),
    rows: safeParseJson<CourtReportDocxTableRow[]>(table.rowsJson, []),
    basisNote: table.basisNote,
  };
}

export function Module4Studio({
  caseDetail,
  expertProfile,
}: {
  caseDetail: CaseDetail;
  expertProfile: ExpertProfileDetail;
}) {
  const router = useRouter();
  const report = caseDetail.courtReport;
  const tasks = report?.tasks ?? [];
  const documents = caseDetail.documents;

  const mandateTaskCount = safeParseJson<string[]>(caseDetail.analyses[0]?.mandateTasks, []).length;

  const [activeTab, setActiveTab] = useState("preliminary");
  const [openTaskId, setOpenTaskId] = useState<string | undefined>(tasks[0]?.id);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const status = (report?.status as CourtReportStatus) ?? "DRAFT";
  const gate = isExportBlocked(tasks, report ? { tables: report.tables, objections: report.objections, report } : undefined);
  const liquidation = computeLiquidation(tasks);

  function jumpToTask(taskId: string) {
    setActiveTab("tasks");
    setOpenTaskId(taskId);
    requestAnimationFrame(() => {
      document.getElementById(`task-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/cases/${caseDetail.id}/court-report/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...buildClientApiKeyHeaders() },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل توليد التقرير");

      if (data.warning) toast.warning(data.warning);
      else if (data.mode === "OFFLINE") toast.success("تم تجميع الأقسام الحتمية بلا ذكاء اصطناعي (لا يوجد مفتاح API)");
      else toast.success(`تم توليد التقرير بالذكاء الاصطناعي${data.preservedCertifiedFields > 0 ? ` (تم الحفاظ على ${data.preservedCertifiedFields} كتلة معتمدة سابقاً)` : ""}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل توليد التقرير");
    } finally {
      setGenerating(false);
    }
  }

  async function handleFinalize() {
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseDetail.id}/court-report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...buildClientApiKeyHeaders() },
        body: JSON.stringify({ status: "FINAL" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.uncertifiedTaskIndexes) {
          toast.error(
            `${data.error} (المهام غير المعتمدة: ${data.uncertifiedTaskIndexes.map((i: number) => i + 1).join("، ")})`,
          );
        } else {
          toast.error(data.error || "فشل اعتماد التقرير");
        }
        return;
      }
      toast.success("تم اعتماد التقرير");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل اعتماد التقرير");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    if (!report) return;
    if (!expertProfile?.expertName || !expertProfile?.registrationNumber) {
      toast.warning("لم تُعرَّف بيانات الخبير بعد — أضفها من «بيانات الخبير» في تبويب الأقسام التمهيدية للحصول على توقيع كامل في الملف المُصدَّر.");
    }
    setExporting(true);
    try {
      const documentById = new Map(documents.map((d) => [d.id, d]));
      const attachmentPlan = buildAttachmentPlan(
        tasks.map((t) => ({ taskIndex: t.taskIndex, linkedDocumentIds: safeParseJson<string[]>(t.linkedDocumentIds, []) })),
        documentById,
      );
      const timeline = safeParseJson<ProceduralTimelineEvent[]>(report.timelineJson, []);
      const scopeTables = report.tables.filter((t) => t.placement === "SCOPE").map(toDocxTable);

      const blob = await buildCourtReportDocxBlob({
        caseNumber: caseDetail.caseNumber,
        caseTitle: caseDetail.title,
        court: caseDetail.court,
        judgeName: report.judgeName,
        judgeTitle: report.judgeTitle,
        letterDateLabel: report.letterDate ? formatDate(report.letterDate) : null,
        parties: caseDetail.parties.map((p) => ({
          roleLabel: CASE_PARTY_ROLE_LABELS[p.role as "CLAIMANT" | "RESPONDENT"],
          name: p.name,
          capacityNote: p.capacityNote,
        })),
        introduction: report.introduction,
        mandateSummary: report.mandateSummary,
        proceduralHistory: report.proceduralHistory,
        timeline: timeline.map((e) => ({ dateLabel: formatDate(e.at), label: TIMELINE_EVENT_LABELS[e.kind], detail: e.detail })),
        scopeNarrative: report.scopeNarrative,
        scopeTables,
        tasks: tasks.map((t) => {
          const linkedDocumentIds = safeParseJson<string[]>(t.linkedDocumentIds, []);
          return {
            index: t.taskIndex,
            taskText: t.taskText,
            claimantPosition: t.claimantPosition,
            respondentPosition: t.respondentPosition,
            exhibitFileNames: linkedDocumentIds.map((id) => documentById.get(id)?.fileName).filter((n): n is string => Boolean(n)),
            attachmentNumbers: linkedDocumentIds
              .map((id) => attachmentPlan.numberByDocumentId.get(id))
              .filter((n): n is number => n !== undefined),
            forensicAnalysis: t.forensicAnalysis,
            tables: report.tables.filter((table) => table.courtReportTaskId === t.id).map(toDocxTable),
            missingDocsImpact: t.missingDocsImpact,
            expertVerdict: t.expertVerdict,
          };
        }),
        liquidation: {
          rows: liquidation.rows.map((r) => ({
            taskLabel: `مهمة ${r.taskIndex + 1}: ${r.taskLabel}`,
            claimantAmountLabel: formatAed(r.claimantAmount),
            respondentOffsetLabel: formatAed(r.respondentOffset),
            netLabel: formatAed(r.net),
          })),
          totalClaimantLabel: formatAed(liquidation.totalClaimant),
          totalRespondentLabel: formatAed(liquidation.totalRespondent),
          netResultLabel: `${formatAed(Math.abs(liquidation.netDue))} ${beneficiaryLabel(liquidation.beneficiaryRole)}`,
          narrative: report.settlementNarrative,
        },
        objectionsIntro: report.objectionsIntro,
        objections: report.objections.map((o) => ({
          partyRoleLabel: CASE_PARTY_ROLE_LABELS[o.partyRole as "CLAIMANT" | "RESPONDENT"],
          submittedOnBehalfOfLabel: o.submittedOnBehalfOfLabel,
          memoDateLabel: o.objectionMemoDate ? formatDate(o.objectionMemoDate) : null,
          objectionText: o.objectionText,
          responseText: o.responseText,
        })),
        conclusionIntro: report.conclusionIntro,
        conclusionItems: safeParseJson<string[]>(report.conclusionItemsJson, []),
        conclusionClosing: report.conclusionClosing,
        documentsIndex: attachmentPlan.entries.map((e) => ({ number: e.number, fileName: e.fileName })),
      });
      downloadBlob(blob, `تقرير-الخبرة-${caseDetail.caseNumber}.docx`);
      toast.success("تم تصدير التقرير بصيغة Word");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تصدير التقرير");
    } finally {
      setExporting(false);
    }
  }

  const exportDisabled = gate.blocked || exporting;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={status === "FINAL" ? "gap-1 border-primary/30 bg-primary/10 text-primary" : "gap-1"}
          >
            {status === "FINAL" && <CheckCircle2 className="size-3.5" />}
            {COURT_REPORT_STATUS_LABELS[status]}
          </Badge>
          {report?.generationMode && (
            <Badge variant="outline" className="font-normal">
              آخر توليد: {report.generationMode === "AI" ? "بالذكاء الاصطناعي" : "بالمحرك الاحتياطي"}
            </Badge>
          )}
          {tasks.length > 0 && (
            <Badge variant="outline" className="font-normal">
              {tasks.filter((t) => t.expertVerdictProvenance === "EXPERT_CERTIFIED").length} / {tasks.length} مهمة معتمدة
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="size-4 animate-spin" /> : tasks.length > 0 ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
            {tasks.length > 0 ? "إعادة توليد التقرير" : "توليد التقرير"}
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exportDisabled}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            تصدير كملف Word
          </Button>
          {status === "DRAFT" && (
            <Button variant="outline" onClick={handleFinalize} disabled={saving || gate.blocked}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              اعتماد التقرير
            </Button>
          )}
        </div>
      </div>

      {report?.generationWarning && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
          {report.generationWarning}
        </div>
      )}

      {gate.blocked && tasks.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            <span>لا يمكن التصدير أو اعتماد التقرير قبل اعتماد ما يلي:</span>
            {gate.uncertifiedTaskIndexes.length > 0 && (
              <span>
                رأي الخبرة في:{" "}
                {gate.uncertifiedTaskIndexes.map((i, idx) => (
                  <span key={i}>
                    <button type="button" className="underline underline-offset-2" onClick={() => jumpToTask(tasks.find((t) => t.taskIndex === i)?.id ?? "")}>
                      مهمة {i + 1}
                    </button>
                    {idx < gate.uncertifiedTaskIndexes.length - 1 ? "، " : ""}
                  </span>
                ))}
              </span>
            )}
            {gate.uncertifiedTableIds.length > 0 && (
              <span>{gate.uncertifiedTableIds.length} جدول مالي غير معتمَد (أو بلا صفوف فعلية).</span>
            )}
            {gate.uncertifiedObjectionIds.length > 0 && (
              <span>
                <button type="button" className="underline underline-offset-2" onClick={() => setActiveTab("objections")}>
                  {gate.uncertifiedObjectionIds.length} اعتراض بلا رد معتمَد
                </button>
                .
              </span>
            )}
            {gate.conclusionUncertified && (
              <span>
                <button type="button" className="underline underline-offset-2" onClick={() => setActiveTab("conclusion")}>
                  الخلاصة (ثامناً) غير معتمَدة بعد
                </button>
                .
              </span>
            )}
          </div>
        </div>
      )}

      {!report && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">لم يُولَّد التقرير بعد</p>
              <p className="text-sm text-muted-foreground">
                يجمع التوليد بيانات الموديولات 1-3 آلياً (الجدول الزمني، حافظة المستندات، مواقف
                الأطراف) ويصوغ بحث كل مهمة من مهام المأمورية.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="preliminary">الأقسام التمهيدية</TabsTrigger>
            <TabsTrigger value="tasks">البحث والدراسة ({tasks.length})</TabsTrigger>
            <TabsTrigger value="settlement">تصفية الحساب</TabsTrigger>
            <TabsTrigger value="objections">العرض على الأطراف ({report.objections.length})</TabsTrigger>
            <TabsTrigger value="conclusion">الخلاصة</TabsTrigger>
            <TabsTrigger value="documents">حافظة المستندات</TabsTrigger>
          </TabsList>

          <TabsContent value="preliminary">
            <div className="flex flex-col gap-4">
              <ReportCoverSettings
                caseId={caseDetail.id}
                report={report}
                expertProfile={expertProfile}
                onChanged={() => router.refresh()}
              />
              <Card>
                <CardContent>
                  <ReportPreliminarySections caseId={caseDetail.id} report={report} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="tasks">
            {tasks.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                لا توجد مهام — تأكد من اعتماد التحليل الأولي في الموديول 1 وأن مهام المأمورية
                مستخرجة فيه، ثم ولِّد التقرير.
              </p>
            ) : (
              <Card>
                <CardContent>
                  <Accordion
                    type="single"
                    collapsible
                    value={openTaskId}
                    onValueChange={(v) => setOpenTaskId(v || undefined)}
                  >
                    {tasks.map((task) => {
                      const isStale = task.taskIndex >= mandateTaskCount;
                      return (
                        <AccordionItem key={task.id} value={task.id} id={`task-${task.id}`}>
                          <AccordionTrigger>
                            <span className="flex flex-1 flex-wrap items-center gap-2 text-start">
                              <span>
                                مهمة {task.taskIndex + 1}: {task.taskText.slice(0, 90)}
                                {task.taskText.length > 90 ? "…" : ""}
                              </span>
                              {task.expertVerdictProvenance === "EXPERT_CERTIFIED" ? (
                                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                                  معتمدة
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300">
                                  غير معتمدة
                                </Badge>
                              )}
                              {isStale && (
                                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                  لم تعد ضمن المأمورية الحالية
                                </Badge>
                              )}
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <ReportTaskSection
                              caseId={caseDetail.id}
                              task={task}
                              allTasks={tasks}
                              tables={(report?.tables ?? []).filter((t) => t.courtReportTaskId === task.id)}
                              documents={documents}
                              onChanged={() => router.refresh()}
                            />
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="settlement">
            <div className="flex flex-col gap-4">
              <Card>
                <CardContent>
                  <ForensicLiquidationTable tasks={tasks} onJumpToTask={jumpToTask} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="objections">
            <ReportObjectionsPanel caseId={caseDetail.id} report={report} tasks={tasks} onChanged={() => router.refresh()} />
          </TabsContent>

          <TabsContent value="conclusion">
            <Card>
              <CardContent>
                <ReportConclusionSection caseId={caseDetail.id} report={report} onChanged={() => router.refresh()} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardContent>
                <ReportDocumentsIndex inventoryJson={report.inventoryJson} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
