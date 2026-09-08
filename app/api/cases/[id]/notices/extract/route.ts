import { NextRequest, NextResponse } from "next/server";
import { extractDocument } from "@/lib/document-parser";
import { getClientApiKeysFromRequest } from "@/lib/ai-client";
import { extractNoticeFromText } from "@/lib/notice-extractor";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // نفس حد app/api/cases/[id]/documents/route.ts

interface RouteParams {
  params: Promise<{ id: string }>;
}

// نموذج إنشاء الإخطار (components/NoticeForm.tsx) — تعبئة تلقائية من ملف
// مرجعي (كتاب تكليف سابق، إخطار مماثل...) بدل الكتابة اليدوية بالكامل.
// لا تخزين على القرص أو قاعدة البيانات هنا — استخراج نص مؤقت في الذاكرة
// فقط، يراجعه الخبير في النموذج قبل الإرسال الفعلي. لا علاقة لهذا
// المسار بمستندات الدعوى نفسها (app/api/cases/[id]/documents) — الملف
// المرجعي هنا لا يُحفَظ كمستند من مستندات الدعوى.
export async function POST(req: NextRequest, { params }: RouteParams) {
  await params; // caseId غير مستخدَم فعلياً — لا قراءة/كتابة لبيانات الدعوى هنا، لكنه جزء من شكل المسار القياسي

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
  const outcome = await extractNoticeFromText(extracted.text, clientKeys);

  return NextResponse.json({ result: outcome.result, mode: outcome.mode, warning: outcome.warning ?? null });
}
