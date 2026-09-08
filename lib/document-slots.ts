import type { DocCategory } from "./schemas";

// الخانات الخمس الثابتة لرفع مستندات المرحلة 3 (لا تشمل UNSPECIFIED —
// لا تُختار عند الرفع، فقط تصنيف احتياطي لمستندات قديمة قبل هذا العرف).
// مصدر وحيد يستورده كل من واجهة الرفع اليدوي (CaseDocumentsStep) والرفع
// الدفعي بالتصنيف الآلي (BulkDocumentUpload) حتى لا تختلف العناوين أو
// قاعدة "ملف واحد فقط" بين الاثنين.
export const DOCUMENT_UPLOAD_SLOTS: { category: DocCategory; title: string; multiple: boolean }[] = [
  { category: "PRELIMINARY_RULING", title: "الحكم التمهيدي / قرار الندب", multiple: false },
  { category: "STATEMENT_OF_CLAIM", title: "لائحة / صحيفة الدعوى", multiple: false },
  { category: "PARTY_MEMO", title: "مذكرات الأطراف", multiple: true },
  { category: "PARTY_ATTACHMENT", title: "مستندات الأطراف وحوافظ المستندات", multiple: true },
  { category: "OTHER_JUDICIAL", title: "مستندات قضائية أخرى", multiple: true },
];
