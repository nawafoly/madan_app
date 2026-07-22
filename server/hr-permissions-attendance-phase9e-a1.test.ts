import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (file: string) =>
  fs.readFileSync(path.join(root, file), "utf8");

describe("HR permissions and attendance phase 9E-A.1", () => {
  it("syncs HR account edits and overrides to D1", () => {
    const settings = source("client/src/pages/admin/Settings.tsx");
    expect(settings).toContain("updateHrCoreAccount");
    expect(settings).toContain("replaceHrCoreAccountPermissions");
    expect(settings).toContain('if (area === "staff")');
  });

  it("separates daily-task and weekly-report permissions", () => {
    const auth = source("client/src/_core/hooks/useAuth.ts");
    const app = source("client/src/App.tsx");
    const worker = source("workers/hr-core-worker.js");

    expect(auth).toContain('"daily_tasks.manager_notes"');
    expect(app).toContain(
      '<RequireAdminPermission permission="daily_tasks.manager_notes" area="staff">'
    );
    expect(worker).toContain(
      'requester.permissions.includes("daily_tasks.manager_notes")'
    );
    expect(worker).toContain(
      'requester.permissions.includes("weekly_reports.manager_notes")'
    );
    expect(worker).not.toContain('requester.role === "owner"');
  });

  it("honors effective employee and account permissions without role bypass", () => {
    const worker = source("workers/hr-core-worker.js");
    expect(worker).toContain(
      'function canReadEmployees(requester) {\n  return requester.permissions.includes("employees.view");'
    );
    expect(worker).toContain(
      'function canManageEmployees(requester) {\n  return requester.permissions.includes("employees.manage");'
    );
    expect(worker).toContain(
      'function canManageAccounts(requester) {\n  return requester.permissions.includes("admin_accounts.manage");'
    );
  });

  it("repairs UID placeholder employee names and does not display raw UIDs", () => {
    const migration = source(
      "workers/hr-migrations/0009_repair_employee_display_names.sql"
    );
    const attendance = source("client/src/pages/hr/Attendance.tsx");
    const worker = source("workers/hr-core-worker.js");

    expect(migration).toContain("LOWER(TRIM(name)) = LOWER(TRIM(id))");
    expect(worker).toContain("employee_directory_source");
    expect(attendance).toContain("getAttendanceEmployeeDisplayName");
    expect(attendance).not.toContain(
      "{record.employeeName || record.employeeUid}"
    );
  });

  it("supports account-only permission synchronization", () => {
    const migrationScript = source(
      "scripts/migrate-hr-core-to-cloudflare.mjs"
    );
    const packageJson = source("package.json");
    expect(migrationScript).toContain('Boolean(args["accounts-only"])');
    expect(packageJson).toContain('"hr:accounts:migrate"');
  });
});
