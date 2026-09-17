import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceOnce(source, anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error(`Missing patch anchor: ${label}`);
  return source.replace(anchor, replacement);
}

const workforcePath = "client/src/features/workforce/WorkforceEmployeeFile.tsx";
let workforce = read(workforcePath);

workforce = replaceOnce(
  workforce,
  'import WorkforceAttendanceOperationsPanel from "./WorkforceAttendanceOperationsPanel";\n',
  'import WorkforceAttendanceOperationsPanel from "./WorkforceAttendanceOperationsPanel";\nimport HabatEmployeeAttendancePanel from "@/pages/habat/HabatEmployeeAttendancePanel";\nimport type { HabatAccessAccount } from "@/pages/habat/habatAttendanceClient";\n',
  "canonical attendance panel imports"
);

workforce = replaceOnce(
  workforce,
  [
    'type Props = {',
    '  identity: WorkforceEmployeeIdentity;',
    '  onBack?: () => void;',
    '  legacyAttendance?: ReactNode;',
    '};',
  ].join("\n"),
  [
    'type Props = {',
    '  identity: WorkforceEmployeeIdentity;',
    '  onBack?: () => void;',
    '  attendanceAccess?: HabatAccessAccount | null;',
    '};',
  ].join("\n"),
  "employee file canonical attendance prop"
);

workforce = replaceOnce(
  workforce,
  'export default function WorkforceEmployeeFile({ identity, onBack, legacyAttendance }: Props) {',
  'export default function WorkforceEmployeeFile({ identity, onBack, attendanceAccess }: Props) {',
  "employee file attendance prop destructuring"
);

workforce = replaceOnce(
  workforce,
  '{legacyAttendance ? (\n              <TabsTrigger',
  '{attendanceAccess ? (\n              <TabsTrigger',
  "attendance tab visibility"
);

workforce = replaceOnce(
  workforce,
  '          {employeeId ? <WorkforceAttendanceOperationsPanel employeeId={employeeId} /> : null}\n',
  '',
  "remove attendance operations from absences tab"
);

workforce = replaceOnce(
  workforce,
  '{legacyAttendance ? <TabsContent value="attendance"><div className="rounded-[28px] border border-slate-200 bg-white p-1 shadow-sm"><div className="rounded-[24px] bg-[#f5f5f3] p-3 sm:p-4">{legacyAttendance}</div></div></TabsContent> : null}',
  [
    '{attendanceAccess ? (',
    '          <TabsContent value="attendance" className="space-y-5">',
    '            {employeeId ? <WorkforceAttendanceOperationsPanel employeeId={employeeId} /> : null}',
    '            <HabatEmployeeAttendancePanel access={attendanceAccess} />',
    '          </TabsContent>',
    '        ) : null}',
  ].join("\n"),
  "employee file canonical attendance content"
);

write(workforcePath, workforce);

const appPath = "client/src/pages/habat/HabatAttendanceAppV4.tsx";
let app = read(appPath);

app = replaceOnce(
  app,
  [
    '          legacyAttendance={',
    '            <AttendanceMonthWorkspace',
    '              access={selectedEmployee}',
    '              manager',
    '            />',
    '          }',
  ].join("\n"),
  '          attendanceAccess={selectedEmployee}',
  "remove legacy attendance injection"
);

write(appPath, app);

console.log("Applied Habat Attendance Core Phase 2: employee file now reads and edits the canonical attendance core directly.");
