import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workforce = fs.readFileSync(new URL("../client/src/features/workforce/WorkforceEmployeeFile.tsx", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../client/src/pages/habat/HabatAttendanceAppV4.tsx", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../client/src/pages/habat/HabatEmployeeAttendancePanel.tsx", import.meta.url), "utf8");

test("employee file no longer depends on legacy attendance injection", () => {
  assert.doesNotMatch(workforce, /legacyAttendance/);
  assert.doesNotMatch(app, /legacyAttendance/);
  assert.match(workforce, /attendanceAccess\?: HabatAccessAccount/);
  assert.match(workforce, /<HabatEmployeeAttendancePanel access=\{attendanceAccess\}/);
});

test("attendance operations are rendered inside the attendance tab", () => {
  const attendanceTab = workforce.indexOf('<TabsContent value="attendance"');
  const operations = workforce.indexOf("<WorkforceAttendanceOperationsPanel", attendanceTab);
  assert.ok(attendanceTab >= 0);
  assert.ok(operations > attendanceTab);
});

test("employee attendance panel uses only canonical v3 attendance commands", () => {
  assert.match(panel, /v3\/month/);
  assert.match(panel, /v3\/records\/manual/);
  assert.ok(panel.includes("v3/records/${encodeURIComponent(editor.record.id)}"));
  assert.ok(panel.includes("v3/records/${encodeURIComponent(record.id)}"));
  assert.match(panel, /method: "PATCH"/);
  assert.match(panel, /method: "DELETE"/);
  assert.match(panel, /value="check_out"/);
});
