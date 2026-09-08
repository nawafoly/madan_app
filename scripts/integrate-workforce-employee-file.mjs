import fs from "node:fs";

const target = "client/src/pages/habat/HabatAttendanceAppV4.tsx";
const source = fs.readFileSync(target, "utf8");

const importAnchor = 'import { AuditLogPage, EmployeePortalPage } from "./HabatAttendancePortal";';
const workforceImport = 'import WorkforceEmployeeFile from "@/features/workforce/WorkforceEmployeeFile";';

const oldCase = '      case "employee-file": return selectedEmployee ? <AttendanceMonthWorkspace access={selectedEmployee} manager onBack={() => setPage("employees")} /> : <EmployeesPage onOpenEmployee={account => { setSelectedEmployee(account); setPage("employee-file"); }} />;';
const newCase = `      case "employee-file": return selectedEmployee ? (\n        <WorkforceEmployeeFile\n          identity={{\n            accountUid: selectedEmployee.uid,\n            accountEmail: selectedEmployee.email,\n            fallbackName: selectedEmployee.displayName,\n          }}\n          onBack={() => setPage("employees")}\n          legacyAttendance={<AttendanceMonthWorkspace access={selectedEmployee} manager />}\n        />\n      ) : <EmployeesPage onOpenEmployee={account => { setSelectedEmployee(account); setPage("employee-file"); }} />;`;

let next = source;

if (!next.includes(workforceImport)) {
  if (!next.includes(importAnchor)) {
    throw new Error(`[workforce-ui-integration] import anchor not found in ${target}`);
  }
  next = next.replace(importAnchor, `${workforceImport}\n${importAnchor}`);
}

if (!next.includes(newCase)) {
  if (!next.includes(oldCase)) {
    throw new Error(`[workforce-ui-integration] employee-file route anchor not found in ${target}`);
  }
  next = next.replace(oldCase, newCase);
}

if (next === source) {
  console.log("[workforce-ui-integration] already integrated; no changes required.");
  process.exit(0);
}

fs.writeFileSync(target, next, "utf8");
console.log("[workforce-ui-integration] PASS — V4 employee file now opens the generic Workforce workspace and preserves legacy attendance as a tab.");
