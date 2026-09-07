"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { DocumentInventory } from "@/lib/reports/report-aggregator";

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

const STATUS_LABELS: Record<string, string> = {
  PROVIDED: "مقدم بالكامل",
  PARTIALLY_PROVIDED: "مقدم جزئياً",
  MISSING: "غير مقدم",
  NOT_ANALYZED: "لم تتم المطابقة بعد",
  RECEIVED: "مكتملة ومطابقة",
  PARTIALLY_RECEIVED: "مستلمة جزئياً",
  PENDING: "مطلوبة",
};

/** حافظة المستندات — قراءة فقط، مُجمَّعة آلياً وقت آخر توليد للتقرير عبر
 * lib/reports/report-aggregator.ts؛ تُحدَّث بإعادة توليد التقرير، لا بالكتابة
 * اليدوية هنا. */
export function ReportDocumentsIndex({ inventoryJson }: { inventoryJson: string | null }) {
  const inventory = safeParseJson<DocumentInventory | null>(inventoryJson, null);

  if (!inventory || inventory.entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        لا توجد حافظة مستندات بعد — ستُبنى تلقائياً عند توليد التقرير.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>البند</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>المستندات المرفقة</TableHead>
              <TableHead>الطرف المقدِّم</TableHead>
              <TableHead>الفترة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventory.entries.map((entry) => (
              <TableRow key={`${entry.sourceKind}-${entry.sourceId}`}>
                <TableCell className="font-medium">{entry.label}</TableCell>
                <TableCell>
                  <Badge variant="outline">{STATUS_LABELS[entry.status] ?? entry.status}</Badge>
                </TableCell>
                <TableCell>
                  {entry.documents.length === 0
                    ? "—"
                    : entry.documents.map((d) => d.fileName).join("، ")}
                </TableCell>
                <TableCell>
                  {entry.documents.map((d) => d.submittedByPartyName).filter(Boolean).join("، ") || "—"}
                </TableCell>
                <TableCell>
                  {entry.documents.map((d) => d.periodLabel).filter(Boolean).join("، ") || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {inventory.unlinkedDocuments.length > 0 && (
        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm font-medium">مستندات مرفوعة لم تُربَط ببند مطلوب محدَّد</p>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {inventory.unlinkedDocuments.map((d) => (
              <li key={d.id}>- {d.fileName}</li>
            ))}
          </ul>
        </div>
      )}

      {inventory.missingItems.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">مستندات لم تُقدَّم بعد</p>
          <ul className="flex flex-col gap-1 text-sm text-amber-800 dark:text-amber-300">
            {inventory.missingItems.map((item, i) => (
              <li key={i}>
                - {item.label} ({STATUS_LABELS[item.status] ?? item.status})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
