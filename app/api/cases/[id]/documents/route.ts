import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveUploadedFile } from "@/lib/file-storage";
import { extractDocument } from "@/lib/document-parser";
import { DOC_CATEGORIES, type DocCategory } from "@/lib/schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;
  const documents = await prisma.document.findMany({
    where: { caseId },
    orderBy: { uploadedAt: "desc" },
  });
  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: caseId } = await params;

  const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "لم يتم إرفاق أي ملفات" }, { status: 400 });
  }

  // خانة الرفع (المرحلة 3) التي أتت منها هذه الدفعة — واحدة من الخانات
  // الخمس، محددة عند الرفع بدل تصنيفها لاحقاً بالذكاء الاصطناعي. طلبات
  // قديمة بدون هذا الحقل تبقى UNSPECIFIED كما كانت.
  const rawDocCategory = formData.get("docCategory");
  const docCategory: DocCategory =
    typeof rawDocCategory === "string" && (DOC_CATEGORIES as readonly string[]).includes(rawDocCategory)
      ? (rawDocCategory as DocCategory)
      : "UNSPECIFIED";

  const results = [];
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      results.push({ fileName: file.name, error: "حجم الملف يتجاوز 25 ميجابايت" });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const stored = await saveUploadedFile(caseId, file.name, buffer);
      const extracted = await extractDocument(buffer, file.name);

      const document = await prisma.document.create({
        data: {
          caseId,
          fileName: file.name,
          storedPath: stored.storedPath,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
          fileKind: extracted.fileKind,
          parseStatus: extracted.status,
          parseError: extracted.error ?? null,
          extractedText: extracted.text || null,
          detectedDates: JSON.stringify(extracted.detectedDates),
          detectedPeriod: extracted.note ?? null,
          pageCount: extracted.pageCount ?? null,
          docCategory,
        },
      });
      results.push({ fileName: file.name, document, parseError: extracted.error ?? null });
    } catch (err) {
      results.push({
        fileName: file.name,
        error: err instanceof Error ? err.message : "فشل رفع الملف",
      });
    }
  }

  // Uploading new documents invalidates any prior AI analysis for the case's
  // requirements — mark them for re-analysis rather than showing stale results.
  await prisma.requirement.updateMany({
    where: { caseId, manualOverride: false },
    data: { status: "NOT_ANALYZED" },
  });

  return NextResponse.json({ results }, { status: 201 });
}
