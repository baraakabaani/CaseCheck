"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { Loader2, CheckCircle2, Sparkles, Mail } from "lucide-react";
import type {
  MissingDocumentItem,
  ReceivedDocumentSummary,
} from "@/lib/case-analysis-schemas";
import { DOC_CATEGORY_LABELS } from "@/lib/case-intake-labels";
import type { DocCategory } from "@/lib/schemas";
import type { CaseAnalysisDetail, CasePartyDetail, DocumentDetail } from "@/lib/queries";

function parseAnalysis(analysis: CaseAnalysisDetail) {
  return {
    mandateTasks: JSON.parse(analysis.mandateTasks) as string[],
    receivedDocuments: JSON.parse(analysis.receivedDocumentsSummary) as ReceivedDocumentSummary[],
    missingDocuments: JSON.parse(analysis.missingDocuments) as MissingDocumentItem[],
    unclearPoints: JSON.parse(analysis.unclearPoints) as string[],
    claimantQuestions: JSON.parse(analysis.claimantQuestions) as string[],
    respondentQuestions: JSON.parse(analysis.respondentQuestions) as string[],
    expertNotes: JSON.parse(analysis.expertNotes) as string[],
  };
}

export function CaseAnalysisReview({
  caseId,
  analysis,
  documents,
  parties,
}: {
  caseId: string;
  analysis: CaseAnalysisDetail;
  documents: DocumentDetail[];
  parties: CasePartyDetail[];
}) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);

  const parsed = parseAnalysis(analysis);
  const documentById = new Map(documents.map((d) => [d.id, d]));
  const partyById = new Map(parties.map((p) => [p.id, p]));

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/analysis/${analysis.id}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل اعتماد التحليل الأولي");

      toast.success(`تم اعتماد التحليل الأولي — أُضيف ${data.createdRequirements} بند إلى قائمة المتطلبات`);
      router.push(`/cases/${caseId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل اعتماد التحليل الأولي");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {analysis.mode === "OFFLINE" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
          تم إعداد هذا التقرير بمطابقة آلية محدودة بدون ذكاء اصطناعي — أضف مفتاح Groq API من زر
          «مفتاح Groq API» أعلى الصفحة ثم أعد التحليل للحصول على تقرير كامل.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ملخص الدعوى</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-justify leading-7 whitespace-pre-wrap">{analysis.caseSummary}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>مأمورية الخبرة</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-justify leading-7 whitespace-pre-wrap">{analysis.mandateText}</p>
          {parsed.mandateTasks.length > 0 && (
            <ol className="flex flex-col gap-1 ps-5">
              {parsed.mandateTasks.map((task, i) => (
                <li key={i} className="list-decimal">
                  {task}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>المستندات المستلمة ({parsed.receivedDocuments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {parsed.receivedDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستند</TableHead>
                    <TableHead>التصنيف</TableHead>
                    <TableHead>مقدم من</TableHead>
                    <TableHead>التاريخ / الفترة</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.receivedDocuments.map((rd, i) => (
                    <TableRow key={i}>
                      <TableCell>{documentById.get(rd.documentId)?.fileName ?? rd.documentId}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {DOC_CATEGORY_LABELS[rd.docCategory as DocCategory] ?? rd.docCategory}
                      </TableCell>
                      <TableCell>
                        {rd.submittedByPartyId
                          ? (partyById.get(rd.submittedByPartyId)?.name ?? "—")
                          : "غير محدد"}
                      </TableCell>
                      <TableCell>{rd.periodLabel ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{rd.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>المستندات الناقصة المطلوب طلبها ({parsed.missingDocuments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {parsed.missingDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستند المطلوب</TableHead>
                    <TableHead>من أي طرف</TableHead>
                    <TableHead>سبب طلبه</TableHead>
                    <TableHead>المهمة المرتبطة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.missingDocuments.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{m.item}</TableCell>
                      <TableCell>
                        {m.requestedFromPartyIds.length > 0
                          ? m.requestedFromPartyIds
                              .map((id) => partyById.get(id)?.name ?? "—")
                              .join("، ")
                          : "غير محدد"}
                      </TableCell>
                      <TableCell className="max-w-64 text-sm text-muted-foreground">
                        {m.reason}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.relatedTask ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            ستظهر هذه القائمة كمتطلبات في تبويب «قائمة المتطلبات والمطابقة» بعد الاعتماد، ويمكن
            استخدامها لتعبئة إخطار اجتماع الخبرة تلقائياً.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>نقاط تحتاج إلى إيضاح من الأطراف</CardTitle>
        </CardHeader>
        <CardContent>
          {parsed.unclearPoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد</p>
          ) : (
            <ul className="flex flex-col gap-1 ps-5">
              {parsed.unclearPoints.map((p, i) => (
                <li key={i} className="list-disc">
                  {p}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الأسئلة المقترحة للاجتماع الأول</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">أسئلة للمدعي / المستأنف</p>
            {parsed.claimantQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد</p>
            ) : (
              <ol className="flex flex-col gap-1 ps-5">
                {parsed.claimantQuestions.map((q, i) => (
                  <li key={i} className="list-decimal">
                    {q}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">أسئلة للمدعى عليه / المستأنف ضده</p>
            {parsed.respondentQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد</p>
            ) : (
              <ol className="flex flex-col gap-1 ps-5">
                {parsed.respondentQuestions.map((q, i) => (
                  <li key={i} className="list-decimal">
                    {q}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ملاحظات أولية للخبير</CardTitle>
        </CardHeader>
        <CardContent>
          {parsed.expertNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد</p>
          ) : (
            <ul className="flex flex-col gap-1 ps-5">
              {parsed.expertNotes.map((n, i) => (
                <li key={i} className="list-disc">
                  {n}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        {parsed.missingDocuments.length > 0 && (
          <Button variant="outline" asChild>
            <Link href={`/cases/${caseId}/notices/new?fromAnalysisId=${analysis.id}`}>
              <Mail className="size-4" />
              توليد إشعار النواقص ودعوة الاجتماع الأول
            </Link>
          </Button>
        )}

        {analysis.status === "APPROVED" ? (
          <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="size-3.5" />
            تم الاعتماد
          </Badge>
        ) : (
          <Button onClick={handleApprove} disabled={approving} size="lg">
            {approving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            مراجعة واعتماد التحليل الأولي
          </Button>
        )}
      </div>
    </div>
  );
}
