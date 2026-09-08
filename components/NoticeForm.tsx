"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Trash2, Sparkles } from "lucide-react";
import { NoticeAutoFillUpload } from "@/components/NoticeAutoFillUpload";
import { cn } from "@/lib/utils";
import type { NoticeAddressee } from "@/lib/notice-schemas";
import type { ExtractedNotice } from "@/lib/notice-extraction-schemas";

interface AddresseeDraft extends NoticeAddressee {
  key: string;
}

function newAddressee(): AddresseeDraft {
  return { key: crypto.randomUUID(), lawFirmName: "", roleLabel: "", representedNames: [""] };
}

// نفس معيار تظليل الحقول المُعبَّأة تلقائياً في CaseIntakeStep1Form.tsx —
// يبقى حتى يعدّل الخبير الحقل يدوياً (reviewField)، فيختفي التظليل.
const AUTO_FILLED_CLASS = "border-purple-400 ring-1 ring-purple-300/60 dark:border-purple-600";

export function NoticeForm({
  caseId,
  caseNumber,
  suggestedItems,
  defaultMeetingDate,
  expertProfile,
}: {
  caseId: string;
  caseNumber: string;
  suggestedItems: string[];
  /** مُعبّأة من تاريخ الجلسة القادمة للدعوى إن وُجد (YYYY-MM-DD) */
  defaultMeetingDate?: string | null;
  /** مُعبّأة من بيانات الخبير المحفوظة (زر «بيانات الخبير» أعلى الصفحة)
   * إن وُجدت — تبقى قابلة للتعديل هنا كأي حقل آخر. */
  expertProfile?: { expertTitle: string; expertName: string; registrationNumber: string } | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [noticeLabel, setNoticeLabel] = useState("الأول");
  const [subjectLine, setSubjectLine] = useState(
    "اخطار اجتماع خبرة عبر تقنية الاتصال المرئي ZOOM MEETING",
  );
  const [referenceLetterNumber, setReferenceLetterNumber] = useState("");
  const [referenceLetterDate, setReferenceLetterDate] = useState("");

  const [meetingDate, setMeetingDate] = useState(defaultMeetingDate ?? "");
  const [meetingTimeLabel, setMeetingTimeLabel] = useState("");
  const [meetingMethod, setMeetingMethod] = useState(
    "تقنية الاتصال المرئي بواسطة تطبيق تقنية ZOOM MEETING",
  );
  const [meetingLink, setMeetingLink] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [meetingPasscode, setMeetingPasscode] = useState("");

  const [documentsDeadlineDays, setDocumentsDeadlineDays] = useState(2);
  const [requestedFromLabel, setRequestedFromLabel] = useState("وكلاء الأطراف");

  const [addressees, setAddressees] = useState<AddresseeDraft[]>([newAddressee()]);
  const [requestedItems, setRequestedItems] = useState<string[]>(
    suggestedItems.length > 0 ? suggestedItems : [""],
  );

  const [expertTitle, setExpertTitle] = useState(expertProfile?.expertTitle ?? "الخبير الحسابي");
  const [expertName, setExpertName] = useState(expertProfile?.expertName ?? "");
  const [expertRegistrationNumber, setExpertRegistrationNumber] = useState(
    expertProfile?.registrationNumber ?? "",
  );

  // تعبئة تلقائية من ملف مرجعي (NoticeAutoFillUpload) — نفس معيار
  // CaseIntakeStep1Form.tsx: كل حقل عُبِّئ تلقائياً يُعلَّم حتى يعدّله
  // الخبير يدوياً (reviewField)، فيُزال تظليله.
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  function reviewField(key: string) {
    setAutoFilledFields((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }
  function isAuto(key: string) {
    return autoFilledFields.has(key);
  }

  function handleExtracted(result: ExtractedNotice) {
    const next = new Set<string>();
    if (result.subjectLine) {
      setSubjectLine(result.subjectLine);
      next.add("subjectLine");
    }
    if (result.referenceLetterNumber) {
      setReferenceLetterNumber(result.referenceLetterNumber);
      next.add("referenceLetterNumber");
    }
    if (result.referenceLetterDate) {
      setReferenceLetterDate(result.referenceLetterDate);
      next.add("referenceLetterDate");
    }
    if (result.meetingDate) {
      setMeetingDate(result.meetingDate);
      next.add("meetingDate");
    }
    if (result.meetingTimeLabel) {
      setMeetingTimeLabel(result.meetingTimeLabel);
      next.add("meetingTimeLabel");
    }
    if (result.meetingMethod) {
      setMeetingMethod(result.meetingMethod);
      next.add("meetingMethod");
    }
    if (result.meetingLink) {
      setMeetingLink(result.meetingLink);
      next.add("meetingLink");
    }
    if (result.meetingId) {
      setMeetingId(result.meetingId);
      next.add("meetingId");
    }
    if (result.meetingPasscode) {
      setMeetingPasscode(result.meetingPasscode);
      next.add("meetingPasscode");
    }
    if (result.documentsDeadlineDays) {
      setDocumentsDeadlineDays(result.documentsDeadlineDays);
      next.add("documentsDeadlineDays");
    }
    if (result.requestedFromLabel) {
      setRequestedFromLabel(result.requestedFromLabel);
      next.add("requestedFromLabel");
    }
    if (result.addressees.length > 0) {
      setAddressees(
        result.addressees.map((a) => ({
          key: crypto.randomUUID(),
          lawFirmName: a.lawFirmName,
          roleLabel: a.roleLabel,
          representedNames: a.representedNames.length > 0 ? a.representedNames : [""],
        })),
      );
      next.add("addressees");
    }
    if (result.requestedItems.length > 0) {
      setRequestedItems(result.requestedItems);
      next.add("requestedItems");
    }
    setAutoFilledFields(next);
  }

  function updateAddressee(key: string, patch: Partial<AddresseeDraft>) {
    setAddressees((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
    reviewField("addressees");
  }

  function addAddresseeName(key: string) {
    setAddressees((prev) =>
      prev.map((a) =>
        a.key === key ? { ...a, representedNames: [...a.representedNames, ""] } : a,
      ),
    );
  }

  function updateAddresseeName(key: string, index: number, value: string) {
    setAddressees((prev) =>
      prev.map((a) =>
        a.key === key
          ? {
              ...a,
              representedNames: a.representedNames.map((n, i) => (i === index ? value : n)),
            }
          : a,
      ),
    );
    reviewField("addressees");
  }

  function removeAddresseeName(key: string, index: number) {
    setAddressees((prev) =>
      prev.map((a) =>
        a.key === key
          ? { ...a, representedNames: a.representedNames.filter((_, i) => i !== index) }
          : a,
      ),
    );
  }

  function updateItem(index: number, value: string) {
    setRequestedItems((prev) => prev.map((it, i) => (i === index ? value : it)));
    reviewField("requestedItems");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!meetingDate) {
      toast.error("الرجاء تحديد تاريخ الاجتماع");
      return;
    }
    if (!meetingTimeLabel.trim()) {
      toast.error("الرجاء تحديد وقت الاجتماع");
      return;
    }
    if (!expertName.trim() || !expertRegistrationNumber.trim()) {
      toast.error("الرجاء إدخال اسم الخبير ورقم القيد");
      return;
    }

    const cleanedAddressees = addressees
      .filter((a) => a.lawFirmName.trim())
      .map((a) => ({
        lawFirmName: a.lawFirmName.trim(),
        roleLabel: a.roleLabel.trim(),
        representedNames: a.representedNames.map((n) => n.trim()).filter(Boolean),
      }));
    if (cleanedAddressees.length === 0) {
      toast.error("الرجاء إضافة جهة مخاطبة واحدة على الأقل");
      return;
    }

    const cleanedItems = requestedItems.map((it) => it.trim()).filter(Boolean);
    if (cleanedItems.length === 0) {
      toast.error("الرجاء إضافة بند واحد على الأقل من المستندات المطلوبة");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noticeLabel,
          subjectLine,
          referenceLetterNumber: referenceLetterNumber || null,
          referenceLetterDate: referenceLetterDate
            ? new Date(referenceLetterDate).toISOString()
            : null,
          meetingDate: new Date(meetingDate).toISOString(),
          meetingTimeLabel,
          meetingMethod,
          meetingLink: meetingLink || null,
          meetingId: meetingId || null,
          meetingPasscode: meetingPasscode || null,
          documentsDeadlineDays,
          requestedFromLabel,
          addressees: cleanedAddressees,
          requestedItems: cleanedItems,
          expertTitle,
          expertName,
          expertRegistrationNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إنشاء الإخطار");

      toast.success("تم إنشاء الإخطار بنجاح");
      router.push(`/cases/${caseId}/notices/${data.notice.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <NoticeAutoFillUpload caseId={caseId} onExtracted={handleExtracted} />

      <Card>
        <CardHeader>
          <CardTitle>بيانات الإخطار</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>رقم الإخطار</Label>
            <Input value={noticeLabel} onChange={(e) => setNoticeLabel(e.target.value)} placeholder="الأول" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>موضوع الإخطار</Label>
            <Input
              value={subjectLine}
              onChange={(e) => {
                setSubjectLine(e.target.value);
                reviewField("subjectLine");
              }}
              className={cn(isAuto("subjectLine") && AUTO_FILLED_CLASS)}
            />
            <p className="text-xs text-muted-foreground">
              سيظهر تحته تلقائياً: &quot;في الدعوى رقم {caseNumber}&quot;
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>رقم كتاب التكليف (اختياري)</Label>
            <Input
              value={referenceLetterNumber}
              onChange={(e) => {
                setReferenceLetterNumber(e.target.value);
                reviewField("referenceLetterNumber");
              }}
              placeholder="2026/1089"
              className={cn(isAuto("referenceLetterNumber") && AUTO_FILLED_CLASS)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>تاريخ كتاب التكليف (اختياري)</Label>
            <Input
              type="date"
              value={referenceLetterDate}
              onChange={(e) => {
                setReferenceLetterDate(e.target.value);
                reviewField("referenceLetterDate");
              }}
              className={cn(isAuto("referenceLetterDate") && AUTO_FILLED_CLASS)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>موعد الاجتماع</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>تاريخ الاجتماع *</Label>
            <Input
              type="date"
              value={meetingDate}
              onChange={(e) => {
                setMeetingDate(e.target.value);
                reviewField("meetingDate");
              }}
              required
              className={cn(isAuto("meetingDate") && AUTO_FILLED_CLASS)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>وقت الاجتماع *</Label>
            <Input
              value={meetingTimeLabel}
              onChange={(e) => {
                setMeetingTimeLabel(e.target.value);
                reviewField("meetingTimeLabel");
              }}
              placeholder="12:30 ظهراً"
              required
              className={cn(isAuto("meetingTimeLabel") && AUTO_FILLED_CLASS)}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>طريقة الاجتماع</Label>
            <Input
              value={meetingMethod}
              onChange={(e) => {
                setMeetingMethod(e.target.value);
                reviewField("meetingMethod");
              }}
              className={cn(isAuto("meetingMethod") && AUTO_FILLED_CLASS)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>رابط الاجتماع (اختياري)</Label>
            <Input
              dir="ltr"
              value={meetingLink}
              onChange={(e) => {
                setMeetingLink(e.target.value);
                reviewField("meetingLink");
              }}
              className={cn(isAuto("meetingLink") && AUTO_FILLED_CLASS)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Meeting ID (اختياري)</Label>
            <Input
              dir="ltr"
              value={meetingId}
              onChange={(e) => {
                setMeetingId(e.target.value);
                reviewField("meetingId");
              }}
              className={cn(isAuto("meetingId") && AUTO_FILLED_CLASS)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Passcode (اختياري)</Label>
            <Input
              dir="ltr"
              value={meetingPasscode}
              onChange={(e) => {
                setMeetingPasscode(e.target.value);
                reviewField("meetingPasscode");
              }}
              className={cn(isAuto("meetingPasscode") && AUTO_FILLED_CLASS)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>طلب المستندات</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>مهلة تزويد المستندات (أيام عمل)</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={documentsDeadlineDays}
              onChange={(e) => {
                setDocumentsDeadlineDays(Number(e.target.value) || 1);
                reviewField("documentsDeadlineDays");
              }}
              className={cn(isAuto("documentsDeadlineDays") && AUTO_FILLED_CLASS)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>يُطلب التزويد من</Label>
            <Input
              value={requestedFromLabel}
              onChange={(e) => {
                setRequestedFromLabel(e.target.value);
                reviewField("requestedFromLabel");
              }}
              placeholder="وكيل المدعيان"
              className={cn(isAuto("requestedFromLabel") && AUTO_FILLED_CLASS)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            الجهات المخاطبة (وكلاء الأطراف)
            {isAuto("addressees") && (
              <span className="flex items-center gap-1 text-xs font-normal text-purple-700 dark:text-purple-300">
                <Sparkles className="size-3.5" />
                معبَّأة تلقائياً — راجعها
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {addressees.map((a) => (
            <div key={a.key} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="اسم المكتب، مثال: السادة/ عبد الحكيم بن حرز للمحاماه"
                  value={a.lawFirmName}
                  onChange={(e) => updateAddressee(a.key, { lawFirmName: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setAddressees((prev) => prev.filter((x) => x.key !== a.key))}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              <Input
                placeholder="الصفة، مثال: وكلاء المدعيان"
                value={a.roleLabel}
                onChange={(e) => updateAddressee(a.key, { roleLabel: e.target.value })}
              />
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">الأسماء الممثَّلة</Label>
                {a.representedNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={name}
                      onChange={(e) => updateAddresseeName(a.key, i, e.target.value)}
                      placeholder="اسم الموكل"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAddresseeName(a.key, i)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => addAddresseeName(a.key)}
                >
                  <Plus className="size-4" />
                  إضافة اسم
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => setAddressees((prev) => [...prev, newAddressee()])}
          >
            <Plus className="size-4" />
            إضافة جهة مخاطبة
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            المستندات والبنود المطلوبة
            {isAuto("requestedItems") && (
              <span className="flex items-center gap-1 text-xs font-normal text-purple-700 dark:text-purple-300">
                <Sparkles className="size-3.5" />
                معبَّأة تلقائياً — راجعها
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            هذه القائمة مُعبّأة مبدئياً من المتطلبات غير المكتملة في ملف الدعوى — يمكنك تعديلها
            أو حذف/إضافة بنود بحرية. ستظهر مرقّمة في الإخطار.
          </p>
          {requestedItems.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2.5 text-sm text-muted-foreground">{i + 1})</span>
              <Textarea
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                rows={2}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setRequestedItems((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => setRequestedItems((prev) => [...prev, ""])}
          >
            <Plus className="size-4" />
            إضافة بند
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>بيانات الخبير (التوقيع)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>الصفة</Label>
            <Input value={expertTitle} onChange={(e) => setExpertTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>اسم الخبير *</Label>
            <Input value={expertName} onChange={(e) => setExpertName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>رقم القيد وزارة العدل *</Label>
            <Input
              value={expertRegistrationNumber}
              onChange={(e) => setExpertRegistrationNumber(e.target.value)}
              required
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitting} size="lg">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          إنشاء الإخطار
        </Button>
      </div>
    </form>
  );
}
