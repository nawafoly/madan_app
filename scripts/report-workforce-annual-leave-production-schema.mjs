import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const database = "maedin-attendance";
const wranglerConfig = "workers/wrangler.toml";

const checks = [
  ["employment_annual_leave_contract_days", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_employment') WHERE name='annual_leave_contract_days';"],
  ["employment_annual_leave_accrual_mode", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_employment') WHERE name='annual_leave_accrual_mode';"],
  ["balances_balance_days", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_leave_balances') WHERE name='balance_days';"],
  ["balances_review_status", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_leave_balances') WHERE name='review_status';"],
  ["balances_review_reason", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_leave_balances') WHERE name='review_reason';"],
  ["ledger_delta_days", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_leave_ledger') WHERE name='delta_days';"],
  ["ledger_balance_before_days", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_leave_ledger') WHERE name='balance_before_days';"],
  ["ledger_balance_after_days", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_leave_ledger') WHERE name='balance_after_days';"],
  ["ledger_entry_code", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_leave_ledger') WHERE name='entry_code';"],
  ["ledger_metadata_json", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_leave_ledger') WHERE name='metadata_json';"],
  ["ledger_deleted_at", "SELECT COUNT(*) AS value FROM pragma_table_info('workforce_leave_ledger') WHERE name='deleted_at';"],
];

const forbidden = /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH|REINDEX)\b/i;
for (const [name, sql] of checks) {
  if (!/^\s*SELECT\b/i.test(sql) || forbidden.test(sql)) {
    throw new Error(`[workforce-annual-leave-production-schema] non-read-only SQL blocked for ${name}`);
  }
}

function invocation(sql) {
  const wranglerArgs = [
    "wrangler",
    "d1",
    "execute",
    database,
    "--remote",
    "--config",
    wranglerConfig,
    "--command",
    sql,
  ];

  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npx", ...wranglerArgs],
    };
  }

  return { command: "npx", args: wranglerArgs };
}

console.log("[workforce-annual-leave-production-schema] READ ONLY — remote D1 schema report\n");
for (const [name, sql] of checks) {
  console.log(`\n=== ${name} ===`);
  const call = invocation(sql);
  const result = spawnSync(call.command, call.args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("\n[workforce-annual-leave-production-schema] COMPLETE — all checks are SELECT-only. Before migration 0002, every value must be 0. After migration 0002, every value must be 1.");
