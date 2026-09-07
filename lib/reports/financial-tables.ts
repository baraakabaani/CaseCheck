// طبقة تجميع حتمية (صفر ذكاء اصطناعي) فوق lib/financial/structured-rows.ts:
// تُجمِّع معاملات حقيقية مُحلَّلة إلى ملخصات شهرية/ربعية/سنوية، وتبني منها
// جداول بنفس أشكال جداول التقرير المرجعي (الحركة السنوية/الربعية/الشهرية،
// مطابقة الحركة المصرفية، متوسط المبيعات اليومية). كل رقم هنا محسوب
// بجمع/طرح مباشر على بيانات مُحلَّلة فعلياً — لا تخمين ولا استدعاء ذكاء
// اصطناعي في هذا الملف على الإطلاق؛ الذكاء الاصطناعي (lib/report-draft-ai.ts)
// يُسمح له لاحقاً فقط باختيار وتسمية هذه الجداول الجاهزة، لا بإعادة حساب
// أرقامها.

import { parseDocumentLedger, type ParsedLedger, type ParsedTransaction } from "../financial/structured-rows";
import type { ReportAggregate } from "./report-aggregator";

export type BucketGranularity = "MONTH" | "QUARTER" | "YEAR";

export interface PeriodBucket {
  key: string;
  label: string;
  from: string; // ISO date (yyyy-mm-dd)
  to: string;
}

export interface BucketSummary {
  bucket: PeriodBucket;
  credit: number;
  debit: number;
  net: number;
  count: number;
  openingBalance: number | null;
  closingBalance: number | null;
}

