import { NextRequest, NextResponse } from "next/server";
import { extractDocument } from "@/lib/document-parser";
import { getClientApiKeysFromRequest } from "@/lib/ai-client";
import { extractCaseBasics } from "@/lib/case-basics-extractor";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // نفس حد app/api/cases/[id]/documents/route.ts

// المرحلة 1 من معالج فتح الملف — تعبئة تلقائية لبيانات القضية من مستند
// "الحكم التمهيدي / قرار ندب الخبرة" يرفعه الخبير قبل إنشاء صف الدعوى
// أصلاً. لا caseId هنا (الدعوى غير موجودة بعد) ولا تخزين على القرص أو
// قاعدة البيانات — استخراج نص مؤقت في الذاكرة فقط، ثم يُرمى. الملف نفسه
// يُعاد رفعه فعلياً (بصفته "الحكم التمهيدي") من الواجهة عبر
// /api/cases/:id/documents بعد إنشاء الدعوى، إن اختار الخبير ذلك.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "لم يتم إرفاق أي ملف" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "حجم الملف يتجاوز 25 ميجابايت" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractDocument(buffer, file.name);
  if (extracted.status !== "PARSED" || !extracted.text.trim()) {
    return NextResponse.json(
      {
        error:
          extracted.error ||
          "تعذّر استخراج نص من هذا الملف — تحقق من صيغته أو أكمل تعبئة الحقول يدوياً.",
      },
      { status: 422 },
    );
  }

  const clientKeys = getClientApiKeysFromRequest(req);
  const outcome = await extractCaseBasics(extracted.text, clientKeys);

  return NextResponse.json({ result: outcome.result, mode: outcome.mode, warning: outcome.warning ?? null });
}
