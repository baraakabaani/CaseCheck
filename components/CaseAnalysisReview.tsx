"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { Loader2, CheckCircle2, Sparkles, Mail, ArrowRight, Pencil, Plus, Trash2, Save } from "lucide-react";
import { EditableStringList } from "@/components/EditableStringList";
import type {
  MissingDocumentItem,
  ReceivedDocumentSummary,
} from "@/lib/case-analysis-schemas";
import { DOC_CATEGORY_LABELS, CASE_PARTY_ROLE_LABELS } from "@/lib/case-intake-labels";
import type { DocCategory } from "@/lib/schemas";
import type { CaseAnalysisDetail, CasePartyDetail, DocumentDetail } from "@/lib/queries";

interface ParsedAnalysis {
  caseSummary: string;
  mandateText: string;
  mandateTasks: string[];
  receivedDocuments: ReceivedDocumentSummary[];
  missingDocuments: MissingDocumentItem[];
  unclearPoints: string[];
  claimantQuestions: string[];
  respondentQuestions: string[];
  expertNotes: string[];
}

function parseAnalysis(analysis: CaseAnalysisDetail): ParsedAnalysis {
  return {
    caseSummary: analysis.caseSummary,
    mandateText: analysis.mandateText,
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
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ParsedAnalysis>(() => parseAnalysis(analysis));

  const parsed = editing ? draft : parseAnalysis(analysis);
  const documentById = new Map(documents.map((d) => [d.id, d]));
  const partyById = new Map(parties.map((p) => [p.id, p]));

  function startEditing() {
    setDraft(parseAnalysis(analysis));
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/analysis/${analysis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseSummary: draft.caseSummary,
          mandateText: draft.mandateText,
          mandateTasks: draft.mandateTasks.map((t) => t.trim()).filter(Boolean),
          receivedDocuments: draft.receivedDocuments,
          missingDocuments: draft.missingDocuments
            .map((m) => ({ ...m, item: m.item.trim() }))
            .filter((m) => m.item),
          unclearPoints: draft.unclearPoints.map((p) => p.trim()).filter(Boolean),
          claimantQuestions: draft.claimantQuestions.map((q) => q.trim()).filter(Boolean),
          respondentQuestions: draft.respondentQuestions.map((q) => q.trim()).filter(Boolean),
          expertNotes: draft.expertNotes.map((n) => n.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حفظ التعديلات");

      toast.success("تم حفظ التعديلات — ستُستخدَم هذه النسخة المعدَّلة في بقية الموديولات");
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ التعديلات");
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setDraft(parseAnalysis(analysis));
    setEditing(false);
  }

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

  function updateMissingDoc(i: number, patch: Partial<MissingDocumentItem>) {
    setDraft((prev) => ({
      ...prev,
      missingDocuments: prev.missingDocuments.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    }));
  }
  function removeMissingDoc(i: number) {
    setDraft((prev) => ({ ...prev, missingDocuments: prev.missingDocuments.filter((_, idx) => idx !== i) }));
  }
  function toggleMissingDocParty(i: number, partyId: string) {
    setDraft((prev) => ({
      ...prev,
      missingDocuments: prev.missingDocuments.map((m, idx) => {
        if (idx !== i) return m;
        const has = m.requestedFromPartyIds.includes(partyId);
        return {
          ...m,
          requestedFromPartyIds: has
            ? m.requestedFromPartyIds.filter((id) => id !== partyId)
            : [...m.requestedFromPartyIds, partyId],
        };
      }),
    }));
  }

  function updateReceivedDoc(i: number, patch: Partial<ReceivedDocumentSummary>) {
    setDraft((prev) => ({
      ...prev,
      receivedDocuments: prev.receivedDocuments.map((rd, idx) => (idx === i ? { ...rd, ...patch } : rd)),
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      {analysis.mode === "OFFLINE" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
          تم إعداد هذا التقرير بمطابقة آلية محدودة بدون ذكاء اصطناعي — أضف مفتاح Groq API من زر
          «مفتاح Groq API» أعلى الصفحة ثم أعد التحليل للحصول على تقرير كامل.
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300">
        <span>
          هذا تحليل مُعَد بالذكاء الاصطناعي — إن كانت أي نتيجة غير دقيقة (مهمة ناقصة، ملخص غير
          صحيح، سؤال غير مناسب...) عدّلها مباشرة قبل أو بعد الاعتماد.
        </span>
        {!editing && (
          <Button type="button" variant="outline" size="sm" onClick={startEditing} className="shrink-0">
            <Pencil className="size-3.5" />
            تعديل
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ملخص الدعوى</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <Textarea
              rows={5}
              value={draft.caseSummary}
              onChange={(e) => setDraft((p) => ({ ...p, caseSummary: e.target.value }))}
              className="text-justify leading-6"
            />
          ) : (
            <p className="text-justify leading-7 whitespace-pre-wrap">{parsed.caseSummary}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>مأمورية الخبرة</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {editing ? (
            <>
              <Label className="text-xs text-muted-foreground">نص المأمورية</Label>
              <Textarea
                rows={5}
                value={draft.mandateText}
                onChange={(e) => setDraft((p) => ({ ...p, mandateText: e.target.value }))}
                className="text-justify leading-6"
              />
              <Label className="mt-2 text-xs text-muted-foreground">
                المهام (هذه القائمة هي ما يُبنى عليه هيكل تقرير الموديول 4 مباشرة — أضف إليها أي
                مهمة استجدت في محضر الجلسة ولم يلتقطها التحليل الأولي)
              </Label>
              <EditableStringList
                items={draft.mandateTasks}
                onChange={(next) => setDraft((p) => ({ ...p, mandateTasks: next }))}
                placeholder="نص المهمة"
                ordered
              />
            </>
          ) : (
            <>
              <p className="text-justify leading-7 whitespace-pre-wrap">{parsed.mandateText}</p>
              {parsed.mandateTasks.length > 0 && (
                <ol className="flex flex-col gap-1 ps-5">
                  {parsed.mandateTasks.map((task, i) => (
                    <li key={i} className="list-decimal">
                      {task}
                    </li>
                  ))}
                </ol>
              )}
            </>
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
                        {editing ? (
                          <Select
                            value={rd.submittedByPartyId ?? "none"}
                            onValueChange={(v) => updateReceivedDoc(i, { submittedByPartyId: v === "none" ? null : v })}
                          >
                            <SelectTrigger className="h-8 w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">غير محدد</SelectItem>
                              {parties.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : rd.submittedByPartyId ? (
                          (partyById.get(rd.submittedByPartyId)?.name ?? "—")
                        ) : (
                          "غير محدد"
                        )}
                      </TableCell>
                      <TableCell>
                        {editing ? (
                          <Input
                            className="h-8 w-32"
                            value={rd.periodLabel ?? ""}
                            onChange={(e) => updateReceivedDoc(i, { periodLabel: e.target.value || null })}
                          />
                        ) : (
                          (rd.periodLabel ?? "—")
                        )}
                      </TableCell>
                      <TableCell>
                        {editing ? (
                          <Input
                            className="h-8 w-28"
                            value={rd.status}
                            onChange={(e) => updateReceivedDoc(i, { status: e.target.value })}
                          />
                        ) : (
                          <Badge variant="outline">{rd.status}</Badge>
                        )}
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
          {editing ? (
            <div className="flex flex-col gap-3">
              {draft.missingDocuments.map((m, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex items-start gap-2">
                    <Input
                      value={m.item}
                      onChange={(e) => updateMissingDoc(i, { item: e.target.value })}
                      placeholder="المستند المطلوب"
                      className="flex-1"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeMissingDoc(i)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {parties.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleMissingDocParty(i, p.id)}
                        className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                          m.requestedFromPartyIds.includes(p.id)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-muted-foreground/25 text-muted-foreground"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={m.reason}
                    onChange={(e) => updateMissingDoc(i, { reason: e.target.value })}
                    placeholder="سبب طلبه"
                  />
                  <Input
                    value={m.relatedTask ?? ""}
                    onChange={(e) => updateMissingDoc(i, { relatedTask: e.target.value || null })}
                    placeholder="المهمة المرتبطة (اختياري)"
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  setDraft((p) => ({
                    ...p,
                    missingDocuments: [...p.missingDocuments, { item: "", requestedFromPartyIds: [], reason: "", relatedTask: null }],
                  }))
                }
              >
                <Plus className="size-4" />
                إضافة بند
              </Button>
            </div>
          ) : parsed.missingDocuments.length === 0 ? (
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
          {editing ? (
            <EditableStringList
              items={draft.unclearPoints}
              onChange={(next) => setDraft((p) => ({ ...p, unclearPoints: next }))}
            />
          ) : parsed.unclearPoints.length === 0 ? (
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
            <p className="mb-2 text-sm font-medium">
              أسئلة لـ{CASE_PARTY_ROLE_LABELS.CLAIMANT}
            </p>
            {editing ? (
              <EditableStringList
                items={draft.claimantQuestions}
                onChange={(next) => setDraft((p) => ({ ...p, claimantQuestions: next }))}
                ordered
              />
            ) : parsed.claimantQuestions.length === 0 ? (
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
            <p className="mb-2 text-sm font-medium">
              أسئلة لـ{CASE_PARTY_ROLE_LABELS.RESPONDENT}
            </p>
            {editing ? (
              <EditableStringList
                items={draft.respondentQuestions}
                onChange={(next) => setDraft((p) => ({ ...p, respondentQuestions: next }))}
                ordered
              />
            ) : parsed.respondentQuestions.length === 0 ? (
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
          {editing ? (
            <EditableStringList
              items={draft.expertNotes}
              onChange={(next) => setDraft((p) => ({ ...p, expertNotes: next }))}
            />
          ) : parsed.expertNotes.length === 0 ? (
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href={`/cases/${caseId}/setup/documents`}>
            <ArrowRight className="size-4" />
            رجوع لتعديل المستندات
          </Link>
        </Button>

        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button type="button" variant="ghost" onClick={cancelEditing} disabled={saving}>
                إلغاء
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                حفظ التعديلات
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
