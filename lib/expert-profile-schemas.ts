// بيانات الخبير الحسابي الثابتة — سجل واحد فقط، هذا التطبيق بلا
// مستخدمين/مصادقة متعددة. تُستخدم في غلاف تقرير الخبرة (الموديول 4) وفي
// نموذج الإخطار (الموديول 2)، بدل إعادة كتابتها في كل مرة.

import { z } from "zod";

export const EXPERT_PROFILE_ID = "default";

export const expertProfileSchema = z.object({
  expertName: z.string().min(1, "اسم الخبير مطلوب"),
  expertTitle: z.string().min(1).default("الخبير الحسابي"),
  registrationNumber: z.string().min(1, "رقم القيد مطلوب"),
  phone: z.string().optional().nullable(),
  fax: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
});
export type ExpertProfileInput = z.infer<typeof expertProfileSchema>;
