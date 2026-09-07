import { spawnSync } from "node:child_process";

const root = process.cwd();
function run(label, command, args) {
  console.log(`\n[workforce-payroll-reports-gate] ${label}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function node(label, args) { run(label, process.execPath, args); }
function executable(name, args) {
  if (process.platform === "win32") run(name, process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", name, ...args]);
  else run(name, name, args);
}

node("integrate payroll reports", ["scripts/integrate-workforce-payroll-reports.mjs"]);
node("syntax: payroll reports", ["--check", "workers/workforce-payroll-reports.js"]);
node("syntax: workforce core", ["--check", "workers/workforce-core.js"]);
node("payroll report contracts", ["--test", "workers/workforce-payroll-reports-contract.test.mjs"]);
node("payroll lifecycle contracts", ["--test", "workers/workforce-payroll-lifecycle-contract.test.mjs"]);
node("payroll readiness contracts", ["--test", "workers/workforce-payroll-readiness-contract.test.mjs"]);
node("manual payroll contracts", ["--test", "workers/workforce-payroll-adjustments-contract.test.mjs"]);
node("attendance operations contracts", ["--test", "workers/workforce-attendance-operations-contract.test.mjs"]);
node("leave lifecycle contracts", ["--test", "workers/workforce-leave-control-contract.test.mjs"]);
node("annual leave contracts", ["--test", "workers/workforce-annual-leave-contract.test.mjs"]);
node("schedule contracts", ["--test", "workers/workforce-schedule-control-contract.test.mjs"]);
node("UI contracts", ["--test", "workers/workforce-ui-contract.test.mjs"]);
node("cutover contracts", ["--test", "workers/workforce-cutover-contract.test.mjs"]);
executable("pnpm", ["check"]);
executable("pnpm", ["build"]);
executable("git", ["status", "--short"]);
console.log("\n[workforce-payroll-reports-gate] PASS - monthly reports, exports, regressions, TypeScript, and build completed.");
