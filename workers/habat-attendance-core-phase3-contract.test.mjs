import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const v3 = fs.readFileSync(new URL("./habat-attendance-v3.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../client/src/pages/habat/HabatAttendanceAppV4.tsx", import.meta.url), "utf8");

test("v3 exposes the canonical attendance records read surface", () => {
  assert.match(v3, /subpath === "\/records"/);
  assert.match(v3, /return listAttendanceRecords\(db, url, principal\)/);
  assert.match(v3, /async function listAttendanceRecords/);
  assert.match(v3, /access_id = \?/);
  assert.match(v3, /attendance_status = \?/);
});

test("manager attendance records no longer read from the v2 records endpoint", () => {
  assert.doesNotMatch(app, /v2\/records\?/);
  assert.match(app, /v3\/records\?/);
  assert.match(app, /params\.set\("accessId", employeeAccessId\)/);
});

test("manager record filtering uses canonical access identity instead of email", () => {
  assert.match(app, /employeeAccessId/);
  assert.doesNotMatch(app, /params\.set\("email", employeeEmail\)/);
  assert.match(app, /value=\{account\.id\}/);
});
