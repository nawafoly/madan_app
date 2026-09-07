import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const write = (path, value) => fs.writeFileSync(path, value);

function replaceOnce(text, before, after, label) {
  if (text.includes(after)) return text;
  if (!text.includes(before)) throw new Error(`integration_anchor_missing:${label}`);
  return text.replace(before, after);
}

function replaceRegexOnce(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`integration_anchor_missing:${label}`);
  pattern.lastIndex = 0;
  return text.replace(pattern, replacement);
}

const corePath = "workers/workforce-core.js";
let core = read(corePath);

const oldTemplateFn = `async function createScheduleTemplate(db, tenantId, request, principal) {
  const body = await readJson(request);
  const name = clean(body.name);
  const startTime = clean(body.startTime);
  const endTime = clean(body.endTime);
  const workingDays = normalizeWorkingDays(body.workingDays);
  if (!name) return json(400, { ok: false, message: "workforce_schedule_name_required" });
  if (!isTime(startTime) || !isTime(endTime)) return json(400, { ok: false, message: "workforce_schedule_time_invalid" });
  if (!workingDays.length) return json(400, { ok: false, message: "workforce_schedule_working_days_required" });

  const templateId = id("wf_shift");
  const now = nowIso();
  await db
    .prepare(
      \`INSERT INTO workforce_schedule_templates (
         id, tenant_id, name, start_time, end_time, grace_minutes,
         early_leave_tolerance_minutes, working_days_json, is_active,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)\`
    )
    .bind(
      templateId,
      tenantId,
      name,
      startTime,
      endTime,
      nonNegativeInt(body.graceMinutes ?? 0),
      nonNegativeInt(body.earlyLeaveToleranceMinutes ?? 0),
      JSON.stringify(workingDays),
      now,
      now
    )
    .run();
  const row = await db.prepare(\`SELECT * FROM workforce_schedule_templates WHERE tenant_id = ? AND id = ?\`).bind(tenantId, templateId).first();
  await audit(db, tenantId, principal, "workforce.schedule_template.create", "schedule_template", templateId, null, row);
  return json(201, { ok: true, template: mapScheduleTemplate(row) });
}`;

const newTemplateFn = `async function createScheduleTemplate(db, tenantId, request, principal) {
  const body = await readJson(request);
  const name = clean(body.name);
  const startTime = clean(body.startTime);
  const endTime = clean(body.endTime);
  if (!name) return json(400, { ok: false, message: "workforce_schedule_name_required" });
  if (!isTime(startTime) || !isTime(endTime)) return json(400, { ok: false, message: "workforce_schedule_time_invalid" });

  // Shift templates own reusable time/policy only. The legacy NOT NULL column is
  // populated with all weekdays so a template never silently owns employee rest.
  const templateCompatibilityDays = [0, 1, 2, 3, 4, 5, 6];
  const templateId = id("wf_shift");
  const now = nowIso();
  await db
    .prepare(
      \`INSERT INTO workforce_schedule_templates (
         id, tenant_id, name, start_time, end_time, grace_minutes,
         early_leave_tolerance_minutes, working_days_json, is_active,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)\`
    )
    .bind(
      templateId,
      tenantId,
      name,
      startTime,
      endTime,
      nonNegativeInt(body.graceMinutes ?? 0),
      nonNegativeInt(body.earlyLeaveToleranceMinutes ?? 0),
      JSON.stringify(templateCompatibilityDays),
      now,
      now
    )
    .run();
  const row = await db.prepare(\`SELECT * FROM workforce_schedule_templates WHERE tenant_id = ? AND id = ?\`).bind(tenantId, templateId).first();
  await audit(db, tenantId, principal, "workforce.schedule_template.create", "schedule_template", templateId, null, row, {
    scheduleOwnership: "template_time_policy_only",
  });
  return json(201, { ok: true, template: mapScheduleTemplate(row) });
}`;
core = replaceOnce(core, oldTemplateFn, newTemplateFn, "workforce-core-template-ownership");

