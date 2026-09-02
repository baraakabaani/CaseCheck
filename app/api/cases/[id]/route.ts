import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
      parties: { orderBy: { order: "asc" } },
      requirements: {
        orderBy: { order: "asc" },
        include: {
          matches: { include: { document: true } },
        },
      },
      documents: { orderBy: { uploadedAt: "desc" } },
      emailDrafts: { orderBy: { createdAt: "desc" }, take: 5 },
      notices: { orderBy: { createdAt: "desc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
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

  const {
    claimants,
    respondents,
    clientEmail,
    title,
    committeeMembers,
    mandateNature,
    mandateDecisionDate,
    mandateReceivedDate,
    mandateAcceptedDate,
    nextHearingDate,
    reportDeadlineDate,
    ...rest
  } = parsed.data;

  const data: Prisma.CaseUpdateInput = { ...rest };
  if (title) data.title = title;
  if (clientEmail !== undefined) data.clientEmail = clientEmail || null;
  if (committeeMembers !== undefined) data.committeeMembers = JSON.stringify(committeeMembers);
  if (mandateNature !== undefined) data.mandateNature = JSON.stringify(mandateNature);
  if (mandateDecisionDate !== undefined) data.mandateDecisionDate = new Date(mandateDecisionDate);
  if (mandateReceivedDate !== undefined) {
    data.mandateReceivedDate = mandateReceivedDate ? new Date(mandateReceivedDate) : null;
  }
  if (mandateAcceptedDate !== undefined) {
    data.mandateAcceptedDate = mandateAcceptedDate ? new Date(mandateAcceptedDate) : null;
  }
  if (nextHearingDate !== undefined) {
    data.nextHearingDate = nextHearingDate ? new Date(nextHearingDate) : null;
  }
  if (reportDeadlineDate !== undefined) {
    data.reportDeadlineDate = reportDeadlineDate ? new Date(reportDeadlineDate) : null;
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // The party list is replaced wholesale only when the caller actually
      // sends claimants/respondents (the Phase-1 edit form always sends
      // both; Phase 2's mandate save never includes these fields, so it's
      // unaffected). Deleting a CaseParty is safe — Document.submittedByPartyId
      // is onDelete: SetNull, not a hard dependency.
      if (claimants !== undefined) {
        await tx.caseParty.deleteMany({ where: { caseId: id, role: "CLAIMANT" } });
        await tx.caseParty.createMany({
          data: claimants.map((name, order) => ({ caseId: id, role: "CLAIMANT", name, order })),
        });
      }
      if (respondents !== undefined) {
        await tx.caseParty.deleteMany({ where: { caseId: id, role: "RESPONDENT" } });
        await tx.caseParty.createMany({
          data: respondents.map((name, order) => ({ caseId: id, role: "RESPONDENT", name, order })),
        });
      }
      return tx.case.update({ where: { id }, data, include: { parties: { orderBy: { order: "asc" } } } });
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
