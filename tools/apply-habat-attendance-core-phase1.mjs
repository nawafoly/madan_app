import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceOnce(source, anchor, replacement, label) {
  if (!source.includes(anchor)) {
    throw new Error(`Missing patch anchor: ${label}`);
  }
  return source.replace(anchor, replacement);
}

// ---------------------------------------------------------------------------
// 1) Canonical management attendance commands: v3 owns create/update/delete.
// ---------------------------------------------------------------------------
const v3Path = "workers/habat-attendance-v3.js";
let v3 = read(v3Path);

v3 = replaceOnce(
  v3,
  'import { resolveWorkforceDayRange, resolveWorkforceEmployeeBySource, assertWorkforceDayMutationAllowed, assertPayrollSourceMutationAllowed, buildPayrollStaleStatements } from "./workforce-day-state.js";\n',
  'import { resolveWorkforceDayRange, resolveWorkforceEmployeeBySource, assertWorkforceDayMutationAllowed, assertPayrollSourceMutationAllowed, buildPayrollStaleStatements } from "./workforce-day-state.js";\nimport { prepareAttendanceMutationGuard } from "./workforce-mutation-guard.js";\n',
  "v3 mutation guard import"
);

v3 = replaceOnce(
  v3,
  '  const deleteRecordMatch = subpath.match(/^\\/records\\/([^/]+)$/);',
  '  const recordMatch = subpath.match(/^\\/records\\/([^/]+)$/);',
  "canonical record route match"
);

v3 = replaceOnce(
  v3,
  [
    '  if (deleteRecordMatch) {',
    '    if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);',
    '    return deleteAttendanceRecord(db, requester, decodeURIComponent(deleteRecordMatch[1]));',
    '  }',
  ].join("\n"),
  [
    '  if (recordMatch) {',
    '    const recordId = decodeURIComponent(recordMatch[1]);',
    '    if (request.method === "PATCH") return updateAttendanceRecord(db, request, requester, recordId);',
    '    if (request.method === "DELETE") return deleteAttendanceRecord(db, requester, recordId);',
    '    return methodNotAllowed(["PATCH", "DELETE"]);',
    '  }',
  ].join("\n"),
  "canonical record update/delete routes"
);

const manualValidationBefore = [
  '  const checkInAt = normalizeIso(body.value?.checkInAt);',
  '  const checkOutAt = normalizeOptionalIso(body.value?.checkOutAt);',
  '  const reason = normalizeText(body.value?.reason);',
  '  if (!accessId || !date || !checkInAt) return json(400, { ok: false, message: "habat_manual_record_fields_required" });',
  '  if (reason.length < 3) return json(400, { ok: false, message: "habat_correction_reason_required" });',
  '  if (checkOutAt && Date.parse(checkOutAt) < Date.parse(checkInAt)) {',
  '    return json(400, { ok: false, message: "habat_invalid_attendance_order" });',
  '  }',
  '  if (date > getRiyadhDateKey() || Date.parse(checkInAt) > Date.now()) {',
  '    return json(400, { ok: false, message: "habat_future_attendance_not_allowed" });',
  '  }',
  '  if (getRiyadhDateKeyFromIso(checkInAt) !== date) {',
  '    return json(400, { ok: false, message: "habat_attendance_date_mismatch" });',
  '  }',
].join("\n");

const manualValidationAfter = [
  '  const checkInAt = normalizeOptionalIso(body.value?.checkInAt);',
  '  const checkOutAt = normalizeOptionalIso(body.value?.checkOutAt);',
  '  const reason = normalizeText(body.value?.reason);',
  '  if (!accessId || !date) return json(400, { ok: false, message: "habat_manual_record_fields_required" });',
  '  if (!checkInAt && !checkOutAt) return json(400, { ok: false, message: "habat_attendance_punch_required" });',
  '  if (reason.length < 3) return json(400, { ok: false, message: "habat_correction_reason_required" });',
  '  if (checkInAt && checkOutAt && Date.parse(checkOutAt) < Date.parse(checkInAt)) {',
  '    return json(400, { ok: false, message: "habat_invalid_attendance_order" });',
  '  }',
  '  if (date > getRiyadhDateKey() || (checkInAt && Date.parse(checkInAt) > Date.now()) || (checkOutAt && Date.parse(checkOutAt) > Date.now())) {',
  '    return json(400, { ok: false, message: "habat_future_attendance_not_allowed" });',
  '  }',
  '  if ((checkInAt && getRiyadhDateKeyFromIso(checkInAt) !== date) || (checkOutAt && getRiyadhDateKeyFromIso(checkOutAt) !== date)) {',
  '    return json(400, { ok: false, message: "habat_attendance_date_mismatch" });',
  '  }',
].join("\n");

