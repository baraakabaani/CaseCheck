import { NextRequest, NextResponse } from "next/server";
import { extractDocument } from "@/lib/document-parser";
import { getClientApiKeysFromRequest } from "@/lib/ai-client";
import { classifyDocuments, type ClassifyInputFile } from "@/lib/document-classifier";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_FILES = 60; // حد معقول لدفعة رفع مجلد كامل في طلب واحد

// المرحلة 3 — تصنيف دفعة ملفات (رفع مجلد كامل) إلى إحدى خانات الرفع
// الخمس. بلا caseId ولا تخزين على القرص أو قاعدة البيانات — استخراج نص كل
// ملف في الذاكرة فقط للتصنيف، ثم يُرمى؛ الملفات نفسها تُرفَع فعلياً لاحقاً
// من الواجهة عبر /api/cases/:id/documents الحالي بعد مراجعة الخبير
// للتصنيف المقترَح وربما تعديله.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "لم يتم إرفاق أي ملفات" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `الحد الأقصى ${MAX_FILES} ملفاً في الدفعة الواحدة` }, { status: 400 });
  }

  const inputs: ClassifyInputFile[] = [];
  const skipped: { fileName: string; error: string }[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      skipped.push({ fileName: file.name, error: "حجم الملف يتجاوز 25 ميجابايت" });
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractDocument(buffer, file.name);
    // لا نستبعد ملفاً تعذّر استخراج نصه (مستند ممسوح ضوئياً مثلاً) — يبقى
    // في الدفعة بنص فارغ، ليصنَّف اعتماداً على اسمه فقط (انظر
    // lib/document-classifier.ts) بدل حرمانه من التصنيف بالكامل.
    inputs.push({ fileName: file.name, text: extracted.text || "" });
  }

  if (inputs.length === 0) {
    return NextResponse.json({ error: "تعذّرت معالجة كل الملفات المرفَقة", skipped }, { status: 422 });
  }

  const clientKeys = getClientApiKeysFromRequest(req);
  const outcome = await classifyDocuments(inputs, clientKeys);

  return NextResponse.json({
    results: outcome.results,
    mode: outcome.mode,
    warning: outcome.warning ?? null,
    skipped,
  });
}
