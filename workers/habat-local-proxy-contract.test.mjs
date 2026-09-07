import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const vite = read("vite.config.ts");
const pagesProxy = read("functions/habat-api/[[path]].js");
const client = read("client/src/pages/habat/habatAttendanceClient.ts");
const main = read("client/src/main.tsx");

const WORKER_ORIGIN = "https://upload.maedin2026.workers.dev";

test("Habbat browser client stays on the same-origin /habat-api boundary", () => {
  assert.match(client, /fetch\(`\/habat-api\/\$\{path\.replace/);
  assert.doesNotMatch(client, /fetch\(`https:\/\/upload\.maedin2026\.workers\.dev/);
});

test("Cloudflare Pages and local Vite proxy target the same Habbat Worker boundary", () => {
  assert.match(pagesProxy, new RegExp(WORKER_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(pagesProxy, /\/attendance\/habat\/\$\{parts\.join/);

  assert.match(vite, /"\/habat-api"\s*:\s*\{/);
  assert.match(vite, new RegExp(`target:\\s*"${WORKER_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(vite, /requestPath\.replace\(\/\^\\\/habat-api\/,\s*"\/attendance\/habat"\)/);
});

test("local Habbat routing remains a Vite dev-server concern, not a production app rewrite", () => {
  const serverIndex = vite.indexOf("server:");
  const proxyIndex = vite.indexOf("proxy:");
  const buildIndex = vite.indexOf("build:");
  assert.ok(serverIndex >= 0 && proxyIndex > serverIndex, "proxy must live under Vite server config");
  assert.ok(buildIndex >= 0 && buildIndex < serverIndex, "build config must remain independent from dev proxy");
});

test("Maedin remains the default runtime and Habbat requires explicit VITE_APP_MODE", () => {
  assert.match(main, /VITE_APP_MODE/);
  assert.match(main, /appMode\s*===\s*"habat-attendance"\s*\?\s*HabatAttendanceRuntime\s*:\s*App/);
});