v3 = replaceOnce(v3, manualValidationBefore, manualValidationAfter, "manual single-punch validation");

const deleteAnchor = 'async function deleteAttendanceRecord(db, requester, id) {';
const updateFunction = [
  'async function updateAttendanceRecord(db, request, requester, id) {',
  '  const current = await db.prepare(`SELECT * FROM habat_attendance_records WHERE id = ? LIMIT 1`).bind(id).first();',
  '  if (!current) return json(404, { ok: false, message: "habat_record_not_found" });',
  '',
  '  const body = await readJsonBody(request);',
  '  if (!body.ok) return body.response;',
  '  const value = body.value || {};',
  '  const reason = normalizeText(value.reason);',
  '  if (reason.length < 3) return json(400, { ok: false, message: "habat_correction_reason_required" });',
  '',
  '  const hasCheckIn = Object.prototype.hasOwnProperty.call(value, "checkInAt");',
  '  const hasCheckOut = Object.prototype.hasOwnProperty.call(value, "checkOutAt");',
  '  const checkInAt = hasCheckIn ? normalizeOptionalIso(value.checkInAt) : (normalizeText(current.check_in_at) || null);',
  '  const checkOutAt = hasCheckOut ? normalizeOptionalIso(value.checkOutAt) : (normalizeText(current.check_out_at) || null);',
  '  const date = normalizeText(current.attendance_date);',
  '',
  '  if (!checkInAt && !checkOutAt) return json(400, { ok: false, message: "habat_attendance_punch_required" });',
  '  if (checkInAt && checkOutAt && Date.parse(checkOutAt) < Date.parse(checkInAt)) {',
  '    return json(400, { ok: false, message: "habat_invalid_attendance_order" });',
  '  }',
  '  if ((checkInAt && Date.parse(checkInAt) > Date.now()) || (checkOutAt && Date.parse(checkOutAt) > Date.now())) {',
  '    return json(400, { ok: false, message: "habat_future_attendance_not_allowed" });',
  '  }',
  '  if ((checkInAt && getRiyadhDateKeyFromIso(checkInAt) !== date) || (checkOutAt && getRiyadhDateKeyFromIso(checkOutAt) !== date)) {',
  '    return json(400, { ok: false, message: "habat_attendance_date_mismatch" });',
  '  }',
  '',
  '  const accessId = normalizeText(current.access_id);',
  '  if (!accessId) return json(409, { ok: false, message: "workforce_employee_link_not_ready" });',
  '  const guard = await prepareAttendanceMutationGuard({',
  '    db,',
  '    tenantId: WORKFORCE_TENANT_ID,',
  '    sourceEmployeeId: accessId,',
  '    attendanceDate: date,',
  '    currentRecord: current,',
  '    mutation: "correction",',
  '  });',
  '',
  '  const shift = await resolveShiftForAccessDate(db, accessId, date);',
  '  if (!shift) return json(409, { ok: false, message: "habat_shift_not_configured" });',
  '  const schedule = current.scheduled_start_at && current.scheduled_end_at',
  '    ? { start: new Date(current.scheduled_start_at), end: new Date(current.scheduled_end_at) }',
  '    : buildScheduleWindow(date, shift);',
  '  const metrics = calculateMetrics(checkInAt, checkOutAt, shift, schedule);',
  '  const previousNotes = normalizeText(current.notes);',
  '  const correctionNote = `تصحيح إداري: ${reason}`;',
  '  const notes = previousNotes ? `${previousNotes}\\n${correctionNote}` : correctionNote;',
  '  const now = nowIso();',
  '',
  '  try {',
  '    const update = db.prepare(',
  '      `UPDATE habat_attendance_records',
  '       SET check_in_at = ?, check_out_at = ?, attendance_status = ?,',
  '           late_minutes = ?, early_leave_minutes = ?, worked_minutes = ?,',
  '           notes = ?, updated_at = ?',
  '       WHERE id = ?`',
  '    ).bind(checkInAt, checkOutAt, metrics.status, metrics.lateMinutes, metrics.earlyLeaveMinutes, metrics.workedMinutes, notes, now, id);',
  '    await db.batch([update, ...(guard?.staleStatements || [])]);',
  '    const next = await db.prepare(`SELECT * FROM habat_attendance_records WHERE id = ? LIMIT 1`).bind(id).first();',
  '    await writeAudit(db, requester, "manager_update_attendance_record", "habat_attendance_record", id, current, { ...next, correctionReason: reason });',
  '    return json(200, { ok: true, record: mapRecord(next) });',
  '  } catch (error) {',
  '    console.error("[habat-v3] record update failed", error);',
  '    return json(500, { ok: false, message: "habat_record_update_failed" });',
  '  }',
  '}',
  '',
].join("\n");

