import fs from "node:fs";

// Normalize Windows CRLF checkouts in-memory so deterministic source anchors
// remain stable across developer machines. Files are written back as LF and Git
// can re-checkout using the user's configured line-ending policy afterwards.
const read = path => fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
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
  `        effectiveTo: assignmentTo || null,\n        weeklyRestWeekday: Number(weeklyRestWeekday),\n        reason: assignmentReason || null,\n        operationId: crypto.randomUUID(),\n      });\n      setAssignmentFrom(""); setAssignmentTo(""); setAssignmentReason("");`,
  "employee-file-save-weekly-rest"
);
employeeFile = replaceOnce(
  employeeFile,
  `          {employeeId ? <WorkforceMonthlyEmployeeReportPanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforcePayrollLifecyclePanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforcePayrollReadinessPanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforcePayrollAdjustmentsPanel employeeId={employeeId} /> : null}\n          <form onSubmit={savePayroll}`,
  `          <form onSubmit={savePayroll}`,
  "employee-file-payroll-order-remove-prefix"
);
employeeFile = replaceOnce(
  employeeFile,
  `            <Button type="submit" disabled={saving} className="rounded-xl bg-black"><Save className="h-4 w-4" /> حفظ إعدادات الراتب</Button>\n          </form>\n        </TabsContent>`,
  `            <Button type="submit" disabled={saving} className="rounded-xl bg-black"><Save className="h-4 w-4" /> حفظ إعدادات الراتب</Button>\n          </form>\n          {employeeId ? <WorkforcePayrollReadinessPanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforcePayrollAdjustmentsPanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforcePayrollLifecyclePanel employeeId={employeeId} /> : null}\n          {employeeId ? <WorkforceMonthlyEmployeeReportPanel employeeId={employeeId} /> : null}\n        </TabsContent>`,
  "employee-file-payroll-order-append"
);
const assignmentFormPattern = /<form onSubmit=\{createAssignment\}[\s\S]*?<\/form>/;
const assignmentFormReplacement = `<form onSubmit={createAssignment} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h3 className="font-black">جدول الموظف الأسبوعي</h3><p className="text-sm text-slate-500">اختر قالب وقت الدوام وحدد يوم الراحة الأسبوعية الخاص بهذا الموظف. أي تغيير لاحق يسجل كتعيين مؤرخ ولا يغير قالب الشفت لباقي الموظفين.</p><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="قالب الشفت"><Select value={assignmentTemplate} onValueChange={setAssignmentTemplate}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue placeholder="اختر الشفت" /></SelectTrigger><SelectContent>{templates.filter(t => t.isActive).map(t => <SelectItem key={t.id} value={t.id}>{t.name} · {t.startTime} — {t.endTime}</SelectItem>)}</SelectContent></Select></Field><Field label="الإجازة الأسبوعية الأساسية"><Select value={weeklyRestWeekday} onValueChange={setWeeklyRestWeekday}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">الأحد</SelectItem><SelectItem value="1">الاثنين</SelectItem><SelectItem value="2">الثلاثاء</SelectItem><SelectItem value="3">الأربعاء</SelectItem><SelectItem value="4">الخميس</SelectItem><SelectItem value="5">الجمعة</SelectItem><SelectItem value="6">السبت</SelectItem></SelectContent></Select></Field><Field label="ساري من"><Input dir="ltr" type="date" value={assignmentFrom} onChange={e => setAssignmentFrom(e.target.value)} className="h-11 rounded-2xl" required /></Field><Field label="ساري إلى (اختياري)"><Input dir="ltr" type="date" value={assignmentTo} onChange={e => setAssignmentTo(e.target.value)} className="h-11 rounded-2xl" /></Field></div><Field label="سبب التغيير (اختياري)"><Textarea value={assignmentReason} onChange={e => setAssignmentReason(e.target.value)} className="min-h-20 rounded-2xl" /></Field><Button type="submit" disabled={saving || !assignmentTemplate || !assignmentFrom} className="rounded-xl bg-black"><Plus className="h-4 w-4" /> حفظ جدول الموظف</Button></form>`;
employeeFile = replaceRegexOnce(employeeFile, assignmentFormPattern, assignmentFormReplacement, "employee-file-schedule-form");
write(filePath, employeeFile);

