import { spawnSync } from "node:child_process";

const root = process.cwd();

function run(label, command, args) {
  console.log(`\n[workforce-operations-gate] ${label}`);
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

node("integrate leave lifecycle", ["scripts/integrate-workforce-leave-control.mjs"]);
node("integrate attendance operations", ["scripts/integrate-workforce-attendance-operations.mjs"]);
node("syntax: leave control", ["--check", "workers/workforce-leave-control.js"]);
node("syntax: attendance operations", ["--check", "workers/workforce-attendance-operations.js"]);
node("syntax: workforce core", ["--check", "workers/workforce-core.js"]);
node("syntax: Habbat edge adapter", ["--check", "workers/habat-workforce-adapter.js"]);
node("leave-control contracts", ["--test", "workers/workforce-leave-control-contract.test.mjs"]);
node("attendance-operations contracts", ["--test", "workers/workforce-attendance-operations-contract.test.mjs"]);
node("combined rollout safety", ["--test", "workers/workforce-operations-rollout-contract.test.mjs"]);
node("annual-leave contracts", ["--test", "workers/workforce-annual-leave-contract.test.mjs"]);
node("schedule contracts", ["--test", "workers/workforce-schedule-control-contract.test.mjs"]);
node("UI contracts", ["--test", "workers/workforce-ui-contract.test.mjs"]);
node("cutover contracts", ["--test", "workers/workforce-cutover-contract.test.mjs"]);
executable("pnpm", ["check"]);
executable("pnpm", ["build"]);
executable("git", ["status", "--short"]);

console.log("\n[workforce-operations-gate] PASS - leave lifecycle + attendance operations integration, contracts, TypeScript, and build completed.");
