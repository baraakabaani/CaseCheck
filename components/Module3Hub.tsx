"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, MapPin } from "lucide-react";
import { formatDate } from "@/lib/format";
import { DOCUMENT_DEMAND_STATUS_LABELS } from "@/lib/case-hub-labels";
import type { CaseDetail } from "@/lib/queries";
import type { RequirementStatus } from "@/lib/schemas";
import type { DocumentDemandStatus } from "@/lib/hub-schemas";

const BOARD_COLUMNS: { status: RequirementStatus; title: string; accent: string }[] = [
  {
    status: "MISSING",
    title: "مطلوبة",
    accent: "border-t-[#c8102e]",
  },
  {
    status: "PARTIALLY_PROVIDED",
    title: "مستلمة جزئياً",
    accent: "border-t-amber-400",
  },
  {
    status: "NOT_ANALYZED",
    title: "لم تتم المطابقة بعد",
    accent: "border-t-[#5A6B7C]",
  },
  {
    status: "PROVIDED",
    title: "مكتملة ومطابقة",
    accent: "border-t-primary",
  },
];

export function Module3Hub({ caseDetail }: { caseDetail: CaseDetail }) {
  const router = useRouter();

  const columns = useMemo(() => {
    return BOARD_COLUMNS.map((col) => ({
      ...col,
      items: caseDetail.requirements.filter((r) => r.status === col.status),
    }));
  }, [caseDetail.requirements]);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>متابعة استيفاء المستندات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {columns.map((col) => (
              <div key={col.status} className={`rounded-md border border-t-4 ${col.accent} bg-muted/30 p-3`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{col.title}</span>
                  <Badge variant="secondary">{col.items.length}</Badge>
                </div>
                <div className="flex flex-col gap-2">
                  {col.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">لا يوجد</p>
                  ) : (
                    col.items.map((r) => (
                      <div key={r.id} className="rounded-md border bg-card p-2 text-xs">
                        <div className="font-medium text-foreground">{r.labelAr}</div>
                        {r.category && <div className="text-muted-foreground">{r.category}</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            مبنية على قائمة المتطلبات في الموديول 1 — تحديث الحالة يدوياً من هناك (متاح مستقبلاً
            بالسحب والإفلات مباشرة هنا).
          </p>
        </CardContent>
      </Card>

      <DocumentDemandsSummaryCard caseDetail={caseDetail} />

      <SiteInspectionsCard caseDetail={caseDetail} onChanged={refresh} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// مطالبات المستندات الناتجة عن اجتماعات الخبرة (الموديول 2) — عرض للمتابعة
// هنا؛ إدارتها (إضافة/تعديل الحالة) تتم من غرفة الاجتماع نفسها.
// ---------------------------------------------------------------------------
function DocumentDemandsSummaryCard({ caseDetail }: { caseDetail: CaseDetail }) {
  if (caseDetail.documentDemands.length === 0) return null;

  const partyById = new Map(caseDetail.parties.map((p) => [p.id, p.name]));
  const now = new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle>مطالبات المستندات من اجتماعات الخبرة</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {caseDetail.documentDemands.map((d) => {
          const requestedFrom: string[] = (() => {
            try {
              const ids = JSON.parse(d.requestedFromPartyIds) as string[];
              return ids.map((id) => partyById.get(id) ?? id);
            } catch {
              return [];
            }
          })();
          const overdue = d.status !== "RECEIVED" && new Date(d.deadline) < now;
          return (
            <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{d.item}</div>
                <div className="text-xs text-muted-foreground">
                  من: {requestedFrom.join("، ") || "غير محدد"} · الموعد النهائي: {formatDate(d.deadline)}
                </div>
              </div>
              {overdue && (
                <Badge variant="outline" className="border-[#c8102e33] bg-[#c8102e0d] text-[#c8102e]">
                  متأخرة
                </Badge>
              )}
              <Badge variant="secondary">{DOCUMENT_DEMAND_STATUS_LABELS[d.status as DocumentDemandStatus]}</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SiteInspectionsCard({
  caseDetail,
  onChanged,
}: {
  caseDetail: CaseDetail;
  onChanged: () => void;
}) {
  const caseId = caseDetail.id;
  const [visitDate, setVisitDate] = useState("");
  const [location, setLocation] = useState("");
  const [purpose, setPurpose] = useState("");
  const [attendees, setAttendees] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    if (!visitDate || !location.trim() || !purpose.trim()) {
      toast.error("الرجاء تعبئة تاريخ الزيارة والموقع والغرض منها");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/site-inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitDate: new Date(visitDate).toISOString(),
          location: location.trim(),
          purpose: purpose.trim(),
          attendees: attendees
            .split("\n")
            .map((a) => a.trim())
            .filter(Boolean),
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تسجيل زيارة المعاينة");
      setVisitDate("");
      setLocation("");
      setPurpose("");
      setAttendees("");
      setNotes("");
      toast.success("تم تسجيل زيارة المعاينة");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تسجيل زيارة المعاينة");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(inspectionId: string) {
    setDeletingId(inspectionId);
    try {
      const res = await fetch(`/api/cases/${caseId}/site-inspections/${inspectionId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل الحذف");
      toast.success("تم حذف سجل المعاينة");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحذف");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>الانتقال والمعاينة الميدانية</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {caseDetail.siteInspections.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد زيارات معاينة مسجَّلة بعد</p>
        ) : (
          <div className="flex flex-col gap-2">
            {caseDetail.siteInspections.map((visit) => {
              const attendeesList: string[] = (() => {
                try {
                  return visit.attendees ? (JSON.parse(visit.attendees) as string[]) : [];
                } catch {
                  return [];
                }
              })();
              return (
                <div key={visit.id} className="flex items-start gap-3 rounded-md border p-3">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{visit.location}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(visit.visitDate)} · الغرض: {visit.purpose}
                    </div>
                    {attendeesList.length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        الحاضرون: {attendeesList.join("، ")}
                      </div>
                    )}
                    {visit.notes && <p className="mt-1 text-sm">{visit.notes}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deletingId === visit.id}
                    onClick={() => handleDelete(visit.id)}
                  >
                    {deletingId === visit.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 text-destructive" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="visitDate">تاريخ الزيارة</Label>
            <Input
              id="visitDate"
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">الموقع</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="purpose">الغرض من الزيارة</Label>
            <Input id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="attendees">الحاضرون (سطر لكل اسم)</Label>
            <Textarea
              id="attendees"
              rows={2}
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="visitNotes">
              ملاحظات — الأجهزة/الخوادم التي تم فحصها، الدفاتر المالية التي روجعت، الإفادات
            </Label>
            <Textarea id="visitNotes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              تسجيل زيارة معاينة
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
