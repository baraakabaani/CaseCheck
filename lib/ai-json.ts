// استخراج JSON من رد نموذج ذكاء اصطناعي — يتشاركه كل مستدعي AI في التطبيق
// (كان مكرَّراً بنفس الحروف في 8 ملفات قبل هذا التعديل). يضيف خطوة "ترميم"
// أخيرة تتعامل مع الحالة الفعلية التي وقعت: رد طويل جداً (حالة خاصة، مثل
// عدد كبير من المستندات/الأسئلة في التحليل الأولي) يُقطَع في منتصفه عند
// بلوغ حد max_tokens قبل أن يُغلِق النموذج كل الأقواس — رسالة الخطأ
// النموذجية لذلك تكون "Expected ',' or ']' after array element" في موضع
// متأخر جداً من النص. من قبل، كان أي فشل هنا يُسقط الاستجابة بالكامل
// ويلجأ التطبيق للمحرك الاحتياطي دون ذكاء اصطناعي — رغم أن الرد كان
// يحوي فعلاً بيانات صحيحة وكاملة تقريباً حتى نقطة القطع. الترميم أدناه
// يستعيد أطول بادئة صالحة هيكلياً من الرد (بإسقاط العنصر الأخير غير
// المكتمل فقط) بدل إهدار الرد بأكمله.
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // يقع هنا تحديداً رد مقطوع لا ينتهي بـ "}" صحيح — جرّب الترميم أدناه
      }
    }
    const repaired = repairTruncatedJson(trimmed);
    if (repaired !== null) return repaired;
    throw new Error("لم يتم العثور على JSON صالح في رد النموذج");
  }
}

/**
 * يفحص النص حرفاً حرفاً متتبعاً تعشيش `{}`/`[]` وحالة كونه داخل سلسلة
 * نصية، ويسجّل عند كل نقطة "آمنة" (مباشرة بعد إغلاق عنصر متداخل بالكامل،
 * أو قبل فاصلة تفصل بين عناصر) نسخة من حالة التعشيش في تلك اللحظة. إن
 * فشل تحليل النص كاملاً (لأنه انقطع في منتصف عنصر لاحق)، يُقتطع النص عند
 * آخر نقطة آمنة مسجَّلة ثم تُغلَق كل الأقواس المفتوحة المتبقية بنفس
 * ترتيبها — فينتج JSON صالح يحمل كل العناصر المكتملة فعلاً ويُسقط فقط
 * الجزء الأخير غير المكتمل. يعيد null إن تعذّر ترميم أي شيء مفيد.
 */
function repairTruncatedJson(raw: string): unknown | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  const text = raw.slice(start);

  const stack: ("{" | "[")[] = [];
  let inString = false;
  let escape = false;
  let lastSafeEnd = -1;
  let lastSafeStack: ("{" | "[")[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }
    if (ch === "}" || ch === "]") {
      stack.pop();
      lastSafeEnd = i + 1;
      lastSafeStack = [...stack];
      continue;
    }
    if (ch === "," && stack.length > 0) {
      lastSafeEnd = i;
      lastSafeStack = [...stack];
    }
  }

  if (lastSafeEnd <= 0) return null;

  let repaired = text.slice(0, lastSafeEnd);
  for (let i = lastSafeStack.length - 1; i >= 0; i--) {
    repaired += lastSafeStack[i] === "{" ? "}" : "]";
  }

  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}
