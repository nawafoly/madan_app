import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const stateDir = path.join(os.tmpdir(), "madan-workforce-cutover-test");
const wranglerConfig = path.join("workers", "wrangler.toml");
const database = "maedin-attendance";

// Wrangler is intentionally not a repository dependency today; the normal
// project workflow invokes it through `npx wrangler`. On Windows/Node 24,
// spawning npx.cmd directly can return EINVAL, so route the exact same command
// through cmd.exe (ComSpec). We still keep spawnSync shell:false and all command
// arguments are hard-coded by this local-only harness.
function wranglerInvocation(args) {
  const wranglerArgs = [
    "wrangler",
    "d1",
    "execute",
    database,
    "--local",
    "--persist-to",
    stateDir,
    "--config",
    wranglerConfig,
    ...args,
  ];

  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npx", ...wranglerArgs],
    };
  }

  return { command: "npx", args: wranglerArgs };
}

function run(args) {
  const invocation = wranglerInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function applyFile(file) {
  console.log(`\n[workforce-cutover-local] apply ${file}`);
  run(["--file", file]);
}

console.log(`[workforce-cutover-local] resetting isolated state: ${stateDir}`);
rmSync(stateDir, { recursive: true, force: true });

for (const file of [
  "workers/attendance-migrations/0005_create_habat_attendance.sql",
  "workers/attendance-migrations/0006_habat_attendance_management.sql",
  "workers/attendance-migrations/0007_habat_attendance_day_management.sql",
  "workers/workforce-migrations/0001_workforce_core_foundation.sql",
  "workers/workforce-migrations/tenant-cutover/fixtures/0001_habat_local_fixture.sql",
  "workers/workforce-migrations/tenant-cutover/0001_habat_workforce_seed.sql",
]) {
  applyFile(file);
}

// Run the cutover twice intentionally: the migration must be idempotent.
applyFile("workers/workforce-migrations/tenant-cutover/0001_habat_workforce_seed.sql");

// Do not pass verification SQL through --command on Windows. cmd.exe treats
// parentheses and other SQL characters as shell metacharacters and can truncate
// the argument before Wrangler receives it. A read-only/assertion SQL file keeps
// the verification cross-platform and makes any mismatch fail through CHECK.
console.log("\n[workforce-cutover-local] verify counts, mapping, and idempotency");
applyFile("workers/workforce-migrations/tenant-cutover/fixtures/0002_verify_habat_local_cutover.sql");

console.log("\n[workforce-cutover-local] PASS — isolated schema, fixture mapping, and idempotent rerun completed.");