v3 = replaceOnce(v3, deleteAnchor, updateFunction + deleteAnchor, "canonical update record command");

const metricsBefore = [
  'function calculateMetrics(checkInAt, checkOutAt, shift, schedule) {',
  '  const checkIn = new Date(checkInAt);',
  '  const checkOut = checkOutAt ? new Date(checkOutAt) : null;',
  '  const rawLate = Math.max(0, Math.floor((checkIn.getTime() - schedule.start.getTime()) / 60000));',
  '  const grace = Number(shift.grace_minutes || 0);',
  '  const lateMinutes = rawLate > grace ? rawLate : 0;',
  '  const rawEarly = checkOut ? Math.max(0, Math.floor((schedule.end.getTime() - checkOut.getTime()) / 60000)) : 0;',
  '  const tolerance = Number(shift.early_leave_tolerance_minutes || 0);',
  '  const earlyLeaveMinutes = rawEarly > tolerance ? rawEarly : 0;',
  '  const workedMinutes = checkOut ? Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000)) : null;',
  '  let status = lateMinutes ? "late" : "present";',
  '  if (earlyLeaveMinutes) status = lateMinutes ? "late_early_leave" : "early_leave";',
  '  return { status, lateMinutes, earlyLeaveMinutes, workedMinutes };',
  '}',
].join("\n");

const metricsAfter = [
  'function calculateMetrics(checkInAt, checkOutAt, shift, schedule) {',
  '  const checkIn = checkInAt ? new Date(checkInAt) : null;',
  '  const checkOut = checkOutAt ? new Date(checkOutAt) : null;',
  '  const rawLate = checkIn ? Math.max(0, Math.floor((checkIn.getTime() - schedule.start.getTime()) / 60000)) : 0;',
  '  const grace = Number(shift.grace_minutes || 0);',
  '  const lateMinutes = rawLate > grace ? rawLate : 0;',
  '  const rawEarly = checkOut ? Math.max(0, Math.floor((schedule.end.getTime() - checkOut.getTime()) / 60000)) : 0;',
  '  const tolerance = Number(shift.early_leave_tolerance_minutes || 0);',
  '  const earlyLeaveMinutes = rawEarly > tolerance ? rawEarly : 0;',
  '  const workedMinutes = checkIn && checkOut ? Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000)) : null;',
  '  if (!checkIn || !checkOut) {',
  '    return { status: "incomplete", lateMinutes, earlyLeaveMinutes, workedMinutes };',
  '  }',
  '  let status = lateMinutes ? "late" : "present";',
  '  if (earlyLeaveMinutes) status = lateMinutes ? "late_early_leave" : "early_leave";',
  '  return { status, lateMinutes, earlyLeaveMinutes, workedMinutes };',
  '}',
].join("\n");

v3 = replaceOnce(v3, metricsBefore, metricsAfter, "single-punch metrics");
write(v3Path, v3);

// ---------------------------------------------------------------------------
// 2) Live employee clock: server-enforced 60-second checkout cooldown.
// ---------------------------------------------------------------------------
const extPath = "workers/habat-attendance-extensions.js";
let ext = read(extPath);

ext = replaceOnce(
  ext,
  'const MAX_LOCATION_TOLERANCE_M = 20;\n',
  'const MAX_LOCATION_TOLERANCE_M = 20;\nconst CHECKOUT_COOLDOWN_MS = 60 * 1000;\n',
  "checkout cooldown constant"
);

const cooldownAnchor = [
  '  if (clockType === "check_out" && existing?.check_out_at) {',
  '    return json(409, {',
  '      ok: false,',
  '      message: "habat_already_checked_out",',
  '      record: mapRecord(existing),',
  '    });',
  '  }',
].join("\n");

