// الموديول 4 — صياغة نصية ثابتة (deterministic) فوق التجميعة الحتمية
// (lib/reports/report-aggregator.ts): نفس فلسفة lib/hearing-minutes.ts —
// مستند/سياق موثوق يجب أن يكون قابلاً للتنبؤ به بالكامل، لا مصدره احتمالي.
// تُستخدَم هذه الدوال في ثلاثة سياقات: (أ) سياق موجَّه لطلب الذكاء
// الاصطناعي (lib/report-draft-ai.ts) بحيث لا يُعاد سرد الجدول الزمني/الجرد
// من الصفر، (ب) مخرجات المحرك الاحتياطي بلا مفتاح API، (ج) تصدير Word.

import { formatDate } from "../format";
import { CASE_PARTY_ROLE_LABELS, DOC_CATEGORY_LABELS } from "../case-intake-labels";
import { TIMELINE_EVENT_LABELS } from "../case-hub-labels";
import type {
  ProceduralTimelineEvent,
  DocumentInventory,
  PartyClaimsSnapshot,
  AggregatedTask,
  ReportAggregateBasics,
} from "./report-aggregator";

const STATUS_LABELS: Record<string, string> = {
  PROVIDED: "مقدم بالكامل",
  PARTIALLY_PROVIDED: "مقدم جزئياً",
  MISSING: "غير مقدم",
  NOT_ANALYZED: "لم تتم المطابقة بعد",
  RECEIVED: "مكتملة ومطابقة",
  PARTIALLY_RECEIVED: "مستلمة جزئياً",
  PENDING: "مطلوبة",
};

export function buildProceduralTimelineText(events: ProceduralTimelineEvent[]): string {
  if (events.length === 0) return "لم تُسجَّل أي إجراءات بعد.";
  const lines: string[] = [];
  for (const e of events) {
    const dateLabel = `${formatDate(e.at)}${e.isEstimated ? " (تاريخ تقريبي)" : ""}${e.isFuture ? " (لم يحن بعد)" : ""}`;
    lines.push(`- ${dateLabel} — ${TIMELINE_EVENT_LABELS[e.kind]}${e.detail ? `: ${e.detail}` : ""}`);
  }
  return lines.join("\n");
}

export function buildDocumentInventoryText(inv: DocumentInventory): string {
  const lines: string[] = [];

  if (inv.entries.length === 0) {
    lines.push("لا توجد مستندات مُتحقَّق منها (مقدَّمة بالكامل أو جزئياً) حتى الآن.");
  } else {
    for (const entry of inv.entries) {
      lines.push(`- ${entry.label} (${STATUS_LABELS[entry.status] ?? entry.status})`);
      if (entry.documents.length === 0) {
        lines.push("  لا يوجد مستند مرتبط مباشرة مسجَّل في النظام.");
      } else {
        for (const doc of entry.documents) {
          const parts = [
            doc.fileName,
            doc.submittedByPartyName ? `مقدَّم من: ${doc.submittedByPartyName}` : null,
            doc.periodLabel ? `الفترة: ${doc.periodLabel}` : null,
            doc.pageRefs ? `صفحات: ${doc.pageRefs}` : null,
          ].filter(Boolean);
          lines.push(`  · ${parts.join(" — ")}`);
        }
      }
    }
  }

  if (inv.unlinkedDocuments.length > 0) {
    lines.push("");
    lines.push("مستندات مرفوعة لم تُربَط ببند مطلوب محدَّد:");
    for (const doc of inv.unlinkedDocuments) {
      lines.push(`- ${doc.fileName}${doc.submittedByPartyName ? ` (مقدَّم من: ${doc.submittedByPartyName})` : ""}`);
    }
  }

  if (inv.missingItems.length > 0) {
    lines.push("");
    lines.push("بنود لم تُقدَّم بعد:");
    for (const item of inv.missingItems) {
      lines.push(`- ${item.label} (${STATUS_LABELS[item.status] ?? item.status})`);
    }
  }

  return lines.join("\n");
}

function formatPartyName(p: { name: string; capacityNote?: string | null }): string {
  return p.capacityNote ? `${p.name} (${p.capacityNote})` : p.name;
}

