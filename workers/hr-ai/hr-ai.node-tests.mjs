import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { canUseHrAi, isWriteIntent, safeContext, sanitizeConversation } from "./policy.js";
import { WorkersAiProvider } from "./provider.js";
import { executeHrAiTool } from "./tools.js";
import { handleHrAiChat } from "./service.js";

class FakeDb {
  constructor({ all = async () => [], first = async () => null } = {}) {
    this.onAll = all;
    this.onFirst = first;
  }
  prepare(sql) {
    return {
      bind: (...args) => ({
        all: async () => ({ results: await this.onAll(sql, args) }),
        first: async () => this.onFirst(sql, args),
      }),
      all: async () => ({ results: await this.onAll(sql, []) }),
      first: async () => this.onFirst(sql, []),
    };
  }
}

const activeEmployee = {
  id: "emp-1",
  auth_uid: "uid-1",
  name: "أحمد",
  title: "موظف",
  department: "تشغيل",
  employee_code: "E1",
  employment_status: "active",
  is_active: 1,
  shift_start_time: "08:00",
  shift_end_time: "16:00",
  weekly_off_days_json: "[]",
  allowed_zone_ids_json: "[]",
};

function hrDbFor({ employees = [activeEmployee], leaves = [], absences = [], payroll = null } = {}) {
  return new FakeDb({
    all: async sql => {
      if (sql.includes("FROM employees")) return employees;
      if (sql.includes("FROM employee_leave_requests")) return leaves;
      if (sql.includes("FROM employee_absences")) return absences;
      return [];
    },
    first: async (sql, args) => {
      if (sql.includes("FROM employees") && sql.includes("WHERE id = ?")) {
        return employees.find(row => row.id === args[0]) || null;
      }
      if (sql.includes("FROM employee_payroll_records")) return payroll;
      return null;
    },
  });
}

function attendanceDbFor(records = [], fail = null) {
  return new FakeDb({
    all: async sql => {
      if (fail) throw fail;
      if (sql.includes("FROM attendance_records")) return records;
      return [];
    },
  });
}

const allReadPerms = ["hr_ai.view", "employees.view", "attendance.view", "leave_requests.view", "absences.view", "payroll.view"];

// 1
test("unauthenticated subject cannot use HR AI", () => {
  assert.equal(canUseHrAi(null), false);
});

// 2
test("regular employee without hr_ai.view is denied", () => {
  assert.equal(canUseHrAi({ permissions: [] }), false);
});

// 3
test("HR/Admin capability is permission-driven", () => {
  assert.equal(canUseHrAi({ permissions: ["hr_ai.view"] }), true);
});

// 4
test("AI tool SQL source contains no mutation statements", async () => {
  const source = await readFile(new URL("./tools.js", import.meta.url), "utf8");
  assert.equal(/\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE)\s+(?:INTO|TABLE|FROM|employees|attendance_records|employee_)/i.test(source), false);
  assert.equal(/executeSQL|runArbitraryQuery/i.test(source), false);
});

// 5
test("invalid employeeId returns a clean error", async () => {
  await assert.rejects(
    executeHrAiTool("getEmployeeSummary", { employeeId: "" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor(), permissions: allReadPerms }),
    /invalid_employee_id/
  );
});

// 6
test("missing checkout is detected", async () => {
  const records = [{ id: "r1", employee_uid: "uid-1", employee_doc_id: "emp-1", type: "check_in", server_time: "2026-08-10T05:03:00.000Z", result: "allowed" }];
  const result = await executeHrAiTool("getMissingCheckouts", { date: "2026-08-10" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor(records), permissions: allReadPerms });
  assert.equal(result.count, 1);
  assert.equal(result.employees[0].name, "أحمد");
  assert.equal(result.employees[0].checkIn, "08:03");
});

