"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { computeLiquidation, formatAed, beneficiaryLabel, type LiquidationTaskLike } from "@/lib/reports/liquidation";

export function ForensicLiquidationTable({
  tasks,
  onJumpToTask,
}: {
  tasks: LiquidationTaskLike[];
  onJumpToTask?: (taskId: string) => void;
}) {
  const liquidation = computeLiquidation(tasks);

  if (liquidation.rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        لا توجد أي مهمة تحمل مبلغاً معتمَداً بعد — أدخل مطالبة المدعي و/أو مقاصة المدعى عليه ضمن
        قسم كل مهمة في «البحث والدراسة» ليظهر صفها هنا تلقائياً.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المهمة</TableHead>
              <TableHead>مطالبة المدعي (درهم)</TableHead>
              <TableHead>خصم/مقاصة المدعى عليه (درهم)</TableHead>
              <TableHead>الصافي</TableHead>
              <TableHead>سند الرقم</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {liquidation.rows.map((row) => (
              <TableRow key={row.taskId} className={!row.verdictCertified ? "bg-amber-50 dark:bg-amber-950/20" : undefined}>
                <TableCell className="max-w-64">
                  <button
                    type="button"
                    onClick={() => onJumpToTask?.(row.taskId)}
                    className="text-start font-medium underline-offset-2 hover:underline"
                  >
                    مهمة {row.taskIndex + 1}: {row.taskLabel}
                  </button>
                  {!row.verdictCertified && (
                    <Badge variant="outline" className="mt-1 gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-3" />
                      رأي الخبرة لهذه المهمة غير معتمد بعد
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{formatAed(row.claimantAmount)}</TableCell>
                <TableCell className="tabular-nums">{formatAed(row.respondentOffset)}</TableCell>
                <TableCell className="font-medium tabular-nums">{formatAed(row.net)}</TableCell>
                <TableCell className="max-w-48 truncate text-sm text-muted-foreground">{row.amountNote || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-1 rounded-md border bg-muted/30 p-4">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span>إجمالي مطالبات المدعي المعتمدة</span>
          <span className="font-medium tabular-nums">{formatAed(liquidation.totalClaimant)}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span>إجمالي مقاصات/مسدَّدات المدعى عليه المعتمدة</span>
          <span className="font-medium tabular-nums">{formatAed(liquidation.totalRespondent)}</span>
        </div>
        <div className="mt-1 flex flex-wrap justify-between gap-2 border-t pt-2 text-base font-semibold">
          <span>صافي نتيجة التصفية</span>
          <span className="tabular-nums text-primary">
            {formatAed(Math.abs(liquidation.netDue))} {beneficiaryLabel(liquidation.beneficiaryRole)}
          </span>
        </div>
      </div>

      {liquidation.uncertifiedRowCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5" />
          {liquidation.uncertifiedRowCount} من الأرقام أعلاه ضمن مهمة لم يُعتمد رأي الخبرة فيها بعد.
        </p>
      )}
    </div>
  );
}
