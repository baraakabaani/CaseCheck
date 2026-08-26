import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateCaseSchema } from "@/lib/schemas";
import { deleteStoredFile } from "@/lib/file-storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const found = await prisma.case.findUnique({
    where: { id },
    include: {
      requirements: {
        orderBy: { order: "asc" },
        include: {
          matches: { include: { document: true } },
        },
      },
      documents: { orderBy: { uploadedAt: "desc" } },
      emailDrafts: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!found) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }

  return NextResponse.json({ case: found });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { requirements: _requirements, clientEmail, ...rest } = parsed.data;
  void _requirements; // requirements are managed via their own sub-resource

  try {
    const updated = await prisma.case.update({
      where: { id },
      data: {
        ...rest,
        ...(clientEmail !== undefined ? { clientEmail: clientEmail || null } : {}),
      },
    });
    return NextResponse.json({ case: updated });
  } catch {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const existing = await prisma.case.findUnique({
    where: { id },
    include: { documents: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "الدعوى غير موجودة" }, { status: 404 });
  }

  await Promise.all(existing.documents.map((d) => deleteStoredFile(d.storedPath)));
  await prisma.case.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
