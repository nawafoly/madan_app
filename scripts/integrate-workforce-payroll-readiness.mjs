import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const corePath = path.join(root, "workers", "workforce-core.js");
const employeeFilePath = path.join(root, "client", "src", "features", "workforce", "WorkforceEmployeeFile.tsx");
const payrollAdjustmentsPath = path.join(root, "workers", "workforce-payroll-adjustments.js");

function preferredEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}
function withEol(text, eol) {
  return text.replace(/\r?\n/g, eol);
}
function replaceOnce(text, marker, replacement, label) {
  if (text.includes(marker)) return text.replace(marker, replacement);
  const crlfMarker = marker.replace(/\n/g, "\r\n");
  if (crlfMarker !== marker && text.includes(crlfMarker)) {
    return text.replace(crlfMarker, withEol(replacement, "\r\n"));
  }
  throw new Error(`[workforce-payroll-readiness-integration] marker not found: ${label}`);
}

let core = fs.readFileSync(corePath, "utf8");
const coreEol = preferredEol(core);
if (!core.includes('from "./workforce-payroll-readiness.js"')) {
  const marker = 'import { handleWorkforcePayrollAdjustmentsRequest } from "./workforce-payroll-adjustments.js";\n';
  core = replaceOnce(
    core,
    marker,
    withEol(`${marker}import { handleWorkforcePayrollReadinessRequest } from "./workforce-payroll-readiness.js";\n`, coreEol),
    "workforce-core payroll readiness import"
  );
}
if (!core.includes("const payrollReadinessResponse = await handleWorkforcePayrollReadinessRequest")) {
  const marker = `  if (payrollAdjustmentsResponse) return payrollAdjustmentsResponse;\n\n`;
  const block = `${marker}  const payrollReadinessResponse = await handleWorkforcePayrollReadinessRequest({\n    request,\n    url,\n    db,\n    tenant,\n    principal,\n    sourceAdapter,\n    routePrefix,\n  });\n  if (payrollReadinessResponse) return payrollReadinessResponse;\n\n`;
  core = replaceOnce(core, marker, withEol(block, coreEol), "workforce-core payroll readiness route");
}
fs.writeFileSync(corePath, core, "utf8");

let ui = fs.readFileSync(employeeFilePath, "utf8");
const uiEol = preferredEol(ui);
if (!ui.includes('from "./WorkforcePayrollReadinessPanel"')) {
  const marker = 'import WorkforcePayrollAdjustmentsPanel from "./WorkforcePayrollAdjustmentsPanel";\n';
  ui = replaceOnce(
    ui,
    marker,
    withEol(`${marker}import WorkforcePayrollReadinessPanel from "./WorkforcePayrollReadinessPanel";\n`, uiEol),
    "employee-file payroll readiness import"
  );
}
if (!ui.includes("<WorkforcePayrollReadinessPanel")) {
  const marker = `        <TabsContent value="payroll" className="space-y-5">\n          {employeeId ? <WorkforcePayrollAdjustmentsPanel employeeId={employeeId} /> : null}\n`;
  const replacement = `        <TabsContent value="payroll" className="space-y-5">\n          {employeeId ? <WorkforcePayrollReadinessPanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforcePayrollAdjustmentsPanel employeeId={employeeId} /> : null}\n`;
  ui = replaceOnce(ui, marker, withEol(replacement, uiEol), "employee-file payroll readiness mount");
}
fs.writeFileSync(employeeFilePath, ui, "utf8");

let payrollAdjustments = fs.readFileSync(payrollAdjustmentsPath, "utf8");
const payrollAdjustmentsEol = preferredEol(payrollAdjustments);
if (!/function\s+clean\s*\(/.test(payrollAdjustments)) {
  const marker = `function id(prefix) {\n`;
  const helper = `function clean(value) {\n  const text = String(value ?? "").trim();\n  if (!text || text === "undefined" || text === "null") return "";\n  return text;\n}\n\n${marker}`;
  payrollAdjustments = replaceOnce(
    payrollAdjustments,
    marker,
    withEol(helper, payrollAdjustmentsEol),
    "payroll adjustments clean helper"
  );
}
fs.writeFileSync(payrollAdjustmentsPath, payrollAdjustments, "utf8");

console.log("[workforce-payroll-readiness-integration] PASS - payroll readiness, attendance deductions, and payroll-adjustment helper compatibility integrated idempotently.");
