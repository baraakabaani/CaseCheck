// كلمات مفتاحية لاكتشاف أعمدة كشوف الحساب/دفاتر الأستاذ — مصدر وحيد
// يستورده كل من lib/smart-ingest.ts (ملخص نصي مضغوط للذكاء الاصطناعي)
// و lib/financial/structured-rows.ts (تحليل حتمي للصفوف الحقيقية)، بدل
// قائمتين قد تنحرفان عن بعضهما بمرور الوقت.

export const CREDIT_KEYWORDS = ["دائن", "ايداع", "إيداع", "credit", "deposit"];
export const DEBIT_KEYWORDS = ["مدين", "سحب", "debit", "withdrawal"];
export const BALANCE_KEYWORDS = ["رصيد", "balance"];
export const DATE_KEYWORDS = ["التاريخ", "تاريخ العملية", "تاريخ القيد", "date", "trn date", "value date"];
export const DESCRIPTION_KEYWORDS = ["البيان", "الوصف", "التفاصيل", "description", "narration", "details"];
export const AMOUNT_KEYWORDS = ["المبلغ", "القيمة", "amount", "value"];

// كشف "هل نص هذه المهمة/مستنداتها ذو طبيعة مالية" — يُستخدَم في
// lib/report-draft-ai.ts لتقرير ما إذا تستحق مهمة معيّنة طلب اقتراح جداول
// إضافياً (لا علاقة له بتحليل صفوف كشف حساب فعلي، فقط كشف نية مالية عامة
// في نص حر: مبلغ مُدَّعى، فاتورة، ربح، إلخ).
export const FINANCIAL_MATERIAL_KEYWORDS = [
  ...CREDIT_KEYWORDS,
  ...DEBIT_KEYWORDS,
  ...BALANCE_KEYWORDS,
  ...AMOUNT_KEYWORDS,
  "درهم",
  "فاتورة",
  "إيراد",
  "مصروف",
  "ربح",
  "خسارة",
  "مبيعات",
  "مطالبة مالية",
  "تحويل",
  "شيك",
  "أرباح",
  "حصة",
  "نسبة",
];
