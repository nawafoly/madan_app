import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const persist = fs.mkdtempSync(path.join(os.tmpdir(), "madan-workforce-schedule-"));

function run(label, command, args) {
  console.log(`\n[workforce-schedule-gate] ${label}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function node(label, args) {
  run(label, process.execPath, args);
}

function executable(name, args) {
  if (process.platform === "win32") {
    run(name, process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", name, ...args]);
  } else {
    run(name, name, args);
  }
}

function wranglerLocal(label, file) {
  const args = [
    "wrangler", "d1", "execute", "maedin-attendance",
    "--local",
    "--persist-to", persist,
    "--config", "workers/wrangler.toml",
    "--file", file,
  ];
  if (process.platform === "win32") {
    run(label, process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npx", ...args]);
  } else {
    run(label, "npx", args);
  }
}

try {
  node("integrate schedule control", ["scripts/integrate-workforce-schedule-control.mjs"]);
  node("syntax: schedule service", ["--check", "workers/workforce-schedule-control.js"]);
  node("schedule contracts", ["--test", "workers/workforce-schedule-control-contract.test.mjs"]);
  node("schedule production reporter contracts", ["--test", "workers/workforce-schedule-production-reporter-contract.test.mjs"]);
  node("annual leave contracts", ["--test", "workers/workforce-annual-leave-contract.test.mjs"]);
  node("UI contracts", ["--test", "workers/workforce-ui-contract.test.mjs"]);
  node("cutover contracts", ["--test", "workers/workforce-cutover-contract.test.mjs"]);

  wranglerLocal("local migration 0001", "workers/workforce-migrations/0001_workforce_core_foundation.sql");
  wranglerLocal("local migration 0002", "workers/workforce-migrations/0002_workforce_annual_leave_ledger.sql");
  wranglerLocal("local migration 0003", "workers/workforce-migrations/0003_workforce_schedule_control.sql");

  executable("pnpm", ["check"]);
  executable("pnpm", ["build"]);

  node("production schema preflight (READ ONLY)", ["scripts/report-workforce-schedule-production-schema.mjs"]);
  executable("git", ["status", "--short"]);

  console.log("\n[workforce-schedule-gate] PASS — local integration/tests/migrations/check/build complete; Production schema report above is read-only.");
} finally {
  fs.rmSync(persist, { recursive: true, force: true });
}