// 7
test("attendance plus approved leave conflict is detected", async () => {
  const records = [{ id: "r1", employee_uid: "uid-1", employee_doc_id: "emp-1", type: "check_in", server_time: "2026-08-10T05:00:00.000Z", result: "allowed" }];
  const leaves = [{ id: "l1", employee_id: "emp-1", employee_uid: "uid-1", employee_name: "أحمد", leave_type: "annual", start_date: "2026-08-10", end_date: "2026-08-10", cancelled_date_keys_json: "[]" }];
  const result = await executeHrAiTool("getAttendanceConflicts", { date: "2026-08-10" }, { hrDb: hrDbFor({ leaves }), attendanceDb: attendanceDbFor(records), permissions: allReadPerms });
  assert.equal(result.count, 1);
  assert.equal(result.conflicts[0].type, "approved_leave_with_attendance");
});

// 8
test("unknown attendance employee mapping is detected", async () => {
  const records = [{ id: "orphan-1", employee_uid: "unknown-uid", employee_doc_id: "old-id", type: "check_in", server_time: "2026-08-10T05:00:00.000Z", result: "allowed" }];
  const result = await executeHrAiTool("getOrphanAttendanceRecords", { dateFrom: "2026-08-01", dateTo: "2026-08-10" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor(records), permissions: allReadPerms });
  assert.equal(result.count, 1);
  assert.equal(result.records[0].employeeUid, "unknown-uid");
});

// 9
test("empty result stays explicit and empty", async () => {
  const result = await executeHrAiTool("getMissingCheckouts", { date: "2026-08-10" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor([]), permissions: allReadPerms });
  assert.deepEqual(result.employees, []);
  assert.equal(result.count, 0);
});

// 10
test("AI provider failure is surfaced", async () => {
  const provider = new WorkersAiProvider({ run: async () => { throw new Error("provider exploded with secret detail"); } });
  await assert.rejects(provider.answer([], [], "system"), /provider exploded/);
});

// 11
test("backend attendance error is propagated as a bounded tool failure", async () => {
  await assert.rejects(
    executeHrAiTool("getAttendanceForDate", { date: "2026-08-10" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor([], new Error("db timeout")), permissions: allReadPerms }),
    /db timeout/
  );
});

// 12
test("conversation/context sanitizers do not forward auth-like object fields", () => {
  const messages = sanitizeConversation([{ role: "user", content: "hello", authorization: "Bearer secret", token: "secret" }]);
  assert.deepEqual(messages, [{ role: "user", content: "hello" }]);
  assert.deepEqual(safeContext({ employeeId: "emp-1", route: "/hr/employees", token: "secret" }), { employeeId: "emp-1", route: "/hr/employees" });
});

// 13
test("write prompt is blocked before any AI/model/database call", async () => {
  let aiCalls = 0;
  const result = await handleHrAiChat(
    { messages: [{ role: "user", content: "عدل حضور أحمد اليوم" }], language: "ar" },
    { env: { AI: { run: async () => { aiCalls += 1; throw new Error("must not run"); } }, HR_DB: null, ATTENDANCE_DB: null }, requester: { uid: "admin-1", permissions: allReadPerms } }
  );
  assert.equal(result.ok, true);
  assert.equal(result.blockedAction, true);
  assert.equal(aiCalls, 0);
  assert.match(result.answer, /للقراءة والتحليل فقط/);
});

// 14
test("write intent detector covers destructive English and Arabic requests", () => {
  assert.equal(isWriteIntent("احذف سجل الحضور"), true);
  assert.equal(isWriteIntent("approve this leave"), true);
  assert.equal(isWriteIntent("مين متأخر اليوم؟"), false);
  assert.equal(isWriteIntent("هل فيه سجلات غير منطقية؟"), false);
  assert.equal(isWriteIntent("هل فيه Employee ID غير مربوط؟"), false);
  assert.equal(isWriteIntent("غير جدول أحمد"), true);
});

// 15
test("payroll tool requires payroll.view", async () => {
  await assert.rejects(
    executeHrAiTool("getEmployeePayrollSummary", { employeeId: "emp-1", payrollMonth: "2026-08" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor(), permissions: ["employees.view", "attendance.view"] }),
    /payroll_view_forbidden/
  );
});

