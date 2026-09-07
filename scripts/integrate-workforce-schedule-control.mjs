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
  throw new Error(`[workforce-schedule-control-integration] marker not found: ${label}`);
}

let core = fs.readFileSync(corePath, "utf8");
const coreEol = preferredEol(core);
if (!core.includes('from "./workforce-schedule-control.js"')) {
  const marker = 'import { handleWorkforceAnnualLeaveRequest } from "./workforce-annual-leave.js";\n';
  core = replaceOnce(
    core,
    marker,
    withEol(`${marker}import { handleWorkforceScheduleControlRequest } from "./workforce-schedule-control.js";\n`, coreEol),
    "workforce-core schedule import"
  );
}

if (!core.includes("const scheduleControlResponse = await handleWorkforceScheduleControlRequest")) {
  const marker = "  if (annualLeaveResponse) return annualLeaveResponse;\n\n";
  const block = `${marker}  const scheduleControlResponse = await handleWorkforceScheduleControlRequest({\n    request,\n    url,\n    db,\n    tenant,\n    principal,\n    routePrefix,\n  });\n  if (scheduleControlResponse) return scheduleControlResponse;\n\n`;
  core = replaceOnce(core, marker, withEol(block, coreEol), "workforce-core schedule route");
}
fs.writeFileSync(corePath, core, "utf8");

let ui = fs.readFileSync(employeeFilePath, "utf8");
const uiEol = preferredEol(ui);
if (!ui.includes('from "./WorkforceScheduleControlPanel"')) {
  const marker = 'import WorkforceAnnualLeavePanel from "./WorkforceAnnualLeavePanel";\n';
  ui = replaceOnce(
    ui,
    marker,
    withEol(`${marker}import WorkforceScheduleControlPanel from "./WorkforceScheduleControlPanel";\n`, uiEol),
    "employee-file schedule panel import"
  );
}

if (!ui.includes("<WorkforceScheduleControlPanel")) {
  const marker = '        <TabsContent value="schedule" className="space-y-5">\n';
  const block = `${marker}          {employeeId ? <WorkforceScheduleControlPanel employeeId={employeeId} templates={templates} /> : null}\n`;
  ui = replaceOnce(ui, marker, withEol(block, uiEol), "employee-file schedule control panel");
}

fs.writeFileSync(employeeFilePath, ui, "utf8");
console.log("[workforce-schedule-control-integration] PASS — resolver, exceptions, and weekly-rest controls integrated idempotently.");
