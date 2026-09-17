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

// ---------------------------------------------------------------------------
// 1) Payroll adjustment workspace exposes one canonical financial impact ledger.
// ---------------------------------------------------------------------------
const servicePath = "workers/workforce-payroll-adjustments.js";
let service = read(servicePath);

service = replaceOnce(
  service,
  'const ADDITION_KINDS = new Set(["bonus", "allowance", "commission", "manual_addition"]);',
  'import { buildCanonicalPayrollImpactLedger } from "./workforce-payroll-impact-ledger.js";\n\nconst ADDITION_KINDS = new Set(["bonus", "allowance", "commission", "manual_addition"]);',
  "payroll impact ledger import"
);

service = replaceOnce(
  service,
  '    automaticAttendanceDeductionApplied: false,\n  };',
  '    automaticAttendanceDeductionApplied: false,\n    impactLedger: buildCanonicalPayrollImpactLedger({ entry, manualAdjustments: adjustments }),\n  };',
  "canonical impact ledger workspace"
);

write(servicePath, service);

// ---------------------------------------------------------------------------
// 2) Payroll UI becomes the single financial impact center for the employee.
// ---------------------------------------------------------------------------
const uiPath = "client/src/features/workforce/WorkforcePayrollAdjustmentsPanel.tsx";
let ui = read(uiPath);

ui = replaceOnce(
  ui,
  'type Workspace = {\n',
  [
    'type ImpactLedgerRow = {',
    '  id: string;',
    '  direction: Direction;',
    '  kind: string;',
    '  amountHalalas: number;',
    '  reason: string;',
    '  status: "active" | "cancelled";',
    '  automatic: boolean;',
    '  sourceType: string;',
    '};',
    '',
    'type ImpactLedger = {',
    '  rows: ImpactLedgerRow[];',
    '  totals: {',
    '    additionsHalalas: number;',
    '    deductionsHalalas: number;',
    '    overtimeHalalas: number;',
    '    attendanceDeductionHalalas: number;',
    '    absenceDeductionHalalas: number;',
    '    manualAdditionsHalalas: number;',
    '    manualDeductionsHalalas: number;',
    '  };',
    '};',
    '',
    'type Workspace = {',
  ].join("\n"),
  "impact ledger workspace types"
);

ui = replaceOnce(
  ui,
  '  automaticAttendanceDeductionApplied: boolean;\n};',
  '  automaticAttendanceDeductionApplied: boolean;\n  impactLedger: ImpactLedger;\n};',
  "impact ledger workspace field"
);

ui = replaceOnce(
  ui,
  'function kindLabel(kind: Kind, language: "ar" | "en") {\n  const item = allKinds.find(entry => entry.value === kind);\n  return item ? (language === "ar" ? item.ar : item.en) : kind;\n}',
  [
    'function kindLabel(kind: string, language: "ar" | "en") {',
    '  if (kind === "overtime") return tr(language, "عمل إضافي", "Overtime");',
    '  if (kind === "attendance_deduction") return tr(language, "خصم حضور", "Attendance Deduction");',
    '  if (kind === "absence_deduction") return tr(language, "خصم غياب", "Absence Deduction");',
    '  const item = allKinds.find(entry => entry.value === kind);',
    '  return item ? (language === "ar" ? item.ar : item.en) : kind;',
    '}',
  ].join("\n"),
  "automatic financial impact labels"
);

ui = replaceOnce(
  ui,
  '<h3 className="font-black">{tr(language, "الإضافات والخصومات اليدوية", "Manual Additions & Deductions")}</h3>\n            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{tr(language, "مكافآت وبدلات وعمولات وسلف وجزاءات وخصومات يدوية. هذه الشاشة لا تنشئ خصم حضور أو غياب تلقائيًا.", "Bonuses, allowances, commissions, advances, penalties, and manual deductions. This screen does not create automatic attendance or absence deductions.")}</p>',
  '<h3 className="font-black">{tr(language, "مركز الأثر المالي للراتب", "Payroll Financial Impact Center")}</h3>\n            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{tr(language, "مرجع موحد للأوفر تايم وخصومات الحضور والغياب والإضافات والخصومات اليدوية. كل شاشة مالية تعتمد على هذا المركز بدل حساب الأثر بشكل منفصل.", "Canonical view for overtime, attendance and absence deductions, and manual additions or deductions. Financial screens consume this center instead of recalculating impact independently.")}</p>',
  "financial impact center heading"
);

