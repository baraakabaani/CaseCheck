import { composeNotice, type NoticeContext, type NoticeCaseContext } from "@/lib/notice-templates";
import type { NoticeAddressee } from "@/lib/notice-schemas";
import type { NoticeDetail } from "@/lib/queries";

function parseNoticeRecord(notice: NoticeDetail): NoticeContext {
  return {
    ...notice,
    addressees: JSON.parse(notice.addressees) as NoticeAddressee[],
    requestedItems: JSON.parse(notice.requestedItems) as string[],
  };
}

export function NoticeDocument({
  notice,
  caseCtx,
}: {
  notice: NoticeDetail;
  caseCtx: NoticeCaseContext;
}) {
  const parsed = parseNoticeRecord(notice);
  const c = composeNotice(parsed, caseCtx);

  return (
    <div className="notice-paper">
      <div className="notice-bg-image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/letterhead/notice-page1.png" alt="" />
      </div>

      <div className="notice-content text-[13px] leading-8">
        <div className="text-left font-medium" dir="ltr">
          <span className="ms-auto block w-fit" dir="rtl">
            {c.dateLine}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {c.addresseeBlocks.map((block, i) => (
            <div key={i}>
              <div className="font-semibold">{block.lawFirmLine}</div>
              <div className="font-semibold">{block.roleLine}</div>
              {block.nameLines.map((name, j) => (
                <div key={j}>{name}</div>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-4">{c.greeting}</div>

        <div className="mt-4 text-center">
          <div className="font-bold underline underline-offset-4">{c.subjectLine1}</div>
          <div className="font-bold underline underline-offset-4">{c.subjectLine2}</div>
        </div>

        <p className="mt-4 text-justify">{c.bodyIntro}</p>

        <ol className="mt-2 flex flex-col gap-1.5 ps-5">
          {c.numberedItems.map((item, i) => (
            <li key={i} className="list-decimal whitespace-pre-line text-justify">
              {item}
            </li>
          ))}
        </ol>

        <p className="mt-3 text-justify">{c.reminderNote}</p>

        <div className="mt-8 text-center">
          <p>{c.closingLine}</p>
          <p className="mt-4">{c.signature.expertTitle}</p>
          <p className="font-semibold">{c.signature.expertName}</p>
          <p>{c.signature.regLine}</p>
        </div>
      </div>
    </div>
  );
}
