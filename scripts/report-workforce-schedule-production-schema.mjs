import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const database = "maedin-attendance";
const wranglerConfig = "workers/wrangler.toml";
const expectedArg = process.argv.find(arg => arg.startsWith("--expect="));
const expected = expectedArg ? Number(expectedArg.split("=")[1]) : null;
if (expectedArg && ![0, 1].includes(expected)) {
  throw new Error("[workforce-schedule-production-schema] --expect must be 0 or 1");
}

const checks = [
  ["schedule_status", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_exceptions') WHERE name='status';"],
  ["schedule_source_type", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_exceptions') WHERE name='source_type';"],
  ["schedule_source_id", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_exceptions') WHERE name='source_id';"],
  ["schedule_operation_id", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_exceptions') WHERE name='operation_id';"],
  ["schedule_metadata_json", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_exceptions') WHERE name='metadata_json';"],
  ["schedule_cancelled_at", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_exceptions') WHERE name='cancelled_at';"],
  ["schedule_cancelled_by_uid", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_exceptions') WHERE name='cancelled_by_uid';"],
  ["schedule_cancelled_by_email", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_schedule_exceptions') WHERE name='cancelled_by_email';"],
  ["schedule_operation_index", "SELECT COUNT(*) AS value FROM sqlite_master WHERE type='index' AND name='idx_workforce_schedule_exception_operation';"],
  ["schedule_status_date_index", "SELECT COUNT(*) AS value FROM sqlite_master WHERE type='index' AND name='idx_workforce_schedule_exception_employee_status_date';"],
  ["schedule_source_index", "SELECT COUNT(*) AS value FROM sqlite_master WHERE type='index' AND name='idx_workforce_schedule_exception_source';"],
];

const forbidden = /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH|REINDEX)\b/i;
for (const [name, sql] of checks) {
  if (!/^\s*SELECT\b/i.test(sql) || forbidden.test(sql)) {
    throw new Error(`[workforce-schedule-production-schema] non-read-only SQL blocked for ${name}`);
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

console.log("[workforce-schedule-production-schema] READ ONLY — remote D1 schema report\n");
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
    console.error(`[workforce-schedule-production-schema] could not parse value for ${name}`);
    process.exit(2);
  }
  observed.push([name, value]);
}

if (expected !== null) {
  const mismatches = observed.filter(([, value]) => value !== expected);
  if (mismatches.length) {
    console.error(`\n[workforce-schedule-production-schema] EXPECTATION FAILED — expected every value=${expected}`);
    for (const [name, value] of mismatches) console.error(`  ${name}=${value}`);
    process.exit(3);
  }
  console.log(`\n[workforce-schedule-production-schema] EXPECTATION PASS — all ${observed.length} values=${expected}.`);
}

console.log("\n[workforce-schedule-production-schema] COMPLETE — all checks are SELECT-only. Before migration 0003 every value must be 0; after migration every value must be 1.");
