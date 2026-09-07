import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const corePath = path.join(root, "workers", "workforce-core.js");
const employeeFilePath = path.join(root, "client", "src", "features", "workforce", "WorkforceEmployeeFile.tsx");

function preferredEol(text) { return text.includes("\r\n") ? "\r\n" : "\n"; }
function withEol(text, eol) { return text.replace(/\r?\n/g, eol); }
function replaceOnce(text, marker, replacement, label) {
  if (text.includes(marker)) return text.replace(marker, replacement);
  const crlfMarker = marker.replace(/\n/g, "\r\n");
  if (crlfMarker !== marker && text.includes(crlfMarker)) return text.replace(crlfMarker, withEol(replacement, "\r\n"));
  throw new Error(`[workforce-payroll-lifecycle-integration] marker not found: ${label}`);
}

let core = fs.readFileSync(corePath, "utf8");
const coreEol = preferredEol(core);
if (!core.includes('from "./workforce-payroll-lifecycle.js"')) {
  const marker = 'import { handleWorkforcePayrollReadinessRequest } from "./workforce-payroll-readiness.js";\n';
  core = replaceOnce(core, marker, withEol(`${marker}import { handleWorkforcePayrollLifecycleRequest } from "./workforce-payroll-lifecycle.js";\n`, coreEol), "workforce-core lifecycle import");
}
if (!core.includes("const payrollLifecycleResponse = await handleWorkforcePayrollLifecycleRequest")) {
  const marker = `  if (payrollReadinessResponse) return payrollReadinessResponse;\n\n`;
  const block = `${marker}  const payrollLifecycleResponse = await handleWorkforcePayrollLifecycleRequest({\n    request,\n    url,\n    db,\n    tenant,\n    principal,\n    routePrefix,\n  });\n  if (payrollLifecycleResponse) return payrollLifecycleResponse;\n\n`;
  core = replaceOnce(core, marker, withEol(block, coreEol), "workforce-core lifecycle route");
}
fs.writeFileSync(corePath, core, "utf8");

let ui = fs.readFileSync(employeeFilePath, "utf8");
const uiEol = preferredEol(ui);
if (!ui.includes('from "./WorkforcePayrollLifecyclePanel"')) {
  const marker = 'import WorkforcePayrollReadinessPanel from "./WorkforcePayrollReadinessPanel";\n';
  ui = replaceOnce(ui, marker, withEol(`${marker}import WorkforcePayrollLifecyclePanel from "./WorkforcePayrollLifecyclePanel";\n`, uiEol), "employee-file lifecycle import");
}
if (!ui.includes("<WorkforcePayrollLifecyclePanel")) {
  const marker = `        <TabsContent value="payroll" className="space-y-5">\n          {employeeId ? <WorkforcePayrollReadinessPanel employeeId={employeeId} /> : null}\n`;
  const replacement = `        <TabsContent value="payroll" className="space-y-5">\n          {employeeId ? <WorkforcePayrollLifecyclePanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforcePayrollReadinessPanel employeeId={employeeId} /> : null}\n`;
  ui = replaceOnce(ui, marker, withEol(replacement, uiEol), "employee-file lifecycle mount");
}
fs.writeFileSync(employeeFilePath, ui, "utf8");

console.log("[workforce-payroll-lifecycle-integration] PASS - payroll lifecycle integrated idempotently.");
