import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const corePath = path.join(root, "workers", "workforce-core.js");
const adapterPath = path.join(root, "workers", "habat-workforce-adapter.js");
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
  throw new Error(`[workforce-attendance-operations-integration] marker not found: ${label}`);
}

let core = fs.readFileSync(corePath, "utf8");
const coreEol = preferredEol(core);
if (!core.includes('from "./workforce-attendance-operations.js"')) {
  const marker = 'import { handleWorkforceScheduleControlRequest } from "./workforce-schedule-control.js";\n';
  core = replaceOnce(
    core,
    marker,
    withEol(`${marker}import { handleWorkforceAttendanceOperationsRequest } from "./workforce-attendance-operations.js";\n`, coreEol),
    "workforce-core attendance import"
  );
}
if (!core.includes("const attendanceOperationsResponse = await handleWorkforceAttendanceOperationsRequest")) {
  const marker = `  if (scheduleControlResponse) return scheduleControlResponse;\n\n`;
  const block = `${marker}  const attendanceOperationsResponse = await handleWorkforceAttendanceOperationsRequest({\n    request,\n    url,\n    db,\n    tenant,\n    principal,\n    sourceAdapter,\n    routePrefix,\n  });\n  if (attendanceOperationsResponse) return attendanceOperationsResponse;\n\n`;
  core = replaceOnce(core, marker, withEol(block, coreEol), "workforce-core attendance route");
}
fs.writeFileSync(corePath, core, "utf8");

let adapter = fs.readFileSync(adapterPath, "utf8");
const adapterEol = preferredEol(adapter);
if (!adapter.includes("listAttendanceMonth: (sourceEmployeeId, monthKey)")) {
  const marker = `        listEmployees: () => listLegacyEmployees(db),\n`;
  const replacement = `${marker}        listAttendanceMonth: (sourceEmployeeId, monthKey) => listLegacyAttendanceMonth(db, sourceEmployeeId, monthKey),\n`;
  adapter = replaceOnce(adapter, marker, withEol(replacement, adapterEol), "Habbat attendance source adapter hook");
}
if (!adapter.includes("async function listLegacyAttendanceMonth")) {
  const marker = `\nfunction readRequesterName(requester) {\n`;
  const block = `\nasync function listLegacyAttendanceMonth(db, sourceEmployeeId, monthKey) {\n  const accessId = clean(sourceEmployeeId);\n  const access = await db\n    .prepare(\`SELECT id, uid, email FROM habat_attendance_access WHERE id = ? LIMIT 1\`)\n    .bind(accessId)\n    .first();\n  if (!access) return [];\n\n  const uid = clean(access.uid);\n  const email = clean(access.email).toLowerCase();\n  const result = await db\n    .prepare(\`SELECT attendance_date, check_in_at, check_out_at, attendance_status,\n                     late_minutes, early_leave_minutes, worked_minutes\n                FROM habat_attendance_records\n               WHERE attendance_date LIKE ?\n                 AND (\n                   access_id = ?\n                   OR (access_id IS NULL AND uid_fallback_match(account_uid, account_email, ?, ?))\n                 )\n               ORDER BY attendance_date ASC\`)\n    .bind(\`${"${monthKey}"}-%\`, accessId, uid, email)\n    .all();\n\n  return (result?.results || []).map(row => ({\n    date: clean(row.attendance_date),\n    checkInAt: clean(row.check_in_at) || null,\n    checkOutAt: clean(row.check_out_at) || null,\n    status: clean(row.attendance_status) || null,\n    lateMinutes: Number(row.late_minutes || 0),\n    earlyLeaveMinutes: Number(row.early_leave_minutes || 0),\n    workedMinutes: row.worked_minutes == null ? null : Number(row.worked_minutes),\n  }));\n}\n\nfunction uid_fallback_match() {\n  return 0;\n}\n`;
  // D1 cannot call a JS function from SQL. Install the portable query variant below instead.
  const safeBlock = `\nasync function listLegacyAttendanceMonth(db, sourceEmployeeId, monthKey) {\n  const accessId = clean(sourceEmployeeId);\n  const access = await db\n    .prepare(\`SELECT id, uid, email FROM habat_attendance_access WHERE id = ? LIMIT 1\`)\n    .bind(accessId)\n    .first();\n  if (!access) return [];\n\n  const uid = clean(access.uid);\n  const email = clean(access.email).toLowerCase();\n  const result = await db\n    .prepare(\`SELECT attendance_date, check_in_at, check_out_at, attendance_status,\n                     late_minutes, early_leave_minutes, worked_minutes\n                FROM habat_attendance_records\n               WHERE attendance_date LIKE ?\n                 AND (\n                   access_id = ?\n                   OR (access_id IS NULL AND ? <> '' AND account_uid = ?)\n                   OR (access_id IS NULL AND ? <> '' AND lower(COALESCE(account_email, '')) = ?)\n                 )\n               ORDER BY attendance_date ASC\`)\n    .bind(\`${"${monthKey}"}-%\`, accessId, uid, uid, email, email)\n    .all();\n\n  return (result?.results || []).map(row => ({\n    date: clean(row.attendance_date),\n    checkInAt: clean(row.check_in_at) || null,\n    checkOutAt: clean(row.check_out_at) || null,\n    status: clean(row.attendance_status) || null,\n    lateMinutes: Number(row.late_minutes || 0),\n    earlyLeaveMinutes: Number(row.early_leave_minutes || 0),\n    workedMinutes: row.worked_minutes == null ? null : Number(row.worked_minutes),\n  }));\n}\n`;
  adapter = replaceOnce(adapter, marker, withEol(`${safeBlock}${marker}`, adapterEol), "Habbat attendance source query");
}
fs.writeFileSync(adapterPath, adapter, "utf8");

let ui = fs.readFileSync(employeeFilePath, "utf8");
const uiEol = preferredEol(ui);
if (!ui.includes('from "./WorkforceAttendanceOperationsPanel"')) {
  const marker = 'import WorkforceScheduleControlPanel from "./WorkforceScheduleControlPanel";\n';
  ui = replaceOnce(
    ui,
    marker,
    withEol(`${marker}import WorkforceAttendanceOperationsPanel from "./WorkforceAttendanceOperationsPanel";\n`, uiEol),
    "employee-file attendance operations import"
  );
}
if (!ui.includes("<WorkforceAttendanceOperationsPanel")) {
  const marker = `        <TabsContent value="absences" className="space-y-5">\n`;
  const block = `${marker}          {employeeId ? <WorkforceAttendanceOperationsPanel employeeId={employeeId} /> : null}\n`;
  ui = replaceOnce(ui, marker, withEol(block, uiEol), "employee-file attendance operations panel");
}
fs.writeFileSync(employeeFilePath, ui, "utf8");

console.log("[workforce-attendance-operations-integration] PASS - generic attendance operations + Habbat source edge integrated idempotently.");
