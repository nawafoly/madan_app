import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function runContract() {
  const script = `
    import { readFileSync, readdirSync } from "node:fs";
    import { resolve } from "node:path";
    import { DatabaseSync } from "node:sqlite";

    const root = process.cwd();
    const migrationsDir = resolve(root, "workers", "hr-migrations");
    const db = new DatabaseSync(":memory:");

    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    function expectSqliteFailure(fn, expected) {
      try {
        fn();
      } catch (error) {
        const text = String(error?.message || error);
        assert(text.includes(expected), "expected sqlite failure: " + expected + "; got: " + text);
        return;
      }
      throw new Error("expected sqlite failure but command succeeded: " + expected);
    }

    db.exec("PRAGMA foreign_keys = ON");

    const migrations = readdirSync(migrationsDir)
      .filter(name => /^[0-9]{4}_.*[.]sql$/.test(name))
      .filter(name => !name.startsWith("0018_"))
      .sort();

    for (const migration of migrations) {
      db.exec(readFileSync(resolve(migrationsDir, migration), "utf8"));
    }

    db.exec(readFileSync(resolve(migrationsDir, "0018_policy_kernel.sql"), "utf8"));

    const definitions = db.prepare(
      "SELECT COUNT(*) AS count FROM hr_policy_definitions"
    ).get().count;
    assert(definitions === 28, "expected 28 stable policy definitions");

    const versionCount = db.prepare(
      "SELECT COUNT(*) AS count FROM hr_policy_versions"
    ).get().count;
    assert(versionCount === 0, "migration fabricated concrete policy versions");

    db.prepare(\`
      INSERT INTO hr_policy_versions (
        id, policy_key, version, effective_from, status,
        scope_json, parameters_json, calculation_contract_json,
        approval_contract_json, evidence_contract_json,
        attendance_effect_json, payroll_effect_json,
        source, reason, created_by_uid
      ) VALUES (
        'policy:schedule:v1', 'SA-WORK-SCHEDULE', 1, '2026-01-01', 'draft',
        '{"tenant":"default"}', '{"dailyHours":8}', '{"resolver":"server"}',
        '{}', '{}', '{"affectsWorkObligation":true}', '{}',
        'test', 'first governed schedule policy', 'tester'
      )
    \`).run();

    db.prepare(\`
      UPDATE hr_policy_versions
         SET parameters_json = '{"dailyHours":8,"weeklyHours":40}',
             updated_at = '2026-08-31T00:00:01.000Z'
       WHERE id = 'policy:schedule:v1'
    \`).run();

    db.prepare(\`
      UPDATE hr_policy_versions
         SET status = 'published',
             published_at = '2026-08-31T00:00:02.000Z',
             published_by_uid = 'tester',
             updated_at = '2026-08-31T00:00:02.000Z'
       WHERE id = 'policy:schedule:v1'
    \`).run();

    const current = db.prepare(\`
      SELECT id, policy_key, version, status, parameters_json
        FROM hr_current_policy_versions
       WHERE policy_key = 'SA-WORK-SCHEDULE'
    \`).get();

    assert(current, "current published policy version missing");
    assert(current.id === 'policy:schedule:v1', "wrong current policy version");
    assert(current.version === 1, "wrong current policy version number");

    expectSqliteFailure(
      () => db.prepare(\`
        UPDATE hr_policy_versions
           SET parameters_json = '{"dailyHours":7}'
         WHERE id = 'policy:schedule:v1'
      \`).run(),
      'published_policy_version_immutable'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO hr_policy_versions (
          id, policy_key, version, effective_from, status,
          parameters_json, published_at, source
        ) VALUES (
          'policy:schedule:overlap', 'SA-WORK-SCHEDULE', 2,
          '2026-06-01', 'published', '{}',
          '2026-08-31T00:00:03.000Z', 'test'
        )
      \`).run(),
      'policy_effective_period_overlap'
    );

    db.prepare(\`
      UPDATE hr_policy_versions
         SET effective_to = '2027-01-01',
             status = 'superseded',
             closed_at = '2026-08-31T00:00:04.000Z',
             closed_by_uid = 'tester',
             updated_at = '2026-08-31T00:00:04.000Z'
       WHERE id = 'policy:schedule:v1'
    \`).run();

    db.prepare(\`
      INSERT INTO hr_policy_versions (
        id, policy_key, version, effective_from, status,
        parameters_json, supersedes_version_id,
        published_at, published_by_uid, source, reason
      ) VALUES (
        'policy:schedule:v2', 'SA-WORK-SCHEDULE', 2,
        '2027-01-01', 'published', '{"dailyHours":8}',
        'policy:schedule:v1', '2026-08-31T00:00:05.000Z',
        'tester', 'test', 'adjacent superseding version'
      )
    \`).run();

    const adjacent = db.prepare(\`
      SELECT COUNT(*) AS count
        FROM hr_policy_versions
       WHERE policy_key = 'SA-WORK-SCHEDULE'
    \`).get().count;
    assert(adjacent === 2, "adjacent superseding policy period was not accepted");

    const currentAfterFuturePublication = db.prepare(\`
      SELECT id
        FROM hr_current_policy_versions
       WHERE policy_key = 'SA-WORK-SCHEDULE'
    \`).get();
    assert(
      currentAfterFuturePublication?.id === 'policy:schedule:v1',
      "future policy version affected current business date early"
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO hr_policy_versions (
          id, policy_key, version, effective_from, status,
          parameters_json, supersedes_version_id,
          published_at, source
        ) VALUES (
          'policy:gosi:bad-lineage', 'SA-GOSI', 2,
          '2027-01-01', 'published', '{}',
          'policy:schedule:v1', '2026-08-31T00:00:06.000Z', 'test'
        )
      \`).run(),
      'policy_supersedes_invalid'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        INSERT INTO hr_policy_versions (
          id, policy_key, version, effective_from, status,
          parameters_json, source
        ) VALUES (
          'policy:gosi:array', 'SA-GOSI', 1,
          '2026-01-01', 'draft', '[]', 'test'
        )
      \`).run(),
      'policy_contract_json_must_be_object'
    );

    expectSqliteFailure(
      () => db.prepare(\`
        DELETE FROM hr_policy_versions
         WHERE id = 'policy:schedule:v1'
      \`).run(),
      'published_policy_version_immutable'
    );

    db.prepare(\`
      INSERT INTO hr_policy_versions (
        id, policy_key, version, effective_from, status, source
      ) VALUES (
        'policy:gosi:draft', 'SA-GOSI', 1,
        '2026-01-01', 'draft', 'test'
      )
    \`).run();

    db.prepare(
      "DELETE FROM hr_policy_versions WHERE id = 'policy:gosi:draft'"
    ).run();

    const summary = db.prepare(\`
      SELECT
        invalid_effective_ranges,
        overlapping_finalized_policy_periods,
        policy_keys_with_multiple_current_versions,
        invalid_supersession_links,
        finalized_versions_missing_publish_metadata
      FROM hr_policy_integrity_summary
    \`).get();

    assert(summary.invalid_effective_ranges === 0, "invalid policy range detected");
    assert(summary.overlapping_finalized_policy_periods === 0, "overlapping policy periods detected");
    assert(summary.policy_keys_with_multiple_current_versions === 0, "multiple current versions detected");
    assert(summary.invalid_supersession_links === 0, "invalid supersession lineage detected");
    assert(summary.finalized_versions_missing_publish_metadata === 0, "publish metadata missing");

    db.close();
    console.log("POLICY_KERNEL_CONTRACT=PASS");
  `;

  return execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
}

describe("MADAN versioned policy kernel 0018", () => {
  it("resolves immutable effective-dated policy versions without inventing policy values", () => {
    expect(runContract()).toContain("POLICY_KERNEL_CONTRACT=PASS");
  });
});
