// المرحلة 3 — تصنيف دفعة مستندات مرفوعة معاً (رفع مجلد كامل بدل رفع كل
// خانة يدوياً) إلى إحدى الخانات الخمس الحقيقية (لا UNSPECIFIED — تلك ليست
// خانة رفع فعلية، انظر lib/document-slots.ts). الذكاء الاصطناعي يقترح فقط؛
// الخبير يراجع كل تصنيف ويعدّله قبل الرفع الفعلي (BulkDocumentUpload لا
// يرفع شيئاً قبل ضغط "تأكيد الرفع") — لا يختلف هذا عن أي تصنيف آخر في
// التطبيق (AI_DRAFT يحتاج اعتماد الخبير).

import {
  createAiClient,
  resolveAiKeys,
  callWithAiFailover,
  AiFailoverError,
  type ClientApiKeys,
} from "./ai-client";
import { DOC_CATEGORIES, type DocCategory } from "./schemas";
import { DOC_CATEGORY_LABELS } from "./case-intake-labels";
import { z } from "zod";

export type ClassifiableCategory = Exclude<DocCategory, "UNSPECIFIED">;
export const CLASSIFIABLE_CATEGORIES = DOC_CATEGORIES.filter(
  (c): c is ClassifiableCategory => c !== "UNSPECIFIED",
);

export interface ClassifyInputFile {
  fileName: string;
  text: string; // نص مُستخرَج مسبقاً — قد يكون فارغاً (مستند ممسوح ضوئياً تعذّر استخراج نصه)
}

export interface ClassifiedFile {
  fileName: string;
  category: ClassifiableCategory;
  reasoning: string;
}

export interface ClassificationOutcome {
  results: ClassifiedFile[];
  mode: "AI" | "OFFLINE";
  warning?: string;
}

const MAX_DIGEST_CHARS = 500;
const MAX_FILES_PER_REQUEST = 25; // دفعة واحدة كافية لمعظم ملفات الدعوى؛ أكبر من ذلك يُقسَّم تسلسلياً

/** تخمين مبدئي من اسم الملف فقط — يُستخدَم عند غياب مفتاح ذكاء اصطناعي، أو
 * لملء أي ملف لم يرد له تصنيف في رد النموذج (بدل إسقاطه بصمت). صريح الصدق:
 * وسم "OTHER_JUDICIAL" هو نفسه خانة "مستندات قضائية أخرى" اليدوية — الحل
 * الآمن الافتراضي عند عدم اليقين، لا تخمين لخانة حصرية (ملف واحد) قد يكون
 * خاطئاً. */
function heuristicClassify(fileName: string): ClassifiableCategory {
  const name = fileName.toLowerCase();
  if (/حكم|قرار.*ندب|ندب.*خبير/.test(name)) return "PRELIMINARY_RULING";
  if (/لائحة|صحيفة.*دعو/.test(name)) return "STATEMENT_OF_CLAIM";
  if (/مذكرة/.test(name)) return "PARTY_MEMO";
  if (/كشف|فاتورة|حافظة|مرفق|عقد|سند/.test(name)) return "PARTY_ATTACHMENT";
  return "OTHER_JUDICIAL";
}

function offlineClassify(files: ClassifyInputFile[]): ClassifiedFile[] {
  return files.map((f) => ({
    fileName: f.fileName,
    category: heuristicClassify(f.fileName),
    reasoning: "تخمين مبدئي من اسم الملف فقط (لا يوجد مفتاح ذكاء اصطناعي مُهيأ) — راجعه.",
  }));
}

const aiResultSchema = z.object({
  files: z.array(
    z.object({
      fileName: z.string(),
      category: z.enum(CLASSIFIABLE_CATEGORIES as [ClassifiableCategory, ...ClassifiableCategory[]]),
      reasoning: z.string(),
    }),
  ),
});

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

const CATEGORY_GUIDE = CLASSIFIABLE_CATEGORIES.map((c) => `${c} = ${DOC_CATEGORY_LABELS[c]}`).join("، ");

