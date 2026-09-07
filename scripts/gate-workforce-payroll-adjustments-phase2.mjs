import { spawnSync } from "node:child_process";

const root = process.cwd();

function run(label, command, args) {
  console.log(`\n[workforce-payroll-adjustments-gate] ${label}`);
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

node("integrate payroll adjustments", ["scripts/integrate-workforce-payroll-adjustments.mjs"]);
node("syntax: payroll adjustment service", ["--check", "workers/workforce-payroll-adjustments.js"]);
node("syntax: workforce core", ["--check", "workers/workforce-core.js"]);
node("payroll adjustment contracts", ["--test", "workers/workforce-payroll-adjustments-contract.test.mjs"]);
node("leave-control contracts", ["--test", "workers/workforce-leave-control-contract.test.mjs"]);
node("attendance-operations contracts", ["--test", "workers/workforce-attendance-operations-contract.test.mjs"]);
node("schedule contracts", ["--test", "workers/workforce-schedule-control-contract.test.mjs"]);
node("annual-leave contracts", ["--test", "workers/workforce-annual-leave-contract.test.mjs"]);
node("UI contracts", ["--test", "workers/workforce-ui-contract.test.mjs"]);
node("cutover contracts", ["--test", "workers/workforce-cutover-contract.test.mjs"]);
executable("pnpm", ["check"]);
executable("pnpm", ["build"]);
executable("git", ["status", "--short"]);

console.log("\n[workforce-payroll-adjustments-gate] PASS - manual payroll adjustments integration, contracts, TypeScript, and build completed.");