// 16
test("today without attendance is pending, not absent", async () => {
  const result = await executeHrAiTool("getAbsentEmployees", { date: "2026-08-10" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor([]), permissions: allReadPerms });
  assert.equal(result.count, 0);
  assert.match(result.note, /today_pending/);
});

// 17
test("role name alone never bypasses backend HR AI permission", () => {
  assert.equal(canUseHrAi({ account: { role_key: "owner" }, permissions: [] }), false);
  assert.equal(canUseHrAi({ account: { role_key: "admin" }, permissions: [] }), false);
});

// 18
test("structured tool logs do not include raw error text", async () => {
  const source = await readFile(new URL("./service.js", import.meta.url), "utf8");
  const logLines = source.split("\n").filter(line => line.includes('event: "hr_ai_tool"'));
  assert.ok(logLines.length >= 2);
  assert.ok(logLines.every(line => !line.includes("error.message") && !line.includes("code:")));
});

// 19
test("attendance-derived absence tools respect leave permission denies", async () => {
  await assert.rejects(
    executeHrAiTool("getAbsentEmployees", { date: "2026-08-01" }, {
      hrDb: hrDbFor(),
      attendanceDb: attendanceDbFor([]),
      permissions: ["attendance.view", "employees.view"],
    }),
    /leave_requests_view_forbidden/
  );
});

// 20
test("checkout without checkin is detected by diagnostics", async () => {
  const records = [{ id: "r-out", employee_uid: "uid-1", employee_doc_id: "emp-1", type: "check_out", server_time: "2026-08-10T13:00:00.000Z", result: "allowed" }];
  const result = await executeHrAiTool("getHrSystemDiagnostics", { date: "2026-08-10" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor(records), permissions: allReadPerms });
  assert.ok(result.issues.some(issue => issue.type === "checkout_without_checkin"));
});

// 21
test("a second checkin after a completed pair remains a missing checkout", async () => {
  const records = [
    { id: "r1", employee_uid: "uid-1", employee_doc_id: "emp-1", type: "check_in", server_time: "2026-08-10T05:00:00.000Z", result: "allowed" },
    { id: "r2", employee_uid: "uid-1", employee_doc_id: "emp-1", type: "check_out", server_time: "2026-08-10T10:00:00.000Z", result: "allowed" },
    { id: "r3", employee_uid: "uid-1", employee_doc_id: "emp-1", type: "check_in", server_time: "2026-08-10T12:00:00.000Z", result: "allowed" },
  ];
  const result = await executeHrAiTool("getMissingCheckouts", { date: "2026-08-10" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor(records), permissions: allReadPerms });
  assert.equal(result.count, 1);
  assert.equal(result.employees[0].checkIn, "15:00");
});

// 22
test("general employee lookup omits auth UID from model-visible results", async () => {
  const search = await executeHrAiTool("searchEmployees", { query: "أحمد" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor(), permissions: allReadPerms });
  assert.equal(search.employees[0].id, "emp-1");
  assert.equal(Object.hasOwn(search.employees[0], "auth_uid"), false);

  const summary = await executeHrAiTool("getEmployeeSummary", { employeeId: "emp-1" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor(), permissions: allReadPerms });
  assert.equal(Object.hasOwn(summary.employee, "authUid"), false);
});

// 23
test("daily attendance output exposes business identity, not Firebase UID", async () => {
  const records = [{ id: "r1", employee_uid: "uid-1", employee_doc_id: "emp-1", type: "check_in", server_time: "2026-08-10T05:03:00.000Z", result: "allowed", zone_name: "المكتب" }];
  const result = await executeHrAiTool("getAttendanceForDate", { date: "2026-08-10" }, { hrDb: hrDbFor(), attendanceDb: attendanceDbFor(records), permissions: allReadPerms });
  assert.equal(result.records[0].employeeId, "emp-1");
  assert.equal(result.records[0].name, "أحمد");
  assert.equal(Object.hasOwn(result.records[0], "employeeUid"), false);
});
