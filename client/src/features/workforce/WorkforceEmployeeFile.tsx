import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Clock3,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Umbrella,
  UserRound,
  UserX,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  WorkforceApiError,
  WorkforceService,
  halalasToRiyals,
  riyalsToHalalas,
  type WorkforceAbsence,
  type WorkforceEmployee,
  type WorkforceEmployeeFile as WorkforceEmployeeFilePayload,
  type WorkforceLeave,
  type WorkforceScheduleTemplate,
} from "./workforceClient";
import WorkforceAnnualLeavePanel from "./WorkforceAnnualLeavePanel";
import WorkforceScheduleControlPanel from "./WorkforceScheduleControlPanel";
import WorkforceAttendanceOperationsPanel from "./WorkforceAttendanceOperationsPanel";
import WorkforceLeaveLifecyclePanel from "./WorkforceLeaveLifecyclePanel";
import WorkforcePayrollAdjustmentsPanel from "./WorkforcePayrollAdjustmentsPanel";

export type WorkforceEmployeeIdentity = {
  accountUid?: string | null;
  accountEmail?: string | null;
  fallbackName?: string | null;
};

type Props = {
  identity: WorkforceEmployeeIdentity;
  onBack?: () => void;
  legacyAttendance?: ReactNode;
};

type AssignmentRow = {
  id?: string;
  template_id?: string;
  template_name?: string;
  start_time?: string;
  end_time?: string;
  effective_from?: string;
  effective_to?: string | null;
};

type BasicForm = {
  displayName: string;
  employeeNumber: string;
  jobTitle: string;
  phone: string;
  status: WorkforceEmployee["status"];
  serviceStartDate: string;
  serviceEndDate: string;
  employmentStatus: "active" | "inactive" | "terminated";
  department: string;
  locationId: string;
  notes: string;
};

type PayrollForm = {
  baseSalary: string;
  housingAllowance: string;
  transportationAllowance: string;
  otherAllowances: string;
  workDaysPerMonth: string;
  dailyHours: string;
  monthlyHours: string;
  deductionMethod: "hourly" | "daily";
  overtimeEnabled: boolean;
  overtimeMultiplier: string;
  attendancePayrollMode: "required" | "exempt";
  attendancePayrollExemptionReason: string;
};

const emptyBasic: BasicForm = {
  displayName: "",
  employeeNumber: "",
  jobTitle: "",
  phone: "",
  status: "active",
  serviceStartDate: "",
  serviceEndDate: "",
  employmentStatus: "active",
  department: "",
  locationId: "",
  notes: "",
};

const emptyPayroll: PayrollForm = {
  baseSalary: "0",
  housingAllowance: "0",
  transportationAllowance: "0",
  otherAllowances: "0",
  workDaysPerMonth: "",
  dailyHours: "",
  monthlyHours: "",
  deductionMethod: "hourly",
  overtimeEnabled: false,
  overtimeMultiplier: "1.5",
  attendancePayrollMode: "required",
  attendancePayrollExemptionReason: "",
};

const leaveLabels: Record<WorkforceLeave["leave_type"], string> = {
  annual: "سنوية",
  sick: "مرضية",
  emergency: "طارئة",
  unpaid: "بدون راتب",
  rest: "راحة معتمدة",
  weekly_rest_substitute: "بديل راحة أسبوعية",
  other: "أخرى",
};

