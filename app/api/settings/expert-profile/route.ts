import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { EXPERT_PROFILE_ID, expertProfileSchema } from "@/lib/expert-profile-schemas";

// بيانات الخبير الحسابي — سجل واحد ثابت لكامل التطبيق (لا مستخدمين
// متعددين هنا)، يُستخدم في غلاف تقرير الخبرة وفي نموذج الإخطار.
export async function GET() {
  const profile = await prisma.expertProfile.findUnique({ where: { id: EXPERT_PROFILE_ID } });
  return NextResponse.json({ profile });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = expertProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة", issues: parsed.error.issues }, { status: 400 });
  }

  const profile = await prisma.expertProfile.upsert({
    where: { id: EXPERT_PROFILE_ID },
    create: { id: EXPERT_PROFILE_ID, ...parsed.data },
    update: parsed.data,
  });

  return NextResponse.json({ profile });
}
