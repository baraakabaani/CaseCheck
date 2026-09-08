import { z } from "zod";
import { LITIGATION_DEGREES, CASE_CATEGORIES } from "./schemas";

// المرحلة 1 من معالج فتح الملف — التعبئة التلقائية من مستند "الحكم
// التمهيدي / قرار ندب الخبرة": المخطط المطلوب من الذكاء الاصطناعي. كل حقل
// nullable صراحة — حقل غير مذكور بوضوح في المستند يجب أن يعود null، لا
// تخميناً (نفس قاعدة "لا رقم بلا سند" المتّبعة في بقية التطبيق، مطبَّقة هنا
// على حقول نصية/تصنيفية بدل مبالغ). هذه بيانات تعبئة أولية يراجعها الخبير
// ويعدّلها قبل الحفظ فعلياً — لا تُحفَظ في قاعدة البيانات مباشرة من هنا.

export const extractedPartySchema = z.object({
  name: z.string(),
  capacityNote: z.string().nullable().default(null),
});
export type ExtractedParty = z.infer<typeof extractedPartySchema>;

export const extractedCaseBasicsSchema = z.object({
  caseNumber: z.string().nullable().default(null),
  court: z.string().nullable().default(null),
  circuit: z.string().nullable().default(null),
  litigationDegree: z.enum(LITIGATION_DEGREES).nullable().default(null),
  caseCategory: z.enum(CASE_CATEGORIES).nullable().default(null),
  title: z.string().nullable().default(null),
  claimants: z.array(extractedPartySchema).default([]),
  respondents: z.array(extractedPartySchema).default([]),
});
export type ExtractedCaseBasics = z.infer<typeof extractedCaseBasicsSchema>;
