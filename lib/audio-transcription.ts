// الموديول 2 — تفريغ صوت الاجتماع (تسجيل مباشر من المتصفح أو ملف صوتي
// مرفوع) إلى نص خام، تمهيداً لتصحيحه بنفس محرك التصحيح الموجود أصلاً
// (lib/hearing-transcript-ai.ts) دون أي تعديل عليه — هذه الوحدة تنتج فقط
// الخطوة السابقة له (صوت ← نص خام)، تماماً كما يفعل رفع ملف نصي عبر
// extractDocument() اليوم.
//
// يعتمد التفريغ على Whisper عبر Groq تحديداً (client.audio.transcriptions)
// — هذه القدرة غير متاحة في تجريد lib/ai-client.ts الحالي (مكالمات
// chat/completions نصية فقط لدى المزودين)، ولا يوجد لدى Gemini مسار مكافئ
// ضمن هذا التجريد. لذلك لا يوجد "احتياطي بدون مفتاح" هنا كما في بقية
// الوحدات: إن لم يتوفر مفتاح Groq، الفشل الصادق (رسالة واضحة) هو السلوك
// الصحيح بدل استخراج نص وهمي من ملف صوتي — على عكس التصحيح النصي حيث
// النص الخام نفسه (كما رُفع) هو احتياطي معقول.

import Groq from "groq-sdk";
import type { ClientApiKeys } from "./ai-client";

const WHISPER_MODEL = "whisper-large-v3-turbo";

export class AudioTranscriptionError extends Error {}

/** نفس ترتيب أولوية Groq في resolveAiKey (lib/ai-client.ts)، لكن مقتصر على
 * Groq فقط — مفتاح Gemini وحده لا يكفي لهذه الخطوة تحديداً. */
export function resolveGroqKeyForTranscription(clientKeys?: ClientApiKeys | null): string | null {
  return clientKeys?.groq?.trim() || process.env.GROQ_API_KEY?.trim() || null;
}

export interface AudioTranscriptionResult {
  text: string;
}

/** يرسل ملف/تسجيل صوتي إلى Whisper (عبر Groq) ويُعيد النص الخام المُفرَّغ.
 * `language: "ar"` يُحسّن الدقة وزمن الاستجابة (نفس التوصية في وثائق
 * Whisper) بما أن جلسات الخبرة القضائية في الإمارات تكون عربية غالباً. */
export async function transcribeHearingAudio(
  file: File,
  groqApiKey: string,
): Promise<AudioTranscriptionResult> {
  const client = new Groq({ apiKey: groqApiKey });

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
    const message = err instanceof Error ? err.message : "خطأ غير معروف";
    // رسالة صريحة تشمل حالات شائعة فعلياً: تنسيق غير مدعوم، حجم يتجاوز حد
    // مزود الخدمة، أو انقطاع الاتصال — بدل فشل صامت أو نص مختلق.
    throw new AudioTranscriptionError(`تعذر تفريغ التسجيل الصوتي (${message})`);
  }
}
