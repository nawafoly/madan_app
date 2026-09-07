export type PayrollExportEmployee = {
  employeeId?: string;
  employeeNumber?: string | null;
  displayName: string;
  jobTitle?: string | null;
  department?: string | null;
  status?: string;
  readiness?: { ready?: boolean; code?: string; message?: string } | null;
  attendance?: Record<string, number | string | boolean | null | undefined>;
  absences?: Record<string, number | string | boolean | null | undefined>;
  baseSalaryHalalas?: number;
  allowancesHalalas?: number;
  attendanceDeductionHalalas?: number;
  absenceDeductionHalalas?: number;
  overtimeHalalas?: number;
  manualAdditionsHalalas?: number;
  manualDeductionsHalalas?: number;
  grossSalaryHalalas?: number;
  totalDeductionsHalalas?: number;
  netSalaryHalalas?: number;
  notes?: string | null;
};

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cell(value: unknown, type: "String" | "Number" = "String", style = "") {
  const attr = style ? ` ss:StyleID="${style}"` : "";
  return `<Cell${attr}><Data ss:Type="${type}">${xml(value)}</Data></Cell>`;
}

function row(values: Array<{ value: unknown; type?: "String" | "Number"; style?: string }>) {
  return `<Row>${values.map(item => cell(item.value, item.type || "String", item.style || "")).join("")}</Row>`;
}

