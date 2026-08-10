import test from "node:test";
import assert from "node:assert/strict";

import { getDefaultAiDate } from "./tools.js";
import { getHelpReply, getSmallTalkReply, handleHrAiChat, resolveDeterministicToolCalls } from "./service.js";

const allReadPerms = [
  "hr_ai.view",
  "employees.view",
  "attendance.view",
  "leave_requests.view",
  "absences.view",
  "payroll.view",
];

test("greeting never routes to attendance diagnostics", async () => {
  assert.match(getSmallTalkReply("السلام علكيم", "ar"), /وعليكم السلام/);
  assert.deepEqual(resolveDeterministicToolCalls("السلام عليكم", {}), []);

  let aiCalls = 0;
  const result = await handleHrAiChat(
    { messages: [{ role: "user", content: "السلام علكيم" }], language: "ar" },
    {
      env: {
        AI: { run: async () => { aiCalls += 1; throw new Error("unexpected_ai_call"); } },
        HR_DB: null,
        ATTENDANCE_DB: null,
      },
      requester: { uid: "admin-1", permissions: allReadPerms },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(aiCalls, 0);
  assert.deepEqual(result.toolResults, []);
  assert.doesNotMatch(result.answer, /pending|لا توجد بيانات/);
});

test("who checked in today routes to today's attendance records", () => {
  const calls = resolveDeterministicToolCalls("مين بصم اليوم؟", {});
  assert.deepEqual(calls, [
    { name: "getAttendanceForDate", arguments: { date: getDefaultAiDate() } },
  ]);
});

test("today actions wording routes to attendance records", () => {
  const calls = resolveDeterministicToolCalls("ايش الاجرائات اللي صارت اليوم", {});
  assert.deepEqual(calls, [
    { name: "getAttendanceForDate", arguments: { date: getDefaultAiDate() } },
  ]);
});

test("attendance issues today still routes to diagnostics", () => {
  const calls = resolveDeterministicToolCalls("مشاكل الحضور اليوم", {});
  assert.deepEqual(calls, [
    { name: "getHrSystemDiagnostics", arguments: { date: getDefaultAiDate() } },
  ]);
});

test("unknown chat no longer silently falls back to diagnostics", () => {
  assert.deepEqual(resolveDeterministicToolCalls("وش الأخبار؟", {}), []);
});

test("present employees wording routes to today's attendance records", () => {
  assert.deepEqual(resolveDeterministicToolCalls("الموظفين الحاضرين", {}), [
    { name: "getAttendanceForDate", arguments: { date: getDefaultAiDate() } },
  ]);
});

test("payroll by employee name starts with safe employee search", () => {
  assert.deepEqual(resolveDeterministicToolCalls("كم راتب نواف؟", {}), [
    { name: "searchEmployees", arguments: { query: "نواف", limit: 5 } },
  ]);
});

test("attendance branch/location question routes to today's attendance records", () => {
  assert.deepEqual(resolveDeterministicToolCalls("كم فرع بصمه عندنا و كل فرع اذكر الاشخاص اللي فيهم", {}), [
    { name: "getAttendanceForDate", arguments: { date: getDefaultAiDate() } },
  ]);
});

test("capabilities/help question is answered without database access", async () => {
  assert.match(getHelpReply("اعطيني كلمات البحث اللي تعرفها", "ar"), /مين بصم اليوم/);

  let aiCalls = 0;
  const result = await handleHrAiChat(
    { messages: [{ role: "user", content: "اعطيني كلمات البحث اللي تعرفها" }], language: "ar" },
    {
      env: {
        AI: { run: async () => { aiCalls += 1; throw new Error("unexpected_ai_call"); } },
        HR_DB: null,
        ATTENDANCE_DB: null,
      },
      requester: { uid: "admin-1", permissions: allReadPerms },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(aiCalls, 0);
  assert.deepEqual(result.toolResults, []);
  assert.match(result.answer, /الرواتب/);
});
