// المرحلة 1 من معالج فتح الملف — تعبئة تلقائية لبيانات القضية الأساسية من
// مستند "الحكم التمهيدي / قرار ندب الخبرة" الذي يرفعه الخبير قبل حتى إنشاء
// صف الدعوى. طلب واحد بسيط بلا مستندات أخرى ولا سياق دعوى سابق (الدعوى غير
// موجودة بعد) — لا علاقة له بـ lib/case-analyzer.ts (تحليل الملف الكامل
// بعد الإنشاء)، لكنه يتبع نفس نمط الذكاء الاصطناعي + محرك احتياطي صادق.

import {
  createAiClient,
  resolveAiKeys,
  callWithAiFailover,
  AiFailoverError,
  type ClientApiKeys,
} from "./ai-client";
import { extractedCaseBasicsSchema, type ExtractedCaseBasics } from "./case-basics-schemas";
import { LITIGATION_DEGREES, CASE_CATEGORIES } from "./schemas";

export interface CaseBasicsExtractionOutcome {
  result: ExtractedCaseBasics;
  mode: "AI" | "OFFLINE";
  warning?: string;
}

const EMPTY_RESULT: ExtractedCaseBasics = {
  caseNumber: null,
  court: null,
  circuit: null,
  litigationDegree: null,
  caseCategory: null,
  title: null,
  claimants: [],
  respondents: [],
};

const SYSTEM_PROMPT = `أنت مساعد إدخال بيانات في مكتب خبرة حسابية قضائية إماراتي. سيُعرض عليك نص مستند واحد (عادة الحكم التمهيدي أو قرار ندب الخبرة الصادر من المحكمة)، ومهمتك استخراج بيانات القضية الأساسية منه فقط — لا تحليل ولا رأي، مجرد نقل ما هو مذكور صراحة.

استخرج:
- caseNumber: رقم الدعوى كما ورد حرفياً (مثال: "4360 لسنة 2026 تجاري").
- court: اسم المحكمة/الجهة القضائية.
- circuit: اسم الدائرة إن ذُكر.
- litigationDegree: درجة التقاضي — اختر بالضبط واحدة من: ${LITIGATION_DEGREES.join(", ")} (FIRST_INSTANCE=أول درجة، APPEAL=استئناف، EXECUTION=تنفيذ، OTHER=غير ذلك أو غير واضح).
- caseCategory: نوع الدعوى — اختر بالضبط واحدة من: ${CASE_CATEGORIES.join(", ")} (COMMERCIAL=تجاري، CIVIL=مدني، REAL_ESTATE=عقاري، LABOR=عمالي، OTHER=غير ذلك).
- title: عنوان مختصر جداً وموضوعي لموضوع الدعوى (بضع كلمات، مثال: "مطالبة مالية ناشئة عن عقد توريد") — استنتجه من موضوع المأمورية إن لم يُذكر عنوان صريح.
- claimants: قائمة المدعين/المستأنفين، كل عنصر { name, capacityNote }. name هو الاسم الكامل فقط. capacityNote هو أي وصف لصفته (مثال: "شريك بنسبة 68% ومدير الشركة") إن ذُكر، وإلا null.
- respondents: نفس الشيء للمدعى عليهم/المستأنف ضدهم.

قاعدة صارمة لا استثناء فيها: أي حقل غير مذكور صراحة وبوضوح في النص المعروض عليك يجب أن يكون null (أو مصفوفة فارغة لـ claimants/respondents) — لا تخمّن رقم دعوى أو اسم محكمة أو اسم طرف غير موجود فعلياً في النص. لا تخترع صفة (capacityNote) لم تُذكر.

أجب بالعربية الفصحى فيما تكتبه من نصوص. يجب أن يكون ردك بصيغة JSON صالحة فقط، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown، وفق المخطط التالي بالضبط:
{"caseNumber": "string|null", "court": "string|null", "circuit": "string|null", "litigationDegree": "string|null", "caseCategory": "string|null", "title": "string|null", "claimants": [{"name": "string", "capacityNote": "string|null"}], "respondents": [{"name": "string", "capacityNote": "string|null"}]}`;

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("لم يتم العثور على JSON صالح في رد النموذج");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

/** يحدّ من طول النص المُرسَل (قرار الندب/الحكم التمهيدي عادة قصير نسبياً،
 * لكن حماية من ملف استثنائي الطول). */
const MAX_TEXT_CHARS = 20_000;

export async function extractCaseBasics(
  documentText: string,
  clientKeys?: ClientApiKeys | null,
): Promise<CaseBasicsExtractionOutcome> {
  const candidates = resolveAiKeys(clientKeys);

  if (candidates.length === 0) {
    return {
      result: EMPTY_RESULT,
      mode: "OFFLINE",
      warning:
        "تعذّرت التعبئة التلقائية (لا يوجد مفتاح ذكاء اصطناعي مُهيأ) — أضف مفتاحاً من زر «مفتاح الذكاء الاصطناعي» أعلى الصفحة ثم أعد رفع المستند، أو أكمل تعبئة الحقول يدوياً.",
    };
  }

  try {
    const { result } = await callWithAiFailover(candidates, async (resolved) => {
      const client = createAiClient(resolved);
      const completion = await client.chat.completions.create({
        model: resolved.model,
        temperature: 0.1,
        max_tokens: 900,
        reasoning_effort: resolved.provider === "gemini" ? "low" : undefined,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `نص المستند:\n\n${documentText.slice(0, MAX_TEXT_CHARS)}` },
        ],
      });
      const raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error("رد فارغ من خدمة الذكاء الاصطناعي");
      const validated = extractedCaseBasicsSchema.safeParse(extractJson(raw));
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