const adminPath = "client/src/pages/habat/HabatAttendanceAdmin.tsx";
let admin = read(adminPath);

// This bridge can be re-run against Habat sources that already contain part of
// the architecture-parity cleanup. Remove legacy template-owned working-day UI
// only when each fragment is still present instead of failing on applied work.
admin = admin.replace(`  workingDays: number[];\n};`, `};`);
admin = admin.replace(
  /  earlyLeaveToleranceMinutes: 0,\n  workingDays: \[[^\n]*\],\n};/,
  `  earlyLeaveToleranceMinutes: 0,\n};`
);
admin = admin.replace(
  /\n  function toggleDay\(day: number\) \{[\s\S]*?\n  \}\n\n  async function save/,
  `\n  async function save`
);
admin = admin.replace(`      workingDays: shift.workingDays,\n`, ``);
admin = admin.replace(`      workingDays: [0, 1, 2, 3, 4, 5, 6],\n`, ``);
if (!admin.includes(`<Panel title="قوالب الشفتات"`)) {
  admin = admin.replace(
    `<Panel title="الدوام والشفتات" subtitle="ساعات العمل، أيام الدوام، السماح بالتأخير والانصراف المبكر">`,
    `<Panel title="قوالب الشفتات" subtitle="أوقات وسياسات قابلة لإعادة الاستخدام. يوم الراحة يُحدد لكل موظف من ملفه.">`
  );
}
admin = admin.replace(
  /\n          <div>\n            <p className="mb-2 text-sm font-bold">أيام العمل<\/p>[\s\S]*?\n          <\/div>\n/,
  `\n`
);
admin = admin.replace(
  /\n                  <p className="mt-2 text-xs text-slate-500">\n                    \{dayOptions[\s\S]*?<\/p>/,
  ``
);
// HABAT_LEGACY_WORKING_DAYS_TRANSPORT_COMPAT
if (!admin.includes(`  workingDays: number[];`)) {
  admin = admin.replace(
    `  earlyLeaveToleranceMinutes: number;\n};`,
    `  earlyLeaveToleranceMinutes: number;\n  workingDays: number[];\n};`
  );
}
if (!/earlyLeaveToleranceMinutes: 0,\n  workingDays: \[0, 1, 2, 3, 4, 5, 6\],/.test(admin)) {
  admin = admin.replace(
    `  earlyLeaveToleranceMinutes: 0,\n};`,
    `  earlyLeaveToleranceMinutes: 0,\n  workingDays: [0, 1, 2, 3, 4, 5, 6],\n};`
  );
}
// Editing a legacy shift must also satisfy ShiftDraft's transport-only field.
// The employee rest day still belongs to the employee assignment, not the template UI.
admin = admin.replace(
  `      earlyLeaveToleranceMinutes: shift.earlyLeaveToleranceMinutes,\n    });`,
  `      earlyLeaveToleranceMinutes: shift.earlyLeaveToleranceMinutes,\n      workingDays: [0, 1, 2, 3, 4, 5, 6],\n    });`
);
write(adminPath, admin);

const habatPath = "workers/habat-attendance-v2.js";
let habat = read(habatPath);
if (!habat.includes(`const WORKFORCE_TENANT_ID = "restaurant_tenant_habat_alwaraq";`)) {
  habat = replaceOnce(
    habat,
    `const HABAT_ACCESS_LEVELS = new Set(["employee", "manager"]);`,
    `const HABAT_ACCESS_LEVELS = new Set(["employee", "manager"]);\nconst WORKFORCE_TENANT_ID = "restaurant_tenant_habat_alwaraq";`,
    "habat-workforce-tenant-constant"
  );
}
habat = replaceOnce(
  habat,
  `async function resolveShiftForAccess(db, accessId, dateKey) {`,
  `async function resolveShiftForAccess(db, accessId, dateKey) {\n  const workforceShift = await resolveWorkforceShiftForAccess(db, accessId, dateKey);\n  if (workforceShift) return workforceShift;`,
  "habat-workforce-first-resolver"
);
const beforeDefaultShift = `async function getDefaultShift(db) {`;
const workforceBridge = `async function resolveWorkforceShiftForAccess(db, accessId, dateKey) {
  const link = await db.prepare(
    \`SELECT a.employee_id
       FROM workforce_attendance_links a
      WHERE a.tenant_id = ? AND a.source_employee_id = ?
        AND COALESCE(a.status, 'confirmed') = 'confirmed'
      LIMIT 1\`
  ).bind(WORKFORCE_TENANT_ID, accessId).first();
  if (!link?.employee_id) return null;

  const exception = await db.prepare(
    \`SELECT e.*, t.start_time AS template_start_time, t.end_time AS template_end_time,
            t.grace_minutes AS template_grace_minutes,
            t.early_leave_tolerance_minutes AS template_early_leave_tolerance_minutes
       FROM workforce_schedule_exceptions e
       LEFT JOIN workforce_schedule_templates t
         ON t.tenant_id = e.tenant_id AND t.id = e.template_id
      WHERE e.tenant_id = ? AND e.employee_id = ? AND e.work_date = ?
        AND COALESCE(e.status, 'active') = 'active'
      LIMIT 1\`
  ).bind(WORKFORCE_TENANT_ID, link.employee_id, dateKey).first();

  const assignment = await db.prepare(
    \`SELECT a.*, t.start_time, t.end_time, t.grace_minutes,
            t.early_leave_tolerance_minutes, t.working_days_json
       FROM workforce_schedule_assignments a
       JOIN workforce_schedule_templates t
         ON t.tenant_id = a.tenant_id AND t.id = a.template_id
      WHERE a.tenant_id = ? AND a.employee_id = ? AND a.effective_from <= ?
        AND (a.effective_to IS NULL OR a.effective_to >= ?)
        AND t.is_active = 1
      ORDER BY a.effective_from DESC, a.created_at DESC
      LIMIT 1\`
  ).bind(WORKFORCE_TENANT_ID, link.employee_id, dateKey, dateKey).first();

  if (!assignment && !exception) return null;
  if (exception && normalizeText(exception.kind) === "day_off") return null;

  const weekday = new Date(dateKey + "T12:00:00+03:00").getDay();
  const explicitRest = Number(assignment?.weekly_rest_weekday);
  let workingDays = [];
  if (Number.isInteger(explicitRest) && explicitRest >= 0 && explicitRest <= 6) {
    try {
      const parsed = JSON.parse(assignment?.week_pattern_json || "{}");
      workingDays = Array.isArray(parsed?.workingDays) ? parsed.workingDays.map(Number) : [];
    } catch {}
    if (!workingDays.length) workingDays = [0, 1, 2, 3, 4, 5, 6].filter(day => day !== explicitRest);
  } else {
    try {
      const parsed = JSON.parse(assignment?.working_days_json || "[]");
      workingDays = Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {}
  }
  if (assignment && !workingDays.includes(weekday)) return null;

  const startTime = normalizeText(exception?.start_time || exception?.template_start_time || assignment?.start_time);
  const endTime = normalizeText(exception?.end_time || exception?.template_end_time || assignment?.end_time);
  if (!startTime || !endTime) return null;

  return {
    id: normalizeText(assignment?.template_id) || "workforce:" + normalizeText(assignment?.id),
    name: "Workforce schedule",
    startTime,
    endTime,
    graceMinutes: Number(exception?.template_grace_minutes ?? assignment?.grace_minutes ?? 0),
    earlyLeaveToleranceMinutes: Number(exception?.template_early_leave_tolerance_minutes ?? assignment?.early_leave_tolerance_minutes ?? 0),
    source: "workforce",
  };
}

${beforeDefaultShift}`;
habat = replaceOnce(habat, beforeDefaultShift, workforceBridge, "habat-workforce-resolver-bridge");
write(habatPath, habat);

console.log("PASS - workforce architecture parity integration applied.");