const ARABIC_MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const ARABIC_QUARTER_NAMES = ["الأول", "الثاني", "الثالث", "الرابع"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function bucketKeyAndLabel(date: Date, granularity: BucketGranularity): PeriodBucket {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();

  if (granularity === "YEAR") {
    return { key: `${y}`, label: `${y}`, from: `${y}-01-01`, to: `${y}-12-31` };
  }
  if (granularity === "QUARTER") {
    const q = Math.floor(m / 3) + 1;
    const startMonth = (q - 1) * 3;
    const endMonth = startMonth + 2;
    return {
      key: `${y}-Q${q}`,
      label: `الربع ${ARABIC_QUARTER_NAMES[q - 1]} ${y}`,
      from: `${y}-${pad2(startMonth + 1)}-01`,
      to: `${y}-${pad2(endMonth + 1)}-${pad2(daysInMonth(y, endMonth))}`,
    };
  }
  return {
    key: `${y}-${pad2(m + 1)}`,
    label: `${ARABIC_MONTH_NAMES[m]} ${y}`,
    from: `${y}-${pad2(m + 1)}-01`,
    to: `${y}-${pad2(m + 1)}-${pad2(daysInMonth(y, m))}`,
  };
}

/** يُجمِّع معاملات مُحلَّلة فعلياً إلى ملخصات لكل فترة (شهر/ربع/سنة) —
 * جمع مباشر، لا تقدير. الرصيد الافتتاحي/الختامي لكل فترة هو أول/آخر قيمة
 * رصيد حقيقية وردت ضمنها (بترتيب التاريخ)، لا حساب مُشتق. */
export function bucketTransactions(txns: ParsedTransaction[], granularity: BucketGranularity): BucketSummary[] {
  interface Acc {
    bucket: PeriodBucket;
    credit: number;
    debit: number;
    count: number;
    sorted: ParsedTransaction[];
  }
  const buckets = new Map<string, Acc>();

  for (const t of txns) {
    const bucket = bucketKeyAndLabel(t.date, granularity);
    let acc = buckets.get(bucket.key);
    if (!acc) {
      acc = { bucket, credit: 0, debit: 0, count: 0, sorted: [] };
      buckets.set(bucket.key, acc);
    }
    acc.credit += t.credit ?? 0;
    acc.debit += t.debit ?? 0;
    acc.count++;
    acc.sorted.push(t);
  }

  const summaries: BucketSummary[] = [];
  for (const acc of buckets.values()) {
    acc.sorted.sort((a, b) => a.date.getTime() - b.date.getTime());
    const withBalance = acc.sorted.filter((t) => t.balance !== null);
    summaries.push({
      bucket: acc.bucket,
      credit: acc.credit,
      debit: acc.debit,
      net: acc.credit - acc.debit,
      count: acc.count,
      openingBalance: withBalance[0]?.balance ?? null,
      closingBalance: withBalance[withBalance.length - 1]?.balance ?? null,
    });
  }
  summaries.sort((a, b) => a.bucket.from.localeCompare(b.bucket.from));
  return summaries;
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function mergeTransactions(ledgers: ParsedLedger[]): ParsedTransaction[] {
  return ledgers.flatMap((l) => l.transactions).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function sourceIds(ledgers: ParsedLedger[]): string[] {
  return ledgers.map((l) => l.documentId);
}

function sourceNames(ledgers: ParsedLedger[]): string {
  return ledgers.map((l) => l.fileName).join("، ");
}

export interface ProposedTableColumn {
  key: string;
  label: string;
  align?: "start" | "center" | "end";
}
export interface ProposedTableRow {
  cells: string[];
  isTotal?: boolean;
}
export interface ProposedTable {
  /** معرّف مؤقت يستخدمه النموذج (lib/report-draft-ai.ts) للإشارة إلى هذا
   * الجدول عند اختياره — لا يُخزَّن كما هو، يُستبدَل بمعرّف قاعدة بيانات
   * حقيقي عند الحفظ. */
  key: string;
  title: string;
  subtitle?: string | null;
  columns: ProposedTableColumn[];
  rows: ProposedTableRow[];
  basisNote: string;
  computation: "DETERMINISTIC" | "AI_PROPOSED" | "MANUAL";
  sourceDocumentIds: string[];
  computationJson?: string | null;
}

export function buildYearlyMovementTable(ledgers: ParsedLedger[]): ProposedTable | null {
  const summaries = bucketTransactions(mergeTransactions(ledgers), "YEAR");
  if (summaries.length === 0) return null;

  const rows: ProposedTableRow[] = summaries.map((s) => ({
    cells: [s.bucket.label, formatAmount(s.debit), formatAmount(s.credit), formatAmount(s.net)],
  }));
  const totalDebit = summaries.reduce((sum, s) => sum + s.debit, 0);
  const totalCredit = summaries.reduce((sum, s) => sum + s.credit, 0);
  rows.push({
    cells: ["الإجمالي", formatAmount(totalDebit), formatAmount(totalCredit), formatAmount(totalCredit - totalDebit)],
    isTotal: true,
  });

  return {
    key: "yearly-movement",
    title: "الحركة المالية السنوية",
    columns: [
      { key: "period", label: "السنة المالية" },
      { key: "debit", label: "إجمالي المدين (المسحوبات)", align: "end" },
      { key: "credit", label: "إجمالي الدائن (الإيداعات)", align: "end" },
      { key: "net", label: "الصافي", align: "end" },
    ],
    rows,
    basisNote: `محسوبة آلياً من ${sourceNames(ledgers)} — إجمالي المدين والدائن لكل سنة مالية.`,
    computation: "DETERMINISTIC",
    sourceDocumentIds: sourceIds(ledgers),
    computationJson: JSON.stringify(summaries),
  };
}

export function buildQuarterlyMovementTable(ledgers: ParsedLedger[]): ProposedTable | null {
  const summaries = bucketTransactions(mergeTransactions(ledgers), "QUARTER");
  if (summaries.length === 0) return null;

  const rows: ProposedTableRow[] = summaries.map((s) => ({
    cells: [s.bucket.label, formatAmount(s.debit), formatAmount(s.credit), formatAmount(s.net)],
  }));
  const totalDebit = summaries.reduce((sum, s) => sum + s.debit, 0);
  const totalCredit = summaries.reduce((sum, s) => sum + s.credit, 0);
  rows.push({
    cells: ["الإجمالي", formatAmount(totalDebit), formatAmount(totalCredit), formatAmount(totalCredit - totalDebit)],
    isTotal: true,
  });

  return {
    key: "quarterly-movement",
    title: "مطابقة الحركة الربعية",
    columns: [
      { key: "period", label: "الفترة" },
      { key: "debit", label: "إجمالي المدين", align: "end" },
      { key: "credit", label: "إجمالي الدائن", align: "end" },
      { key: "net", label: "الصافي", align: "end" },
    ],
    rows,
    basisNote: `محسوبة آلياً من ${sourceNames(ledgers)}.`,
    computation: "DETERMINISTIC",
    sourceDocumentIds: sourceIds(ledgers),
    computationJson: JSON.stringify(summaries),
  };
}

/** جدول محوري: صف لكل شهر (يناير..ديسمبر)، عمود لكل سنة وُجدت معاملات
 * فيها — بنفس شكل جدول "المبيعات الشهرية" في التقرير المرجعي. القيمة
 * المعروضة هي إجمالي الدائن (الإيداعات) لكل شهر — تُستخدَم كمؤشر إيرادات
 * عند غياب عمود مبيعات صريح؛ يوضَّح هذا في basisNote صراحة. */
export function buildMonthlyMovementTable(ledgers: ParsedLedger[]): ProposedTable | null {
  const monthly = bucketTransactions(mergeTransactions(ledgers), "MONTH");
  if (monthly.length === 0) return null;

  const years = Array.from(new Set(monthly.map((m) => Number(m.bucket.key.split("-")[0])))).sort((a, b) => a - b);
  const byKey = new Map(monthly.map((m) => [m.bucket.key, m]));

  const rows: ProposedTableRow[] = [];
  for (let month = 0; month < 12; month++) {
    const cells = [ARABIC_MONTH_NAMES[month]];
    for (const year of years) {
      const summary = byKey.get(`${year}-${pad2(month + 1)}`);
      cells.push(summary ? formatAmount(summary.credit) : "—");
    }
    rows.push({ cells });
  }
  const totalsCells = ["الإجمالي"];
  for (const year of years) {
    const total = monthly
      .filter((m) => m.bucket.key.startsWith(`${year}-`))
      .reduce((sum, m) => sum + m.credit, 0);
    totalsCells.push(formatAmount(total));
  }
  rows.push({ cells: totalsCells, isTotal: true });

  return {
    key: "monthly-movement",
    title: "الحركة الشهرية (إجمالي الدائن/الإيداعات)",
    columns: [
      { key: "month", label: "الشهر" },
      ...years.map((y) => ({ key: `y${y}`, label: `${y}`, align: "end" as const })),
    ],
    rows,
    basisNote: `محسوبة آلياً من ${sourceNames(ledgers)} — إجمالي الإيداعات (الدائن) لكل شهر، كمؤشر على الحركة الإيرادية عند عدم وجود عمود مبيعات صريح في المستند.`,
    computation: "DETERMINISTIC",
    sourceDocumentIds: sourceIds(ledgers),
    computationJson: JSON.stringify(monthly),
  };
}

export function buildBankReconciliationTable(ledgers: ParsedLedger[]): ProposedTable | null {
  const summaries = bucketTransactions(mergeTransactions(ledgers), "YEAR").filter(
    (s) => s.openingBalance !== null || s.closingBalance !== null,
  );
  if (summaries.length === 0) return null;

  const rows: ProposedTableRow[] = summaries.map((s) => ({
    cells: [
      s.bucket.label,
      s.openingBalance !== null ? formatAmount(s.openingBalance) : "—",
      formatAmount(s.debit),
      formatAmount(s.credit),
      s.closingBalance !== null ? formatAmount(s.closingBalance) : "—",
    ],
  }));

  return {
    key: "bank-reconciliation",
    title: "مطابقة الحركة المالية المصرفية",
    columns: [
      { key: "period", label: "الفترة" },
      { key: "opening", label: "الرصيد الافتتاحي", align: "end" },
      { key: "debit", label: "إجمالي المدين (المسحوبات)", align: "end" },
      { key: "credit", label: "إجمالي الدائن (الإيداعات)", align: "end" },
      { key: "closing", label: "الرصيد الختامي", align: "end" },
    ],
    rows,
    basisNote: `الأرصدة كما وردت فعلياً بعمود الرصيد في ${sourceNames(ledgers)} — لم تُقارَن بالقوائم المالية المدققة (يتطلب ذلك مراجعة يدوية أو رفع القوائم المدققة).`,
    computation: "DETERMINISTIC",
    sourceDocumentIds: sourceIds(ledgers),
    computationJson: JSON.stringify(summaries),
  };
}

export function buildDailyAverageTable(ledgers: ParsedLedger[]): ProposedTable | null {
  const txns = mergeTransactions(ledgers);
  if (txns.length === 0) return null;

  const byYear = new Map<number, { total: number; days: Set<string> }>();
  for (const t of txns) {
    const y = t.date.getUTCFullYear();
    let entry = byYear.get(y);
    if (!entry) {
      entry = { total: 0, days: new Set() };
      byYear.set(y, entry);
    }
    entry.total += t.credit ?? 0;
    entry.days.add(t.date.toISOString().slice(0, 10));
  }

  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  const rows: ProposedTableRow[] = years.map((y) => {
    const { total, days } = byYear.get(y)!;
    const activeDays = days.size;
    const avg = activeDays > 0 ? total / activeDays : 0;
    return { cells: [`${y}`, formatAmount(total), `${activeDays}`, formatAmount(avg)] };
  });

  return {
    key: "daily-average",
    title: "متوسط المبيعات اليومية",
    columns: [
      { key: "year", label: "السنة المالية" },
      { key: "total", label: "إجمالي المبيعات", align: "end" },
      { key: "activeDays", label: "عدد أيام النشاط", align: "end" },
      { key: "average", label: "متوسط المبيعات اليومية", align: "end" },
    ],
    rows,
    basisNote: `«عدد أيام النشاط» = عدد الأيام التقويمية المميزة التي سُجِّلت فيها حركة دائنة فعلية بـ${sourceNames(
      ledgers,
    )}؛ الإجمالي = مجموع الدائن (الإيداعات) في تلك السنة، والمتوسط = الإجمالي ÷ عدد أيام النشاط.`,
    computation: "DETERMINISTIC",
    sourceDocumentIds: sourceIds(ledgers),
  };
}

export interface DeterministicTablesResult {
  byTaskIndex: Map<number, ProposedTable[]>;
  /** جداول على مستوى التقرير (نطاق الفحص) — فارغة في هذا الإصدار: جدول
   * الحصص/النسب في التقرير المرجعي مصدره بيانات ملكية الأطراف
   * (CaseParty.capacityNote) لا كشوف حساب، فليس له مقابل حتمي هنا؛ يبقى
   * AI_PROPOSED أو يُدخله الخبير يدوياً. */
  scopeTables: ProposedTable[];
  warnings: string[];
}

/** يمشي على كل مهمة، يحلّل مستندات xlsx/csv المرتبطة بها (بذاكرة تخزين
 * مؤقت بين المهام لتفادي إعادة تحليل نفس المستند)، ويعرض عليها بنّاءات
 * الجداول الخمسة أعلاه. مهمة بلا مستندات مالية قابلة للتحليل حتمياً لا
 * تحصل على أي جدول من هذا المسار — تبقى فرصتها الوحيدة عبر AI_PROPOSED. */
export async function buildDeterministicTables(aggregate: ReportAggregate): Promise<DeterministicTablesResult> {
  const byTaskIndex = new Map<number, ProposedTable[]>();
  const warnings: string[] = [];
  const ledgerCache = new Map<string, ParsedLedger | null>();

  async function getLedger(documentId: string): Promise<ParsedLedger | null> {
    if (ledgerCache.has(documentId)) return ledgerCache.get(documentId) ?? null;
    const doc = aggregate.documentsById.get(documentId);
    const parsed = doc
      ? await parseDocumentLedger({ id: doc.id, fileName: doc.fileName, fileKind: doc.fileKind, storedPath: doc.storedPath })
      : null;
    ledgerCache.set(documentId, parsed);
    return parsed;
  }

  for (const task of aggregate.tasks) {
    const ledgers: ParsedLedger[] = [];
    for (const documentId of task.linkedDocumentIds) {
      const ledger = await getLedger(documentId);
      if (ledger) {
        ledgers.push(ledger);
        warnings.push(...ledger.warnings);
      }
    }
    if (ledgers.length === 0) continue;

    const candidates = [
      buildYearlyMovementTable(ledgers),
      buildMonthlyMovementTable(ledgers),
      buildQuarterlyMovementTable(ledgers),
      buildBankReconciliationTable(ledgers),
      buildDailyAverageTable(ledgers),
    ].filter((t): t is ProposedTable => t !== null);

    if (candidates.length > 0) byTaskIndex.set(task.taskIndex, candidates);
  }

  return { byTaskIndex, scopeTables: [], warnings };
}
