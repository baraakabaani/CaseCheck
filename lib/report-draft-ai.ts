// الموديول 4 — صياغة السرد التوليدي للتقرير القضائي بالذكاء الاصطناعي.
// يتبع نفس نمط lib/hearing-transcript-ai.ts بالضبط: يجرّب كل مزود متاح
// بالترتيب (Groq ثم Gemini عبر callWithAiFailover)، وطلب واحد لكل مهمة على
// حدة بدل طلب ضخم واحد (نفس منطق "التقسيم إلى أجزاء متتالية" في تصحيح
// التفريغ — تقرير من 6-8 مهام + الأقسام التمهيدية يتجاوز بسهولة ميزانية
// الطلب الواحد لدى Groq المجاني). لا نص هنا إلا من صياغة النموذج فوق سياق
// مُجمَّع حتمياً بالكامل من lib/reports/report-aggregator.ts — لا تُرسل أي
// وثيقة خام، وأي مبلغ مالي يذكره النموذج يجب أن يكون له أصل في المستندات
// المعروضة عليه، وإلا فـ null صراحة (لا تخمين، انظر القاعدة في الطلب أدناه).

import {
  createAiClient,
  resolveAiKeys,
  callWithAiFailover,
  AiFailoverError,
  type ClientApiKeys,
  type ResolvedAiKey,
} from "./ai-client";
import { buildSingleDocumentDigest, type SmartIngestDocument } from "./smart-ingest";
import { CASE_PARTY_ROLE_LABELS } from "./case-intake-labels";
import {
  buildProceduralTimelineText,
  buildDocumentInventoryText,
  buildMissingDocsImpactText,
  buildPartyClaimsBlock,
} from "./reports/report-sections";
import { offlineDraftPreliminary, offlineDraftTask } from "./reports/offline-report-draft";
import {
  reportPreliminaryAiResultSchema,
  reportTaskAiResultSchema,
  type ReportPreliminarySections,
  type ReportSettlementNarrative,
  type ReportTaskAnalysis,
} from "./reports/report-draft-schemas";
import type { AggregatedTask, ReportAggregate } from "./reports/report-aggregator";
import type { DocCategory } from "./schemas";

export interface ReportDraftResult {
  preliminarySections: ReportPreliminarySections;
  taskAnalyses: ReportTaskAnalysis[];
  settlement: ReportSettlementNarrative;
}