const cooldownReplacement = cooldownAnchor + "\n\n" + [
  '  if (clockType === "check_out" && existing?.check_in_at) {',
  '    const checkedInAtMs = Date.parse(existing.check_in_at);',
  '    const elapsedMs = Number.isFinite(checkedInAtMs) ? Date.now() - checkedInAtMs : CHECKOUT_COOLDOWN_MS;',
  '    if (elapsedMs < CHECKOUT_COOLDOWN_MS) {',
  '      return json(429, {',
  '        ok: false,',
  '        message: "habat_checkout_cooldown",',
  '        retryAfterSeconds: Math.max(1, Math.ceil((CHECKOUT_COOLDOWN_MS - elapsedMs) / 1000)),',
  '        record: mapRecord(existing),',
  '      });',
  '    }',
  '  }',
].join("\n");

ext = replaceOnce(ext, cooldownAnchor, cooldownReplacement, "server checkout cooldown");
write(extPath, ext);

// ---------------------------------------------------------------------------
// 3) UI: countdown + explicit single-punch modes + canonical v3 correction.
// ---------------------------------------------------------------------------
const appPath = "client/src/pages/habat/HabatAttendanceAppV4.tsx";
let app = read(appPath);

app = replaceOnce(
  app,
  '  const [error, setError] = useState("");\n  const record = context.today;\n  const checkedIn = Boolean(record?.checkInAt);',
  '  const [error, setError] = useState("");\n  const [clockNow, setClockNow] = useState(() => Date.now());\n  const record = context.today;\n  const checkedIn = Boolean(record?.checkInAt);',
  "clock countdown state"
);

app = replaceOnce(
  app,
  '  const checkedOut = Boolean(record?.checkOutAt);\n  const nextType: "check-in" | "check-out" | null = checkedOut ? null : checkedIn ? "check-out" : "check-in";\n\n  async function submitClock() {\n    if (!nextType || busy || !context.principal.canClock) return;',
  [
    '  const checkedOut = Boolean(record?.checkOutAt);',
    '  const nextType: "check-in" | "check-out" | null = checkedOut ? null : checkedIn ? "check-out" : "check-in";',
    '  const checkedInAtMs = record?.checkInAt ? Date.parse(record.checkInAt) : Number.NaN;',
    '  const checkoutRetrySeconds = nextType === "check-out" && Number.isFinite(checkedInAtMs)',
    '    ? Math.max(0, Math.ceil((60_000 - (clockNow - checkedInAtMs)) / 1000))',
    '    : 0;',
    '  const checkoutLocked = nextType === "check-out" && checkoutRetrySeconds > 0;',
    '',
    '  useEffect(() => {',
    '    if (!checkedIn || checkedOut) return;',
    '    setClockNow(Date.now());',
    '    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);',
    '    return () => window.clearInterval(timer);',
    '  }, [checkedIn, checkedOut, record?.checkInAt]);',
    '',
    '  async function submitClock() {',
    '    if (!nextType || busy || checkoutLocked || !context.principal.canClock) return;',
  ].join("\n"),
  "clock cooldown calculation"
);

app = replaceOnce(
  app,
  '  const actionLabel = nextType === "check-in" ? tr(language, "تسجيل حضور", "Clock In") : nextType === "check-out" ? tr(language, "تسجيل انصراف", "Clock Out") : tr(language, "تم اكتمال الدوام", "Shift Completed");',
  '  const actionLabel = checkoutLocked\n    ? tr(language, `يمكنك تسجيل الانصراف بعد ${checkoutRetrySeconds} ثانية`, `Clock out available in ${checkoutRetrySeconds}s`)\n    : nextType === "check-in" ? tr(language, "تسجيل حضور", "Clock In") : nextType === "check-out" ? tr(language, "تسجيل انصراف", "Clock Out") : tr(language, "تم اكتمال الدوام", "Shift Completed");',
  "clock cooldown label"
);

app = replaceOnce(
  app,
  '          disabled={!nextType || busy || !context.principal.canClock}',
  '          disabled={!nextType || busy || checkoutLocked || !context.principal.canClock}',
  "clock cooldown disabled"
);

app = replaceOnce(
  app,
  '            (!nextType || !context.principal.canClock) && "opacity-40"',
  '            (!nextType || checkoutLocked || !context.principal.canClock) && "opacity-40"',
  "clock cooldown styling"
);

app = replaceOnce(
  app,
  '      await habatApi(`v2/records/${encodeURIComponent(record.id)}/correct`, {\n        method: "POST",\n        body: JSON.stringify({\n          checkInAt: fromRiyadhDateTimeLocal(record.attendanceDate + "T" + checkInAt),',
  '      await habatApi(`v3/records/${encodeURIComponent(record.id)}`, {\n        method: "PATCH",\n        body: JSON.stringify({\n          checkInAt: checkInAt ? fromRiyadhDateTimeLocal(record.attendanceDate + "T" + checkInAt) : null,',
  "canonical correction endpoint"
);

