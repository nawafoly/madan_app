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
write(employeePath, employee);

// 2) Global shift catalog: explicitly state that weekly rest belongs to employees.
const adminPath = "client/src/pages/habat/HabatAttendanceAdmin.tsx";
let admin = read(adminPath);
admin = replaceOnce(
  admin,
  '<Panel title="قوالب الشفتات" subtitle="أوقات وسياسات قابلة لإعادة الاستخدام. الإجازة الأسبوعية تحدد لكل موظف من ملفه.">',
  '<Panel title="قوالب الشفتات" subtitle="أوقات وسياسات قابلة لإعادة الاستخدام. يوم الراحة يُحدد لكل موظف من ملفه.">',
  "habat-template-only-copy"
);

// Remove the now-unused weekday catalog if the shift page was its last consumer.
const dayOptionsMatches = admin.match(/dayOptions/g) || [];
if (dayOptionsMatches.length === 1) {
  admin = replaceRegexOnce(
    admin,
    /const dayOptions = \[[\s\S]*?\];\n\n/,
    "",
    "habat-unused-day-options"
  );
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

console.log("PASS - parity finalization applied: employee weekly rest copy, template-only UI, generic schedule resolver bridge.");
