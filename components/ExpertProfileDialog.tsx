"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserRoundCog, Check, Loader2 } from "lucide-react";

interface ExpertProfileFields {
  expertName: string;
  expertTitle: string;
  registrationNumber: string;
  phone: string;
  fax: string;
  mobile: string;
  email: string;
}

const EMPTY_FIELDS: ExpertProfileFields = {
  expertName: "",
  expertTitle: "الخبير الحسابي",
  registrationNumber: "",
  phone: "",
  fax: "",
  mobile: "",
  email: "",
};

/** بيانات الخبير الحسابي — سجل واحد ثابت لكامل التطبيق، يُستخدم في غلاف
 * تقرير الخبرة (الموديول 4) وفي نموذج الإخطار، بدل إعادة كتابتها في كل
 * مرة. بخلاف مفاتيح API (localStorage)، هذه البيانات مُخزَّنة على الخادم
 * (لا سرّية فيها) عبر /api/settings/expert-profile — يجلبها هذا المكوّن
 * بنفسه بدل تمريرها من كل صفحة تعرض الترويسة. */
export function ExpertProfileDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [fields, setFields] = useState<ExpertProfileFields>(EMPTY_FIELDS);

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/expert-profile");
      const data = await res.json();
      const profile = data.profile as (ExpertProfileFields & { id: string }) | null;
      setIsComplete(Boolean(profile?.expertName && profile?.registrationNumber));
      setFields(
        profile
          ? {
              expertName: profile.expertName ?? "",
              expertTitle: profile.expertTitle ?? "الخبير الحسابي",
              registrationNumber: profile.registrationNumber ?? "",
              phone: profile.phone ?? "",
              fax: profile.fax ?? "",
              mobile: profile.mobile ?? "",
              email: profile.email ?? "",
            }
          : EMPTY_FIELDS,
      );
    } catch {
      // تحقّق من الاكتمال فقط — فشل الجلب هنا لا يمنع بقية الصفحة من العمل
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // جلب لمرة واحدة عند التركيب (لا مصدر خارجي آخر يُشترك فيه) — الحالة
    // تُحدَّث داخل استدعاء غير متزامن (بعد fetch)، وليس مباشرة وبشكل متزامن
    // ضمن جسم التأثير، فلا يوجد خطر التحديثات المتتالية الذي تحذّر منه
    // القاعدة أدناه.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile();
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) loadProfile();
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/expert-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حفظ بيانات الخبير");
      toast.success("تم حفظ بيانات الخبير");
      setIsComplete(Boolean(fields.expertName && fields.registrationNumber));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل حفظ بيانات الخبير");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserRoundCog className="size-4" />
          بيانات الخبير
          {isComplete && <Check className="size-3.5 text-emerald-600" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>بيانات الخبير الحسابي</DialogTitle>
          <DialogDescription>
            تُستخدم هذه البيانات في غلاف وتوقيع تقرير الخبرة (الموديول 4) وفي نموذج الإخطار، بدل
            إعادة كتابتها في كل مرة. تُحفظ على هذا الخادم (وليست سرّية كمفاتيح API).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="expertName">اسم الخبير</Label>
              <Input
                id="expertName"
                value={fields.expertName}
                onChange={(e) => setFields((p) => ({ ...p, expertName: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expertTitle">الصفة</Label>
              <Input
                id="expertTitle"
                value={fields.expertTitle}
                onChange={(e) => setFields((p) => ({ ...p, expertTitle: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="registrationNumber">رقم القيد (وزارة العدل)</Label>
              <Input
                id="registrationNumber"
                value={fields.registrationNumber}
                onChange={(e) => setFields((p) => ({ ...p, registrationNumber: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">تلفون</Label>
              <Input
                id="phone"
                dir="ltr"
                value={fields.phone}
                onChange={(e) => setFields((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fax">فاكس</Label>
              <Input
                id="fax"
                dir="ltr"
                value={fields.fax}
                onChange={(e) => setFields((p) => ({ ...p, fax: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mobile">محمول</Label>
              <Input
                id="mobile"
                dir="ltr"
                value={fields.mobile}
                onChange={(e) => setFields((p) => ({ ...p, mobile: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                dir="ltr"
                type="email"
                value={fields.email}
                onChange={(e) => setFields((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