ui = replaceOnce(
  ui,
  '<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">\n        <strong>{tr(language, "حماية الرواتب:", "Payroll Protection:")}</strong> خصم الحضور التلقائي غير مفعل في هذه المرحلة. أي قيمة حضور/غياب ستظل صفرًا حتى يتم ربط Payroll Readiness واعتماد محرك الاحتساب.\n      </div>',
  '<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">\n        <strong>{tr(language, "المصدر المالي الموحد:", "Canonical Financial Source:")}</strong> {tr(language, "الأثر التلقائي يأتي من Payroll Readiness المبني على Workforce Day State، والعمليات اليدوية تدخل في نفس دفتر الأثر بدون تكرار الحساب داخل الواجهة.", "Automatic impact comes from Payroll Readiness built on Workforce Day State, while manual operations appear in the same impact ledger without UI-side recalculation.")}\n      </div>',
  "canonical financial source notice"
);

ui = replaceOnce(
  ui,
  '<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">\n            <Metric label={tr(language, "الإضافات اليدوية", "Manual Additions")} value={money(workspace.preview.manualAdditionsHalalas, language)} />\n            <Metric label={tr(language, "الخصومات اليدوية", "Manual Deductions")} value={money(workspace.preview.manualDeductionsHalalas, language)} />\n            <Metric label={tr(language, "إجمالي الاستقطاعات", "Total Deductions")} value={money(workspace.preview.totalDeductionsHalalas, language)} />\n            <Metric label={tr(language, "صافي مبدئي", "Preliminary Net")} value={money(workspace.preview.netSalaryHalalas, language)} emphasized />\n          </div>',
  '<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">\n            <Metric label={tr(language, "الأوفر تايم", "Overtime")} value={money(workspace.impactLedger.totals.overtimeHalalas, language)} />\n            <Metric label={tr(language, "خصم الحضور", "Attendance Deduction")} value={money(workspace.impactLedger.totals.attendanceDeductionHalalas, language)} />\n            <Metric label={tr(language, "خصم الغياب", "Absence Deduction")} value={money(workspace.impactLedger.totals.absenceDeductionHalalas, language)} />\n            <Metric label={tr(language, "صافي مبدئي", "Preliminary Net")} value={money(workspace.preview.netSalaryHalalas, language)} emphasized />\n          </div>',
  "financial impact metrics"
);

const tableAnchor = '          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">';
const ledgerTable = [
  '          <div className="overflow-x-auto rounded-2xl border border-slate-200">',
  '            <Table className="min-w-[760px]">',
  '              <TableHeader><TableRow><TableHead className="text-start">{tr(language, "الأثر", "Impact")}</TableHead><TableHead className="text-start">{tr(language, "المبلغ", "Amount")}</TableHead><TableHead className="text-start">{tr(language, "المصدر", "Source")}</TableHead><TableHead className="text-start">{tr(language, "الحالة", "Status")}</TableHead></TableRow></TableHeader>',
  '              <TableBody>',
  '                {workspace.impactLedger.rows.map(item => (',
  '                  <TableRow key={item.id} className={item.status === "cancelled" ? "opacity-50" : ""}>',
  '                    <TableCell className="font-bold">{kindLabel(item.kind, language)}</TableCell>',
  '                    <TableCell className={item.direction === "addition" ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{item.direction === "addition" ? "+" : "-"}{money(item.amountHalalas, language)}</TableCell>',
  '                    <TableCell>{item.automatic ? tr(language, "تلقائي · Workforce Day State", "Automatic · Workforce Day State") : tr(language, "يدوي", "Manual")}</TableCell>',
  '                    <TableCell>{item.status === "active" ? tr(language, "نشط", "Active") : tr(language, "ملغى", "Cancelled")}</TableCell>',
  '                  </TableRow>',
  '                ))}',
  '              </TableBody>',
  '            </Table>',
  '            {!workspace.impactLedger.rows.length ? <p className="py-8 text-center text-sm text-slate-500">{tr(language, "لا يوجد أثر مالي مسجل لهذا الشهر حتى الآن.", "No payroll financial impact is recorded for this month yet.")}</p> : null}',
  '          </div>',
  '',
  tableAnchor,
].join("\n");
ui = replaceOnce(ui, tableAnchor, ledgerTable, "canonical financial impact ledger table");

write(uiPath, ui);

console.log("Applied Habat Attendance Core Phase 4: canonical payroll financial impact center now unifies overtime, attendance/absence deductions, and manual adjustments.");
