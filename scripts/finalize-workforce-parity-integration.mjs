import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const write = (path, value) => fs.writeFileSync(path, value);

function replaceOnce(text, before, after, label) {
  if (text.includes(after)) return text;
  if (!text.includes(before)) throw new Error(`finalize_anchor_missing:${label}`);
  return text.replace(before, after);
}

function replaceRegexOnce(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`finalize_anchor_missing:${label}`);
  pattern.lastIndex = 0;
  return text.replace(pattern, replacement);
}

// 1) Employee UI: make ownership explicit in the UI copy.
const employeePath = "client/src/features/workforce/WorkforceEmployeeFile.tsx";
let employee = read(employeePath);
employee = replaceOnce(
  employee,
  '<Field label="الإجازة الأسبوعية"><Select value={weeklyRestWeekday}',
  '<Field label="الإجازة الأسبوعية الأساسية"><Select value={weeklyRestWeekday}',
  "employee-weekly-rest-label"
);

// Payroll execution order is an invariant, not a cosmetic preference.
// Normalize the payroll tab deterministically even if an earlier rollout left
// one or more panels in their old position.
const payrollStartMarker = '<TabsContent value="payroll" className="space-y-5">';
const payrollStart = employee.indexOf(payrollStartMarker);
if (payrollStart < 0) throw new Error("finalize_anchor_missing:payroll-tab");
const payrollEnd = employee.indexOf("</TabsContent>", payrollStart);
if (payrollEnd < 0) throw new Error("finalize_anchor_missing:payroll-tab-end");

let payrollBlock = employee.slice(payrollStart, payrollEnd + "</TabsContent>".length);
const payrollPanelPatterns = [
  /\n\s*\{employeeId \? <WorkforcePayrollReadinessPanel employeeId=\{employeeId\} \/> : null\}/g,
  /\n\s*\{employeeId \? <WorkforcePayrollAdjustmentsPanel employeeId=\{employeeId\} \/> : null\}/g,
  /\n\s*\{employeeId \? <WorkforcePayrollLifecyclePanel employeeId=\{employeeId\} \/> : null\}/g,
  /\n\s*\{employeeId \? <WorkforceMonthlyEmployeeReportPanel employeeId=\{employeeId\} \/> : null\}/g,
];
for (const pattern of payrollPanelPatterns) payrollBlock = payrollBlock.replace(pattern, "");

const payrollFormStart = payrollBlock.indexOf("<form onSubmit={savePayroll}");
if (payrollFormStart < 0) throw new Error("finalize_anchor_missing:payroll-setup-form");
const payrollFormEnd = payrollBlock.indexOf("</form>", payrollFormStart);
if (payrollFormEnd < 0) throw new Error("finalize_anchor_missing:payroll-setup-form-end");
const insertAt = payrollFormEnd + "</form>".length;
const orderedPanels = `
          {employeeId ? <WorkforcePayrollReadinessPanel employeeId={employeeId} /> : null}
          {employeeId ? <WorkforcePayrollAdjustmentsPanel employeeId={employeeId} /> : null}
          {employeeId ? <WorkforcePayrollLifecyclePanel employeeId={employeeId} /> : null}
          {employeeId ? <WorkforceMonthlyEmployeeReportPanel employeeId={employeeId} /> : null}`;
payrollBlock = payrollBlock.slice(0, insertAt) + orderedPanels + payrollBlock.slice(insertAt);
employee = employee.slice(0, payrollStart) + payrollBlock + employee.slice(payrollEnd + "</TabsContent>".length);
write(employeePath, employee);

// 2) Global Habbat shift catalog: weekly rest is NOT editable here.
// The legacy Habbat v2 shift endpoint still requires workingDays, so the UI keeps
// an internal compatibility field fixed to all seven weekdays. This satisfies
// the old transport contract without letting a shared template own employee rest.
const adminPath = "client/src/pages/habat/HabatAttendanceAdmin.tsx";
let admin = read(adminPath);
admin = replaceOnce(
  admin,
  '<Panel title="قوالب الشفتات" subtitle="أوقات وسياسات قابلة لإعادة الاستخدام. الإجازة الأسبوعية تحدد لكل موظف من ملفه.">',
  '<Panel title="قوالب الشفتات" subtitle="أوقات وسياسات قابلة لإعادة الاستخدام. يوم الراحة يُحدد لكل موظف من ملفه.">',
  "habat-template-only-copy"
);

// Keep the internal compatibility field type-safe even if a previous rollout
// removed one side of the ShiftDraft contract before TypeScript ran.
const shiftDraftMatch = admin.match(/type ShiftDraft = \{[\s\S]*?\n\};/);
if (!shiftDraftMatch) throw new Error("finalize_anchor_missing:ShiftDraft");
let shiftDraftBlock = shiftDraftMatch[0];
if (!/\n\s*workingDays:\s*number\[\];/.test(shiftDraftBlock)) {
  shiftDraftBlock = shiftDraftBlock.replace(/\n\};$/, "\n  workingDays: number[];\n};");
  admin = admin.replace(shiftDraftMatch[0], shiftDraftBlock);
}

