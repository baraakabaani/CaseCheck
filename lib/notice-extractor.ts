// تعبئة تلقائية لنموذج إنشاء الإخطار (components/NoticeForm.tsx) من ملف
// مرجعي يرفعه الخبير — كتاب تكليف سابق، إخطار مماثل سابق، أو أي مستند يذكر
// موعد الاجتماع والجهات المخاطبة. يتبع نفس نمط lib/case-basics-extractor.ts
// بالضبط: طلب واحد بسيط، الذكاء الاصطناعي بصيغة JSON، محرك احتياطي صادق
// (لا يخترع بيانات) بدون مفتاح.

import {
  createAiClient,
  resolveAiKeys,
  callWithAiFailover,
  AiFailoverError,
  type ClientApiKeys,
} from "./ai-client";
import { extractedNoticeSchema, type ExtractedNotice } from "./notice-extraction-schemas";
import { extractJson } from "./ai-json";

export interface NoticeExtractionOutcome {
  result: ExtractedNotice;
  mode: "AI" | "OFFLINE";
  warning?: string;
}

const EMPTY_RESULT: ExtractedNotice = {
  subjectLine: null,
  referenceLetterNumber: null,
  referenceLetterDate: null,
  meetingDate: null,
  meetingTimeLabel: null,
  meetingMethod: null,
  meetingLink: null,
  meetingId: null,
  meetingPasscode: null,
  documentsDeadlineDays: null,
  requestedFromLabel: null,
  addressees: [],
  requestedItems: [],
};

const SYSTEM_PROMPT = `أنت مساعد إدخال بيانات في مكتب خبرة حسابية قضائية إماراتي. سيُعرض عليك نص مستند مرجعي واحد (قد يكون كتاب تكليف، إخطار اجتماع خبرة سابق، أو محضر يذكر موعد اجتماع)، ومهمتك استخراج بيانات إخطار اجتماع الخبرة منه فقط — لا تحليل ولا رأي، مجرد نقل ما هو مذكور صراحة.

استخرج:
- subjectLine: موضوع الإخطار كما ورد أو أقرب صياغة ممكنة (مثال: "اخطار اجتماع خبرة عبر تقنية الاتصال المرئي ZOOM MEETING").
- referenceLetterNumber / referenceLetterDate: رقم وتاريخ كتاب التكليف إن ذُكر (التاريخ بصيغة YYYY-MM-DD).
- meetingDate: تاريخ الاجتماع بصيغة YYYY-MM-DD إن ذُكر.
- meetingTimeLabel: وقت الاجتماع كنص حر كما ورد (مثال: "12:30 ظهراً").
- meetingMethod: طريقة الاجتماع (حضوري، أو تقنية اتصال مرئي معينة).
- meetingLink / meetingId / meetingPasscode: تفاصيل الاتصال المرئي إن وُجدت.
- documentsDeadlineDays: عدد أيام العمل الممنوحة لتزويد المستندات إن ذُكر رقماً صريحاً.
- requestedFromLabel: وصف الجهة المطلوب منها التزويد (مثال: "وكلاء الأطراف").
- addressees: قائمة الجهات المخاطبة، كل عنصر { lawFirmName (اسم المكتب/المحامي)، roleLabel (صفته، مثال: "وكلاء المدعيان")، representedNames (أسماء من يمثلهم) }.
- requestedItems: قائمة بنود/مستندات مطلوبة إن وردت صراحة.

قاعدة صارمة لا استثناء فيها: أي حقل غير مذكور صراحة وبوضوح في النص المعروض عليك يجب أن يكون null (أو مصفوفة فارغة) — لا تخمّن تاريخاً أو اسم جهة أو بنداً غير موجود فعلياً في النص.

أجب بالعربية الفصحى فيما تكتبه من نصوص. يجب أن يكون ردك بصيغة JSON صالحة فقط، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown، وفق المخطط التالي بالضبط:
{"subjectLine": "string|null", "referenceLetterNumber": "string|null", "referenceLetterDate": "string|null", "meetingDate": "string|null", "meetingTimeLabel": "string|null", "meetingMethod": "string|null", "meetingLink": "string|null", "meetingId": "string|null", "meetingPasscode": "string|null", "documentsDeadlineDays": "number|null", "requestedFromLabel": "string|null", "addressees": [{"lawFirmName": "string", "roleLabel": "string", "representedNames": ["string"]}], "requestedItems": ["string"]}`;

const MAX_TEXT_CHARS = 20_000;

export async function extractNoticeFromText(
  documentText: string,
  clientKeys?: ClientApiKeys | null,
): Promise<NoticeExtractionOutcome> {
  const candidates = resolveAiKeys(clientKeys);

  if (candidates.length === 0) {
    return {
      result: EMPTY_RESULT,
      mode: "OFFLINE",
      warning:
        "تعذّرت التعبئة التلقائية (لا يوجد مفتاح ذكاء اصطناعي مُهيأ) — أضف مفتاحاً من زر «مفتاح الذكاء الاصطناعي» أعلى الصفحة ثم أعد رفع الملف، أو أكمل تعبئة الحقول يدوياً.",
    };
  }

  try {
    const { result } = await callWithAiFailover(candidates, async (resolved) => {
      const client = createAiClient(resolved);
      const completion = await client.chat.completions.create({
        model: resolved.model,
        temperature: 0.1,
        max_tokens: 1400,
        reasoning_effort: resolved.provider === "gemini" ? "low" : undefined,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `نص المستند:\n\n${documentText.slice(0, MAX_TEXT_CHARS)}` },
        ],
      });
      const raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error("رد فارغ من خدمة الذكاء الاصطناعي");
      const validated = extractedNoticeSchema.safeParse(extractJson(raw));
      if (!validated.success) throw new Error("فشل التحقق من صيغة استجابة الذكاء الاصطناعي");
      return validated.data;
    });
    return { result, mode: "AI" };
  } catch (err) {
    const message =
      err instanceof AiFailoverError ? err.message : err instanceof Error ? err.message : "خطأ غير معروف";
    return {
      result: EMPTY_RESULT,
      mode: "OFFLINE",
      warning: `تعذّرت التعبئة التلقائية بالذكاء الاصطناعي (${message}) — أكمل تعبئة الحقول يدوياً.`,
    };
  }
}
