import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const corePath = path.join(root, "workers", "workforce-core.js");
const employeeFilePath = path.join(root, "client", "src", "features", "workforce", "WorkforceEmployeeFile.tsx");
const servicePath = path.join(root, "workers", "workforce-payroll-adjustments.js");

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
  throw new Error(`[workforce-payroll-adjustments-integration] marker not found: ${label}`);
}

let core = fs.readFileSync(corePath, "utf8");
const coreEol = preferredEol(core);
if (!core.includes('from "./workforce-payroll-adjustments.js"')) {
  const marker = 'import { handleWorkforceLeaveControlRequest } from "./workforce-leave-control.js";\n';
  core = replaceOnce(
    core,
    marker,
    withEol(`${marker}import { handleWorkforcePayrollAdjustmentsRequest } from "./workforce-payroll-adjustments.js";\n`, coreEol),
    "workforce-core payroll adjustments import"
  );
}
if (!core.includes("const payrollAdjustmentsResponse = await handleWorkforcePayrollAdjustmentsRequest")) {
  const marker = `  if (leaveControlResponse) return leaveControlResponse;\n\n`;
  const block = `${marker}  const payrollAdjustmentsResponse = await handleWorkforcePayrollAdjustmentsRequest({\n    request,\n    url,\n    db,\n    tenant,\n    principal,\n    routePrefix,\n  });\n  if (payrollAdjustmentsResponse) return payrollAdjustmentsResponse;\n\n`;
  core = replaceOnce(core, marker, withEol(block, coreEol), "workforce-core payroll adjustments route");
}
fs.writeFileSync(corePath, core, "utf8");

let ui = fs.readFileSync(employeeFilePath, "utf8");
const uiEol = preferredEol(ui);
if (!ui.includes('from "./WorkforcePayrollAdjustmentsPanel"')) {
  const marker = 'import WorkforceLeaveLifecyclePanel from "./WorkforceLeaveLifecyclePanel";\n';
  ui = replaceOnce(
    ui,
    marker,
    withEol(`${marker}import WorkforcePayrollAdjustmentsPanel from "./WorkforcePayrollAdjustmentsPanel";\n`, uiEol),
    "employee-file payroll panel import"
  );
}
if (!ui.includes("<WorkforcePayrollAdjustmentsPanel")) {
  const marker = `        <TabsContent value="payroll">\n`;
  const replacement = `        <TabsContent value="payroll" className="space-y-5">\n          {employeeId ? <WorkforcePayrollAdjustmentsPanel employeeId={employeeId} /> : null}\n`;
  ui = replaceOnce(ui, marker, withEol(replacement, uiEol), "employee-file payroll panel mount");
}
fs.writeFileSync(employeeFilePath, ui, "utf8");

let service = fs.readFileSync(servicePath, "utf8");
const serviceEol = preferredEol(service);
const oldCancelOrder = `  const period = await db.prepare(\`SELECT * FROM workforce_payroll_periods WHERE tenant_id = ? AND id = ? LIMIT 1\`)\n    .bind(tenantId, entry.period_id).first();\n  assertDraft(period, entry);\n\n  if (clean(adjustment.status || "active") === "cancelled") {\n    return {\n      idempotent: true,\n      adjustment: mapAdjustment(adjustment),\n      workspace: await getPayrollAdjustmentWorkspace(db, tenantId, employeeId, entry.month_key),\n    };\n  }\n\n`;
const fixedCancelOrder = `  const period = await db.prepare(\`SELECT * FROM workforce_payroll_periods WHERE tenant_id = ? AND id = ? LIMIT 1\`)\n    .bind(tenantId, entry.period_id).first();\n\n  if (clean(adjustment.status || "active") === "cancelled") {\n    return {\n      idempotent: true,\n      adjustment: mapAdjustment(adjustment),\n      workspace: await getPayrollAdjustmentWorkspace(db, tenantId, employeeId, entry.month_key),\n    };\n  }\n\n  assertDraft(period, entry);\n\n`;
if (service.includes(withEol(oldCancelOrder, serviceEol))) {
  service = service.replace(withEol(oldCancelOrder, serviceEol), withEol(fixedCancelOrder, serviceEol));
}
fs.writeFileSync(servicePath, service, "utf8");

console.log("[workforce-payroll-adjustments-integration] PASS - manual payroll adjustments integrated idempotently.");