export interface ReportDraftOutcome {
  result: ReportDraftResult;
  mode: "AI" | "OFFLINE";
  warning?: string;
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

function buildCaseHeaderBlock(aggregate: ReportAggregate): string {
  const { basics } = aggregate;
  const partiesBlock = aggregate.parties
    .map((p) => `partyId: ${p.id} — الصفة: ${CASE_PARTY_ROLE_LABELS[p.role as "CLAIMANT" | "RESPONDENT"]} — الاسم: ${p.name}`)
    .join("\n");
  return `بيانات الدعوى:
- رقم الدعوى: ${basics.caseNumber}
- الموضوع: ${basics.title}
${basics.court ? `- المحكمة: ${basics.court}\n` : ""}${basics.circuit ? `- الدائرة: ${basics.circuit}\n` : ""}${
    basics.mandateNatureLabels.length > 0 ? `- طبيعة المأمورية: ${basics.mandateNatureLabels.join("، ")}\n` : ""
  }
أطراف الدعوى:
${partiesBlock || "غير محدد"}`;
}

// ---------------------------------------------------------------------------
// الأقسام التمهيدية + خلاصة التصفية (طلب واحد)
// ---------------------------------------------------------------------------

const PRELIMINARY_SYSTEM_PROMPT = `أنت خبير حسابي قضائي متمرس تكتب الأقسام التمهيدية لتقرير خبرة حسابية يُودَع لدى محكمة إماراتية.

سيُعرض عليك سياق الدعوى الكامل، بما في ذلك جدول زمني للإجراءات وجرد للمستندات مُجمَّعان آلياً من سجلات النظام — هذان الجزءان حقيقة ثابتة، لا تُعد سردهما ولا تُغيّر ترتيبهما ولا تُضف إليهما حدثاً أو مستنداً غير مذكور فيهما.

اكتب:
1. introduction: مقدمة رسمية موجزة للتقرير (الدعوى، الأطراف، المحكمة، المأمورية).
2. mandateSummary: ملخص واضح لمهمة الخبرة المكلَّف بها الخبير، مبني على نص المأمورية المعطى لك.
3. partiesOverview: فقرة سردية عن الأطراف وصفاتهم، تكملة لِما هو معطى في "الأطراف وصفاتهم" أدناه لا إعادة له حرفياً.
4. proceduralHistory: فقرة سردية تمهيدية فوق "الجدول الزمني للإجراءات" المعطى لك — تعليق وربط بين الأحداث، لا إعادة سرد كل حدث فيه (الجدول نفسه سيُعرض كاملاً في التقرير بعد فقرتك مباشرة).
5. documentInventory: فقرة سردية تمهيدية فوق "جرد المستندات" المعطى لك، بنفس المنطق.

خلاصة التصفية (settlement):
- beneficiary: صِف نصياً أي الطرفين يبدو أنه المستفيد من ترجيح مبدئي للمطالبات مقابل المقاصات المذكورة في سياق مواقف الأطراف (أو اذكر أنه لم يتضح بعد إن كانت الأرقام غير كافية) — لا تذكر رقماً هنا، الأرقام تُحسب لاحقاً من كل مهمة على حدة.
- summaryNarrative: فقرة ختامية عامة تمهّد لجدول التصفية دون ذكر أي رقم إجمالي محدَّد.

لا تخترع أي واقعة أو تاريخ أو مستند أو مبلغ غير معطى لك في السياق. أجب بالعربية الفصحى. يجب أن يكون ردك بصيغة JSON صالحة فقط، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown، وفق المخطط التالي بالضبط:
{"preliminarySections": {"introduction": "string", "mandateSummary": "string", "partiesOverview": "string", "proceduralHistory": "string", "documentInventory": "string"}, "settlement": {"beneficiary": "string", "summaryNarrative": "string"}}`;

async function callAiForPreliminary(
  resolved: ResolvedAiKey,
  aggregate: ReportAggregate,
): Promise<{ preliminarySections: ReportPreliminarySections; settlement: ReportSettlementNarrative }> {
  const client = createAiClient(resolved);

  const userContent = `${buildCaseHeaderBlock(aggregate)}

نص المأمورية: ${aggregate.mandate.mandateText ?? "غير متوفر"}
ملخص الدعوى من التحليل الأولي: ${aggregate.mandate.caseSummary ?? "غير متوفر"}

=====

الأطراف وصفاتهم (بيانات جاهزة):
${aggregate.parties.map((p) => `- ${p.name} (${CASE_PARTY_ROLE_LABELS[p.role as "CLAIMANT" | "RESPONDENT"]})`).join("\n") || "غير محدد"}

=====

الجدول الزمني للإجراءات (مُجمَّع آلياً من سجلات النظام — حقيقة ثابتة):
${buildProceduralTimelineText(aggregate.timeline)}

=====

جرد المستندات المتحقق منه (مُجمَّع آلياً من سجلات النظام — حقيقة ثابتة):
${buildDocumentInventoryText(aggregate.inventory)}

=====

اكتب الأقسام التمهيدية وخلاصة التصفية وفق التعليمات.`;

  const completion = await client.chat.completions.create({
    model: resolved.model,
    temperature: 0.3,
    max_tokens: 2200,
    reasoning_effort: resolved.provider === "gemini" ? "low" : undefined,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PRELIMINARY_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("رد فارغ من خدمة الذكاء الاصطناعي");

  const validated = reportPreliminaryAiResultSchema.safeParse(extractJson(raw));
  if (!validated.success) throw new Error("فشل التحقق من صيغة استجابة الذكاء الاصطناعي");
  return validated.data;
}

// ---------------------------------------------------------------------------
// بحث الدراسة لمهمة واحدة (طلب لكل مهمة)
// ---------------------------------------------------------------------------

const TASK_SYSTEM_PROMPT = `أنت خبير حسابي قضائي متمرس تكتب قسم "بحث الدراسة" لمهمة واحدة محددة من مهام مأمورية خبرة حسابية.

سيُعرض عليك: نص المهمة، المستندات المرتبطة بها (ملخصات محلية، وليست النص الكامل)، مواقف الأطراف ذات الصلة، والمستندات الناقصة المرتبطة بها.

اكتب:
1. claimantArguments: موقف المدعي وحججه ومبالغه المُدَّعاة الخاصة بهذه المهمة تحديداً، مبنية على المستندات/المواقف المعروضة عليك.
2. respondentArguments: دفوع المدعى عليه ومقاصاته الخاصة بهذه المهمة تحديداً.
3. forensicStudy: بحث الخبرة — تحليل مقارن (مطابقة كشوف، تسويات، فحص دفاتر، حساب ما أمكن حسابه من الأرقام المعروضة) خاص بهذه المهمة فقط.
4. missingDocsImpact: أعد نفس نص "المستندات الناقصة المرتبطة بهذه المهمة" المعطى لك أدناه دون تغيير جوهري (هذا القسم حتمي، لا تحليلي).
5. tentativeFinding: استنتاج مبدئي موجز ومسبَّب — هذا رأي مبدئي للخبير سيراجعه ويعتمده بنفسه، اكتبه كاستنتاج لا كحكم قضائي نهائي.

قاعدة الأرقام (صارمة): claimantAmount و respondentOffset يجب أن يكون لهما أصل واضح في المستندات المعروضة عليك أعلاه (رقم مذكور صراحة في مستند، أو ناتج حساب مباشر منه). إن لم تكن هذه المهمة ذات طبيعة مالية، أو لم تتوافر أرقام موثوقة كافية، أعدهما null صراحة — لا تخمّن رقماً تقريبياً أبداً. إن ذكرت رقماً، اشرح أساسه في amountNote (وإلا أعده null أيضاً).

لا تخترع أي معلومة أو مستند أو رقم لا أصل له فيما عُرض عليك. أجب بالعربية الفصحى. يجب أن يكون ردك بصيغة JSON صالحة فقط، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown، وفق المخطط التالي بالضبط:
{"taskId": "string", "claimantArguments": "string", "respondentArguments": "string", "forensicStudy": "string", "missingDocsImpact": "string", "tentativeFinding": "string", "claimantAmount": "number|null", "respondentOffset": "number|null", "amountNote": "string|null"}`;

async function callAiForTask(
  resolved: ResolvedAiKey,
  aggregate: ReportAggregate,
  task: AggregatedTask,
): Promise<ReportTaskAnalysis> {
  const client = createAiClient(resolved);

  const exhibitDigests = task.linkedDocumentIds
    .map((docId) => aggregate.documentsById.get(docId))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .map((d) => {
      const digest = buildSingleDocumentDigest(
        {
          id: d.id,
          fileName: d.fileName,
          fileKind: d.fileKind,
          docCategory: (d.docCategory ?? "UNSPECIFIED") as DocCategory,
          text: d.extractedText ?? "",
        } satisfies SmartIngestDocument,
        500,
      );
      return `[معرف المستند: ${d.id} | الملف: ${d.fileName}] ${digest.text}`;
    })
    .join("\n\n");

  const userContent = `${buildCaseHeaderBlock(aggregate)}

=====

المهمة محل البحث (taskId: ${String(task.taskIndex)}):
${task.taskText}

=====

المستندات المرتبطة بهذه المهمة:
${exhibitDigests || "لا توجد مستندات مرتبطة بهذه المهمة حتى الآن."}

=====

المستندات الناقصة المرتبطة بهذه المهمة:
${buildMissingDocsImpactText(task)}

=====

مواقف الأطراف ذات الصلة (مقتطفات من كامل ملف الدعوى، وليست خاصة بهذه المهمة حصراً — استخدم ما يتصل منها فقط):
${buildPartyClaimsBlock(aggregate.partyClaims)}

=====

اكتب بحث الدراسة لهذه المهمة تحديداً وفق التعليمات.`;

  const completion = await client.chat.completions.create({
    model: resolved.model,
    temperature: 0.25,
    max_tokens: 1600,
    reasoning_effort: resolved.provider === "gemini" ? "low" : undefined,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: TASK_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("رد فارغ من خدمة الذكاء الاصطناعي");

  const validated = reportTaskAiResultSchema.safeParse(extractJson(raw));
  if (!validated.success) throw new Error("فشل التحقق من صيغة استجابة الذكاء الاصطناعي");
  // taskId مصدره الحقيقي فهرس المهمة نفسه، لا رد النموذج (قد يُعيده بصياغة مختلفة).
  return { ...validated.data, taskId: String(task.taskIndex) };
}

// ---------------------------------------------------------------------------
// المنسِّق العام
// ---------------------------------------------------------------------------

/** يصوغ التقرير كاملاً: طلب واحد للأقسام التمهيدية + طلب متتالٍ (وليس
 * متوازياً — نفس السبب الموثَّق في lib/hearing-transcript-ai.ts: طلبات
 * متزامنة تستهلك حصة الدقيقة المجانية بسرعة أكبر) لكل مهمة من `tasksToGenerate`
 * (وليس بالضرورة كل مهام aggregate.tasks — المسار المستدعي يستبعد مسبقاً أي
 * مهمة اعتُمد "رأي الخبرة" فيها بالفعل، فلا تُستهلَك حصة الذكاء الاصطناعي
 * على عمل معتمد أصلاً ولا يُخاطَر باستبداله). كل مهمة/قسم تفشل بعد استنفاد
 * كل المزودات المتاحة تتراجع إلى نظيرتها في المحرك الاحتياطي بدل إسقاطها. */
export async function draftCourtReport(
  aggregate: ReportAggregate,
  tasksToGenerate: AggregatedTask[],
  clientKeys?: ClientApiKeys | null,
): Promise<ReportDraftOutcome> {
  const candidates = resolveAiKeys(clientKeys);

  if (candidates.length === 0) {
    const { preliminarySections, settlement } = offlineDraftPreliminary(aggregate);
    return {
      result: {
        preliminarySections,
        settlement,
        taskAnalyses: tasksToGenerate.map((t) => offlineDraftTask(aggregate, t)),
      },
      mode: "OFFLINE",
      warning:
        "تعذّر تفعيل توليد التقرير بالذكاء الاصطناعي (لا يوجد مفتاح API مُهيأ) — تم تجميع الأقسام الحتمية (الجدول الزمني، جرد المستندات) كاملة، وتُركت الأقسام التحليلية كحقول يملؤها الخبير يدوياً. أضف مفتاحاً من زر «مفتاح الذكاء الاصطناعي» أعلى الصفحة ثم أعد التوليد.",
    };
  }

  let successCount = 0;
  let lastErrorMessage: string | null = null;

  let preliminarySections: ReportPreliminarySections;
  let settlement: ReportSettlementNarrative;
  try {
    const generated = await callWithAiFailover(candidates, (resolved) => callAiForPreliminary(resolved, aggregate));
    preliminarySections = generated.result.preliminarySections;
    settlement = generated.result.settlement;
    successCount++;
  } catch (err) {
    lastErrorMessage = err instanceof AiFailoverError ? err.message : err instanceof Error ? err.message : "خطأ غير معروف";
    const offline = offlineDraftPreliminary(aggregate);
    preliminarySections = offline.preliminarySections;
    settlement = offline.settlement;
  }

  const taskAnalyses: ReportTaskAnalysis[] = [];
  const failedTaskLabels: string[] = [];
  for (const task of tasksToGenerate) {
    try {
      const { result } = await callWithAiFailover(candidates, (resolved) => callAiForTask(resolved, aggregate, task));
      taskAnalyses.push(result);
      successCount++;
    } catch (err) {
      lastErrorMessage = err instanceof AiFailoverError ? err.message : err instanceof Error ? err.message : "خطأ غير معروف";
      failedTaskLabels.push(String(task.taskIndex + 1));
      taskAnalyses.push(offlineDraftTask(aggregate, task));
    }
  }

  const totalAttempts = tasksToGenerate.length + 1; // +1 للأقسام التمهيدية
  const mode: "AI" | "OFFLINE" = successCount > 0 ? "AI" : "OFFLINE";
  const warning =
    successCount < totalAttempts
      ? `تم توليد ${successCount} من أصل ${totalAttempts} قسم/مهمة بالذكاء الاصطناعي${
          failedTaskLabels.length > 0 ? `، وتعذّر توليد المهمة رقم ${failedTaskLabels.join("، ")} (استُخدم نص احتياطي بدلاً منه)` : ""
        } — السبب: ${lastErrorMessage}`
      : undefined;

  return { result: { preliminarySections, taskAnalyses, settlement }, mode, warning };
}
