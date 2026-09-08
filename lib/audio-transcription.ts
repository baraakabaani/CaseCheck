// الموديول 2 — تفريغ صوت الاجتماع (تسجيل مباشر من المتصفح أو ملف صوتي
// مرفوع) إلى نص خام، تمهيداً لتصحيحه بنفس محرك التصحيح الموجود أصلاً
// (lib/hearing-transcript-ai.ts) دون أي تعديل عليه — هذه الوحدة تنتج فقط
// الخطوة السابقة له (صوت ← نص خام)، تماماً كما يفعل رفع ملف نصي عبر
// extractDocument() اليوم.
//
// يعتمد التفريغ على Whisper عبر Groq تحديداً (client.audio.transcriptions)
// — هذه القدرة غير متاحة في تجريد lib/ai-client.ts الحالي (مكالمات
// chat/completions نصية فقط لدى المزودين)، ولا يوجد لدى Gemini/DeepSeek
// مسار مكافئ ضمن هذا التجريد. لذلك لا يوجد "احتياطي بدون مفتاح" هنا كما في
// بقية الوحدات: إن لم يتوفر مفتاح Groq واحد على الأقل، الفشل الصادق (رسالة
// واضحة) هو السلوك الصحيح بدل استخراج نص وهمي من ملف صوتي — على عكس
// التصحيح النصي حيث النص الخام نفسه (كما رُفع) هو احتياطي معقول.

import Groq from "groq-sdk";
import { resolveAiKeys, type ClientApiKeys } from "./ai-client";

const WHISPER_MODEL = "whisper-large-v3-turbo";

export class AudioTranscriptionError extends Error {}

/** كل مفاتيح Groq المتاحة بترتيب الأولوية (مفتاح العميل أولاً إن وُجد، ثم
 * كل مفاتيح الخادم — بما فيها عدة حسابات مفصولة بفواصل في GROQ_API_KEY،
 * انظر splitKeys في lib/ai-client.ts) — يُعاد استخدام resolveAiKeys نفسها
 * ثم تُستبعَد مرشحات أي مزود غير Groq، فلا يوجد منطق تفريد/تقسيم مكرَّر قد
 * ينحرف عن نظيره في lib/ai-client.ts بمرور الوقت (هذا بالضبط الخلل الذي
 * وقع فيه الإصدار السابق من هذه الدالة: كانت تقرأ process.env.GROQ_API_KEY
 * مباشرة بلا تقسيم، فحين صار المتغير يقبل عدة مفاتيح مفصولة بفواصل، انكسر
 * تفريغ الصوت تحديداً لأنه أرسل السلسلة الكاملة كمفتاح واحد غير صالح).
 * مصفوفة لا قيمة واحدة، حتى يمكن تجربة أكثر من حساب Groq قبل الفشل
 * الصادق (transcribeHearingAudio أدناه)، بنفس منطق callWithAiFailover في
 * بقية التطبيق. مفتاح Gemini/DeepSeek وحده لا يكفي لهذه الخطوة تحديداً. */
export function resolveGroqKeysForTranscription(clientKeys?: ClientApiKeys | null): string[] {
  return resolveAiKeys(clientKeys)
    .filter((k) => k.provider === "groq")
    .map((k) => k.apiKey);
}

export interface AudioTranscriptionResult {
  text: string;
}

/** يرسل ملف/تسجيل صوتي إلى Whisper (عبر Groq) ويُعيد النص الخام المُفرَّغ.
 * `language: "ar"` يُحسّن الدقة وزمن الاستجابة (نفس التوصية في وثائق
 * Whisper) بما أن جلسات الخبرة القضائية في الإمارات تكون عربية غالباً.
 * يجرّب كل مفتاح في groqApiKeys بالترتيب — مفتاح مرفوض (401) أو محظوظ
 * الحد (429) أو عطل مؤقت في الشبكة ينتقل للمفتاح التالي بدل الفشل فوراً؛
 * فشل *محتوى* حقيقي (تسجيل بلا كلام مسموع) لا يُعاد تجربته بمفتاح آخر —
 * لن يتغيّر بتغيير الحساب. */
export async function transcribeHearingAudio(
  file: File,
  groqApiKeys: string[],
): Promise<AudioTranscriptionResult> {
  let lastError: unknown = null;

  for (const apiKey of groqApiKeys) {
    const client = new Groq({ apiKey });
    try {
      const transcription = await client.audio.transcriptions.create({
        file,
        model: WHISPER_MODEL,
        language: "ar",
      });
      const text = transcription.text?.trim();
      if (!text) {
        throw new AudioTranscriptionError("لم يتمكن النموذج من استخراج أي كلام من التسجيل الصوتي");
      }
      return { text };
    } catch (err) {
      if (err instanceof AudioTranscriptionError) throw err;
      lastError = err;
    }
  }

  const message = lastError instanceof Error ? lastError.message : "خطأ غير معروف";
  // رسالة صريحة تشمل حالات شائعة فعلياً: تنسيق غير مدعوم، حجم يتجاوز حد
  // مزود الخدمة، أو انقطاع الاتصال — بدل فشل صامت أو نص مختلق.
  throw new AudioTranscriptionError(`تعذر تفريغ التسجيل الصوتي (${message})`);
}
