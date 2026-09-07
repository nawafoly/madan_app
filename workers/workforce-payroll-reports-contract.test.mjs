import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const service = fs.readFileSync(new URL("./workforce-payroll-reports.js", import.meta.url), "utf8");
const exportHelper = fs.readFileSync(new URL("../client/src/features/workforce/workforcePayrollExport.ts", import.meta.url), "utf8");
const employeeUi = fs.readFileSync(new URL("../client/src/features/workforce/WorkforceMonthlyEmployeeReportPanel.tsx", import.meta.url), "utf8");
const overallUi = fs.readFileSync(new URL("../client/src/features/workforce/WorkforceMonthlyPayrollReportPanel.tsx", import.meta.url), "utf8");
const integration = fs.readFileSync(new URL("../scripts/integrate-workforce-payroll-reports.mjs", import.meta.url), "utf8");

test("payroll report core remains tenant-agnostic", () => {
  assert.doesNotMatch(service, /habat|salon|queens|malikat/i);
  assert.match(service, /tenantId/);
});

test("payroll reports are GET-only and read-only", () => {
  assert.match(service, /request\.method !== "GET"/);
  assert.doesNotMatch(service, /INSERT\s+INTO|UPDATE\s+workforce_|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE/i);
  assert.doesNotMatch(service, /db\.batch\s*\(/);
});

test("reports use persisted payroll snapshots instead of recalculating locked payroll", () => {
  for (const field of ["attendance_snapshot_json", "setup_snapshot_json", "calculation_snapshot_json", "net_salary_halalas"]) {
    assert.match(service, new RegExp(field));
  }
  assert.doesNotMatch(service, /resolveWorkforceSchedule|calculateWorkforcePayroll|payrollReadiness/i);
});

test("overall report is bounded by month and does not query inside an employee loop", () => {
  assert.match(service, /pe\.month_key=\?/);
  const overall = service.match(/async function buildOverallMonthlyReport[\s\S]*?function mapEmployeeReport/)?.[0] || "";
  assert.equal((overall.match(/\.prepare\s*\(/g) || []).length, 1);
  assert.doesNotMatch(overall, /for\s*\([^)]*employees[^)]*\)[\s\S]*?\.prepare\s*\(/i);
});

test("individual and monthly exports cover payroll, attendance, deductions, status, and notes", () => {
  for (const required of [
    "baseSalaryHalalas", "allowancesHalalas", "attendanceDeductionHalalas", "absenceDeductionHalalas",
    "manualAdditionsHalalas", "manualDeductionsHalalas", "grossSalaryHalalas", "totalDeductionsHalalas",
    "netSalaryHalalas", "lateMinutes", "earlyLeaveMinutes", "absenceUnits", "notes",
  ]) assert.match(service + exportHelper, new RegExp(required));
});

test("Excel export is dependency-free SpreadsheetML and employee report supports print/PDF", () => {
  assert.match(exportHelper, /urn:schemas-microsoft-com:office:spreadsheet/);
  assert.match(exportHelper, /application\/vnd\.ms-excel/);
  assert.match(exportHelper, /\.xls/);
  assert.match(exportHelper, /window\.print\(\)/);
  assert.doesNotMatch(exportHelper, /from\s+["']xlsx["']|from\s+["']exceljs["']/i);
});

test("report UI exposes individual Excel, print/PDF, and overall Excel", () => {
  assert.match(employeeUi, /Excel/);
  assert.match(employeeUi, /طباعة \/ PDF/);
  assert.match(overallUi, /Excel شامل/);
  assert.match(overallUi, /المسير الشهري للموظفين/);
});

test("report integration is idempotent, CRLF-safe, edge-aware, and cannot deploy", () => {
  assert.match(integration, /if \(!core\.includes/);
  assert.match(integration, /if \(!employee\.includes/);
  assert.match(integration, /if \(!habat\.includes/);
  assert.match(integration, /\\r\\n/);
  assert.match(integration, /HabatAttendanceAppV4\.tsx/);
  assert.doesNotMatch(integration, /wrangler|--remote|d1\s+execute/i);
});
