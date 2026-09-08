// الموديول 2 → 1 — اقتراح مهام جديدة للمأمورية (CaseAnalysis.mandateTasks)
// من محضر اجتماع مصحَّح، لم تكن مغطاة أصلاً في قائمة المهام الحالية. زر
// اختياري صريح على صفحة الاجتماع (لا شيء يتغيّر تلقائياً في الخلفية بعد
// كل تصحيح تفريغ) — الخبير يراجع كل اقتراح مع اقتباسه الحرفي من المحضر
// ويختار بنفسه ما يريد إضافته فعلياً (components/HearingRoom.tsx).
//
// يُضيف فقط — لا يُعدِّل ولا يحذف أي مهمة موجودة بالفعل، مهما بدت مكرَّرة
// أو قابلة للدمج: مهمة موجودة قد تكون مرتبطة بالفعل بعمل معتمَد في
// الموديول 4 (CourtReportTask بفهرس ثابت)، فتعديل نصها هنا قد يُربك ذلك
// العمل دون داعٍ حقيقي — الإضافة وحدها آمنة تماماً.

import { z } from "zod";
import { extractJson } from "./ai-json";
import {
  createAiClient,
  resolveAiKeys,
  callWithAiFailover,
  AiFailoverError,
  type ClientApiKeys,
} from "./ai-client";

export interface SuggestedTask {
  taskText: string;
  groundingExcerpt: string; // اقتباس حرفي (أو أقرب صياغة ممكنة) من المحضر يثبت أن هذه المهمة استجدت فعلاً في الاجتماع
}

export interface TaskSuggestionOutcome {
  suggestions: SuggestedTask[];
  mode: "AI" | "OFFLINE";
  warning?: string;
}

const aiResultSchema = z.object({
  suggestions: z.array(z.object({ taskText: z.string(), groundingExcerpt: z.string() })),
});

const SYSTEM_PROMPT = `أنت مساعد خبير حسابي قضائي في دولة الإمارات العربية المتحدة. سيُعرض عليك نص محضر اجتماع خبرة مصحَّح، وقائمة "المهام الحالية" لمأمورية الخبرة كما هي معتمدة الآن.

مهمتك: افحص محضر الاجتماع وحدد فقط ما استجد فيه من التزامات أو طلبات فعلية صريحة من الخبير (وليس من أحد الأطراف فقط) تستحق أن تصبح "مهمة" مستقلة ضمن مأمورية الخبرة — مثال نموذجي: طلب الخبير في الاجتماع مستندات محاسبية محددة لفترات بعينها (ميزان مراجعة، أرباح وخسائر، مركز مالي لسنوات محددة)، أو التزامه بالانتقال لمعاينة مقر الشركة، أو تحديده لنقطة بحث فنية إضافية لم تكن واردة في المأمورية الأصلية.

قواعد صارمة:
1. لا تقترح أي مهمة تتطابق أو تتداخل جوهرياً مع أي مهمة موجودة بالفعل في "المهام الحالية" المعطاة لك — راجعها بعناية أولاً؛ الهدف فقط سد فجوة حقيقية، لا إعادة صياغة شيء موجود.
2. كل اقتراح يجب أن يكون له سند واضح وصريح في نص المحضر — أرفق مع كل مهمة مقترَحة (groundingExcerpt) اقتباساً حرفياً قصيراً (سطر أو سطرين) من المحضر نفسه يثبت أنها استجدت فعلاً، لا استنتاجاً أو تخميناً منك.
3. إن لم يستجد في المحضر أي شيء يستحق أن يكون مهمة مستقلة جديدة، أعد قائمة اقتراحات فارغة تماماً — لا تخترع مهمة لمجرد ملء الرد.
4. صِغ نص كل مهمة مقترَحة بصيغة مهمة واضحة قابلة للبحث والدراسة (بنفس أسلوب المهام الموجودة في القائمة الحالية)، لا كنقل حرفي لكلام غير منظَّم.

أجب بالعربية الفصحى. يجب أن يكون ردك بصيغة JSON صالحة فقط، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown، وفق المخطط التالي بالضبط:
{"suggestions": [{"taskText": "string", "groundingExcerpt": "string"}]}`;

const MAX_TRANSCRIPT_CHARS = 20_000;

export async function suggestTasksFromHearing(
  correctedTranscript: string,
  existingTasks: string[],
  clientKeys?: ClientApiKeys | null,
): Promise<TaskSuggestionOutcome> {
  const candidates = resolveAiKeys(clientKeys);

  if (candidates.length === 0) {
    return {
      suggestions: [],
      mode: "OFFLINE",
      warning:
        "تعذّر استخراج مهام من المحضر (لا يوجد مفتاح ذكاء اصطناعي مُهيأ) — يمكنك إضافة أي مهمة استجدت يدوياً من تبويب «التحليل الأولي» في الموديول 1.",
    };
  }

  const existingTasksBlock =
    existingTasks.length > 0
      ? existingTasks.map((t, i) => `${i + 1}. ${t}`).join("\n")
      : "لا توجد مهام معتمدة حتى الآن.";

  try {
    const { result } = await callWithAiFailover(candidates, async (resolved) => {
      const client = createAiClient(resolved);
      const completion = await client.chat.completions.create({
        model: resolved.model,
        temperature: 0.15,
        max_tokens: 1600,
        reasoning_effort: resolved.provider === "gemini" ? "low" : undefined,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `المهام الحالية لمأمورية الخبرة:\n${existingTasksBlock}\n\n=====\n\nنص محضر الاجتماع المصحَّح:\n"""\n${correctedTranscript.slice(0, MAX_TRANSCRIPT_CHARS)}\n"""\n\n=====\n\nحدد أي مهام جديدة استجدت وفق التعليمات.`,
          },
        ],
      });
      const raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error("رد فارغ من خدمة الذكاء الاصطناعي");
      const validated = aiResultSchema.safeParse(extractJson(raw));
      if (!validated.success) throw new Error("فشل التحقق من صيغة استجابة الذكاء الاصطناعي");
      return validated.data.suggestions;
    });
    return { suggestions: result, mode: "AI" };
  } catch (err) {
    const message =
      err instanceof AiFailoverError ? err.message : err instanceof Error ? err.message : "خطأ غير معروف";
    return {
      suggestions: [],
      mode: "OFFLINE",
      warning: `تعذّر استخراج مهام من المحضر بالذكاء الاصطناعي (${message}) — يمكنك إضافة أي مهمة استجدت يدوياً من تبويب «التحليل الأولي» في الموديول 1.`,
    };
  }
}