const oldAssignmentFn = `async function createScheduleAssignment(db, tenantId, employeeId, request, principal) {
  const body = await readJson(request);
  const templateId = clean(body.templateId);
  const effectiveFrom = clean(body.effectiveFrom);
  const effectiveTo = nullable(body.effectiveTo);
  if (!templateId) return json(400, { ok: false, message: "workforce_schedule_template_required" });
  if (!isDateKey(effectiveFrom) || (effectiveTo && (!isDateKey(effectiveTo) || effectiveTo < effectiveFrom))) {
    return json(400, { ok: false, message: "workforce_schedule_assignment_dates_invalid" });
  }
  const template = await db
    .prepare(\`SELECT id FROM workforce_schedule_templates WHERE tenant_id = ? AND id = ? AND is_active = 1 LIMIT 1\`)
    .bind(tenantId, templateId)
    .first();
  if (!template) return json(404, { ok: false, message: "workforce_schedule_template_not_found" });

  const assignmentId = id("wf_shift_assignment");
  await db
    .prepare(
      \`INSERT INTO workforce_schedule_assignments (
         id, tenant_id, employee_id, template_id, effective_from, effective_to,
         created_by_uid, created_by_email, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\`
    )
    .bind(
      assignmentId,
      tenantId,
      employeeId,
      templateId,
      effectiveFrom,
      effectiveTo,
      principal.uid || null,
      principal.email || null,
      nowIso()
    )
    .run();
  const row = await db.prepare(\`SELECT * FROM workforce_schedule_assignments WHERE tenant_id = ? AND id = ?\`).bind(tenantId, assignmentId).first();
  await audit(db, tenantId, principal, "workforce.schedule_assignment.create", "schedule_assignment", assignmentId, null, row);
  return json(201, { ok: true, assignment: row });
}`;

