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
  assert.doesNotMatch(client, /setInterval\([^)]*fetch/);
  assert.doesNotMatch(client, /\bhabatApi\b/);
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
