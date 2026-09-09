import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  normalizeHabatRealtimeClientId,
  topicForHabatMutation,
  audienceForHabatMutation,
} from "./habat-realtime.js";

test("Habat realtime classifies mutation topics", () => {
  assert.equal(
    topicForHabatMutation("/attendance/habat/v2/shifts/x"),
    "shifts"
  );

  assert.equal(
    topicForHabatMutation("/attendance/habat/v2/assignments"),
    "assignments"
  );

  assert.equal(
    topicForHabatMutation("/attendance/habat/v2/records/x/correct"),
    "records"
  );

  assert.equal(
    topicForHabatMutation("/attendance/habat/v3/day-overrides"),
    "records"
  );

  assert.equal(
    topicForHabatMutation("/attendance/habat/v2/check-in"),
    "attendance"
  );

  assert.equal(
    topicForHabatMutation("/attendance/habat/v2/settings"),
    "settings"
  );

  assert.equal(
    topicForHabatMutation("/attendance/habat/access/x"),
    "access"
  );

  assert.equal(
    topicForHabatMutation("/attendance/habat/workforce/v1/schedule"),
    "workforce"
  );
});

test("Habat realtime client IDs are bounded and transport-safe", () => {
  assert.equal(
    normalizeHabatRealtimeClientId(" abc<>123 "),
    "abc123"
  );

  assert.equal(
    normalizeHabatRealtimeClientId("a".repeat(200)).length,
    128
  );
});

test("Habat runtime publishes only after successful routed mutations", () => {
  const runtime = fs.readFileSync(
    new URL("./habat-runtime.js", import.meta.url),
    "utf8"
  );

  assert.match(
    runtime,
    /pathname === "\/attendance\/habat\/realtime\/ticket"/
  );

  assert.match(
    runtime,
    /pathname === "\/attendance\/habat\/realtime"/
  );

  assert.match(
    runtime,
    /if \(isMutation && response\?\.ok\)/
  );

  assert.match(
    runtime,
    /publishHabatRealtimeMutation/
  );
});

