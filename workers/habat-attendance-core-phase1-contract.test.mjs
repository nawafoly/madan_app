import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const v3 = fs.readFileSync(new URL("./habat-attendance-v3.js", import.meta.url), "utf8");
const ext = fs.readFileSync(new URL("./habat-attendance-extensions.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../client/src/pages/habat/HabatAttendanceAppV4.tsx", import.meta.url), "utf8");

test("v3 is the canonical manager create/update/delete command surface", () => {
  assert.match(v3, /request\.method === "PATCH".*updateAttendanceRecord/s);
  assert.match(v3, /request\.method === "DELETE".*deleteAttendanceRecord/s);
  assert.match(v3, /habat_attendance_punch_required/);
  assert.match(v3, /status: "incomplete"/);
});

test("employee checkout has a server-side 60 second cooldown", () => {
  assert.match(ext, /CHECKOUT_COOLDOWN_MS = 60 \* 1000/);
  assert.match(ext, /habat_checkout_cooldown/);
  assert.match(ext, /retryAfterSeconds/);
});

test("attendance UI uses canonical v3 correction and explicit single-punch modes", () => {
  assert.ok(app.includes("v3/records/${encodeURIComponent(record.id)}"));
  assert.match(app, /value="check_in"/);
  assert.match(app, /value="check_out"/);
  assert.match(app, /checkoutRetrySeconds/);
});
