import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const corePath = path.join(root, "workers", "workforce-core.js");
const employeeFilePath = path.join(root, "client", "src", "features", "workforce", "WorkforceEmployeeFile.tsx");

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
  throw new Error(`[workforce-leave-control-integration] marker not found: ${label}`);
}

let core = fs.readFileSync(corePath, "utf8");
const coreEol = preferredEol(core);
if (!core.includes('from "./workforce-leave-control.js"')) {
  const marker = 'import { handleWorkforceScheduleControlRequest } from "./workforce-schedule-control.js";\n';
  core = replaceOnce(
    core,
    marker,
    withEol(`${marker}import { handleWorkforceLeaveControlRequest } from "./workforce-leave-control.js";\n`, coreEol),
    "workforce-core leave-control import"
  );
}

if (!core.includes("const leaveControlResponse = await handleWorkforceLeaveControlRequest")) {
  const marker = `  if (scheduleControlResponse) return scheduleControlResponse;\n\n`;
  const block = `${marker}  const leaveControlResponse = await handleWorkforceLeaveControlRequest({\n    request,\n    url,\n    db,\n    tenant,\n    principal,\n    routePrefix,\n  });\n  if (leaveControlResponse) return leaveControlResponse;\n\n`;
  core = replaceOnce(core, marker, withEol(block, coreEol), "workforce-core leave-control route");
}
fs.writeFileSync(corePath, core, "utf8");

let ui = fs.readFileSync(employeeFilePath, "utf8");
const uiEol = preferredEol(ui);
if (!ui.includes('from "./WorkforceLeaveLifecyclePanel"')) {
  const marker = 'import WorkforceScheduleControlPanel from "./WorkforceScheduleControlPanel";\n';
  ui = replaceOnce(
    ui,
    marker,
    withEol(`${marker}import WorkforceLeaveLifecyclePanel from "./WorkforceLeaveLifecyclePanel";\n`, uiEol),
    "employee-file leave lifecycle import"
  );
}

if (!ui.includes("<WorkforceLeaveLifecyclePanel")) {
  const marker = `          {employeeId ? <WorkforceAnnualLeavePanel employeeId={employeeId} serviceStartDate={file.employment?.serviceStartDate || null} /> : null}\n`;
  const block = `${marker}          {employeeId ? <WorkforceLeaveLifecyclePanel employeeId={employeeId} onChanged={() => void load()} /> : null}\n`;
  ui = replaceOnce(ui, marker, withEol(block, uiEol), "employee-file leave lifecycle panel");
}

if (!ui.includes("workforce_annual_leave_insufficient_balance")) {
  const marker = `    workforce_leave_partial_time_required: "الإجازة الجزئية تحتاج وقت بداية ونهاية.",\n`;
  const replacement = `${marker}    workforce_annual_leave_schedule_not_ready: "لا يمكن اعتماد الإجازة السنوية قبل اكتمال جدول الدوام للفترة.",\n    workforce_annual_leave_insufficient_balance: "رصيد الإجازة السنوية غير كافٍ لاعتماد هذه الفترة.",\n    workforce_annual_leave_no_chargeable_workday: "الفترة المحددة لا تحتوي يوم عمل قابل للخصم من الرصيد.",\n`;
  ui = replaceOnce(ui, marker, withEol(replacement, uiEol), "employee-file annual leave usage errors");
}

fs.writeFileSync(employeeFilePath, ui, "utf8");
console.log("[workforce-leave-control-integration] PASS - leave usage/reversal control integrated idempotently.");