const SYSTEM_PROMPT = `أنت مساعد فرز مستندات في مكتب خبرة حسابية قضائية إماراتي. سيُعرض عليك اسم كل ملف وملخص قصير من محتواه، ومهمتك تصنيف كل ملف إلى واحدة بالضبط من الفئات التالية:
${CATEGORY_GUIDE}

قواعد:
- PRELIMINARY_RULING وSTATEMENT_OF_CLAIM كل منهما مستند واحد عادة لكل دعوى — لا تُسند أكثر من ملف لكل منهما إلا إن كان المحتوى واضحاً فعلاً أن هناك أكثر من مستند من هذا النوع.
- عند عدم اليقين أو عدم توفر نص كافٍ (ملف ممسوح ضوئياً بلا نص مستخرَج)، اختر OTHER_JUDICIAL كخيار افتراضي آمن بدل التخمين.
- استخدم اسم الملف نفسه (fileName) بالضبط كما ورد لك في ردك، لكل ملف عُرض عليك، بلا استثناء ولا تكرار ولا إضافة ملف غير موجود في القائمة.

أجب بالعربية الفصحى في reasoning (سطر واحد مختصر لكل ملف). يجب أن يكون ردك بصيغة JSON صالحة فقط، دون أي نص إضافي قبله أو بعده ودون أي تنسيق Markdown، وفق المخطط التالي بالضبط:
{"files": [{"fileName": "string", "category": "string", "reasoning": "string"}]}`;

async function callAiForBatch(
  clientKeysCandidates: ReturnType<typeof resolveAiKeys>,
  batch: ClassifyInputFile[],
): Promise<ClassifiedFile[]> {
  const userContent = batch
    .map((f, i) => `${i + 1}) اسم الملف: ${f.fileName}\nملخص المحتوى: ${f.text.slice(0, MAX_DIGEST_CHARS) || "(تعذّر استخراج نص من الملف)"}`)
    .join("\n\n");

  const { result } = await callWithAiFailover(clientKeysCandidates, async (resolved) => {
    const client = createAiClient(resolved);
    const completion = await client.chat.completions.create({
      model: resolved.model,
      temperature: 0.1,
      max_tokens: 1600,
      reasoning_effort: resolved.provider === "gemini" ? "low" : undefined,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `الملفات (العدد: ${batch.length}):\n\n${userContent}` },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("رد فارغ من خدمة الذكاء الاصطناعي");
    const validated = aiResultSchema.safeParse(extractJson(raw));
    if (!validated.success) throw new Error("فشل التحقق من صيغة استجابة الذكاء الاصطناعي");
    return validated.data.files;
  });

  // كل ملف عُرض على النموذج يجب أن يحصل على تصنيف — ملف لم يرد له تصنيف في
  // الرد (تجاهله النموذج) يقع على التخمين الاحتياطي من اسمه، لا يُسقَط بصمت.
  const byFileName = new Map(result.map((r) => [r.fileName, r]));
  return batch.map((f) => {
    const match = byFileName.get(f.fileName);
    return match
      ? { fileName: f.fileName, category: match.category, reasoning: match.reasoning }
      : { fileName: f.fileName, category: heuristicClassify(f.fileName), reasoning: "لم يرد تصنيف من النموذج لهذا الملف — تخمين احتياطي من اسمه." };
  });
}

export async function classifyDocuments(
  files: ClassifyInputFile[],
  clientKeys?: ClientApiKeys | null,
): Promise<ClassificationOutcome> {
  const candidates = resolveAiKeys(clientKeys);
  if (candidates.length === 0) {
    return {
      results: offlineClassify(files),
      mode: "OFFLINE",
      warning:
        "تعذّر التصنيف الآلي بالذكاء الاصطناعي (لا يوجد مفتاح API مُهيأ) — التصنيفات أدناه تخمين مبدئي من أسماء الملفات فقط، راجع كل ملف قبل التأكيد.",
    };
  }

  try {
    const chunks: ClassifyInputFile[][] = [];
    for (let i = 0; i < files.length; i += MAX_FILES_PER_REQUEST) {
      chunks.push(files.slice(i, i + MAX_FILES_PER_REQUEST));
    }
    const results: ClassifiedFile[] = [];
    for (const chunk of chunks) {
      results.push(...(await callAiForBatch(candidates, chunk)));
    }
    return { results, mode: "AI" };
  } catch (err) {
    const message =
      err instanceof AiFailoverError ? err.message : err instanceof Error ? err.message : "خطأ غير معروف";
    return {
      results: offlineClassify(files),
      mode: "OFFLINE",
      warning: `تعذّر التصنيف الآلي بالذكاء الاصطناعي (${message}) — التصنيفات أدناه تخمين مبدئي من أسماء الملفات فقط، راجع كل ملف قبل التأكيد.`,
    };
  }
}
