import { z } from "zod";

export const noticeAddresseeSchema = z.object({
  lawFirmName: z.string().min(1, "اسم المكتب مطلوب"),
  roleLabel: z.string().min(1, "الصفة مطلوبة"), // e.g. "وكلاء المدعيان"
  representedNames: z.array(z.string().min(1)).default([]),
});
export type NoticeAddressee = z.infer<typeof noticeAddresseeSchema>;

export const createNoticeSchema = z.object({
  noticeLabel: z.string().min(1).default("الأول"),
  subjectLine: z.string().min(1, "موضوع الإخطار مطلوب"),

  referenceLetterNumber: z.string().optional().nullable(),
  referenceLetterDate: z.string().datetime().optional().nullable(),

  meetingDate: z.string().datetime({ message: "تاريخ الاجتماع مطلوب" }),
  meetingTimeLabel: z.string().min(1, "وقت الاجتماع مطلوب"),
  meetingMethod: z
    .string()
    .min(1)
    .default("تقنية الاتصال المرئي بواسطة تطبيق تقنية ZOOM MEETING"),
  meetingLink: z.string().optional().nullable(),
  meetingId: z.string().optional().nullable(),
  meetingPasscode: z.string().optional().nullable(),

  documentsDeadlineDays: z.number().int().min(1).max(90).default(2),
  requestedFromLabel: z.string().min(1, "الرجاء تحديد الجهة المطلوب منها المستندات"),

  addressees: z.array(noticeAddresseeSchema).min(1, "الرجاء إضافة جهة مخاطبة واحدة على الأقل"),
  requestedItems: z
    .array(z.string().min(1))
    .min(1, "الرجاء إضافة بند واحد على الأقل من المستندات المطلوبة"),

  expertTitle: z.string().min(1).default("الخبير الحسابي"),
  expertName: z.string().min(1, "اسم الخبير مطلوب"),
  expertRegistrationNumber: z.string().min(1, "رقم القيد مطلوب"),
});
export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;
