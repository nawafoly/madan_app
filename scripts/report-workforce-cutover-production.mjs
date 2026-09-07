import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const database = "maedin-attendance";
const wranglerConfig = "workers/wrangler.toml";

const checks = [
  ["source_employees", "SELECT COUNT(*) AS value FROM habat_attendance_access;"],
  ["source_shifts", "SELECT COUNT(*) AS value FROM habat_attendance_shifts;"],
  ["legacy_default_shift_available", "SELECT CASE WHEN EXISTS (SELECT 1 FROM habat_attendance_shifts WHERE is_active=1) THEN 1 ELSE 0 END AS value;"],
  ["source_assignments", "SELECT COUNT(*) AS value FROM habat_attendance_shift_assignments;"],
  ["source_leaves", "SELECT COUNT(*) AS value FROM habat_attendance_day_overrides WHERE override_type='emergency_leave';"],
  ["source_absences", "SELECT COUNT(*) AS value FROM habat_attendance_day_overrides WHERE override_type='absence';"],
  ["source_snapshots", "SELECT COUNT(*) AS value FROM habat_attendance_monthly_summaries;"],
  ["orphan_assignment_employee", "SELECT COUNT(*) AS value FROM habat_attendance_shift_assignments a LEFT JOIN habat_attendance_access e ON e.id=a.access_id WHERE e.id IS NULL;"],
  ["orphan_assignment_shift", "SELECT COUNT(*) AS value FROM habat_attendance_shift_assignments a LEFT JOIN habat_attendance_shifts s ON s.id=a.shift_id WHERE s.id IS NULL;"],
  ["orphan_overrides", "SELECT COUNT(*) AS value FROM habat_attendance_day_overrides o LEFT JOIN habat_attendance_access e ON e.id=o.access_id WHERE e.id IS NULL;"],
  ["orphan_snapshots", "SELECT COUNT(*) AS value FROM habat_attendance_monthly_summaries m LEFT JOIN habat_attendance_access e ON e.id=m.access_id WHERE e.id IS NULL;"],
  ["identity_conflicts", "SELECT COUNT(*) AS value FROM habat_attendance_access a JOIN workforce_employee_profiles p ON p.tenant_id='restaurant_tenant_habat_alwaraq' AND (((NULLIF(trim(a.uid),'') IS NOT NULL) AND NULLIF(trim(p.account_uid),'')=NULLIF(trim(a.uid),'')) OR ((NULLIF(trim(a.email),'') IS NOT NULL) AND lower(trim(p.account_email))=lower(trim(a.email)))) WHERE NOT (p.source_type='legacy_attendance_access' AND p.source_id=a.id);"],
  ["source_conflicts", "SELECT COUNT(*) AS value FROM habat_attendance_access a JOIN workforce_employee_profiles p ON p.tenant_id='restaurant_tenant_habat_alwaraq' AND p.source_type='legacy_attendance_access' AND p.source_id=a.id WHERE p.id <> 'wf_emp_' || a.id;"],
  ["expected_default_fallback_assignments", "SELECT CASE WHEN EXISTS (SELECT 1 FROM habat_attendance_shifts WHERE is_active=1) THEN (SELECT COUNT(*) FROM habat_attendance_access) ELSE 0 END AS value;"],
  ["expected_target_assignments_after_cutover", "SELECT ((SELECT COUNT(*) FROM habat_attendance_shift_assignments a JOIN habat_attendance_access e ON e.id=a.access_id JOIN habat_attendance_shifts s ON s.id=a.shift_id) + CASE WHEN EXISTS (SELECT 1 FROM habat_attendance_shifts WHERE is_active=1) THEN (SELECT COUNT(*) FROM habat_attendance_access) ELSE 0 END) AS value;"],
  ["current_target_tenants", "SELECT COUNT(*) AS value FROM workforce_tenants WHERE id='restaurant_tenant_habat_alwaraq';"],
  ["current_target_employees", "SELECT COUNT(*) AS value FROM workforce_employee_profiles WHERE tenant_id='restaurant_tenant_habat_alwaraq';"],
  ["current_target_employment", "SELECT COUNT(*) AS value FROM workforce_employment WHERE tenant_id='restaurant_tenant_habat_alwaraq';"],
  ["current_target_shifts", "SELECT COUNT(*) AS value FROM workforce_schedule_templates WHERE tenant_id='restaurant_tenant_habat_alwaraq';"],
  ["current_target_assignments", "SELECT COUNT(*) AS value FROM workforce_schedule_assignments WHERE tenant_id='restaurant_tenant_habat_alwaraq';"],
  ["current_target_attendance_links", "SELECT COUNT(*) AS value FROM workforce_attendance_links WHERE tenant_id='restaurant_tenant_habat_alwaraq';"],
  ["current_target_leaves", "SELECT COUNT(*) AS value FROM workforce_leaves WHERE tenant_id='restaurant_tenant_habat_alwaraq';"],
  ["current_target_absences", "SELECT COUNT(*) AS value FROM workforce_absences WHERE tenant_id='restaurant_tenant_habat_alwaraq';"],
  ["current_target_snapshots", "SELECT COUNT(*) AS value FROM workforce_attendance_month_snapshots WHERE tenant_id='restaurant_tenant_habat_alwaraq';"],
];

const forbidden = /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH|REINDEX)\b/i;
for (const [name, sql] of checks) {
  if (!/^\s*SELECT\b/i.test(sql) || forbidden.test(sql)) {
    throw new Error(`[workforce-production-preflight] non-read-only SQL blocked for ${name}`);
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

console.log("[workforce-production-preflight] READ ONLY — remote D1 value report\n");
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

console.log("\n[workforce-production-preflight] COMPLETE — no write statements are permitted by this reporter.");
