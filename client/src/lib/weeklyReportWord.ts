import { WEEKLY_REPORT_DIRECT_MANAGER_NAME } from "@/lib/weeklyReportConfig";
import { loadWeeklyReportLetterhead } from "@/lib/weeklyReportLetterhead";

export type WeeklyReportTask = {
  index: number;
  title: string;
  description: string;
  managerName: string;
  progress: string;
};

export type WeeklyReportWordData = {
  createdByName: string;
  jobTitle: string;
  reportDate: string;
  tasks: WeeklyReportTask[];
  managerNotes: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function downloadWeeklyReportWord(report: WeeklyReportWordData) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Header,
    HorizontalPositionRelativeFrom,
    ImageRun,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    TextWrappingType,
    VerticalPositionRelativeFrom,
    WidthType,
  } = await import("docx");
  const letterheadImage = await loadWeeklyReportLetterhead();
  const letterheadHeader = letterheadImage
    ? new Header({
        children: [
          new Paragraph({
            children: [
              new ImageRun({
                type: "png",
                data: letterheadImage,
                transformation: {
                  width: 794,
                  height: 1123,
                },
                floating: {
                  horizontalPosition: {
                    relative: HorizontalPositionRelativeFrom.PAGE,
                    offset: 0,
                  },
                  verticalPosition: {
                    relative: VerticalPositionRelativeFrom.PAGE,
                    offset: 0,
                  },
                  allowOverlap: true,
                  behindDocument: true,
                  layoutInCell: true,
                  lockAnchor: true,
                  margins: {
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                  },
                  wrap: {
                    type: TextWrappingType.NONE,
                  },
                },
                altText: {
                  title: "MAEDIN weekly report letterhead",
                  description: "MAEDIN report background",
                },
              }),
            ],
          }),
        ],
      })
    : null;
  const tableBorder = {
    style: BorderStyle.SINGLE,
    size: 8,
    color: "111827",
  };
  const cell = (content: string, options?: { bold?: boolean; width?: number }) =>
    new TableCell({
      width: options?.width
        ? { size: options.width, type: WidthType.PERCENTAGE }
        : undefined,
      margins: { top: 120, bottom: 120, left: 120, right: 120 },
      borders: {
        top: tableBorder,
        bottom: tableBorder,
        left: tableBorder,
        right: tableBorder,
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          bidirectional: true,
          children: [
            new TextRun({
              text: content || " ",
              bold: options?.bold,
              size: 22,
              font: "Arial",
            }),
          ],
        }),
      ],
    });
  const fieldRow = (label: string, value: string) =>
    new TableRow({
      children: [
        cell(label, { bold: true, width: 26 }),
        cell(value, { width: 74 }),
      ],
    });
  const tasks = report.tasks.length
    ? report.tasks
    : [
        {
          index: 1,
          title: "",
          description: "",
          managerName: WEEKLY_REPORT_DIRECT_MANAGER_NAME,
          progress: "",
        },
      ];

  const doc = new Document({
    sections: [
      {
        headers: letterheadHeader ? { default: letterheadHeader } : undefined,
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1900, bottom: 1250, left: 720, right: 720 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            bidirectional: true,
            spacing: { after: 300 },
            children: [
              new TextRun({
                text: "نموذج تقرير عمل اسبوعي",
                bold: true,
                size: 36,
                font: "Arial",
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              fieldRow("اسم الموظف", text(report.createdByName)),
              fieldRow("المسمى الوظيفي", text(report.jobTitle)),
              fieldRow("التاريخ", text(report.reportDate)),
            ],
          }),
          new Paragraph({ text: "", spacing: { after: 220 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  cell("رقم", { bold: true, width: 8 }),
                  cell("المهام اليومية", { bold: true, width: 22 }),
                  cell("الوصف", { bold: true, width: 36 }),
                  cell("الموظف المسؤول/المدير المباشر", {
                    bold: true,
                    width: 22,
                  }),
                  cell("معدل الإنجاز", { bold: true, width: 12 }),
                ],
              }),
              ...tasks.map((task, taskIndex) =>
                new TableRow({
                  children: [
                    cell(String(taskIndex + 1), { width: 8 }),
                    cell(text(task.title), { width: 22 }),
                    cell(text(task.description), { width: 36 }),
                    cell(WEEKLY_REPORT_DIRECT_MANAGER_NAME, { width: 22 }),
                    cell(text(task.progress), { width: 12 }),
                  ],
                })
              ),
            ],
          }),
          new Paragraph({ text: "", spacing: { after: 220 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              fieldRow("ملاحظات المدير المباشر", text(report.managerNotes)),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = text(report.createdByName).replace(/[\\/:*?"<>|]+/g, "-");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `تقرير العمل الأسبوعي - ${safeName || "موظف"} - ${
    text(report.reportDate) || "بدون تاريخ"
  }.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
