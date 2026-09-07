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
