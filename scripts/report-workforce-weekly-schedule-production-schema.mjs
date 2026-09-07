import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const database = "maedin-attendance";
const wranglerConfig = "workers/wrangler.toml";
const expectedArg = process.argv.find(arg => arg.startsWith("--expect="));
const expected = expectedArg ? Number(expectedArg.split("=")[1]) : null;
if (expectedArg && ![0, 1].includes(expected)) {
  throw new Error("[workforce-weekly-schedule-production-schema] --expect must be 0 or 1");
}

const checks = [
  ["assignment_weekly_rest_weekday", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_assignments') WHERE name='weekly_rest_weekday';"],
  ["assignment_week_pattern_json", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_assignments') WHERE name='week_pattern_json';"],
  ["assignment_reason", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_assignments') WHERE name='reason';"],
  ["assignment_operation_id", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_assignments') WHERE name='operation_id';"],
  ["assignment_updated_at", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_assignments') WHERE name='updated_at';"],
  ["assignment_operation_unique_index", "SELECT COUNT(*) AS value FROM sqlite_master WHERE type='index' AND name='idx_workforce_schedule_assignment_operation_unique';"],
  ["assignment_effective_weekly_rest_index", "SELECT COUNT(*) AS value FROM sqlite_master WHERE type='index' AND name='idx_workforce_schedule_assignments_effective_weekly_rest';"],
];

const forbidden = /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH|REINDEX)\b/i;
for (const [name, sql] of checks) {
  if (!/^\s*SELECT\b/i.test(sql) || forbidden.test(sql)) {
    throw new Error(`[workforce-weekly-schedule-production-schema] non-read-only SQL blocked for ${name}`);
  }
}

function invocation(sql) {
  const wranglerArgs = [
    "wrangler", "d1", "execute", database,
    "--remote", "--config", wranglerConfig,
    "--command", sql,
  ];
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npx", ...wranglerArgs],
    };
  }
  return { command: "npx", args: wranglerArgs };
}

function extractValue(text) {
  const normalized = String(text || "");
  const matches = [...normalized.matchAll(/│\s*([01])\s*│/g)];
  if (matches.length) return Number(matches.at(-1)[1]);
  const jsonLike = normalized.match(/"value"\s*:\s*([01])/);
  if (jsonLike) return Number(jsonLike[1]);
  return null;
}

console.log("[workforce-weekly-schedule-production-schema] READ ONLY - remote D1 schema report\n");
const observed = [];
for (const [name, sql] of checks) {
  console.log(`\n=== ${name} ===`);
  const call = invocation(sql);
  const result = spawnSync(call.command, call.args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  const value = extractValue(`${result.stdout || ""}\n${result.stderr || ""}`);
  if (value == null) {
    console.error(`[workforce-weekly-schedule-production-schema] could not parse value for ${name}`);
    process.exit(2);
  }
  observed.push([name, value]);
}

if (expected !== null) {
  const mismatches = observed.filter(([, value]) => value !== expected);
  if (mismatches.length) {
    console.error(`\n[workforce-weekly-schedule-production-schema] EXPECTATION FAILED - expected every value=${expected}`);
    for (const [name, value] of mismatches) console.error(`  ${name}=${value}`);
    process.exit(3);
  }
  console.log(`\n[workforce-weekly-schedule-production-schema] EXPECTATION PASS - all ${observed.length} values=${expected}.`);
}

console.log("\n[workforce-weekly-schedule-production-schema] COMPLETE - all checks are SELECT-only.");