export function buildPartiesOverviewText(
  basics: ReportAggregateBasics,
  parties: { role: string; name: string; capacityNote?: string | null }[],
  attendees: { name: string; role: string; representingParty: string | null; hasPoa: boolean }[],
): string {
  const lines: string[] = [];
  const claimants = parties.filter((p) => p.role === "CLAIMANT");
  const respondents = parties.filter((p) => p.role === "RESPONDENT");

  lines.push(`${CASE_PARTY_ROLE_LABELS.CLAIMANT}: ${claimants.map(formatPartyName).join("، ") || "غير محدد"}`);
  lines.push(`${CASE_PARTY_ROLE_LABELS.RESPONDENT}: ${respondents.map(formatPartyName).join("، ") || "غير محدد"}`);

  if (basics.appointmentCapacity === "SOLE_EXPERT") {
    lines.push("صفة الخبير: خبير حسابي منفرد.");
  } else if (basics.committeeMembers.length > 0) {
    lines.push(`لجنة الخبراء: ${basics.committeeMembers.map((m) => m.name).join("، ")}`);
  }

  const poaHolders = attendees.filter((a) => a.hasPoa);
  if (poaHolders.length > 0) {
    lines.push(
      `الوكلاء الحاضرون بموجب توكيل: ${poaHolders
        .map((a) => `${a.name}${a.representingParty ? ` (عن ${a.representingParty})` : ""}`)
        .join("، ")}`,
    );
  }

  return lines.join("\n");
}

/** أولاً: أطراف القضية — نص التقرير المرجعي: قائمة مرقّمة لكل صفة على
 * حدة ("المدعيان:-" / "المدعى عليهما:-")، لا فقرة سردية مثل
 * buildPartiesOverviewText (المُستخدَمة في القسم التمهيدي المختلف). */
export function buildPartiesListingText(
  parties: { role: string; name: string; capacityNote?: string | null }[],
): string {
  const claimants = parties.filter((p) => p.role === "CLAIMANT");
  const respondents = parties.filter((p) => p.role === "RESPONDENT");
  const numbered = (list: typeof parties) =>
    list.length > 0 ? list.map((p, i) => `${i + 1}) ${formatPartyName(p)}`).join("\n") : "غير محدد";

  return [
    `${CASE_PARTY_ROLE_LABELS.CLAIMANT}:-`,
    numbered(claimants),
    "",
    `${CASE_PARTY_ROLE_LABELS.RESPONDENT}:-`,
    numbered(respondents),
  ].join("\n");
}

export function buildIntroductionText(
  basics: ReportAggregateBasics,
  mandate: { mandateText: string | null },
): string {
  const claimantsPart = basics.court ? ` أمام ${basics.court}` : "";
  const mandateNature = basics.mandateNatureLabels.length > 0 ? ` بشأن ${basics.mandateNatureLabels.join("، ")}` : "";
  const lines = [
    `تقرير الخبرة الحسابية في الدعوى رقم ${basics.caseNumber} — ${basics.title}${claimantsPart}${mandateNature}.`,
  ];
  if (mandate.mandateText) {
    lines.push("");
    lines.push(`نص المأمورية كما ورد في الحكم/القرار الصادر بالندب:`);
    lines.push(mandate.mandateText);
  }
  return lines.join("\n");
}

export function buildTaskExhibitsText(task: AggregatedTask): string {
  if (task.exhibitLinks.length === 0) {
    return "لا توجد مستندات مرتبطة بهذه المهمة حتى الآن.";
  }
  return task.exhibitLinks
    .map((l) => {
      const viaLabel =
        l.via === "REQUIREMENT"
          ? `عبر متطلب: ${l.sourceLabel}`
          : l.via === "DEMAND"
            ? `عبر مطالبة مستند: ${l.sourceLabel}`
            : `ربط مقترح تلقائياً بناءً على: ${l.sourceLabel}`;
      return `- ${l.fileName} (${viaLabel})`;
    })
    .join("\n");
}