const leaveStatusLabels: Record<WorkforceLeave["status"], string> = {
  pending: "قيد المراجعة",
  approved: "معتمدة",
  rejected: "مرفوضة",
  cancelled: "ملغاة",
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function sameIdentity(employee: WorkforceEmployee, identity: WorkforceEmployeeIdentity) {
  const uid = clean(identity.accountUid);
  const email = clean(identity.accountEmail).toLowerCase();
  if (uid && clean(employee.accountUid) === uid) return true;
  return Boolean(email && clean(employee.accountEmail).toLowerCase() === email);
}

function friendlyError(error: unknown) {
  const code = error instanceof WorkforceApiError ? error.code : clean((error as { message?: unknown })?.message);
  const messages: Record<string, string> = {
    workforce_employee_not_found: "لم يتم العثور على ملف الموظف داخل Workforce Core.",
    workforce_management_forbidden: "الحساب الحالي لا يملك صلاحية إدارة ملفات الموظفين.",
    workforce_employee_name_required: "اسم الموظف مطلوب.",
    workforce_employment_date_range_invalid: "تاريخ نهاية الخدمة لا يمكن أن يسبق تاريخ بداية الخدمة.",
    workforce_attendance_exemption_reason_required: "اكتب سبب استثناء الموظف من احتساب الحضور في الراتب.",
    workforce_leave_date_range_invalid: "تحقق من تاريخ بداية ونهاية الإجازة.",
    workforce_leave_partial_time_required: "الإجازة الجزئية تحتاج وقت بداية ونهاية.",
    workforce_annual_leave_schedule_not_ready: "لا يمكن اعتماد الإجازة السنوية قبل اكتمال جدول الدوام للفترة.",
    workforce_annual_leave_insufficient_balance: "رصيد الإجازة السنوية غير كافٍ لاعتماد هذه الفترة.",
    workforce_annual_leave_no_chargeable_workday: "الفترة المحددة لا تحتوي يوم عمل قابل للخصم من الرصيد.",
    workforce_absence_already_exists: "يوجد غياب مسجل لهذا الموظف في نفس التاريخ.",
    workforce_schedule_assignment_dates_invalid: "تحقق من تاريخ بداية ونهاية تكليف الشفت.",
  };
  return messages[code] || code || "تعذر إكمال العملية. حاول مرة أخرى.";
}

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

function durationText(item: WorkforceLeave) {
  if (item.duration_kind === "half_day") return "نصف يوم";
  if (item.duration_kind === "partial") return `${item.partial_start_time || "--"} — ${item.partial_end_time || "--"}`;
  return item.start_date === item.end_date ? "يوم كامل" : `${dateText(item.start_date)} — ${dateText(item.end_date)}`;
}

function SectionTitle({ title, description, icon }: { title: string; description?: string; icon: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">{icon}</span>
      <div>
        <h3 className="font-black">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

export default function WorkforceEmployeeFile({ identity, onBack, legacyAttendance }: Props) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [file, setFile] = useState<WorkforceEmployeeFilePayload | null>(null);
  const [leaves, setLeaves] = useState<WorkforceLeave[]>([]);
  const [absences, setAbsences] = useState<WorkforceAbsence[]>([]);
  const [templates, setTemplates] = useState<WorkforceScheduleTemplate[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [basic, setBasic] = useState<BasicForm>(emptyBasic);
  const [payroll, setPayroll] = useState<PayrollForm>(emptyPayroll);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [leaveType, setLeaveType] = useState<WorkforceLeave["leave_type"]>("annual");
  const [leaveDuration, setLeaveDuration] = useState<WorkforceLeave["duration_kind"]>("full_day");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leavePartialStart, setLeavePartialStart] = useState("");
  const [leavePartialEnd, setLeavePartialEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  const [absenceDate, setAbsenceDate] = useState("");
  const [absencePortion, setAbsencePortion] = useState<WorkforceAbsence["day_portion"]>("full_day");
  const [absenceTreatment, setAbsenceTreatment] = useState<WorkforceAbsence["payroll_treatment"]>("attendance_policy");
  const [absenceReason, setAbsenceReason] = useState("");

  const [assignmentTemplate, setAssignmentTemplate] = useState("");
  const [assignmentFrom, setAssignmentFrom] = useState("");
  const [assignmentTo, setAssignmentTo] = useState("");

  const resolveEmployeeId = useCallback(async () => {
    const payload = await WorkforceService.listEmployees();
    const match = payload.employees.find(employee => sameIdentity(employee, identity));
    return match?.id || null;
  }, [identity.accountEmail, identity.accountUid]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resolvedId = employeeId || (await resolveEmployeeId());
      if (!resolvedId) {
        setEmployeeId(null);
        setFile(null);
        throw new WorkforceApiError(404, "workforce_employee_not_found");
      }
      setEmployeeId(resolvedId);
      const [employeePayload, leavePayload, absencePayload, templatePayload, assignmentPayload] = await Promise.all([
        WorkforceService.getEmployee(resolvedId),
        WorkforceService.listLeaves(resolvedId),
        WorkforceService.listAbsences(resolvedId),
        WorkforceService.listScheduleTemplates(),
        WorkforceService.listScheduleAssignments(resolvedId),
      ]);
      setFile(employeePayload);
      setLeaves(leavePayload.leaves || []);
      setAbsences(absencePayload.absences || []);
      setTemplates(templatePayload.templates || []);
      setAssignments((assignmentPayload.assignments || []) as AssignmentRow[]);
      setBasic({
        displayName: employeePayload.employee.displayName || "",
        employeeNumber: employeePayload.employee.employeeNumber || "",
        jobTitle: employeePayload.employee.jobTitle || "",
        phone: employeePayload.employee.phone || "",
        status: employeePayload.employee.status,
        serviceStartDate: employeePayload.employment?.serviceStartDate || "",
        serviceEndDate: employeePayload.employment?.serviceEndDate || "",
        employmentStatus: employeePayload.employment?.employmentStatus || "active",
        department: employeePayload.employment?.department || "",
        locationId: employeePayload.employment?.locationId || "",
        notes: employeePayload.employment?.notes || "",
      });
      const settings = employeePayload.payrollSettings;
      setPayroll(settings ? {
        baseSalary: String(halalasToRiyals(settings.baseSalaryHalalas)),
        housingAllowance: String(halalasToRiyals(settings.housingAllowanceHalalas)),
        transportationAllowance: String(halalasToRiyals(settings.transportationAllowanceHalalas)),
        otherAllowances: String(halalasToRiyals(settings.otherAllowancesHalalas)),
        workDaysPerMonth: settings.workDaysPerMonth == null ? "" : String(settings.workDaysPerMonth),
        dailyHours: settings.dailyHours == null ? "" : String(settings.dailyHours),
        monthlyHours: settings.monthlyHours == null ? "" : String(settings.monthlyHours),
        deductionMethod: settings.deductionMethod,
        overtimeEnabled: settings.overtimeEnabled,
        overtimeMultiplier: String(settings.overtimeMultiplier),
        attendancePayrollMode: settings.attendancePayrollMode,
        attendancePayrollExemptionReason: settings.attendancePayrollExemptionReason || "",
      } : emptyPayroll);
      if (!assignmentTemplate && templatePayload.templates?.length) {
        setAssignmentTemplate(templatePayload.templates[0].id);
      }
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
    }
  }, [assignmentTemplate, employeeId, resolveEmployeeId]);

  useEffect(() => { void load(); }, [identity.accountEmail, identity.accountUid]);

  const totalMonthly = useMemo(() => {
    if (!file?.payrollSettings) return 0;
    const settings = file.payrollSettings;
    return halalasToRiyals(
      settings.baseSalaryHalalas + settings.housingAllowanceHalalas +
      settings.transportationAllowanceHalalas + settings.otherAllowancesHalalas
    );
  }, [file?.payrollSettings]);

  async function saveBasic(event: FormEvent) {
    event.preventDefault();
    if (!employeeId || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await Promise.all([
        WorkforceService.updateEmployee(employeeId, {
          displayName: basic.displayName,
          employeeNumber: basic.employeeNumber || null,
          jobTitle: basic.jobTitle || null,
          phone: basic.phone || null,
          status: basic.status,
        }),
        WorkforceService.saveEmployment(employeeId, {
          serviceStartDate: basic.serviceStartDate || null,
          serviceEndDate: basic.serviceEndDate || null,
          employmentStatus: basic.employmentStatus,
          department: basic.department || null,
          locationId: basic.locationId || null,
          notes: basic.notes || null,
        }),
      ]);
      setMessage("تم حفظ بيانات ملف الموظف.");
      await load();
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setSaving(false); }
  }

  async function savePayroll(event: FormEvent) {
    event.preventDefault();
    if (!employeeId || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await WorkforceService.savePayrollSettings(employeeId, {
        baseSalaryHalalas: riyalsToHalalas(payroll.baseSalary),
        housingAllowanceHalalas: riyalsToHalalas(payroll.housingAllowance),
        transportationAllowanceHalalas: riyalsToHalalas(payroll.transportationAllowance),
        otherAllowancesHalalas: riyalsToHalalas(payroll.otherAllowances),
        workDaysPerMonth: nullableNumber(payroll.workDaysPerMonth),
        dailyHours: nullableNumber(payroll.dailyHours),
        monthlyHours: nullableNumber(payroll.monthlyHours),
        deductionMethod: payroll.deductionMethod,
        overtimeEnabled: payroll.overtimeEnabled,
        overtimeMultiplier: Number(payroll.overtimeMultiplier || 1.5),
        attendancePayrollMode: payroll.attendancePayrollMode,
        attendancePayrollExemptionReason: payroll.attendancePayrollMode === "exempt" ? payroll.attendancePayrollExemptionReason : null,
      });
      setMessage("تم حفظ إعدادات الراتب.");
      await load();
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setSaving(false); }
  }

  async function createLeave(event: FormEvent) {
    event.preventDefault();
    if (!employeeId || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await WorkforceService.createLeave(employeeId, {
        leaveType,
        durationKind: leaveDuration,
        startDate: leaveStart,
        endDate: leaveEnd || leaveStart,
        partialStartTime: leaveDuration === "partial" ? leavePartialStart : undefined,
        partialEndTime: leaveDuration === "partial" ? leavePartialEnd : undefined,
        reason: leaveReason || undefined,
      });
      setLeaveStart(""); setLeaveEnd(""); setLeaveReason(""); setLeavePartialStart(""); setLeavePartialEnd("");
      setMessage("تم تسجيل الإجازة واعتمادها.");
      await load();
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setSaving(false); }
  }

  async function createAbsence(event: FormEvent) {
    event.preventDefault();
    if (!employeeId || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await WorkforceService.createAbsence(employeeId, {
        absenceDate,
        dayPortion: absencePortion,
        payrollTreatment: absenceTreatment,
        reason: absenceReason || undefined,
      });
      setAbsenceDate(""); setAbsenceReason("");
      setMessage("تم تسجيل الغياب.");
      await load();
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setSaving(false); }
  }

  async function createAssignment(event: FormEvent) {
    event.preventDefault();
    if (!employeeId || !assignmentTemplate || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await WorkforceService.createScheduleAssignment(employeeId, {
        templateId: assignmentTemplate,
        effectiveFrom: assignmentFrom,
        effectiveTo: assignmentTo || null,
      });
      setAssignmentFrom(""); setAssignmentTo("");
      setMessage("تم إضافة تكليف الدوام.");
      await load();
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setSaving(false); }
  }

  if (loading && !file) {
    return <div className="rounded-[28px] border border-slate-200 bg-white py-16 text-center text-sm text-slate-500"><RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" />جاري فتح ملف الموظف...</div>;
  }

  if (!file) {
    return (
      <section className="rounded-[28px] border border-red-100 bg-white p-6 shadow-sm">
        {onBack ? <Button type="button" variant="ghost" className="mb-4 rounded-xl" onClick={onBack}><ArrowRight className="h-4 w-4" /> رجوع للموظفين</Button> : null}
        <div className="flex items-start gap-3"><CircleAlert className="mt-1 h-5 w-5 text-red-600" /><div><h2 className="font-black">تعذر ربط ملف الموظف</h2><p className="mt-1 text-sm text-slate-500">{error || "لا توجد هوية مطابقة داخل Workforce Core."}</p></div></div>
      </section>
    );
  }

  const employee = file.employee;
  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {onBack ? <Button type="button" variant="ghost" className="mb-2 -mr-3 rounded-xl" onClick={onBack}><ArrowRight className="h-4 w-4" /> رجوع للموظفين</Button> : null}
            <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white"><UserRound className="h-6 w-6" /></span><div><h2 className="text-2xl font-black">{employee.displayName}</h2><p className="mt-1 text-sm text-slate-500">{employee.accountEmail || identity.accountEmail || "—"}</p></div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1">{employee.status === "active" ? "على رأس العمل" : employee.status === "terminated" ? "منتهي الخدمة" : "غير نشط"}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1"><Link2 className="ml-1 h-3.5 w-3.5" /> الحضور: {file.attendanceLink?.status === "confirmed" ? "مؤكد" : file.attendanceLink?.status || "غير مربوط"}</Badge>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> تحديث</Button>
          </div>
        </div>
      </section>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

      <Tabs defaultValue="basic" dir="rtl" className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-white p-1 shadow-sm">
          <TabsTrigger value="basic" className="rounded-xl px-5 py-2.5">الملف</TabsTrigger>
          <TabsTrigger value="payroll" className="rounded-xl px-5 py-2.5">الراتب</TabsTrigger>
          <TabsTrigger value="schedule" className="rounded-xl px-5 py-2.5">الدوام</TabsTrigger>
          <TabsTrigger value="leaves" className="rounded-xl px-5 py-2.5">الإجازات</TabsTrigger>
          <TabsTrigger value="absences" className="rounded-xl px-5 py-2.5">الغياب</TabsTrigger>
          {legacyAttendance ? <TabsTrigger value="attendance" className="rounded-xl px-5 py-2.5">الحضور</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="basic">
          <form onSubmit={saveBasic} className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionTitle title="بيانات الموظف والتوظيف" description="ملف موحد للهوية الوظيفية وتاريخ الخدمة والحالة التشغيلية." icon={<UserRound className="h-5 w-5" />} />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="اسم الموظف"><Input value={basic.displayName} onChange={e => setBasic(v => ({ ...v, displayName: e.target.value }))} className="h-11 rounded-2xl" required /></Field>
              <Field label="الرقم الوظيفي"><Input value={basic.employeeNumber} onChange={e => setBasic(v => ({ ...v, employeeNumber: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="المسمى الوظيفي"><Input value={basic.jobTitle} onChange={e => setBasic(v => ({ ...v, jobTitle: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="رقم الجوال"><Input dir="ltr" value={basic.phone} onChange={e => setBasic(v => ({ ...v, phone: e.target.value }))} className="h-11 rounded-2xl text-left" /></Field>
              <Field label="حالة الملف"><Select value={basic.status} onValueChange={value => setBasic(v => ({ ...v, status: value as WorkforceEmployee["status"] }))}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">نشط</SelectItem><SelectItem value="inactive">غير نشط</SelectItem><SelectItem value="terminated">منتهي الخدمة</SelectItem></SelectContent></Select></Field>
              <Field label="الحالة الوظيفية"><Select value={basic.employmentStatus} onValueChange={value => setBasic(v => ({ ...v, employmentStatus: value as BasicForm["employmentStatus"] }))}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">على رأس العمل</SelectItem><SelectItem value="inactive">غير نشط</SelectItem><SelectItem value="terminated">منتهي الخدمة</SelectItem></SelectContent></Select></Field>
              <Field label="تاريخ بداية الخدمة"><Input dir="ltr" type="date" value={basic.serviceStartDate} onChange={e => setBasic(v => ({ ...v, serviceStartDate: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="تاريخ نهاية الخدمة"><Input dir="ltr" type="date" value={basic.serviceEndDate} onChange={e => setBasic(v => ({ ...v, serviceEndDate: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="القسم"><Input value={basic.department} onChange={e => setBasic(v => ({ ...v, department: e.target.value }))} className="h-11 rounded-2xl" /></Field>
            </div>
            <Field label="ملاحظات التوظيف"><Textarea value={basic.notes} onChange={e => setBasic(v => ({ ...v, notes: e.target.value }))} className="min-h-24 rounded-2xl" /></Field>
            <Button type="submit" disabled={saving} className="rounded-xl bg-black"><Save className="h-4 w-4" /> حفظ ملف الموظف</Button>
          </form>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-5">
          {employeeId ? <WorkforcePayrollAdjustmentsPanel employeeId={employeeId} /> : null}
          <form onSubmit={savePayroll} className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><SectionTitle title="إعدادات الراتب" description="الراتب والبدلات وطريقة خصم الحضور. لا يتم إنشاء خصم حضور تلقائي من هذه الشاشة." icon={<WalletCards className="h-5 w-5" />} /><div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-500">الإجمالي التعاقدي الحالي</span><p className="mt-1 text-xl font-black">{totalMonthly.toLocaleString("en-US")} ر.س</p></div></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="الراتب الأساسي (ر.س)"><Input dir="ltr" type="number" min="0" step="0.01" value={payroll.baseSalary} onChange={e => setPayroll(v => ({ ...v, baseSalary: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="بدل السكن"><Input dir="ltr" type="number" min="0" step="0.01" value={payroll.housingAllowance} onChange={e => setPayroll(v => ({ ...v, housingAllowance: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="بدل النقل"><Input dir="ltr" type="number" min="0" step="0.01" value={payroll.transportationAllowance} onChange={e => setPayroll(v => ({ ...v, transportationAllowance: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="بدلات أخرى"><Input dir="ltr" type="number" min="0" step="0.01" value={payroll.otherAllowances} onChange={e => setPayroll(v => ({ ...v, otherAllowances: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="أيام العمل بالشهر"><Input dir="ltr" type="number" min="1" step="1" value={payroll.workDaysPerMonth} onChange={e => setPayroll(v => ({ ...v, workDaysPerMonth: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="ساعات العمل اليومية"><Input dir="ltr" type="number" min="0" step="0.25" value={payroll.dailyHours} onChange={e => setPayroll(v => ({ ...v, dailyHours: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="ساعات العمل الشهرية"><Input dir="ltr" type="number" min="0" step="0.25" value={payroll.monthlyHours} onChange={e => setPayroll(v => ({ ...v, monthlyHours: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="طريقة الخصم"><Select value={payroll.deductionMethod} onValueChange={value => setPayroll(v => ({ ...v, deductionMethod: value as PayrollForm["deductionMethod"] }))}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hourly">بالساعة</SelectItem><SelectItem value="daily">باليوم</SelectItem></SelectContent></Select></Field>
              <Field label="احتساب الحضور في الراتب"><Select value={payroll.attendancePayrollMode} onValueChange={value => setPayroll(v => ({ ...v, attendancePayrollMode: value as PayrollForm["attendancePayrollMode"] }))}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="required">مطلوب</SelectItem><SelectItem value="exempt">مستثنى</SelectItem></SelectContent></Select></Field>
              <Field label="معامل الإضافي"><Input dir="ltr" type="number" min="1" step="0.1" value={payroll.overtimeMultiplier} onChange={e => setPayroll(v => ({ ...v, overtimeMultiplier: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label="العمل الإضافي"><label className="flex h-11 items-center gap-3 rounded-2xl border border-slate-200 px-4"><input type="checkbox" checked={payroll.overtimeEnabled} onChange={e => setPayroll(v => ({ ...v, overtimeEnabled: e.target.checked }))} /> <span className="text-sm font-semibold">مفعل</span></label></Field>
            </div>
            {payroll.attendancePayrollMode === "exempt" ? <Field label="سبب الاستثناء"><Textarea value={payroll.attendancePayrollExemptionReason} onChange={e => setPayroll(v => ({ ...v, attendancePayrollExemptionReason: e.target.value }))} className="min-h-20 rounded-2xl" required /></Field> : null}
            <Button type="submit" disabled={saving} className="rounded-xl bg-black"><Save className="h-4 w-4" /> حفظ إعدادات الراتب</Button>
          </form>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-5">
          {employeeId ? <WorkforceScheduleControlPanel employeeId={employeeId} templates={templates} /> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><SectionTitle title="الدوام والشفتات" description="يعرض الـbaseline المنقول من النظام القديم وأي تغييرات مؤرخة بعده." icon={<Clock3 className="h-5 w-5" />} />
            <div className="mt-5 overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead className="text-right">الشفت</TableHead><TableHead className="text-right">الوقت</TableHead><TableHead className="text-right">من</TableHead><TableHead className="text-right">إلى</TableHead></TableRow></TableHeader><TableBody>{assignments.map((item, index) => <TableRow key={item.id || index}><TableCell className="font-bold">{item.template_name || templates.find(t => t.id === item.template_id)?.name || "شفت"}</TableCell><TableCell dir="ltr" className="text-right">{item.start_time || templates.find(t => t.id === item.template_id)?.startTime || "--"} — {item.end_time || templates.find(t => t.id === item.template_id)?.endTime || "--"}</TableCell><TableCell>{dateText(item.effective_from)}</TableCell><TableCell>{dateText(item.effective_to)}</TableCell></TableRow>)}</TableBody></Table>{!assignments.length ? <p className="py-8 text-center text-sm text-slate-500">لا يوجد تكليف دوام.</p> : null}</div>
          </section>
          <form onSubmit={createAssignment} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h3 className="font-black">إضافة تغيير دوام مؤرخ</h3><div className="grid gap-4 md:grid-cols-3"><Field label="الشفت"><Select value={assignmentTemplate} onValueChange={setAssignmentTemplate}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue placeholder="اختر الشفت" /></SelectTrigger><SelectContent>{templates.filter(t => t.isActive).map(t => <SelectItem key={t.id} value={t.id}>{t.name} · {t.startTime} — {t.endTime}</SelectItem>)}</SelectContent></Select></Field><Field label="ساري من"><Input dir="ltr" type="date" value={assignmentFrom} onChange={e => setAssignmentFrom(e.target.value)} className="h-11 rounded-2xl" required /></Field><Field label="ساري إلى (اختياري)"><Input dir="ltr" type="date" value={assignmentTo} onChange={e => setAssignmentTo(e.target.value)} className="h-11 rounded-2xl" /></Field></div><Button type="submit" disabled={saving || !assignmentTemplate || !assignmentFrom} className="rounded-xl bg-black"><Plus className="h-4 w-4" /> إضافة التكليف</Button></form>
        </TabsContent>

        <TabsContent value="leaves" className="space-y-5">
          {employeeId ? <WorkforceAnnualLeavePanel employeeId={employeeId} serviceStartDate={file.employment?.serviceStartDate || null} /> : null}
          {employeeId ? <WorkforceLeaveLifecyclePanel employeeId={employeeId} onChanged={() => void load()} /> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><SectionTitle title="الإجازات" description="الإجازات التشغيلية محفوظة في Workforce Core، ورصيد الإجازة السنوية له ledger مستقل قابل للتدقيق." icon={<Umbrella className="h-5 w-5" />} /><div className="mt-5 overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead className="text-right">النوع</TableHead><TableHead className="text-right">الفترة</TableHead><TableHead className="text-right">المدة</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">السبب</TableHead></TableRow></TableHeader><TableBody>{leaves.map(item => <TableRow key={item.id}><TableCell className="font-bold">{leaveLabels[item.leave_type]}</TableCell><TableCell>{dateText(item.start_date)}{item.end_date !== item.start_date ? ` — ${dateText(item.end_date)}` : ""}</TableCell><TableCell>{durationText(item)}</TableCell><TableCell>{leaveStatusLabels[item.status]}</TableCell><TableCell>{item.reason || "—"}</TableCell></TableRow>)}</TableBody></Table>{!leaves.length ? <p className="py-8 text-center text-sm text-slate-500">لا توجد إجازات مسجلة.</p> : null}</div></section>
          <form onSubmit={createLeave} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h3 className="font-black">تسجيل إجازة</h3><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="النوع"><Select value={leaveType} onValueChange={value => setLeaveType(value as WorkforceLeave["leave_type"])}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(leaveLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="المدة"><Select value={leaveDuration} onValueChange={value => setLeaveDuration(value as WorkforceLeave["duration_kind"])}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full_day">يوم كامل</SelectItem><SelectItem value="half_day">نصف يوم</SelectItem><SelectItem value="partial">جزء من يوم</SelectItem></SelectContent></Select></Field><Field label="من"><Input dir="ltr" type="date" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} className="h-11 rounded-2xl" required /></Field><Field label="إلى"><Input dir="ltr" type="date" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} className="h-11 rounded-2xl" /></Field>{leaveDuration === "partial" ? <><Field label="من وقت"><Input dir="ltr" type="time" value={leavePartialStart} onChange={e => setLeavePartialStart(e.target.value)} className="h-11 rounded-2xl" required /></Field><Field label="إلى وقت"><Input dir="ltr" type="time" value={leavePartialEnd} onChange={e => setLeavePartialEnd(e.target.value)} className="h-11 rounded-2xl" required /></Field></> : null}</div><Field label="السبب / الملاحظة"><Textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)} className="min-h-20 rounded-2xl" /></Field><Button type="submit" disabled={saving || !leaveStart} className="rounded-xl bg-black"><Plus className="h-4 w-4" /> تسجيل الإجازة</Button></form>
        </TabsContent>

        <TabsContent value="absences" className="space-y-5">
          {employeeId ? <WorkforceAttendanceOperationsPanel employeeId={employeeId} /> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><SectionTitle title="الغياب" description="سجل إداري مستقل مع توضيح المعالجة المقترحة للراتب بدون تنفيذ خصم تلقائي قبل جاهزية payroll attendance." icon={<UserX className="h-5 w-5" />} /><div className="mt-5 overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">المدة</TableHead><TableHead className="text-right">المعالجة</TableHead><TableHead className="text-right">السبب</TableHead></TableRow></TableHeader><TableBody>{absences.map(item => <TableRow key={item.id}><TableCell>{dateText(item.absence_date)}</TableCell><TableCell>{item.day_portion === "half_day" ? "نصف يوم" : "يوم كامل"}</TableCell><TableCell>{item.payroll_treatment === "no_deduction" ? "بدون خصم" : item.payroll_treatment === "manual_review" ? "مراجعة يدوية" : "سياسة الحضور"}</TableCell><TableCell>{item.reason || "—"}</TableCell></TableRow>)}</TableBody></Table>{!absences.length ? <p className="py-8 text-center text-sm text-slate-500">لا توجد غيابات مسجلة.</p> : null}</div></section>
          <form onSubmit={createAbsence} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h3 className="font-black">تسجيل غياب</h3><div className="grid gap-4 md:grid-cols-3"><Field label="التاريخ"><Input dir="ltr" type="date" value={absenceDate} onChange={e => setAbsenceDate(e.target.value)} className="h-11 rounded-2xl" required /></Field><Field label="المدة"><Select value={absencePortion} onValueChange={value => setAbsencePortion(value as WorkforceAbsence["day_portion"])}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full_day">يوم كامل</SelectItem><SelectItem value="half_day">نصف يوم</SelectItem></SelectContent></Select></Field><Field label="المعالجة"><Select value={absenceTreatment} onValueChange={value => setAbsenceTreatment(value as WorkforceAbsence["payroll_treatment"])}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="attendance_policy">سياسة الحضور</SelectItem><SelectItem value="no_deduction">بدون خصم</SelectItem><SelectItem value="manual_review">مراجعة يدوية</SelectItem></SelectContent></Select></Field></div><Field label="السبب"><Textarea value={absenceReason} onChange={e => setAbsenceReason(e.target.value)} className="min-h-20 rounded-2xl" /></Field><Button type="submit" disabled={saving || !absenceDate} className="rounded-xl bg-black"><Plus className="h-4 w-4" /> تسجيل الغياب</Button></form>
        </TabsContent>

        {legacyAttendance ? <TabsContent value="attendance"><div className="rounded-[28px] border border-slate-200 bg-white p-1 shadow-sm"><div className="rounded-[24px] bg-[#f5f5f3] p-3 sm:p-4">{legacyAttendance}</div></div></TabsContent> : null}
      </Tabs>
    </div>
  );
}
