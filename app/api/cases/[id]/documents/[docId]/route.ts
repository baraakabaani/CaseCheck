import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteStoredFile, readStoredFile } from "@/lib/file-storage";

interface RouteParams {
  params: Promise<{ id: string; docId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: caseId, docId } = await params;
  const doc = await prisma.document.findFirst({ where: { id: docId, caseId } });
  if (!doc) {
    return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const buffer = await readStoredFile(doc.storedPath);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: caseId, docId } = await params;
  const doc = await prisma.document.findFirst({ where: { id: docId, caseId } });
  if (!doc) {
    return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
  }

  await deleteStoredFile(doc.storedPath);
  await prisma.document.delete({ where: { id: docId } });

  await prisma.requirement.updateMany({
    where: { caseId, manualOverride: false },
    data: { status: "NOT_ANALYZED" },
  });

  return NextResponse.json({ ok: true });
}