export function buildMissingDocsImpactText(task: AggregatedTask): string {
  if (task.missingItems.length === 0) {
    return "لا توجد مستندات ناقصة مرتبطة بهذه المهمة تحديداً في الوقت الحالي.";
  }
  const lines = ["مستندات لم تُقدَّم بعد وتؤثر على استكمال هذه المهمة:"];
  for (const item of task.missingItems) {
    lines.push(
      `- ${item.label} (${STATUS_LABELS[item.status] ?? item.status}${
        item.deadline ? ` — الموعد النهائي: ${formatDate(item.deadline)}` : ""
      })`,
    );
  }
  return lines.join("\n");
}

/** ثامناً: الخلاصة — الفقرة الافتتاحية والختامية نصّان قالبيّان ثابتان
 * (EXTRACT، لا AI_DRAFT) لأنهما صيغة شكلية رسمية لا تحليل فيها، تماماً كمنطق
 * buildMissingDocsImpactText؛ البنود المرقّمة نفسها (conclusionItemsJson)
 * تُبنى في مسار التوليد من "رأي الخبرة" المعتمَد لكل مهمة، لا من هنا. */
export function buildConclusionIntroText(basics: ReportAggregateBasics): string {
  return `بناءً على ما تقدَّم من دراسة وتمحيص لكافة المستندات والمذكرات المقدَّمة من طرفي الدعوى، ووفقاً لما جاء بالمأمورية المكلَّف بها الخبير في الدعوى رقم ${basics.caseNumber}، فقد توصَّل الخبير إلى الخلاصة التالية:`;
}

export function buildConclusionClosingText(expertProfile: { expertTitle: string; expertName: string; registrationNumber: string } | null): string {
  const signatureLines =
    expertProfile && expertProfile.expertName.trim()
      ? [expertProfile.expertTitle, expertProfile.expertName, expertProfile.registrationNumber ? `رقم القيد: ${expertProfile.registrationNumber}` : null]
          .filter(Boolean)
          .join("\n")
      : "لم يُعرَّف اسم الخبير بعد — أضفه من زر «الملف التعريفي للخبير» أعلى الصفحة قبل الاعتماد النهائي.";
  return `وعليه، يرفع الخبير المنتدب هذا التقرير لعدالة المحكمة الموقرة لتقضي فيه بما تراه محققاً لوجه الحق والعدالة.\n\n${signatureLines}`;
}

export function buildPartyClaimsBlock(claims: PartyClaimsSnapshot): string {
  const lines: string[] = [];

  const renderSide = (label: string, side: PartyClaimsSnapshot["claimant"]) => {
    lines.push(`${label} (${side.partyNames.join("، ") || "غير محدد"}):`);
    if (side.pleadingDigests.length === 0 && side.hearingStatements.length === 0 && side.fieldStatements.length === 0) {
      lines.push("  لا توجد مواقف أو إفادات مسجَّلة لهذا الطرف حتى الآن.");
      return;
    }
    for (const d of side.pleadingDigests) {
      lines.push(`  · [${DOC_CATEGORY_LABELS[d.docCategory as keyof typeof DOC_CATEGORY_LABELS] ?? d.docCategory} — ${d.fileName}] ${d.digest}`);
    }
    for (const s of side.hearingStatements) {
      lines.push(`  · [إفادة في ${s.sessionLabel} رداً على: "${s.questionText}"] ${s.answerText}`);
    }
    for (const f of side.fieldStatements) {
      lines.push(`  · [إفادة ميدانية بتاريخ ${formatDate(f.visitDate)} — ${f.personName}${f.personRole ? ` (${f.personRole})` : ""}] ${f.statementText}`);
    }
  };

  renderSide(CASE_PARTY_ROLE_LABELS.CLAIMANT, claims.claimant);
  lines.push("");
  renderSide(CASE_PARTY_ROLE_LABELS.RESPONDENT, claims.respondent);

  if (claims.unattributedPleadingDigests.length > 0) {
    lines.push("");
    lines.push("مستندات مذكرات/لوائح لم يُحدَّد مقدِّمها بعد:");
    for (const d of claims.unattributedPleadingDigests) {
      lines.push(`  · [${d.fileName}] ${d.digest}`);
    }
  }

  return lines.join("\n");
}
