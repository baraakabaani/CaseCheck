import type { CaseType } from "./schemas";

export interface RequirementPreset {
  key: string;
  labelAr: string;
  labelEn: string;
  category: string;
  description?: string;
  /** Extra Arabic/English synonyms used by the offline (zero-API) heuristic
   * matcher to bridge the gap between formal requirement labels and the way
   * documents are actually named/worded. Not shown in the UI. */
  keywords?: string[];
}

export interface PresetGroup {
  id: CaseType;
  labelAr: string;
  labelEn: string;
  items: RequirementPreset[];
}

// Common checklist presets used when auditing UAE court litigation files and
// accounting-expert (خبرة محاسبية) engagements. These are starting points —
// users can add/remove/edit items freely per case.
export const REQUIREMENT_PRESETS: PresetGroup[] = [
  {
    id: "LITIGATION",
    labelAr: "متطلبات الدعاوى القضائية",
    labelEn: "Litigation Case Requirements",
    items: [
      {
        key: "moa",
        labelAr: "عقد التأسيس وملاحقه",
        labelEn: "Memorandum of Association & Addendums",
        category: "قانوني",
        keywords: ["memorandum of association", "moa", "عقد تأسيس", "ملحق"],
      },
      {
        key: "trade_license",
        labelAr: "الرخصة التجارية سارية المفعول",
        labelEn: "Valid Trade License",
        category: "قانوني",
        keywords: ["trade license", "license", "رخصة تجارية", "رخصة", "economic department"],
      },
      {
        key: "poa",
        labelAr: "الوكالة القانونية / التوكيل",
        labelEn: "Power of Attorney",
        category: "قانوني",
        keywords: ["power of attorney", "poa", "توكيل", "وكالة قانونية", "كاتب عدل", "notary"],
      },
      {
        key: "eid_passport",
        labelAr: "صور جوازات السفر / الهوية الإماراتية لأطراف الدعوى",
        labelEn: "Passport / Emirates ID Copies of Parties",
        category: "قانوني",
        keywords: ["passport", "emirates id", "جواز سفر", "هوية اماراتية", "eid"],
      },
      {
        key: "contract_subject",
        labelAr: "العقد محل النزاع وملاحقه",
        labelEn: "Contract Under Dispute & Amendments",
        category: "قانوني",
        keywords: ["contract", "agreement", "عقد", "اتفاقية", "امر تغييري", "addendum"],
      },
      {
        key: "correspondence",
        labelAr: "المراسلات بين الأطراف (بريد إلكتروني / خطابات رسمية)",
        labelEn: "Correspondence Between Parties",
        category: "قانوني",
        keywords: ["email", "correspondence", "مراسلات", "بريد الكتروني", "خطاب", "letter"],
      },
      {
        key: "prior_judgments",
        labelAr: "الأحكام أو القرارات السابقة ذات الصلة بالنزاع",
        labelEn: "Prior Judgments / Rulings Related to the Dispute",
        category: "قانوني",
        keywords: ["judgment", "ruling", "verdict", "حكم", "قرار", "منطوق الحكم"],
      },
      {
        key: "expert_report_prev",
        labelAr: "تقرير الخبرة السابق (إن وجد)",
        labelEn: "Previous Expert Report (if any)",
        category: "قانوني",
        keywords: ["expert report", "تقرير خبرة", "تقرير الخبير"],
      },
    ],
  },
  {
    id: "ACCOUNTING_EXPERT",
    labelAr: "متطلبات الخبرة المحاسبية",
    labelEn: "Accounting Expert Requirements",
    items: [
      {
        key: "moa",
        labelAr: "عقد التأسيس وملاحقه",
        labelEn: "Memorandum of Association & Addendums",
        category: "شركات",
        keywords: ["memorandum of association", "moa", "عقد تأسيس", "ملحق"],
      },
      {
        key: "trade_license",
        labelAr: "الرخصة التجارية",
        labelEn: "Trade License",
        category: "شركات",
        keywords: ["trade license", "license", "رخصة تجارية", "رخصة", "economic department"],
      },
      {
        key: "bank_statements",
        labelAr: "كشوفات الحسابات البنكية المعتمدة عن الفترة محل النزاع",
        labelEn: "Certified Bank Statements for the Disputed Period",
        category: "مالي",
        description: "يجب تحديد الفترة الزمنية المطلوبة بدقة (من - إلى).",
        keywords: [
          "bank statement",
          "statement of account",
          "كشف حساب",
          "كشف بنكي",
          "كشف الحساب البنكي",
          "bank",
          "بنك",
        ],
      },
      {
        key: "audited_financials",
        labelAr: "البيانات المالية المدققة",
        labelEn: "Audited Financial Statements",
        category: "مالي",
        keywords: [
          "audited financial statements",
          "financial statements",
          "قوائم مالية",
          "بيانات مالية مدققة",
          "تقرير مدقق الحسابات",
          "auditor report",
        ],
      },
      {
        key: "trial_balance",
        labelAr: "ميزان المراجعة (Trial Balance)",
        labelEn: "Trial Balance",
        category: "مالي",
        keywords: ["trial balance", "ميزان مراجعة"],
      },
      {
        key: "general_ledger",
        labelAr: "دفتر الأستاذ العام (General Ledger)",
        labelEn: "General Ledger",
        category: "مالي",
        keywords: ["general ledger", "ledger", "دفتر الاستاذ", "استاذ عام"],
      },
      {
        key: "invoices_sales",
        labelAr: "فواتير المبيعات",
        labelEn: "Sales Invoices",
        category: "مالي",
        keywords: ["sales invoice", "invoice", "فاتورة مبيعات", "فاتورة بيع"],
      },
      {
        key: "invoices_purchase",
        labelAr: "فواتير المشتريات",
        labelEn: "Purchase Invoices",
        category: "مالي",
        keywords: ["purchase invoice", "invoice", "فاتورة مشتريات", "فاتورة شراء"],
      },
      {
        key: "payment_vouchers",
        labelAr: "سندات الصرف والقبض",
        labelEn: "Payment & Receipt Vouchers",
        category: "مالي",
        keywords: ["payment voucher", "receipt voucher", "سند صرف", "سند قبض", "voucher"],
      },
      {
        key: "contracts_financial",
        labelAr: "العقود ذات الأثر المالي محل النزاع",
        labelEn: "Contracts with Financial Impact Under Dispute",
        category: "مالي",
        keywords: ["contract", "agreement", "عقد", "اتفاقية"],
      },
      {
        key: "vat_returns",
        labelAr: "إقرارات ضريبة القيمة المضافة (VAT Returns)",
        labelEn: "VAT Returns",
        category: "مالي",
        keywords: ["vat return", "vat", "ضريبة القيمة المضافة", "اقرار ضريبي", "fta"],
      },
      {
        key: "payroll_records",
        labelAr: "سجلات الرواتب والأجور",
        labelEn: "Payroll Records",
        category: "مالي",
        keywords: ["payroll", "salary", "wages", "رواتب", "اجور", "wps"],
      },
      {
        key: "fixed_assets_register",
        labelAr: "سجل الأصول الثابتة",
        labelEn: "Fixed Assets Register",
        category: "مالي",
        keywords: ["fixed assets register", "fixed assets", "اصول ثابتة", "سجل الاصول"],
      },
      {
        key: "inventory_records",
        labelAr: "سجلات المخزون / الجرد",
        labelEn: "Inventory / Stock Records",
        category: "مالي",
        keywords: ["inventory", "stock", "مخزون", "جرد"],
      },
      {
        key: "auditor_correspondence",
        labelAr: "مراسلات مع مدقق الحسابات الخارجي",
        labelEn: "Correspondence with External Auditor",
        category: "مالي",
        keywords: ["auditor", "external audit", "مدقق حسابات", "مراسلات المدقق"],
      },
    ],
  },
];

export function getPresetGroup(caseType: CaseType): PresetGroup | undefined {
  return REQUIREMENT_PRESETS.find((g) => g.id === caseType);
}

export function findPresetItem(
  caseType: CaseType,
  key: string,
): RequirementPreset | undefined {
  return getPresetGroup(caseType)?.items.find((i) => i.key === key);
}