const newAssignmentFn = `async function createScheduleAssignment(db, tenantId, employeeId, request, principal) {
  const body = await readJson(request);
  const templateId = clean(body.templateId);
  const effectiveFrom = clean(body.effectiveFrom);
  const effectiveTo = nullable(body.effectiveTo);
  const weeklyRestWeekday = Number(body.weeklyRestWeekday ?? body.weekly_rest_weekday);
  const reason = nullable(body.reason);
  const operationId = clean(body.operationId || body.operation_id) || id("wf_shift_assignment_op");

  if (!templateId) return json(400, { ok: false, message: "workforce_schedule_template_required" });
  if (!isDateKey(effectiveFrom) || (effectiveTo && (!isDateKey(effectiveTo) || effectiveTo < effectiveFrom))) {
    return json(400, { ok: false, message: "workforce_schedule_assignment_dates_invalid" });
  }
  if (!Number.isInteger(weeklyRestWeekday) || weeklyRestWeekday < 0 || weeklyRestWeekday > 6) {
    return json(400, { ok: false, message: "workforce_weekly_rest_weekday_required" });
  }

  const prior = await db.prepare(
    \`SELECT * FROM workforce_schedule_assignments WHERE tenant_id = ? AND operation_id = ? LIMIT 1\`
  ).bind(tenantId, operationId).first();
  if (prior) {
    if (clean(prior.employee_id) !== employeeId) {
      return json(409, { ok: false, message: "workforce_schedule_operation_employee_mismatch" });
    }
    return json(200, { ok: true, idempotent: true, assignment: prior });
  }

  const template = await db
    .prepare(\`SELECT id FROM workforce_schedule_templates WHERE tenant_id = ? AND id = ? AND is_active = 1 LIMIT 1\`)
    .bind(tenantId, templateId)
    .first();
  if (!template) return json(404, { ok: false, message: "workforce_schedule_template_not_found" });

  const workingDays = [0, 1, 2, 3, 4, 5, 6].filter(day => day !== weeklyRestWeekday);
  const weekPattern = JSON.stringify({
    version: 1,
    weeklyRestWeekday,
    workingDays,
  });
  const assignmentId = id("wf_shift_assignment");
  const now = nowIso();

  await db
    .prepare(
      \`INSERT INTO workforce_schedule_assignments (
         id, tenant_id, employee_id, template_id, effective_from, effective_to,
         weekly_rest_weekday, week_pattern_json, reason, operation_id,
         created_by_uid, created_by_email, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`
    )
    .bind(
      assignmentId,
      tenantId,
      employeeId,
      templateId,
      effectiveFrom,
      effectiveTo,
      weeklyRestWeekday,
      weekPattern,
      reason,
      operationId,
      principal.uid || null,
      principal.email || null,
      now,
      now
    )
    .run();
  const row = await db.prepare(\`SELECT * FROM workforce_schedule_assignments WHERE tenant_id = ? AND id = ?\`).bind(tenantId, assignmentId).first();
  await audit(db, tenantId, principal, "workforce.schedule_assignment.create", "schedule_assignment", assignmentId, null, row, {
    scheduleOwnership: "employee_effective_dated",
    weeklyRestWeekday,
  });
  return json(201, { ok: true, idempotent: false, assignment: row });
}`;
core = replaceOnce(core, oldAssignmentFn, newAssignmentFn, "workforce-core-employee-weekly-rest");
write(corePath, core);

const schedulePath = "workers/workforce-schedule-control.js";
let schedule = read(schedulePath);
const oldClassification = `  const workingDays = parseWorkingDays(assignment.working_days_json);
  const isWorkingDay = workingDays.includes(weekday);
  return {
    date,
    kind: isWorkingDay ? "assignment" : "weekly_rest",
    source: "schedule_assignment",
    ready: true,
    isWorkingDay,
    isWeeklyRest: !isWorkingDay,
    assignmentId: nullable(assignment.id),
    exceptionId: null,
    ...(base || emptyShift()),
  };`;
const newClassification = `  const weekPattern = resolveAssignmentWeekPattern(assignment);
  const isWorkingDay = weekPattern.workingDays.includes(weekday);
  return {
    date,
    kind: isWorkingDay ? "assignment" : "weekly_rest",
    source: "schedule_assignment",
    scheduleOwnership: weekPattern.source,
    ready: true,
    isWorkingDay,
    isWeeklyRest: !isWorkingDay,
    weeklyRestWeekday: weekPattern.weeklyRestWeekday,
    assignmentId: nullable(assignment.id),
    exceptionId: null,
    ...(base || emptyShift()),
  };`;
schedule = replaceOnce(schedule, oldClassification, newClassification, "schedule-resolver-employee-pattern");

const parseDaysAnchor = `function parseWorkingDays(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))).sort();
  } catch {
    return [];
  }
}`;
const parseDaysReplacement = `function resolveAssignmentWeekPattern(row) {
  const explicitRest = Number(row?.weekly_rest_weekday);
  if (Number.isInteger(explicitRest) && explicitRest >= 0 && explicitRest <= 6) {
    let workingDays = [];
    try {
      const parsed = JSON.parse(row?.week_pattern_json || "{}");
      workingDays = Array.isArray(parsed?.workingDays)
        ? Array.from(new Set(parsed.workingDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)))
        : [];
    } catch {}
    if (!workingDays.length) {
      workingDays = [0, 1, 2, 3, 4, 5, 6].filter(day => day !== explicitRest);
    }
    workingDays = workingDays.filter(day => day !== explicitRest).sort((a, b) => a - b);
    return {
      workingDays,
      weeklyRestWeekday: explicitRest,
      source: "employee_schedule",
    };
  }

  // Existing assignments created before 0005 remain readable without a
  // destructive backfill. Once HR saves the employee schedule, ownership moves
  // to the assignment and this fallback is no longer used.
  const workingDays = parseWorkingDays(row?.working_days_json);
  const restDays = [0, 1, 2, 3, 4, 5, 6].filter(day => !workingDays.includes(day));
  return {
    workingDays,
    weeklyRestWeekday: restDays.length === 1 ? restDays[0] : null,
    source: "legacy_template_fallback",
  };
}

${parseDaysAnchor}`;
schedule = replaceOnce(schedule, parseDaysAnchor, parseDaysReplacement, "schedule-pattern-helper");
write(schedulePath, schedule);

const clientPath = "client/src/features/workforce/workforceClient.ts";
let client = read(clientPath);
const oldClientAssignment = `  createScheduleAssignment(
    employeeId: string,
    input: { templateId: string; effectiveFrom: string; effectiveTo?: string | null }
  ) {
    return workforceApi<{ ok: true; assignment: Record<string, unknown> }>(
      \`employees/\${encodeURIComponent(employeeId)}/schedule-assignments\`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },`;
const newClientAssignment = `  createScheduleAssignment(
    employeeId: string,
    input: {
      templateId: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
      weeklyRestWeekday: number;
      reason?: string | null;
      operationId?: string;
    }
  ) {
    return workforceApi<{ ok: true; idempotent?: boolean; assignment: Record<string, unknown> }>(
      \`employees/\${encodeURIComponent(employeeId)}/schedule-assignments\`,
      { method: "POST", body: JSON.stringify(input) }
    );
  },`;
client = replaceOnce(client, oldClientAssignment, newClientAssignment, "client-weekly-rest-contract");
write(clientPath, client);

const filePath = "client/src/features/workforce/WorkforceEmployeeFile.tsx";
let employeeFile = read(filePath);
employeeFile = replaceOnce(
  employeeFile,
  `  reason?: string | null;\n  createdAt?: string | null;`,
  `  reason?: string | null;\n  weekly_rest_weekday?: number | null;\n  week_pattern_json?: string | null;\n  createdAt?: string | null;`,
  "employee-file-assignment-type"
);
if (!employeeFile.includes(`const [weeklyRestWeekday, setWeeklyRestWeekday]`)) {
  employeeFile = replaceOnce(
    employeeFile,
    `  const [assignmentTo, setAssignmentTo] = useState("");`,
    `  const [assignmentTo, setAssignmentTo] = useState("");\n  const [weeklyRestWeekday, setWeeklyRestWeekday] = useState("5");\n  const [assignmentReason, setAssignmentReason] = useState("");`,
    "employee-file-weekly-rest-state"
  );
}
employeeFile = replaceOnce(
  employeeFile,
  `        effectiveTo: assignmentTo || null,\n      });\n      setAssignmentFrom(""); setAssignmentTo("");`,
  `        effectiveTo: assignmentTo || null,\n        weeklyRestWeekday: Number(weeklyRestWeekday),\n        reason: assignmentReason || null,\n      });\n      setAssignmentFrom(""); setAssignmentTo(""); setAssignmentReason("");`,
  "employee-file-assignment-submit"
);

const oldTabs = `<TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-white p-1 shadow-sm">
          <TabsTrigger value="basic" className="rounded-xl px-5 py-2.5">الملف</TabsTrigger>
          <TabsTrigger value="payroll" className="rounded-xl px-5 py-2.5">الراتب</TabsTrigger>
          <TabsTrigger value="schedule" className="rounded-xl px-5 py-2.5">الدوام</TabsTrigger>
          <TabsTrigger value="leaves" className="rounded-xl px-5 py-2.5">الإجازات</TabsTrigger>
          <TabsTrigger value="absences" className="rounded-xl px-5 py-2.5">الغياب</TabsTrigger>
          {legacyAttendance ? <TabsTrigger value="attendance" className="rounded-xl px-5 py-2.5">الحضور</TabsTrigger> : null}
        </TabsList>`;
const newTabs = `<TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-white p-1 shadow-sm">
          <TabsTrigger value="basic" className="rounded-xl px-5 py-2.5">الملف</TabsTrigger>
          <TabsTrigger value="schedule" className="rounded-xl px-5 py-2.5">جدول الدوام</TabsTrigger>
          {legacyAttendance ? <TabsTrigger value="attendance" className="rounded-xl px-5 py-2.5">الحضور</TabsTrigger> : null}
          <TabsTrigger value="payroll" className="rounded-xl px-5 py-2.5">الراتب</TabsTrigger>
          <TabsTrigger value="leaves" className="rounded-xl px-5 py-2.5">الإجازات</TabsTrigger>
          <TabsTrigger value="absences" className="rounded-xl px-5 py-2.5">الغياب</TabsTrigger>
        </TabsList>`;
employeeFile = replaceOnce(employeeFile, oldTabs, newTabs, "employee-file-tab-order");

const payrollPattern = /<TabsContent value="payroll" className="space-y-5">\s*\{employeeId \? <WorkforceMonthlyEmployeeReportPanel employeeId=\{employeeId\} \/> : null\}\s*\{employeeId \? <WorkforcePayrollLifecyclePanel employeeId=\{employeeId\} \/> : null\}\s*\{employeeId \? <WorkforcePayrollReadinessPanel employeeId=\{employeeId\} \/> : null\}\s*\{employeeId \? <WorkforcePayrollAdjustmentsPanel employeeId=\{employeeId\} \/> : null\}\s*(<form onSubmit=\{savePayroll\}[\s\S]*?<\/form>)\s*<\/TabsContent>/;
if (payrollPattern.test(employeeFile)) {
  employeeFile = employeeFile.replace(
    payrollPattern,
    `<TabsContent value="payroll" className="space-y-5">\n          $1\n          {employeeId ? <WorkforcePayrollReadinessPanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforcePayrollAdjustmentsPanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforcePayrollLifecyclePanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforceMonthlyEmployeeReportPanel employeeId={employeeId} /> : null}\n        </TabsContent>`
  );
} else if (!employeeFile.includes(`{employeeId ? <WorkforcePayrollReadinessPanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforcePayrollAdjustmentsPanel`)) {
  throw new Error("integration_anchor_missing:employee-file-payroll-order");
}

const scheduleFormPattern = /<form onSubmit=\{createAssignment\}[\s\S]*?<\/form>/;
const scheduleForm = `<form onSubmit={createAssignment} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div>
              <h3 className="font-black">جدول الموظف الأسبوعي</h3>
              <p className="mt-1 text-sm text-slate-500">الشفت يحدد الوقت والسياسة فقط. يوم الإجازة الأسبوعية ملك لهذا الموظف ويُحفظ بنسخة مؤرخة.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="قالب الشفت"><Select value={assignmentTemplate} onValueChange={setAssignmentTemplate}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue placeholder="اختر الشفت" /></SelectTrigger><SelectContent>{templates.filter(t => t.isActive).map(t => <SelectItem key={t.id} value={t.id}>{t.name} · {t.startTime} — {t.endTime}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="الإجازة الأسبوعية الأساسية"><Select value={weeklyRestWeekday} onValueChange={setWeeklyRestWeekday}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">الأحد</SelectItem><SelectItem value="1">الاثنين</SelectItem><SelectItem value="2">الثلاثاء</SelectItem><SelectItem value="3">الأربعاء</SelectItem><SelectItem value="4">الخميس</SelectItem><SelectItem value="5">الجمعة</SelectItem><SelectItem value="6">السبت</SelectItem></SelectContent></Select></Field>
              <Field label="ساري من"><Input dir="ltr" type="date" value={assignmentFrom} onChange={e => setAssignmentFrom(e.target.value)} className="h-11 rounded-2xl" required /></Field>
              <Field label="ساري إلى (اختياري)"><Input dir="ltr" type="date" value={assignmentTo} onChange={e => setAssignmentTo(e.target.value)} className="h-11 rounded-2xl" /></Field>
            </div>
            <Field label="سبب التغيير"><Input value={assignmentReason} onChange={e => setAssignmentReason(e.target.value)} placeholder="مثال: جدول التشغيل الأساسي" className="h-11 rounded-2xl" /></Field>
            <Button type="submit" disabled={saving || !assignmentTemplate || !assignmentFrom} className="rounded-xl bg-black"><Plus className="h-4 w-4" /> حفظ جدول الموظف</Button>
          </form>`;
if (scheduleFormPattern.test(employeeFile)) {
  employeeFile = employeeFile.replace(scheduleFormPattern, scheduleForm);
} else if (!employeeFile.includes("الإجازة الأسبوعية الأساسية")) {
  throw new Error("integration_anchor_missing:employee-file-schedule-form");
}
write(filePath, employeeFile);

const adminPath = "client/src/pages/habat/HabatAttendanceAdmin.tsx";
let admin = read(adminPath);
admin = admin.replace(`workingDays: [0, 1, 2, 3, 4],`, `workingDays: [0, 1, 2, 3, 4, 5, 6],`);
admin = admin.replace(/\n  function toggleDay\(day: number\) \{[\s\S]*?\n  \}\n\n  async function save/, `\n  async function save`);
admin = admin.replace(`body: JSON.stringify(draft),`, `body: JSON.stringify({ ...draft, workingDays: [0, 1, 2, 3, 4, 5, 6] }),`);
admin = admin.replace(
  `<Panel title="الدوام والشفتات" subtitle="ساعات العمل، أيام الدوام، السماح بالتأخير والانصراف المبكر">`,
  `<Panel title="قوالب الشفتات" subtitle="قالب الشفت يحدد الوقت وسياسة السماح فقط؛ جدول الموظف وإجازته الأسبوعية من ملف الموظف">`
);
admin = admin.replace(/\n          <div>\n            <p className="mb-2 text-sm font-bold">أيام العمل<\/p>[\s\S]*?\n          <\/div>\n/, `\n          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">أيام العمل والإجازة الأسبوعية لا تُحدد من قالب الشفت. افتح ملف الموظف وحدد جدوله الأسبوعي هناك.</p>\n`);
admin = admin.replace(/\n                  <p className="mt-2 text-xs text-slate-500">\n                    \{dayOptions[\s\S]*?\n                  <\/p>/, `\n                  <p className="mt-2 text-xs text-slate-500">الوقت والسياسة فقط · يوم الراحة يُحدد لكل موظف</p>`);
write(adminPath, admin);

const habatV2Path = "workers/habat-attendance-v2.js";
let habatV2 = read(habatV2Path);
if (!habatV2.startsWith(`import { resolveWorkforceScheduleDay }`)) {
  habatV2 = `import { resolveWorkforceScheduleDay } from "./workforce-schedule-control.js";\n\n${habatV2}`;
}
const oldResolveShift = `async function resolveShiftForAccess(db, accessId, dateKey) {
  if (!accessId) return getDefaultShift(db);
  const assignment = await db.prepare(
    \`SELECT a.shift_id
     FROM habat_attendance_shift_assignments a
     JOIN habat_attendance_shifts s ON s.id = a.shift_id
     WHERE a.access_id = ?
       AND a.effective_from <= ?
       AND (a.effective_to IS NULL OR a.effective_to >= ?)
       AND s.is_active = 1
     ORDER BY a.effective_from DESC, a.created_at DESC
     LIMIT 1\`
  ).bind(accessId, dateKey, dateKey).first();

  if (assignment?.shift_id) {
    const shift = await getShiftById(db, assignment.shift_id);
    if (shift && Number(shift.is_active) === 1) return shift;
  }
  return getDefaultShift(db);
}`;
const newResolveShift = `async function resolveShiftForAccess(db, accessId, dateKey) {
  if (!accessId) return getDefaultShift(db);

  // Workforce is canonical once an employee-specific schedule exists. Legacy
  // Habbat assignments remain a safe fallback during the additive cutover.
  try {
    const employee = await db.prepare(
      \`SELECT id FROM workforce_employee_profiles
        WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
          AND source_type = 'legacy_attendance_access'
          AND source_id = ?
        LIMIT 1\`
    ).bind(accessId).first();

    if (employee?.id) {
      const resolved = await resolveWorkforceScheduleDay(
        db,
        "restaurant_tenant_habat_alwaraq",
        employee.id,
        dateKey
      );
      if (resolved?.ready && resolved?.kind !== "unassigned") {
        const weekday = new Date(\`${dateKey}T12:00:00.000Z\`).getUTCDay();
        return {
          id: resolved.templateId || \`workforce_schedule_\${employee.id}\`,
          name: resolved.templateName || "جدول الموظف",
          start_time: resolved.startTime || "09:00",
          end_time: resolved.endTime || "17:00",
          grace_minutes: Number(resolved.graceMinutes || 0),
          early_leave_tolerance_minutes: Number(resolved.earlyLeaveToleranceMinutes || 0),
          working_days: JSON.stringify(resolved.isWorkingDay ? [weekday] : []),
          is_active: 1,
          workforce_schedule_kind: resolved.kind,
          workforce_employee_id: employee.id,
        };
      }
    }
  } catch (error) {
    console.warn("[habat-v2] workforce schedule fallback", error);
  }

  const assignment = await db.prepare(
    \`SELECT a.shift_id
     FROM habat_attendance_shift_assignments a
     JOIN habat_attendance_shifts s ON s.id = a.shift_id
     WHERE a.access_id = ?
       AND a.effective_from <= ?
       AND (a.effective_to IS NULL OR a.effective_to >= ?)
       AND s.is_active = 1
     ORDER BY a.effective_from DESC, a.created_at DESC
     LIMIT 1\`
  ).bind(accessId, dateKey, dateKey).first();

  if (assignment?.shift_id) {
    const shift = await getShiftById(db, assignment.shift_id);
    if (shift && Number(shift.is_active) === 1) return shift;
  }
  return getDefaultShift(db);
}`;
habatV2 = replaceOnce(habatV2, oldResolveShift, newResolveShift, "habat-v2-workforce-schedule-bridge");
write(habatV2Path, habatV2);

console.log("PASS - Workforce architecture parity integration applied.");
console.log("Changed runtime targets:");
for (const file of [corePath, schedulePath, clientPath, filePath, adminPath, habatV2Path]) {
  console.log(` - ${file}`);
}