function workbook(sheetName: string, rows: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style>
  <Style ss:ID="title"><Alignment ss:Horizontal="Right"/><Font ss:FontName="Arial" ss:Size="16" ss:Bold="1"/></Style>
  <Style ss:ID="header"><Alignment ss:Horizontal="Center"/><Font ss:FontName="Arial" ss:Bold="1"/></Style>
  <Style ss:ID="money"><NumberFormat ss:Format="0.00"/></Style>
 </Styles>
 <Worksheet ss:Name="${xml(sheetName.slice(0, 31))}">
  <Table>${rows.join("\n")}</Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><DisplayRightToLeft/></WorksheetOptions>
 </Worksheet>
</Workbook>`;
}

function money(halalas: unknown) {
  const number = Number(halalas || 0);
  return Number.isFinite(number) ? Math.round(number) / 100 : 0;
}

function downloadXml(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "payroll";
}

export function downloadWorkforceEmployeePayrollExcel(report: any) {
  const p = report.payroll || {};
  const a = report.attendance || {};
  const abs = report.absences || {};
  const rows = [
    row([{ value: `تقرير راتب الموظف - ${report.monthKey}`, style: "title" }]),
    row([{ value: "الموظف", style: "header" }, { value: report.employee?.displayName || "" }]),
    row([{ value: "الرقم الوظيفي", style: "header" }, { value: report.employee?.employeeNumber || "" }]),
    row([{ value: "المسمى", style: "header" }, { value: report.employee?.jobTitle || "" }]),
    row([{ value: "القسم", style: "header" }, { value: report.employee?.department || "" }]),
    row([{ value: "الحالة", style: "header" }, { value: report.lifecycle?.status || "not_generated" }]),
    row([{ value: "الراتب الأساسي", style: "header" }, { value: money(p.baseSalaryHalalas), type: "Number", style: "money" }]),
    row([{ value: "البدلات", style: "header" }, { value: money(p.allowancesHalalas), type: "Number", style: "money" }]),
    row([{ value: "إضافي/وقت إضافي", style: "header" }, { value: money(p.overtimeHalalas), type: "Number", style: "money" }]),
    row([{ value: "إضافات يدوية", style: "header" }, { value: money(p.manualAdditionsHalalas), type: "Number", style: "money" }]),
    row([{ value: "خصم حضور", style: "header" }, { value: money(p.attendanceDeductionHalalas), type: "Number", style: "money" }]),
    row([{ value: "خصم غياب", style: "header" }, { value: money(p.absenceDeductionHalalas), type: "Number", style: "money" }]),
    row([{ value: "خصومات يدوية", style: "header" }, { value: money(p.manualDeductionsHalalas), type: "Number", style: "money" }]),
    row([{ value: "إجمالي الاستقطاعات", style: "header" }, { value: money(p.totalDeductionsHalalas), type: "Number", style: "money" }]),
    row([{ value: "الإجمالي", style: "header" }, { value: money(p.grossSalaryHalalas), type: "Number", style: "money" }]),
    row([{ value: "صافي الراتب", style: "header" }, { value: money(p.netSalaryHalalas), type: "Number", style: "money" }]),
    row([{ value: "دقائق التأخير", style: "header" }, { value: Number(a.lateMinutes || 0), type: "Number" }]),
    row([{ value: "دقائق الخروج المبكر", style: "header" }, { value: Number(a.earlyLeaveMinutes || 0), type: "Number" }]),
    row([{ value: "دقائق الحضور الناقصة", style: "header" }, { value: Number(a.attendanceMissingMinutes || 0), type: "Number" }]),
    row([{ value: "أيام/وحدات الغياب", style: "header" }, { value: Number(abs.absenceUnits || 0), type: "Number" }]),
    row([{ value: "ملاحظات", style: "header" }, { value: report.notes || "" }]),
  ];
  if (Array.isArray(report.activeAdjustments) && report.activeAdjustments.length) {
    rows.push(row([{ value: "التعديلات اليدوية", style: "title" }]));
    rows.push(row(["النوع", "الاتجاه", "المبلغ", "السبب", "الملاحظة"].map(value => ({ value, style: "header" }))));
    for (const item of report.activeAdjustments) {
      rows.push(row([
        { value: item.kind }, { value: item.direction }, { value: money(item.amountHalalas), type: "Number", style: "money" },
        { value: item.reason }, { value: item.note || "" },
      ]));
    }
  }
  downloadXml(`${safeName(report.employee?.displayName || "employee")}-${report.monthKey}-payroll.xls`, workbook("راتب الموظف", rows));
}

export function downloadWorkforceMonthlyPayrollExcel(report: any) {
  const headers = [
    "الرقم الوظيفي", "الموظف", "المسمى", "القسم", "الحالة", "جاهزية الحضور", "حالة الربط",
    "الراتب الأساسي", "البدلات", "التأخير (دقيقة)", "الخروج المبكر (دقيقة)", "النقص (دقيقة)",
    "وحدات الغياب", "خصم الحضور", "خصم الغياب", "الوقت الإضافي", "الإضافات اليدوية", "الخصومات اليدوية",
    "الإجمالي", "إجمالي الاستقطاعات", "الصافي", "تاريخ الدفع", "ملاحظات",
  ];
  const rows = [
    row([{ value: `المسير الشهري - ${report.monthKey}`, style: "title" }]),
    row(headers.map(value => ({ value, style: "header" }))),
  ];
  for (const item of report.employees || []) {
    rows.push(row([
      { value: item.employeeNumber || "" }, { value: item.displayName }, { value: item.jobTitle || "" }, { value: item.department || "" },
      { value: item.status }, { value: item.readiness?.ready === true ? "جاهز" : item.readiness?.message || "غير جاهز" },
      { value: item.attendanceLinkStatus || "" },
      { value: money(item.baseSalaryHalalas), type: "Number", style: "money" }, { value: money(item.allowancesHalalas), type: "Number", style: "money" },
      { value: Number(item.attendance?.lateMinutes || 0), type: "Number" }, { value: Number(item.attendance?.earlyLeaveMinutes || 0), type: "Number" },
      { value: Number(item.attendance?.attendanceMissingMinutes || 0), type: "Number" }, { value: Number(item.absences?.absenceUnits || 0), type: "Number" },
      { value: money(item.attendanceDeductionHalalas), type: "Number", style: "money" }, { value: money(item.absenceDeductionHalalas), type: "Number", style: "money" },
      { value: money(item.overtimeHalalas), type: "Number", style: "money" }, { value: money(item.manualAdditionsHalalas), type: "Number", style: "money" },
      { value: money(item.manualDeductionsHalalas), type: "Number", style: "money" }, { value: money(item.grossSalaryHalalas), type: "Number", style: "money" },
      { value: money(item.totalDeductionsHalalas), type: "Number", style: "money" }, { value: money(item.netSalaryHalalas), type: "Number", style: "money" },
      { value: item.payDate || "" }, { value: item.notes || "" },
    ]));
  }
  downloadXml(`workforce-payroll-${report.monthKey}.xls`, workbook("المسير الشهري", rows));
}

export function printWorkforceEmployeePayrollReport(report: any) {
  const p = report.payroll || {};
  const a = report.attendance || {};
  const abs = report.absences || {};
  const pairs = [
    ["الموظف", report.employee?.displayName], ["الرقم الوظيفي", report.employee?.employeeNumber], ["المسمى", report.employee?.jobTitle],
    ["القسم", report.employee?.department], ["شهر المسير", report.monthKey], ["الحالة", report.lifecycle?.status],
    ["الراتب الأساسي", `${money(p.baseSalaryHalalas).toLocaleString("en-US")} ر.س`], ["البدلات", `${money(p.allowancesHalalas).toLocaleString("en-US")} ر.س`],
    ["خصم الحضور", `${money(p.attendanceDeductionHalalas).toLocaleString("en-US")} ر.س`], ["خصم الغياب", `${money(p.absenceDeductionHalalas).toLocaleString("en-US")} ر.س`],
    ["الإضافات اليدوية", `${money(p.manualAdditionsHalalas).toLocaleString("en-US")} ر.س`], ["الخصومات اليدوية", `${money(p.manualDeductionsHalalas).toLocaleString("en-US")} ر.س`],
    ["إجمالي الاستقطاعات", `${money(p.totalDeductionsHalalas).toLocaleString("en-US")} ر.س`], ["صافي الراتب", `${money(p.netSalaryHalalas).toLocaleString("en-US")} ر.س`],
    ["التأخير", `${Number(a.lateMinutes || 0)} دقيقة`], ["الخروج المبكر", `${Number(a.earlyLeaveMinutes || 0)} دقيقة`],
    ["وحدات الغياب", Number(abs.absenceUnits || 0)], ["ملاحظات", report.notes || "—"],
  ];
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=800");
  if (!win) return;
  win.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${xml(report.employee?.displayName || "تقرير الراتب")}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin-top:24px}td{border:1px solid #ddd;padding:10px}td:first-child{font-weight:700;background:#f6f6f6;width:32%}.net{font-size:20px;font-weight:800}@media print{button{display:none}}</style></head><body><h1>تقرير الراتب الشهري</h1><p>${xml(report.employee?.displayName || "")} — ${xml(report.monthKey)}</p><table>${pairs.map(([label, value]) => `<tr><td>${xml(label)}</td><td>${xml(value ?? "—")}</td></tr>`).join("")}</table><script>window.onload=function(){window.print();};<\/script></body></html>`);
  win.document.close();
}
