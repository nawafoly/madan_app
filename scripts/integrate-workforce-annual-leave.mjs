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

// Keep integration safe on both LF and Windows CRLF working trees without
// rewriting the whole target file just because core.autocrlf changed endings.
function replaceOnce(text, marker, replacement, label) {
  if (text.includes(marker)) return text.replace(marker, replacement);

  const crlfMarker = marker.replace(/\n/g, "\r\n");
  if (crlfMarker !== marker && text.includes(crlfMarker)) {
    return text.replace(crlfMarker, withEol(replacement, "\r\n"));
  }

  throw new Error(`[workforce-annual-leave-integration] marker not found: ${label}`);
}

let core = fs.readFileSync(corePath, "utf8");
const coreEol = preferredEol(core);
if (!core.includes('from "./workforce-annual-leave.js"')) {
  core = `import { handleWorkforceAnnualLeaveRequest } from "./workforce-annual-leave.js";${coreEol}${coreEol}${core}`;
}

if (!core.includes("const annualLeaveResponse = await handleWorkforceAnnualLeaveRequest")) {
  const marker = "  await ensureTenant(db, tenant);\n\n";
  const block = `  await ensureTenant(db, tenant);\n\n  const annualLeaveResponse = await handleWorkforceAnnualLeaveRequest({\n    request,\n    url,\n    db,\n    tenant,\n    principal,\n    routePrefix,\n  });\n  if (annualLeaveResponse) return annualLeaveResponse;\n\n`;
  core = replaceOnce(core, marker, withEol(block, coreEol), "workforce-core annual leave route");
}
fs.writeFileSync(corePath, core, "utf8");

let ui = fs.readFileSync(employeeFilePath, "utf8");
const uiEol = preferredEol(ui);
if (!ui.includes('from "./WorkforceAnnualLeavePanel"')) {
  const marker = '} from "./workforceClient";\n';
  ui = replaceOnce(
    ui,
    marker,
    withEol(`${marker}import WorkforceAnnualLeavePanel from "./WorkforceAnnualLeavePanel";\n`, uiEol),
    "employee-file annual leave import"
  );
}

if (!ui.includes("<WorkforceAnnualLeavePanel")) {
  const marker = '        <TabsContent value="leaves" className="space-y-5">\n';
  const block = `${marker}          {employeeId ? <WorkforceAnnualLeavePanel employeeId={employeeId} serviceStartDate={file.employment?.serviceStartDate || null} /> : null}\n`;
  ui = replaceOnce(ui, marker, withEol(block, uiEol), "employee-file annual leave panel");
}

ui = ui.replace(
  "الإجازات التشغيلية الحالية محفوظة في Workforce Core. رصيد الإجازة السنوية والـledger لهما مرحلة منفصلة قبل احتساب الرصيد المالي.",
  "الإجازات التشغيلية محفوظة في Workforce Core، ورصيد الإجازة السنوية له ledger مستقل قابل للتدقيق."
);

fs.writeFileSync(employeeFilePath, ui, "utf8");
console.log("[workforce-annual-leave-integration] PASS — annual leave service and employee-file panel integrated idempotently.");
