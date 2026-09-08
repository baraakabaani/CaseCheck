import { z } from "zod";

// نموذج إنشاء الإخطار (components/NoticeForm.tsx) — التعبئة التلقائية من
// ملف مرجعي يرفعه الخبير (كتاب تكليف سابق، إخطار سابق، محضر...). كل حقل
// nullable صراحة — نفس قاعدة "لا رقم بلا سند" المتّبعة في بقية التطبيق
// (lib/case-basics-schemas.ts): حقل غير مذكور بوضوح في المستند يعود null
// أو مصفوفة فارغة، لا تخميناً. بيانات أولية يراجعها الخبير قبل الإرسال —
// لا تُحفَظ من هنا مباشرة.

export const extractedNoticeAddresseeSchema = z.object({
  lawFirmName: z.string(),
  roleLabel: z.string(),
  representedNames: z.array(z.string()).default([]),
});
export type ExtractedNoticeAddressee = z.infer<typeof extractedNoticeAddresseeSchema>;

export const extractedNoticeSchema = z.object({
  subjectLine: z.string().nullable().default(null),
  referenceLetterNumber: z.string().nullable().default(null),
  referenceLetterDate: z.string().nullable().default(null), // "YYYY-MM-DD"
  meetingDate: z.string().nullable().default(null), // "YYYY-MM-DD"
  meetingTimeLabel: z.string().nullable().default(null),
  meetingMethod: z.string().nullable().default(null),
  meetingLink: z.string().nullable().default(null),
  meetingId: z.string().nullable().default(null),
  meetingPasscode: z.string().nullable().default(null),
  documentsDeadlineDays: z.number().int().min(1).max(90).nullable().default(null),
  requestedFromLabel: z.string().nullable().default(null),
  addressees: z.array(extractedNoticeAddresseeSchema).default([]),
  requestedItems: z.array(z.string()).default([]),
});
export type ExtractedNotice = z.infer<typeof extractedNoticeSchema>;