app = replaceOnce(
  app,
  '<div className="space-y-2"><Label>{tr(language, "وقت الحضور", "Clock-in Time")}</Label><HabatTimeInput value={checkInAt} onChange={setCheckInAt} className="h-12 rounded-2xl" required /></div>\n          <div className="space-y-2"><Label>{tr(language, "وقت الانصراف", "Clock-out Time")}</Label><HabatTimeInput value={checkOutAt} onChange={setCheckOutAt} className="h-12 rounded-2xl" /></div>',
  '<div className="space-y-2"><Label>{tr(language, "وقت الحضور", "Clock-in Time")}</Label><HabatTimeInput value={checkInAt} onChange={setCheckInAt} className="h-12 rounded-2xl" /></div>\n          <div className="space-y-2"><Label>{tr(language, "وقت الانصراف", "Clock-out Time")}</Label><HabatTimeInput value={checkOutAt} onChange={setCheckOutAt} className="h-12 rounded-2xl" /></div>',
  "correction optional punches"
);

app = replaceOnce(
  app,
  '            <Button type="submit" disabled={saving || reason.trim().length < 3} className="rounded-xl bg-black">',
  '            <Button type="submit" disabled={saving || reason.trim().length < 3 || (!checkInAt && !checkOutAt)} className="rounded-xl bg-black">',
  "correction requires at least one punch"
);

app = replaceOnce(
  app,
  '  const [checkInAt, setCheckInAt] = useState("");\n  const [checkOutAt, setCheckOutAt] = useState("");\n  const [reason, setReason] = useState("");\n  const [saving, setSaving] = useState(false);\n  const [error, setError] = useState("");\n\n  useEffect(() => {\n    if (!day) return;\n    setCheckInAt(day.shift?.startTime || "09:00");\n    setCheckOutAt(day.shift?.endTime || "17:00");',
  '  const [checkInAt, setCheckInAt] = useState("");\n  const [checkOutAt, setCheckOutAt] = useState("");\n  const [punchMode, setPunchMode] = useState<"both" | "check_in" | "check_out">("both");\n  const [reason, setReason] = useState("");\n  const [saving, setSaving] = useState(false);\n  const [error, setError] = useState("");\n\n  useEffect(() => {\n    if (!day) return;\n    setPunchMode("both");\n    setCheckInAt(day.shift?.startTime || "09:00");\n    setCheckOutAt(day.shift?.endTime || "17:00");',
  "manual punch mode state"
);

app = replaceOnce(
  app,
  '          checkInAt: fromRiyadhDateTimeLocal(day.date + "T" + checkInAt),\n          checkOutAt: checkOutAt ? fromRiyadhDateTimeLocal(day.date + "T" + checkOutAt) : null,',
  '          checkInAt: punchMode === "check_out" ? null : (checkInAt ? fromRiyadhDateTimeLocal(day.date + "T" + checkInAt) : null),\n          checkOutAt: punchMode === "check_in" ? null : (checkOutAt ? fromRiyadhDateTimeLocal(day.date + "T" + checkOutAt) : null),',
  "manual punch mode payload"
);

const manualFieldsBefore = '<div className="space-y-2"><Label>{tr(language, "وقت الحضور", "Clock-in Time")}</Label><HabatTimeInput value={checkInAt} onChange={setCheckInAt} className="h-12 rounded-2xl" required /></div>\n          <div className="space-y-2"><Label>{tr(language, "وقت الانصراف", "Clock-out Time")}</Label><HabatTimeInput value={checkOutAt} onChange={setCheckOutAt} className="h-12 rounded-2xl" /></div>';
const manualFieldsAfter = [
  '<div className="space-y-2"><Label>{tr(language, "نوع البصمة", "Punch Type")}</Label><Select value={punchMode} onValueChange={value => setPunchMode(value as "both" | "check_in" | "check_out")}><SelectTrigger className="h-12 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="both">{tr(language, "حضور وانصراف", "Clock In & Out")}</SelectItem><SelectItem value="check_in">{tr(language, "حضور فقط", "Clock In Only")}</SelectItem><SelectItem value="check_out">{tr(language, "انصراف فقط", "Clock Out Only")}</SelectItem></SelectContent></Select></div>',
  '          {punchMode !== "check_out" ? <div className="space-y-2"><Label>{tr(language, "وقت الحضور", "Clock-in Time")}</Label><HabatTimeInput value={checkInAt} onChange={setCheckInAt} className="h-12 rounded-2xl" required /></div> : null}',
  '          {punchMode !== "check_in" ? <div className="space-y-2"><Label>{tr(language, "وقت الانصراف", "Clock-out Time")}</Label><HabatTimeInput value={checkOutAt} onChange={setCheckOutAt} className="h-12 rounded-2xl" required /></div> : null}',
].join("\n");
app = replaceOnce(app, manualFieldsBefore, manualFieldsAfter, "manual explicit punch modes");

