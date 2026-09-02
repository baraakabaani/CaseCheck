import {
  emailDraftContentSchema,
  type EmailDraftContent,
  type GenerateEmailInput,
} from "./schemas";
import { createAiClient, resolveAiKey, type ClientApiKeys, type ResolvedAiKey } from "./ai-client";

export interface EmailCaseContext {
  caseNumber: string;
  title: string;
  court?: string | null;
  clientName?: string | null;
}

export interface EmailRequirementContext {
  labelAr: string;
  status: "PARTIALLY_PROVIDED" | "MISSING";
  notes?: string | null;
}

export interface EmailOutcome {
  content: EmailDraftContent;
  mode: "AI" | "OFFLINE";
  warning?: string;
}

const TONE_LABELS: Record<GenerateEmailInput["tone"], string> = {
  FORMAL: "رسمي ومهني",
  URGENT: "رسمي مع التشديد على الاستعجال نظراً لضيق الوقت",
  FRIENDLY_REMINDER: "رسمي ولطيف بأسلوب تذكير ودي",
};

const SYSTEM_PROMPT = `أنت مساعد قانوني تكتب مراسلات رسمية باللغة العربية الفصحى نيابة عن مكتب محاماة/استشارات لتدقيق ملفات الدعاوى القضائية والخبرة المحاسبية في دولة الإمارات العربية المتحدة.

اكتب مسودة بريد إلكتروني/خطاب رسمي موجه إلى المتعامل (العميل) يطلب منه استكمال المستندات الناقصة أو غير المكتملة في ملف الدعوى.

المتطلبات:
- استخدم صيغة مخاطبة رسمية مهذبة (تحية افتتاحية، صلب الموضوع، خاتمة رسمية).
- اذكر رقم الدعوى وعنوانها والمحكمة إن وُجدت.
- اعرض قائمة المستندات الناقصة أو غير المكتملة كنقاط (bullet points) واضحة، مع ذكر السبب المحدد لكل بند (مثال: "كشف الحساب البنكي — مقدم جزئياً: يغطي سنة 2023 فقط، يرجى تزويدنا بكشوفات 2024 و2025").
- حدد مهلة زمنية واضحة للرد وتزويد المستندات.
- لا تخترع تفاصيل غير معطاة لك (مثل أسماء أشخاص أو تواريخ لم تُذكر).

يجب أن يكون ردك بصيغة JSON صالحة فقط، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown، بالشكل التالي بالضبط:
{"subject": "عنوان البريد", "bodyAr": "نص الرسالة كاملاً بما فيه التحية والخاتمة، بدون توقيع اسم مرسل محدد — اختم بعبارة عامة مثل \\"وتفضلوا بقبول فائق الاحترام والتقدير\\""}`;

function buildFallbackContent(
  caseCtx: EmailCaseContext,
  requirements: EmailRequirementContext[],
  deadlineDays: number,
): EmailDraftContent {
  const bulletLines = requirements
    .map((r) => {
      const reason =
        r.status === "PARTIALLY_PROVIDED"
          ? r.notes
            ? `مقدم جزئياً — ${r.notes}`
            : "مقدم جزئياً وغير مكتمل"
          : "غير مقدم";
      return `- ${r.labelAr} (${reason})`;
    })
    .join("\n");

  const bodyAr = `السادة/ ${caseCtx.clientName || "المحترمين"}،
تحية طيبة وبعد،

بالإشارة إلى الدعوى رقم (${caseCtx.caseNumber}) الموضوع: "${caseCtx.title}"${
    caseCtx.court ? ` أمام ${caseCtx.court}` : ""
  }، وفي إطار استكمال إجراءات تدقيق ملف الدعوى، نفيدكم بأنه تبين لدينا نقص أو عدم اكتمال في المستندات التالية:

${bulletLines}

يرجى التكرم بموافاتنا بالمستندات المذكورة أعلاه كاملة خلال مدة أقصاها ${deadlineDays} أيام من تاريخ هذه المراسلة، وذلك لضمان سير إجراءات الدعوى/الخبرة دون تأخير.

وتفضلوا بقبول فائق الاحترام والتقدير.`;

  return {
    subject: `طلب استكمال مستندات — الدعوى رقم ${caseCtx.caseNumber}`,
    bodyAr,
  };
}

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

async function callAiForEmail(
  resolved: ResolvedAiKey,
  caseCtx: EmailCaseContext,
  requirements: EmailRequirementContext[],
  options: GenerateEmailInput,
): Promise<EmailDraftContent> {
  const client = createAiClient(resolved);

  const requirementsBlock = requirements
    .map((r, i) => {
      const statusLabel =
        r.status === "PARTIALLY_PROVIDED" ? "مقدم جزئياً / غير مكتمل" : "غير مقدم";
      return [
        `${i + 1}. ${r.labelAr}`,
        `   الحالة: ${statusLabel}`,
        r.notes ? `   ملاحظات: ${r.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const userContent = `بيانات الدعوى:
- رقم الدعوى: ${caseCtx.caseNumber}
- الموضوع: ${caseCtx.title}
${caseCtx.court ? `- المحكمة: ${caseCtx.court}\n` : ""}${
    caseCtx.clientName ? `- المتعامل: ${caseCtx.clientName}\n` : ""
  }
النبرة المطلوبة: ${TONE_LABELS[options.tone]}
مهلة الرد: ${options.deadlineDays} أيام من تاريخ الخطاب
${options.extraInstructions ? `تعليمات إضافية من المستخدم: ${options.extraInstructions}\n` : ""}
المستندات الناقصة أو غير المكتملة المطلوب ذكرها في الخطاب:
${requirementsBlock}`;

  const completion = await client.chat.completions.create({
    model: resolved.model,
    temperature: 0.4,
    max_tokens: 2048,
    // See AiChatParams.reasoning_effort — without this, Gemini spends an
    // unpredictable share of max_tokens on hidden thinking and can return
    // truncated/invalid JSON.
    reasoning_effort: resolved.provider === "gemini" ? "low" : undefined,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("رد فارغ من خدمة الذكاء الاصطناعي");

  const parsed = extractJson(raw);
  const validated = emailDraftContentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("فشل التحقق من صيغة استجابة الذكاء الاصطناعي");
  }
  return validated.data;
}

export async function generateEmailDraft(
  caseCtx: EmailCaseContext,
  requirements: EmailRequirementContext[],
  options: GenerateEmailInput,
  clientKeys?: ClientApiKeys | null,
): Promise<EmailOutcome> {
  if (requirements.length === 0) {
    throw new Error("لا توجد مستندات ناقصة أو غير مكتملة لإنشاء خطاب بشأنها");
  }

  const resolved = resolveAiKey(clientKeys);

  if (!resolved) {
    return {
      content: buildFallbackContent(caseCtx, requirements, options.deadlineDays),
      mode: "OFFLINE",
    };
  }

  try {
    const content = await callAiForEmail(resolved, caseCtx, requirements, options);
    return { content, mode: "AI" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطأ غير معروف";
    return {
      content: buildFallbackContent(caseCtx, requirements, options.deadlineDays),
      mode: "OFFLINE",
      warning: `تعذر استخدام الذكاء الاصطناعي (${message})، تم استخدام القالب الاحتياطي بدلاً من ذلك.`,
    };
  }
}
