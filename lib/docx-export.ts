import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";

export interface EmailDocxInput {
  subject: string;
  bodyAr: string;
}

export async function buildEmailDocxBlob({ subject, bodyAr }: EmailDocxInput): Promise<Blob> {
  const bodyParagraphs = bodyAr.split("\n").map(
    (line) =>
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { after: 160 },
        children: [new TextRun({ text: line, rightToLeft: true, font: "Arial" })],
      }),
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.RIGHT,
            spacing: { after: 300 },
            children: [
              new TextRun({
                text: subject,
                bold: true,
                size: 28,
                rightToLeft: true,
                font: "Arial",
              }),
            ],
          }),
          ...bodyParagraphs,
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