write(appPath, app);

// ---------------------------------------------------------------------------
// 4) Friendly errors/status labels for the new core contract.
// ---------------------------------------------------------------------------
const clientPath = "client/src/pages/habat/habatAttendanceClient.ts";
let client = read(clientPath);

client = replaceOnce(
  client,
  '    case "habat_already_checked_out":\n      return "تم تسجيل الانصراف مسبقًا اليوم.";',
  '    case "habat_already_checked_out":\n      return "تم تسجيل الانصراف مسبقًا اليوم.";\n    case "habat_checkout_cooldown": {\n      const payload = error instanceof HabatApiError ? error.payload : null;\n      const seconds = Number(payload?.retryAfterSeconds);\n      return Number.isFinite(seconds)\n        ? `انتظر ${Math.max(1, Math.ceil(seconds))} ثانية قبل تسجيل الانصراف.`\n        : "انتظر دقيقة بعد تسجيل الحضور قبل تسجيل الانصراف.";\n    }',
  "cooldown friendly error"
);

client = replaceOnce(
  client,
  '    case "habat_invalid_attendance_order":\n      return "وقت الانصراف لا يمكن أن يكون قبل وقت الحضور.";',
  '    case "habat_invalid_attendance_order":\n      return "وقت الانصراف لا يمكن أن يكون قبل وقت الحضور.";\n    case "habat_attendance_punch_required":\n      return "حدد بصمة حضور أو انصراف واحدة على الأقل.";',
  "single punch friendly error"
);

client = replaceOnce(
  client,
  '    case "late_early_leave":\n      return "متأخر · انصراف مبكر";\n    default:',
  '    case "late_early_leave":\n      return "متأخر · انصراف مبكر";\n    case "incomplete":\n      return "بصمة ناقصة";\n    default:',
  "incomplete status label"
);
write(clientPath, client);

// ---------------------------------------------------------------------------
// 5) Static contract tests: protect the architectural rules introduced here.
// ---------------------------------------------------------------------------
const testPath = "workers/habat-attendance-core-phase1-contract.test.mjs";
write(testPath, [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  'import fs from "node:fs";',
  '',
  'const v3 = fs.readFileSync(new URL("./habat-attendance-v3.js", import.meta.url), "utf8");',
  'const ext = fs.readFileSync(new URL("./habat-attendance-extensions.js", import.meta.url), "utf8");',
  'const app = fs.readFileSync(new URL("../client/src/pages/habat/HabatAttendanceAppV4.tsx", import.meta.url), "utf8");',
  '',
  'test("v3 is the canonical manager create/update/delete command surface", () => {',
  '  assert.match(v3, /request\.method === "PATCH".*updateAttendanceRecord/s);',
  '  assert.match(v3, /request\.method === "DELETE".*deleteAttendanceRecord/s);',
  '  assert.match(v3, /habat_attendance_punch_required/);',
  '  assert.match(v3, /status: "incomplete"/);',
  '});',
  '',
  'test("employee checkout has a server-side 60 second cooldown", () => {',
  '  assert.match(ext, /CHECKOUT_COOLDOWN_MS = 60 \* 1000/);',
  '  assert.match(ext, /habat_checkout_cooldown/);',
  '  assert.match(ext, /retryAfterSeconds/);',
  '});',
  '',
  'test("attendance UI uses canonical v3 correction and explicit single-punch modes", () => {',
  '  assert.match(app, /v3\/records\/\$\{encodeURIComponent\(record\.id\)\}/);',
  '  assert.match(app, /value="check_in"/);',
  '  assert.match(app, /value="check_out"/);',
  '  assert.match(app, /checkoutRetrySeconds/);',
  '});',
  '',
].join("\n"));

console.log("Applied Habat Attendance Core Phase 1: canonical commands, single punches, and 60-second checkout guard.");