test("Habat browser realtime bootstraps a one-time ticket and never polls D1", () => {
  const client = fs.readFileSync(
    new URL(
      "../client/src/pages/habat/habatRealtimeClient.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(client, /new WebSocket\(webSocketUrl\)/);
  assert.match(client, /fetch\("\/habat-api\/realtime\/ticket"/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /cache: "no-store"/);
  assert.doesNotMatch(client, /setInterval\([^)]*fetch/);
  assert.doesNotMatch(client, /\bhabatApi\b/);
});

test("Habat realtime reconnects after subscriber churn during ticket bootstrap", () => {
  const client = fs.readFileSync(
    new URL(
      "../client/src/pages/habat/habatRealtimeClient.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(client, /reconnectRequestedAfterFlight/);
  assert.match(
    client,
    /if \(connectInFlight\) \{[\s\S]*reconnectRequestedAfterFlight = true;[\s\S]*return;[\s\S]*\}/
  );
  assert.match(
    client,
    /if \(reconnectRequestedAfterFlight && listeners\.size > 0\) \{[\s\S]*void connect\(true\);[\s\S]*\}/
  );
});

test("Habat realtime same-client events still refresh subscribers", () => {
  const client = fs.readFileSync(
    new URL(
      "../client/src/pages/habat/habatRealtimeClient.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(client, /emit\(event\)/);
  assert.doesNotMatch(client, /sourceClientId[\s\S]{0,120}return;/);
  assert.doesNotMatch(client, /getHabatRealtimeClientId\(\)[\s\S]{0,80}sourceClientId/);
});

test("Habat Worker entry exports and configures the realtime Durable Object", () => {
  const bootstrap = fs.readFileSync(
    new URL("./r2-upload-bootstrap.js", import.meta.url),
    "utf8"
  );

  const wrangler = fs.readFileSync(
    new URL("./wrangler.toml", import.meta.url),
    "utf8"
  );

  assert.match(
    bootstrap,
    /configureHabatRealtimeBinding/
  );

  assert.match(
    bootstrap,
    /export \{ HabatRealtimeHub \}/
  );

  assert.match(
    wrangler,
    /name = "HABAT_REALTIME"/
  );

  assert.match(
    wrangler,
    /class_name = "HabatRealtimeHub"/
  );
});

test("Habat V4 actually subscribes to realtime", () => {
  const v4 = fs.readFileSync(
    new URL(
      "../client/src/pages/habat/HabatAttendanceAppV4.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    v4,
    /import \{[^}]*useHabatRealtimeRefresh[^}]*\} from "\.\/habatRealtimeClient";/
  );

  assert.match(
    v4,
    /useHabatRealtimeRefresh\(refreshFromRealtime\);/
  );

  assert.match(
    v4,
    /key=\{realtimeRevision\}/
  );
});

test("Habat realtime targets employee attendance plus managers", () => {
  assert.deepEqual(
    audienceForHabatMutation({
      pathname: "/attendance/habat/v2/check-in",
      requester: { accessId: "access_employee_1" },
      responsePayload: {},
    }),
    {
      scope: "access",
      accessIds: ["access_employee_1"],
    }
  );
});

test("Habat realtime targets shift assignment employee", () => {
  assert.deepEqual(
    audienceForHabatMutation({
      pathname: "/attendance/habat/v2/assignments",
      requester: { accessId: "manager" },
      responsePayload: {
        assignment: {
          accessId: "access_employee_2",
        },
      },
    }),
    {
      scope: "access",
      accessIds: ["access_employee_2"],
    }
  );
});

test("Habat realtime keeps global changes global", () => {
  assert.deepEqual(
    audienceForHabatMutation({
      pathname: "/attendance/habat/v2/settings",
      requester: { accessId: "manager" },
      responsePayload: {},
    }),
    {
      scope: "all",
      accessIds: [],
    }
  );

  assert.deepEqual(
    audienceForHabatMutation({
      pathname: "/attendance/habat/v2/shifts/shift-1",
      requester: { accessId: "manager" },
      responsePayload: {},
    }),
    {
      scope: "all",
      accessIds: [],
    }
  );
});

test("Habat Durable Object uses tagged websocket delivery", () => {
  const realtime = fs.readFileSync(
    new URL("./habat-realtime.js", import.meta.url),
    "utf8"
  );

  assert.match(
    realtime,
    /getWebSockets\("manager"\)/
  );

  assert.match(
    realtime,
    /getWebSockets\(\s*`access:\$\{normalized\}`\s*\)/
  );

  assert.match(
    realtime,
    /const \{\s*audience: _internalAudience,\s*\.\.\.publicEvent\s*\}/
  );
});

test("Habat realtime tickets are one-time and expire in Durable Object storage", () => {
  const realtime = fs.readFileSync(
    new URL("./habat-realtime.js", import.meta.url),
    "utf8"
  );

  assert.match(realtime, /habat-realtime\.internal\/ticket/);
  assert.match(realtime, /this\.state\.storage\.put\(`ticket:/);
  assert.match(realtime, /this\.state\.storage\.delete\(key\)/);
  assert.match(realtime, /expiresAt: Date\.now\(\) \+ 60_000/);
});

test("Habat and Workforce user-facing time display is 12-hour", () => {
  const files = [
    "../client/src/pages/habat/HabatTimeInput.tsx",
    "../client/src/pages/habat/HabatDatePicker.tsx",
    "../client/src/features/workforce/WorkforceAttendanceOperationsPanel.tsx",
    "../client/src/features/workforce/WorkforceScheduleControlPanel.tsx",
    "../client/src/features/workforce/WorkforceEmployeeFile.tsx",
    "../client/src/components/EmployeeTodayAttendancePanel.tsx",
  ].map(path => fs.readFileSync(new URL(path, import.meta.url), "utf8"));

  const combined = files.join("\n");
  assert.match(combined, /formatHabatClockTime\([^)]*language/);
  assert.match(combined, /formatPickerTime\(selected\.hour, selected\.minute, language\)/);
  assert.match(combined, /pickerHour12\(draftHour\)/);
  assert.doesNotMatch(combined, /hour12\s*:\s*false/);
  assert.doesNotMatch(combined, /slice\(0,\s*5\)/);
  assert.doesNotMatch(combined, /\$\{context\.shift\.startTime\}[^`]*\$\{context\.shift\.endTime\}/);
  assert.doesNotMatch(combined, /\$\{item\.startTime\}[^`]*\$\{item\.endTime\}/);
});

test("Workforce employee weekly schedule reloads the latest saved assignment", () => {
  const file = fs.readFileSync(
    new URL(
      "../client/src/features/workforce/WorkforceEmployeeFile.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(file, /const savedWeekPlan = weekPlanFromAssignment\(nextAssignments\[0\]\);/);
  assert.match(file, /setWeekPlan\(savedWeekPlan\);/);
  assert.match(file, /setSavedWeekPlanSignature\(weekPlanSignature\(savedWeekPlan\)\);/);
  assert.match(file, /hasUnsavedScheduleChanges/);
  assert.match(file, /Latest saved schedule loaded/);
});

test("Workforce schedule UI does not render technical schedule IDs", () => {
  const file = fs.readFileSync(
    new URL(
      "../client/src/features/workforce/WorkforceEmployeeFile.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(file, /formatHabatShiftRange\(item\.startTime, item\.endTime, language\)/);
  assert.match(file, /dateText\(item\.effective_from, language\)/);
  assert.match(file, /Legacy baseline/);
  const scheduleTab = file.slice(file.indexOf('<TabsContent value="schedule"'));
  assert.doesNotMatch(scheduleTab, />[^<]*(?:template_id|week_pattern_json)[^<]*</);
  assert.doesNotMatch(scheduleTab, />\s*\{config\.templateId\}\s*</);
  assert.doesNotMatch(scheduleTab, />\s*\{item\.id\}\s*</);
  assert.doesNotMatch(file, /return `\$\{templateId\}/);
});

test("Workforce attendance resolves live template time while preserving completed history", () => {
  const resolver = fs.readFileSync(
    new URL("./workforce-schedule-control.js", import.meta.url),
    "utf8"
  );
  const operations = fs.readFileSync(
    new URL("./workforce-attendance-operations.js", import.meta.url),
    "utf8"
  );
  const habatV2 = fs.readFileSync(
    new URL("./habat-attendance-v2.js", import.meta.url),
    "utf8"
  );

  assert.match(resolver, /JOIN workforce_schedule_templates t[\s\S]*ON t\.id = a\.template_id/);
  assert.match(resolver, /assignmentDayTemplate = await db[\s\S]*FROM workforce_schedule_templates/);
  assert.match(operations, /calculateAttendanceMetrics\(\{[\s\S]*schedule,/);
  assert.match(operations, /const historicalComplete = date && date < today && Boolean\(checkInAt && checkOutAt\);/);
  assert.match(habatV2, /JOIN habat_attendance_shifts s ON s\.id = a\.shift_id/);
});
