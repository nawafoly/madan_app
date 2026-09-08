import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const corePath = path.join(root, "workers", "workforce-core.js");
const employeePath = path.join(root, "client", "src", "features", "workforce", "WorkforceEmployeeFile.tsx");
const habatV4Path = path.join(root, "client", "src", "pages", "habat", "HabatAttendanceAppV4.tsx");

function eol(text) { return text.includes("\r\n") ? "\r\n" : "\n"; }
function normalize(text, targetEol) { return text.replace(/\r?\n/g, targetEol); }
function replaceOnce(text, marker, replacement, label) {
  if (text.includes(marker)) return text.replace(marker, replacement);
  const crlf = marker.replace(/\n/g, "\r\n");
  if (crlf !== marker && text.includes(crlf)) return text.replace(crlf, normalize(replacement, "\r\n"));
  throw new Error(`[workforce-payroll-reports-integration] marker not found: ${label}`);
}

let core = fs.readFileSync(corePath, "utf8");
const coreEol = eol(core);
if (!core.includes('from "./workforce-payroll-reports.js"')) {
  const marker = 'import { handleWorkforcePayrollLifecycleRequest } from "./workforce-payroll-lifecycle.js";\n';
  core = replaceOnce(core, marker, normalize(`${marker}import { handleWorkforcePayrollReportsRequest } from "./workforce-payroll-reports.js";\n`, coreEol), "core report import");
}
if (!core.includes("const payrollReportsResponse = await handleWorkforcePayrollReportsRequest")) {
  const marker = `  if (payrollLifecycleResponse) return payrollLifecycleResponse;\n\n`;
  const block = `${marker}  const payrollReportsResponse = await handleWorkforcePayrollReportsRequest({\n    request,\n    url,\n    db,\n    tenant,\n    principal,\n    routePrefix,\n  });\n  if (payrollReportsResponse) return payrollReportsResponse;\n\n`;
  core = replaceOnce(core, marker, normalize(block, coreEol), "core report route");
}
fs.writeFileSync(corePath, core, "utf8");

let employee = fs.readFileSync(employeePath, "utf8");
const employeeEol = eol(employee);
if (!employee.includes('from "./WorkforceMonthlyEmployeeReportPanel"')) {
  const marker = 'import WorkforcePayrollLifecyclePanel from "./WorkforcePayrollLifecyclePanel";\n';
  employee = replaceOnce(employee, marker, normalize(`${marker}import WorkforceMonthlyEmployeeReportPanel from "./WorkforceMonthlyEmployeeReportPanel";\n`, employeeEol), "employee report import");
}
if (!employee.includes("<WorkforceMonthlyEmployeeReportPanel")) {
  const marker = `        <TabsContent value="payroll" className="space-y-5">\n          {employeeId ? <WorkforcePayrollLifecyclePanel employeeId={employeeId} /> : null}\n`;
  const replacement = `        <TabsContent value="payroll" className="space-y-5">\n          {employeeId ? <WorkforceMonthlyEmployeeReportPanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforcePayrollLifecyclePanel employeeId={employeeId} /> : null}\n`;
  employee = replaceOnce(employee, marker, normalize(replacement, employeeEol), "employee report mount");
}
fs.writeFileSync(employeePath, employee, "utf8");

let habat = fs.readFileSync(habatV4Path, "utf8");
const habatEol = eol(habat);
if (!habat.includes('from "@/features/workforce/WorkforceMonthlyPayrollReportPanel"')) {
  const marker = 'import WorkforceEmployeeFile from "@/features/workforce/WorkforceEmployeeFile";\n';
  habat = replaceOnce(habat, marker, normalize(`${marker}import WorkforceMonthlyPayrollReportPanel from "@/features/workforce/WorkforceMonthlyPayrollReportPanel";\n`, habatEol), "Habbat reports import");
}
if (!habat.includes("<WorkforceMonthlyPayrollReportPanel />")) {
  const marker = `  const totals = report?.totals;\n  return <div className="space-y-5"><section`;
  const replacement = `  const totals = report?.totals;\n  return <div className="space-y-5"><WorkforceMonthlyPayrollReportPanel /><section`;
  habat = replaceOnce(habat, marker, normalize(replacement, habatEol), "Habbat reports mount");
}
fs.writeFileSync(habatV4Path, habat, "utf8");

console.log("[workforce-payroll-reports-integration] PASS - employee and overall payroll reports integrated idempotently.");
