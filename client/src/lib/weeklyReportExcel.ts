import { buildWorkbookXlsx, type XlsxColumn, type XlsxRow } from "@/lib/xlsxStore";
import { WEEKLY_REPORT_DIRECT_MANAGER_NAME } from "@/lib/weeklyReportConfig";
import type { WeeklyReportWordData } from "@/lib/weeklyReportWord";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function safeFileName(value: string) {
  return String(value || "موظف")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadWeeklyReportExcel(report: WeeklyReportWordData) {
  const employeeName = text(report.createdByName) || "موظف";
  const reportDate = text(report.reportDate) || "بدون تاريخ";
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

  const summaryRows: XlsxRow[] = [
    { field: "اسم الموظف", value: employeeName },
    { field: "المسمى الوظيفي", value: text(report.jobTitle) },
    { field: "التاريخ", value: reportDate },
    { field: "عدد المهام", value: tasks.length },
  ];

  const taskRows: XlsxRow[] = tasks.map((task, index) => ({
    number: index + 1,
    title: text(task.title),
    description: text(task.description),
    managerName: WEEKLY_REPORT_DIRECT_MANAGER_NAME,
    progress: text(task.progress),
  }));

  const notesRows: XlsxRow[] = [
    {
      label: "ملاحظات المدير المباشر",
      notes: text(report.managerNotes),
    },
  ];

  const fieldColumns: XlsxColumn[] = [
    { key: "field", header: "البيان", width: 24 },
    { key: "value", header: "القيمة", width: 44 },
  ];
  const taskColumns: XlsxColumn[] = [
    { key: "number", header: "رقم", width: 10, align: "center" },
    { key: "title", header: "المهام اليومية", width: 28 },
    { key: "description", header: "الوصف", width: 52 },
    { key: "managerName", header: "الموظف المسؤول/المدير المباشر", width: 34 },
    { key: "progress", header: "معدل الإنجاز", width: 18, align: "center" },
  ];

  const blob = await buildWorkbookXlsx({
    title: `تقرير العمل الأسبوعي - ${employeeName}`,
    creator: "MAEDIN",
    description: `تقرير العمل الأسبوعي للموظف ${employeeName} بتاريخ ${reportDate}`,
    sheets: [
      {
        name: "بيانات التقرير",
        title: "نموذج تقرير عمل أسبوعي",
        subtitle: `${employeeName} | ${reportDate}`,
        headerTone: "navy",
        tabColor: "030640",
        rightToLeft: true,
        zoomScale: 120,
        columns: fieldColumns,
        rows: summaryRows,
      },
      {
        name: "المهام اليومية",
        title: "المهام اليومية",
        subtitle: "نفس أعمدة نموذج التقرير داخل البوابة",
        headerTone: "amber",
        tabColor: "F2B705",
        rightToLeft: true,
        zoomScale: 120,
        columns: taskColumns,
        rows: taskRows,
      },
      {
        name: "ملاحظات المدير",
        title: "ملاحظات المدير المباشر",
        subtitle: `${employeeName} | ${reportDate}`,
        headerTone: "slate",
        tabColor: "334155",
        rightToLeft: true,
        zoomScale: 120,
        columns: [
          { key: "label", header: "البند", width: 28 },
          { key: "notes", header: "الملاحظات", width: 72 },
        ],
        rows: notesRows,
      },
    ],
  });

  downloadBlob(
    blob,
    `تقرير العمل الأسبوعي - ${safeFileName(employeeName)} - ${safeFileName(
      reportDate
    )}.xlsx`
  );
}