const emptyShiftMatch = admin.match(/const emptyShift: ShiftDraft = \{[\s\S]*?\n\};/);
if (!emptyShiftMatch) throw new Error("finalize_anchor_missing:emptyShift");
let emptyShiftBlock = emptyShiftMatch[0];
if (/workingDays:\s*\[[^\]]*\]/.test(emptyShiftBlock)) {
  emptyShiftBlock = emptyShiftBlock.replace(/workingDays:\s*\[[^\]]*\]/, "workingDays: [0, 1, 2, 3, 4, 5, 6]");
} else {
  emptyShiftBlock = emptyShiftBlock.replace(/\n\};$/, "\n  workingDays: [0, 1, 2, 3, 4, 5, 6],\n};");
}
admin = admin.replace(emptyShiftMatch[0], emptyShiftBlock);

const editMatch = admin.match(/function edit\(shift: HabatShift\) \{[\s\S]*?\n  \}/);
if (!editMatch) throw new Error("finalize_anchor_missing:editShift");
let editBlock = editMatch[0];
if (/workingDays:\s*[^,\n]+,/.test(editBlock)) {
  editBlock = editBlock.replace(/workingDays:\s*[^,\n]+,/, "workingDays: [0, 1, 2, 3, 4, 5, 6],");
} else {
  editBlock = editBlock.replace(
    /(earlyLeaveToleranceMinutes:\s*shift\.earlyLeaveToleranceMinutes,)/,
    "$1\n      workingDays: [0, 1, 2, 3, 4, 5, 6],"
  );
}
admin = admin.replace(editMatch[0], editBlock);

// Ensure no employee-specific weekday controls remain on the global template page.
admin = admin.replace(/\n  function toggleDay\(day: number\) \{[\s\S]*?\n  \}\n\n(?=  async function save)/, "\n");
admin = admin.replace(
  /\n          <div>\n            <p className="mb-2 text-sm font-bold">أيام العمل<\/p>[\s\S]*?\n          <\/div>\n/,
  "\n"
);
admin = admin.replace(
  /\n                  <p className="mt-2 text-xs text-slate-500">\n                    \{dayOptions[\s\S]*?<\/p>/,
  ""
);

// Remove weekday display catalog only when no runtime/UI consumer remains.
const dayOptionsMatches = admin.match(/dayOptions/g) || [];
if (dayOptionsMatches.length === 1) {
  admin = admin.replace(/const dayOptions = \[[\s\S]*?\];\n\n/, "");
}
write(adminPath, admin);

// 3) Habbat edge must reuse the generic Workforce resolver instead of duplicating
// schedule classification logic. Habbat-specific source-link knowledge stays here.
const habatPath = "workers/habat-attendance-v2.js";
let habat = read(habatPath);
if (!habat.includes('import { resolveWorkforceScheduleDay } from "./workforce-schedule-control.js";')) {
  habat = 'import { resolveWorkforceScheduleDay } from "./workforce-schedule-control.js";\n\n' + habat;
}

const bridgePattern = /async function resolveWorkforceShiftForAccess\(db, accessId, dateKey\) \{[\s\S]*?\n\}\n\nfunction weekdayFromDateKey\(dateKey\) \{[\s\S]*?\n\}\n\n(?=async function getDefaultShift\(db\) \{)/;
const bridgeReplacement = `async function resolveWorkforceShiftForAccess(db, accessId, dateKey) {
  const link = await db.prepare(
    \`SELECT a.employee_id
       FROM workforce_attendance_links a
      WHERE a.tenant_id = ? AND a.source_employee_id = ?
        AND COALESCE(a.status, 'confirmed') = 'confirmed'
      LIMIT 1\`
  ).bind(WORKFORCE_TENANT_ID, accessId).first();
  if (!link?.employee_id) return null;

  const schedule = await resolveWorkforceScheduleDay(
    db,
    WORKFORCE_TENANT_ID,
    link.employee_id,
    dateKey
  );

  // No generic schedule yet: keep the legacy Habbat assignment as compatibility
  // fallback. Once an employee schedule exists, Workforce is authoritative.
  if (!schedule || schedule.kind === "unassigned" || !schedule.ready) return null;

  return makeWorkforceShiftFromResolved(schedule, dateKey);
}

function makeWorkforceShiftFromResolved(schedule, dateKey) {
  const weekday = weekdayFromDateKey(dateKey);
  return {
    id: normalizeText(schedule?.templateId) || "workforce:" + normalizeText(schedule?.assignmentId),
    name: normalizeText(schedule?.templateName) || "جدول الموظف",
    start_time: normalizeTime(schedule?.startTime) || "09:00",
    end_time: normalizeTime(schedule?.endTime) || "17:00",
    grace_minutes: Number(schedule?.graceMinutes || 0),
    early_leave_tolerance_minutes: Number(schedule?.earlyLeaveToleranceMinutes || 0),
    working_days: JSON.stringify(schedule?.isWorkingDay ? [weekday] : []),
    is_active: 1,
    schedule_source: normalizeText(schedule?.source) || "workforce_schedule",
  };
}

function weekdayFromDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

`;
habat = replaceRegexOnce(habat, bridgePattern, bridgeReplacement, "habat-generic-resolver-bridge");
write(habatPath, habat);

console.log("PASS - parity finalization applied: employee weekly rest, payroll setup-first ordering, template-only UI with legacy transport compatibility, generic schedule resolver bridge.");
