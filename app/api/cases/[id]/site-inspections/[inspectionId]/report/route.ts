import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildSiteInspectionReportText } from "@/lib/site-inspection-report";

interface RouteParams {
  params: Promise<{ id: string; inspectionId: string }>;
}

function safeParseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// توليد مسودة محضر الانتقال والمعاينة من البيانات المنظمة المسجَّلة —
// انظر lib/site-inspection-report.ts (لا يستدعي الذكاء الاصطناعي).
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, inspectionId } = await params;

  const [caseRecord, inspection] = await Promise.all([
    prisma.case.findUnique({ where: { id: caseId } }),
    prisma.siteInspection.findFirst({
      where: { id: inspectionId, caseId },
      include: { testimonies: { orderBy: { order: "asc" } } },
    }),
  ]);
  if (!caseRecord || !inspection) {
    return NextResponse.json({ error: "الدعوى أو سجل المعاينة غير موجود" }, { status: 404 });
  }

  const visitReportDraft = buildSiteInspectionReportText({
    caseNumber: caseRecord.caseNumber,
    court: caseRecord.court,
    visitDate: inspection.visitDate,
    location: inspection.location,
    purpose: inspection.purpose,
    attendees: safeParseJson<string[]>(inspection.attendees, []),
    equipmentReviewed: inspection.equipmentReviewed,
    booksReviewed: inspection.booksReviewed,
    notes: inspection.notes,
    testimonies: inspection.testimonies.map((t) => ({
      personName: t.personName,
      personRole: t.personRole,
      statementText: t.statementText,
    })),
  });

  const updated = await prisma.siteInspection.update({
    where: { id: inspectionId },
    data: { visitReportDraft },
  });

  return NextResponse.json({ inspection: updated });
}
