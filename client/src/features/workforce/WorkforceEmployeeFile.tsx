import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
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

import HabatDatePicker from "@/pages/habat/HabatDatePicker";

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
import WorkforcePayrollReadinessPanel from "./WorkforcePayrollReadinessPanel";
import WorkforcePayrollLifecyclePanel from "./WorkforcePayrollLifecyclePanel";
import WorkforceMonthlyEmployeeReportPanel from "./WorkforceMonthlyEmployeeReportPanel";

import HabatNumberInput from "@/pages/habat/HabatNumberInput";
import HabatTimeInput, { formatHabatClockTime, formatHabatShiftRange } from "@/pages/habat/HabatTimeInput";
import { useHabatRealtimeRefresh } from "@/pages/habat/habatRealtimeClient";
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

type EmployeeTab =
  | "basic"
  | "payroll"
  | "schedule"
  | "leaves"
  | "absences"
  | "attendance";

const EMPLOYEE_TAB_STORAGE_PREFIX = "habat.employeeTab.";

type AssignmentRow = {
  id?: string;
  template_id?: string;
  template_name?: string;
  start_time?: string;
  end_time?: string;
  effective_from?: string;
  effective_to?: string | null;
  week_pattern_json?: string | null;
  weekly_rest_weekday?: number | null;
  reason?: string | null;
  createdAt?: string | null;
};

type WeekDayConfig =
  | { kind: "work"; templateId: string }
  | { kind: "rest" };

type WeekPlan = Record<string, WeekDayConfig>;

const WEEK_DAYS = [
  { value: 6, ar: "السبت", en: "Saturday" },
  { value: 0, ar: "الأحد", en: "Sunday" },
  { value: 1, ar: "الاثنين", en: "Monday" },
  { value: 2, ar: "الثلاثاء", en: "Tuesday" },
  { value: 3, ar: "الأربعاء", en: "Wednesday" },
  { value: 4, ar: "الخميس", en: "Thursday" },
  { value: 5, ar: "الجمعة", en: "Friday" },
];

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

const leaveLabels: Record<WorkforceLeave["leave_type"], { ar: string; en: string }> = {
  annual: { ar: "سنوية", en: "Annual" },
  sick: { ar: "مرضية", en: "Sick" },
  emergency: { ar: "طارئة", en: "Emergency" },
  unpaid: { ar: "بدون راتب", en: "Unpaid" },
  rest: { ar: "راحة معتمدة", en: "Approved Rest" },
  weekly_rest_substitute: { ar: "بديل راحة أسبوعية", en: "Weekly Rest Substitute" },
  other: { ar: "أخرى", en: "Other" },
};

const leaveStatusLabels: Record<WorkforceLeave["status"], { ar: string; en: string }> = {
  pending: { ar: "قيد المراجعة", en: "Pending Review" },
  approved: { ar: "معتمدة", en: "Approved" },
  rejected: { ar: "مرفوضة", en: "Rejected" },
  cancelled: { ar: "ملغاة", en: "Cancelled" },
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

function friendlyError(error: unknown, language: "ar" | "en") {
  const code = error instanceof WorkforceApiError ? error.code : clean((error as { message?: unknown })?.message);
  const messages: Record<string, string> = {
    workforce_employee_not_found: tr(language, "لم يتم العثور على ملف الموظف داخل Workforce Core.", "Employee file was not found in Workforce Core."),
    workforce_management_forbidden: tr(language, "الحساب الحالي لا يملك صلاحية إدارة ملفات الموظفين.", "The current account cannot manage employee files."),
    workforce_employee_name_required: tr(language, "اسم الموظف مطلوب.", "Employee name is required."),
    workforce_employment_date_range_invalid: tr(language, "تاريخ نهاية الخدمة لا يمكن أن يسبق تاريخ بداية الخدمة.", "Employment end date cannot be before the start date."),
    workforce_attendance_exemption_reason_required: tr(language, "اكتب سبب استثناء الموظف من احتساب الحضور في الراتب.", "Enter the reason for exempting this employee from attendance-based payroll."),
    workforce_leave_date_range_invalid: tr(language, "تحقق من تاريخ بداية ونهاية الإجازة.", "Check the leave start and end dates."),
    workforce_leave_partial_time_required: tr(language, "الإجازة الجزئية تحتاج وقت بداية ونهاية.", "Partial leave requires a start and end time."),
    workforce_annual_leave_schedule_not_ready: tr(language, "لا يمكن اعتماد الإجازة السنوية قبل اكتمال جدول الدوام للفترة.", "Annual leave cannot be approved until the schedule is complete for the period."),
    workforce_annual_leave_insufficient_balance: tr(language, "رصيد الإجازة السنوية غير كافٍ لاعتماد هذه الفترة.", "Annual leave balance is insufficient for this period."),
    workforce_annual_leave_no_chargeable_workday: tr(language, "الفترة المحددة لا تحتوي يوم عمل قابل للخصم من الرصيد.", "The selected period contains no chargeable work day."),
    workforce_absence_already_exists: tr(language, "يوجد غياب مسجل لهذا الموظف في نفس التاريخ.", "An absence already exists for this employee on the same date."),
    workforce_schedule_assignment_dates_invalid: tr(language, "تحقق من تاريخ بداية ونهاية تكليف الشفت.", "Check the schedule assignment dates."),
  };
  return messages[code] || code || tr(language, "تعذر إكمال العملية. حاول مرة أخرى.", "Unable to complete the operation. Try again.");
}

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateText(value?: string | null, language: "ar" | "en" = "en") {
  if (!value) return "—";
  if (value === "1970-01-01") return tr(language, "سجل تأسيسي قديم", "Legacy baseline");
  const parsed = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

function durationText(item: WorkforceLeave, language: "ar" | "en") {
  if (item.duration_kind === "half_day") return tr(language, "نصف يوم", "Half Day");
  if (item.duration_kind === "partial") {
    const start = item.partial_start_time ? formatHabatClockTime(item.partial_start_time, language) : "--";
    const end = item.partial_end_time ? formatHabatClockTime(item.partial_end_time, language) : "--";
    return `${start} — ${end}`;
  }
  return item.start_date === item.end_date ? tr(language, "يوم كامل", "Full Day") : `${dateText(item.start_date)} — ${dateText(item.end_date)}`;
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

function defaultWeekPlan(templateId = ""): WeekPlan {
  return {
    "0": { kind: "work", templateId },
    "1": { kind: "work", templateId },
    "2": { kind: "work", templateId },
    "3": { kind: "work", templateId },
    "4": { kind: "work", templateId },
    "5": { kind: "rest" },
    "6": { kind: "work", templateId },
  };
}

function normalizeWeekPlanForSignature(plan: WeekPlan) {
  return WEEK_DAYS.map(day => {
    const config = plan[String(day.value)];
    return config?.kind === "work"
      ? { day: day.value, kind: "work", templateId: config.templateId || "" }
      : { day: day.value, kind: "rest", templateId: "" };
  });
}

function weekPlanSignature(plan: WeekPlan) {
  return JSON.stringify(normalizeWeekPlanForSignature(plan));
}

function todayRiyadhDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function weekPlanFromAssignment(assignment?: AssignmentRow | null): WeekPlan | null {
  if (!assignment?.week_pattern_json) return null;
  try {
    const parsed = JSON.parse(assignment.week_pattern_json);
    const days = parsed?.days;
    if (!days || typeof days !== "object") return null;

    const next = {} as WeekPlan;
    for (const day of WEEK_DAYS) {
      const raw = days[String(day.value)];
      if (raw?.kind === "rest") {
        next[String(day.value)] = { kind: "rest" };
      } else if (raw?.kind === "work") {
        next[String(day.value)] = {
          kind: "work",
          templateId: String(raw.templateId || assignment.template_id || ""),
        };
      }
    }

    return Object.keys(next).length ? next : null;
  } catch {
    return null;
  }
}

function scheduleSummary(
  assignment: AssignmentRow,
  templates: WorkforceScheduleTemplate[],
  language: "ar" | "en"
) {
  const templatesById = new Map(templates.map(item => [item.id, item]));

  function describeTemplate(templateId: string) {
    const template = templatesById.get(templateId);
    if (template) {
      return `${template.name} · ${formatHabatShiftRange(template.startTime, template.endTime, language)}`;
    }

    if (templateId === assignment.template_id && assignment.start_time && assignment.end_time) {
      const name = assignment.template_name || (language === "ar" ? "شفت" : "Shift");
      return `${name} · ${formatHabatShiftRange(assignment.start_time, assignment.end_time, language)}`;
    }

    return language === "ar" ? "عمل" : "Work";
  }

  try {
    const raw = assignment.week_pattern_json
      ? JSON.parse(assignment.week_pattern_json)
      : null;

    const days = raw?.days || {};
    const parts = WEEK_DAYS.map(day => {
      const config = days[String(day.value)];

      if (!config) return null;

      if (config.kind === "rest") {
        return `${language === "ar" ? day.ar : day.en}: ${language === "ar" ? "راحة" : "Rest"}`;
      }

      const templateId =
        typeof config.templateId === "string" && config.templateId.trim()
          ? config.templateId
          : assignment.template_id || "";

      return `${language === "ar" ? day.ar : day.en}: ${describeTemplate(templateId)}`;
    }).filter(Boolean);

    if (parts.length) return parts.join(" · ");

    if (assignment.start_time && assignment.end_time) {
      const name = assignment.template_name || (language === "ar" ? "شفت" : "Shift");
      return `${name} · ${formatHabatShiftRange(assignment.start_time, assignment.end_time, language)}`;
    }

    return language === "ar" ? "جدول أسبوعي" : "Weekly schedule";
  } catch {
    if (assignment.start_time && assignment.end_time) {
      const name = assignment.template_name || (language === "ar" ? "شفت" : "Shift");
      return `${name} · ${formatHabatShiftRange(assignment.start_time, assignment.end_time, language)}`;
    }
    return language === "ar" ? "جدول أسبوعي" : "Weekly schedule";
  }
}

export default function WorkforceEmployeeFile({ identity, onBack, legacyAttendance }: Props) {
  const tabStorageKey = `${EMPLOYEE_TAB_STORAGE_PREFIX}${clean(identity.accountUid) || clean(identity.accountEmail).toLowerCase() || "unknown"}`;

  const [activeTab, setActiveTab] = useState<EmployeeTab>(() => {
    try {
      const stored = sessionStorage.getItem(tabStorageKey);
      if (
        stored === "basic" ||
        stored === "payroll" ||
        stored === "schedule" ||
        stored === "leaves" ||
        stored === "absences" ||
        stored === "attendance"
      ) {
        return stored;
      }
    } catch {
      // sessionStorage may be unavailable in restricted environments.
    }

    return "basic";
  });
  const { language } = useLanguage();
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

  const [assignmentFrom, setAssignmentFrom] = useState(() => todayRiyadhDateKey());
  const [assignmentReason, setAssignmentReason] = useState("");
  const [weekPlan, setWeekPlan] = useState<WeekPlan>(() => defaultWeekPlan());
  const [savedWeekPlanSignature, setSavedWeekPlanSignature] = useState(() => weekPlanSignature(defaultWeekPlan()));

  const resolveEmployeeId = useCallback(async () => {
    const payload = await WorkforceService.listEmployees();
    const match = payload.employees.find(employee => sameIdentity(employee, identity));
    return match?.id || null;
  }, [identity.accountEmail, identity.accountUid]);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
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
      const nextAssignments = (assignmentPayload.assignments || []) as AssignmentRow[];
      setAssignments(nextAssignments);
      const savedWeekPlan = weekPlanFromAssignment(nextAssignments[0]);
      if (savedWeekPlan) {
        setWeekPlan(savedWeekPlan);
        setSavedWeekPlanSignature(weekPlanSignature(savedWeekPlan));
      }
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
      if (!savedWeekPlan && templatePayload.templates?.length) {
        const firstActiveTemplate = templatePayload.templates.find(item => item.isActive);
        if (firstActiveTemplate) {
          setWeekPlan(current => {
            const hasAssignedTemplate = Object.values(current).some(
              item => item.kind === "work" && Boolean(item.templateId)
            );
            const nextPlan = hasAssignedTemplate
              ? current
              : defaultWeekPlan(firstActiveTemplate.id);
            setSavedWeekPlanSignature(weekPlanSignature(nextPlan));
            return nextPlan;
          });
        }
      }
    } catch (caught) {
      setError(friendlyError(caught, language));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [employeeId, resolveEmployeeId]);

  useEffect(() => { void load(true); }, [identity.accountEmail, identity.accountUid]);

  const refreshFromRealtime = useCallback(async () => {
    await load(false);
  }, [load]);

  useHabatRealtimeRefresh(refreshFromRealtime);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(tabStorageKey);
      if (
        stored === "basic" ||
        stored === "payroll" ||
        stored === "schedule" ||
        stored === "leaves" ||
        stored === "absences" ||
        stored === "attendance"
      ) {
        setActiveTab(stored);
      }
    } catch {
      // Keep current tab when storage is unavailable.
    }
  }, [tabStorageKey]);

  const handleTabChange = useCallback(
    (value: string) => {
      const next = value as EmployeeTab;

      setActiveTab(next);

      try {
        sessionStorage.setItem(tabStorageKey, next);
      } catch {
        // Tab navigation must still work without storage.
      }
    },
    [tabStorageKey]
  );
  const currentWeekPlanSignature = useMemo(() => weekPlanSignature(weekPlan), [weekPlan]);
  const hasUnsavedScheduleChanges = currentWeekPlanSignature !== savedWeekPlanSignature;
  const needsInitialScheduleSave = assignments.length === 0;
  const canSaveSchedule = hasUnsavedScheduleChanges || needsInitialScheduleSave;

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
      setMessage(tr(language, "تم حفظ بيانات ملف الموظف.", "Employee details saved."));
      await load();
    } catch (caught) { setError(friendlyError(caught, language)); }
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
      setMessage(tr(language, "تم حفظ إعدادات الراتب.", "Payroll settings saved."));
      await load();
    } catch (caught) { setError(friendlyError(caught, language)); }
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
      setMessage(tr(language, "تم تسجيل الإجازة واعتمادها.", "Leave recorded and approved."));
      await load();
    } catch (caught) { setError(friendlyError(caught, language)); }
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
      setMessage(tr(language, "تم تسجيل الغياب.", "Absence recorded."));
      await load();
    } catch (caught) { setError(friendlyError(caught, language)); }
    finally { setSaving(false); }
  }

  async function createAssignment(event: FormEvent) {
    event.preventDefault();
    if (!employeeId || saving) return;

    const workingDays = Object.values(weekPlan).filter(item => item.kind === "work");
    const invalidWorkingDay = workingDays.some(item => item.kind === "work" && !item.templateId);

    if (!workingDays.length) {
      setError(tr(language, "يجب تحديد يوم عمل واحد على الأقل.", "At least one work day must be selected."));
      return;
    }

    if (invalidWorkingDay) {
      setError(tr(language, "اختر قالب الشفت لكل يوم عمل.", "Select a shift template for every work day."));
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await WorkforceService.createScheduleAssignment(employeeId, {
        effectiveFrom: assignmentFrom || todayRiyadhDateKey(),
        weekPattern: { days: weekPlan },
        reason: assignmentReason || null,
        operationId: crypto.randomUUID(),
      });

      setAssignmentFrom(todayRiyadhDateKey());
      setAssignmentReason("");
      setMessage(tr(language, "تم حفظ جدول الموظف الأسبوعي.", "Employee weekly schedule saved."));
      await load();
    } catch (caught) {
      setError(friendlyError(caught, language));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !file) {
    return <div className="rounded-[28px] border border-slate-200 bg-white py-16 text-center text-sm text-slate-500"><RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" />{tr(language, "جاري فتح ملف الموظف...", "Opening employee file...")}</div>;
  }

  if (!file) {
    return (
      <section className="rounded-[28px] border border-red-100 bg-white p-6 shadow-sm">
        {onBack ? <Button type="button" variant="ghost" className="mb-4 rounded-xl" onClick={onBack}><ArrowRight className="h-4 w-4" /> {tr(language, "رجوع للموظفين", "Back to Employees")}</Button> : null}
        <div className="flex items-start gap-3"><CircleAlert className="mt-1 h-5 w-5 text-red-600" /><div><h2 className="font-black">{tr(language, "تعذر ربط ملف الموظف", "Unable to Link Employee File")}</h2><p className="mt-1 text-sm text-slate-500">{error || tr(language, "لا توجد هوية مطابقة داخل Workforce Core.", "No matching identity exists in Workforce Core.")}</p></div></div>
      </section>
    );
  }

  const employee = file.employee;
  return (
    <div dir={languageDir(language)} className="space-y-5 text-start">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {onBack ? <Button type="button" variant="ghost" className="mb-2 -mr-3 rounded-xl" onClick={onBack}><ArrowRight className="h-4 w-4" /> {tr(language, "رجوع للموظفين", "Back to Employees")}</Button> : null}
            <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white"><UserRound className="h-6 w-6" /></span><div><h2 className="text-2xl font-black">{employee.displayName}</h2><p className="mt-1 text-sm text-slate-500">{employee.accountEmail || identity.accountEmail || "—"}</p></div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1">{employee.status === "active" ? tr(language, "على رأس العمل", "Active Employment") : employee.status === "terminated" ? tr(language, "منتهي الخدمة", "Employment Ended") : "غير نشط"}</Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1"><Link2 className="ml-1 h-3.5 w-3.5" /> {tr(language, "الحضور", "Attendance")}: {file.attendanceLink?.status === "confirmed" ? tr(language, "مؤكد", "Confirmed") : file.attendanceLink?.status || tr(language, "غير مربوط", "Unlinked")}</Badge>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> {tr(language, "تحديث", "Refresh")}</Button>
          </div>
        </div>
      </section>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        dir={languageDir(language)}
        className="gap-4"
      >
        <div className="w-full overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto min-w-max items-center justify-start gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
            <TabsTrigger
              value="basic"
              className="min-w-28 shrink-0 rounded-xl border border-transparent px-5 py-2.5 font-bold data-[state=active]:border-slate-300 data-[state=active]:bg-slate-950 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              {tr(language, "الملف", "Profile")}
            </TabsTrigger>
            <TabsTrigger
              value="payroll"
              className="min-w-28 shrink-0 rounded-xl border border-transparent px-5 py-2.5 font-bold data-[state=active]:border-slate-300 data-[state=active]:bg-slate-950 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              {tr(language, "الراتب", "Payroll")}
            </TabsTrigger>
            <TabsTrigger
              value="schedule"
              className="min-w-28 shrink-0 rounded-xl border border-transparent px-5 py-2.5 font-bold data-[state=active]:border-slate-300 data-[state=active]:bg-slate-950 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              {tr(language, "الدوام", "Schedule")}
            </TabsTrigger>
            <TabsTrigger
              value="leaves"
              className="min-w-28 shrink-0 rounded-xl border border-transparent px-5 py-2.5 font-bold data-[state=active]:border-slate-300 data-[state=active]:bg-slate-950 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              {tr(language, "الإجازات", "Leaves")}
            </TabsTrigger>
            <TabsTrigger
              value="absences"
              className="min-w-28 shrink-0 rounded-xl border border-transparent px-5 py-2.5 font-bold data-[state=active]:border-slate-300 data-[state=active]:bg-slate-950 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              {tr(language, "الغياب", "Absences")}
            </TabsTrigger>
            {legacyAttendance ? (
              <TabsTrigger
                value="attendance"
                className="min-w-28 shrink-0 rounded-xl border border-transparent px-5 py-2.5 font-bold data-[state=active]:border-slate-300 data-[state=active]:bg-slate-950 data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
                {tr(language, "الحضور", "Attendance")}
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <TabsContent value="basic">
          <form onSubmit={saveBasic} className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionTitle title={tr(language, "بيانات الموظف والتوظيف", "Employee & Employment Details")} description={tr(language, "ملف موحد للهوية الوظيفية وتاريخ الخدمة والحالة التشغيلية.", "Unified employment identity, service dates, and operational status.")} icon={<UserRound className="h-5 w-5" />} />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label={tr(language, "اسم الموظف", "Employee Name")}><Input value={basic.displayName} onChange={e => setBasic(v => ({ ...v, displayName: e.target.value }))} className="h-11 rounded-2xl" required /></Field>
              <Field label={tr(language, "الرقم الوظيفي", "Employee Number")}><Input value={basic.employeeNumber} onChange={e => setBasic(v => ({ ...v, employeeNumber: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label={tr(language, "المسمى الوظيفي", "Job Title")}><Input value={basic.jobTitle} onChange={e => setBasic(v => ({ ...v, jobTitle: e.target.value }))} className="h-11 rounded-2xl" /></Field>
              <Field label={tr(language, "رقم الجوال", "Mobile Number")}><Input dir="ltr" value={basic.phone} onChange={e => setBasic(v => ({ ...v, phone: e.target.value }))} className="h-11 rounded-2xl text-start" /></Field>
              <Field label={tr(language, "حالة الملف", "Profile Status")}><Select value={basic.status} onValueChange={value => setBasic(v => ({ ...v, status: value as WorkforceEmployee["status"] }))}><SelectTrigger dir={languageDir(language)} className="h-11 w-full rounded-2xl text-start"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{tr(language, "نشط", "Active")}</SelectItem><SelectItem value="inactive">{tr(language, "غير نشط", "Inactive")}</SelectItem><SelectItem value="terminated">{tr(language, "منتهي الخدمة", "Terminated")}</SelectItem></SelectContent></Select></Field>
              <Field label={tr(language, "الحالة الوظيفية", "Employment Status")}><Select value={basic.employmentStatus} onValueChange={value => setBasic(v => ({ ...v, employmentStatus: value as BasicForm["employmentStatus"] }))}><SelectTrigger dir={languageDir(language)} className="h-11 w-full rounded-2xl text-start"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{tr(language, "على رأس العمل", "Active Employment")}</SelectItem><SelectItem value="inactive">{tr(language, "غير نشط", "Inactive")}</SelectItem><SelectItem value="terminated">{tr(language, "منتهي الخدمة", "Terminated")}</SelectItem></SelectContent></Select></Field>
              <Field label={tr(language, "تاريخ بداية الخدمة", "Employment Start Date")}><HabatDatePicker value={basic.serviceStartDate} onChange={value => setBasic(v => ({ ...v, serviceStartDate: value }))} /></Field>
              <Field label={tr(language, "تاريخ نهاية الخدمة", "Employment End Date")}><HabatDatePicker value={basic.serviceEndDate} onChange={value => setBasic(v => ({ ...v, serviceEndDate: value }))} /></Field>
              <Field label={tr(language, "القسم", "Department")}><Input value={basic.department} onChange={e => setBasic(v => ({ ...v, department: e.target.value }))} className="h-11 rounded-2xl" /></Field>
            </div>
            <Field label={tr(language, "ملاحظات التوظيف", "Employment Notes")}><Textarea value={basic.notes} onChange={e => setBasic(v => ({ ...v, notes: e.target.value }))} className="min-h-24 rounded-2xl" /></Field>
            <Button type="submit" disabled={saving} className="rounded-xl bg-black"><Save className="h-4 w-4" /> {tr(language, "حفظ ملف الموظف", "Save Employee File")}</Button>
          </form>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-5">
          <form onSubmit={savePayroll} className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><SectionTitle title={tr(language, "إعدادات الراتب", "Payroll Settings")} description={tr(language, "الراتب والبدلات وطريقة خصم الحضور. لا يتم إنشاء خصم حضور تلقائي من هذه الشاشة.", "Salary, allowances, and attendance deduction method. This screen does not create attendance deductions automatically.")} icon={<WalletCards className="h-5 w-5" />} /><div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-500">{tr(language, "الإجمالي التعاقدي الحالي", "Current Contracted Total")}</span><p className="mt-1 text-xl font-black">{totalMonthly.toLocaleString("en-US")} {tr(language, "ر.س", "SAR")}</p></div></div>
            <div dir={languageDir(language)} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label={tr(language, "الراتب الأساسي (ر.س)", "Base Salary (SAR)")}><HabatNumberInput min="0" step="0.01" value={payroll.baseSalary} onValueChange={value => setPayroll(v => ({ ...v, baseSalary: value }))} className="h-11 rounded-2xl" /></Field>
              <Field label={tr(language, "بدل السكن", "Housing Allowance")}><HabatNumberInput min="0" step="0.01" value={payroll.housingAllowance} onValueChange={value => setPayroll(v => ({ ...v, housingAllowance: value }))} className="h-11 rounded-2xl" /></Field>
              <Field label={tr(language, "بدل النقل", "Transportation Allowance")}><HabatNumberInput min="0" step="0.01" value={payroll.transportationAllowance} onValueChange={value => setPayroll(v => ({ ...v, transportationAllowance: value }))} className="h-11 rounded-2xl" /></Field>
              <Field label={tr(language, "بدلات أخرى", "Other Allowances")}><HabatNumberInput min="0" step="0.01" value={payroll.otherAllowances} onValueChange={value => setPayroll(v => ({ ...v, otherAllowances: value }))} className="h-11 rounded-2xl" /></Field>
              <Field label={tr(language, "أيام العمل بالشهر", "Work Days per Month")}><HabatNumberInput min="1" step="1" value={payroll.workDaysPerMonth} onValueChange={value => setPayroll(v => ({ ...v, workDaysPerMonth: value }))} className="h-11 rounded-2xl" /></Field>
              <Field label={tr(language, "ساعات العمل اليومية", "Daily Work Hours")}><HabatNumberInput min="0" step="0.25" value={payroll.dailyHours} onValueChange={value => setPayroll(v => ({ ...v, dailyHours: value }))} className="h-11 rounded-2xl" /></Field>
              <Field label={tr(language, "ساعات العمل الشهرية", "Monthly Work Hours")}><HabatNumberInput min="0" step="0.25" value={payroll.monthlyHours} onValueChange={value => setPayroll(v => ({ ...v, monthlyHours: value }))} className="h-11 rounded-2xl" /></Field>
              <Field label={tr(language, "طريقة الخصم", "Deduction Method")}><Select value={payroll.deductionMethod} onValueChange={value => setPayroll(v => ({ ...v, deductionMethod: value as PayrollForm["deductionMethod"] }))}><SelectTrigger dir={languageDir(language)} className="h-11 w-full rounded-2xl text-start"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hourly">{tr(language, "بالساعة", "Hourly")}</SelectItem><SelectItem value="daily">{tr(language, "باليوم", "Daily")}</SelectItem></SelectContent></Select></Field>
              <Field label={tr(language, "احتساب الحضور في الراتب", "Attendance Payroll Mode")}><Select value={payroll.attendancePayrollMode} onValueChange={value => setPayroll(v => ({ ...v, attendancePayrollMode: value as PayrollForm["attendancePayrollMode"] }))}><SelectTrigger dir={languageDir(language)} className="h-11 w-full rounded-2xl text-start"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="required">{tr(language, "مطلوب", "Required")}</SelectItem><SelectItem value="exempt">{tr(language, "مستثنى", "Exempt")}</SelectItem></SelectContent></Select></Field>
              <Field label={tr(language, "معامل الإضافي", "Overtime Multiplier")}><HabatNumberInput min="1" step="0.1" value={payroll.overtimeMultiplier} onValueChange={value => setPayroll(v => ({ ...v, overtimeMultiplier: value }))} className="h-11 rounded-2xl" /></Field>
              <Field label={tr(language, "العمل الإضافي", "Overtime")}><label className="flex h-11 items-center gap-3 rounded-2xl border border-slate-200 px-4"><input type="checkbox" checked={payroll.overtimeEnabled} onChange={e => setPayroll(v => ({ ...v, overtimeEnabled: e.target.checked }))} /> <span className="text-sm font-semibold">{tr(language, "مفعل", "Enabled")}</span></label></Field>
            </div>
            {payroll.attendancePayrollMode === "exempt" ? <Field label={tr(language, "سبب الاستثناء", "Exemption Reason")}><Textarea value={payroll.attendancePayrollExemptionReason} onChange={e => setPayroll(v => ({ ...v, attendancePayrollExemptionReason: e.target.value }))} className="min-h-20 rounded-2xl" required /></Field> : null}
            <Button type="submit" disabled={saving} className="rounded-xl bg-black"><Save className="h-4 w-4" /> {tr(language, "حفظ إعدادات الراتب", "Save Payroll Settings")}</Button>
          </form>
          {employeeId ? <WorkforcePayrollReadinessPanel employeeId={employeeId} /> : null}
          {employeeId ? <WorkforcePayrollAdjustmentsPanel employeeId={employeeId} /> : null}
          {employeeId ? <WorkforcePayrollLifecyclePanel employeeId={employeeId} /> : null}
          {employeeId ? <WorkforceMonthlyEmployeeReportPanel employeeId={employeeId} /> : null}
        </TabsContent>

        <TabsContent value="schedule" className="space-y-5">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionTitle
              title={tr(language, "الدوام والشفتات", "Schedule & Shifts")}
              description={tr(language, "كل تغيير ينشئ نسخة جديدة من جدول الموظف من تاريخ سريانها. النسخ السابقة تبقى محفوظة للحضور والرواتب التاريخية.", "Each change creates a new schedule version from its effective date. Previous versions remain available for historical attendance and payroll.")}
              icon={<Clock3 className="h-5 w-5" />}
            />

            <div className="mt-5 overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">{tr(language, "الجدول", "Schedule")}</TableHead>
                    <TableHead className="text-start">{tr(language, "ساري من", "Effective From")}</TableHead>
                    <TableHead className="text-start">{tr(language, "الحالة", "Status")}</TableHead>
                    <TableHead className="text-start">{tr(language, "سبب التغيير", "Change Reason")}</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {assignments.map((item, index) => (
                    <TableRow key={item.id || index}>
                      <TableCell className="font-bold">{scheduleSummary(item, templates, language)}</TableCell>
                      <TableCell>{dateText(item.effective_from, language)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {index === 0 ? tr(language, "الحالي", "Current") : tr(language, "سابق", "Previous")}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.reason || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {!assignments.length ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  {tr(language, "لا يوجد جدول أسبوعي محفوظ للموظف.", "No weekly schedule has been saved for this employee.")}
                </p>
              ) : null}
            </div>
          </section>

          <form
            onSubmit={createAssignment}
            className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-black">{tr(language, "جدول الموظف الأسبوعي", "Employee Weekly Schedule")}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {tr(language, "حدد لكل يوم هل هو يوم عمل أو راحة. يمكن استخدام شفت مختلف لكل يوم.", "Set each day as work or rest. A different shift may be used for each day.")}
                </p>
              </div>
              <Badge variant="outline" className={hasUnsavedScheduleChanges ? "w-fit rounded-full border-amber-300 bg-amber-50 px-3 py-1 text-amber-800" : "w-fit rounded-full border-emerald-300 bg-emerald-50 px-3 py-1 text-emerald-800"}>
                {hasUnsavedScheduleChanges
                  ? tr(language, "توجد تغييرات غير محفوظة", "Unsaved changes")
                  : needsInitialScheduleSave
                    ? tr(language, "لم يتم حفظ جدول لهذا الموظف بعد", "No saved schedule yet")
                  : tr(language, "يعرض آخر جدول محفوظ", "Latest saved schedule loaded")}
              </Badge>
            </div>

            <div className="space-y-3">
              {WEEK_DAYS.map(day => {
                const config = weekPlan[String(day.value)] || { kind: "rest" as const };
                const isWork = config.kind === "work";

                return (
                  <div
                    key={day.value}
                    className="grid gap-3 rounded-2xl border border-slate-200 p-3 md:grid-cols-[150px_170px_1fr] md:items-center"
                  >
                    <div className="font-black">{language === "ar" ? day.ar : day.en}</div>

                    <Select
                      value={isWork ? "work" : "rest"}
                      onValueChange={value => {
                        setWeekPlan(current => {
                          if (value === "rest") {
                            return {
                              ...current,
                              [String(day.value)]: { kind: "rest" },
                            };
                          }

                          const firstTemplate = templates.find(item => item.isActive)?.id || "";

                          return {
                            ...current,
                            [String(day.value)]: {
                              kind: "work",
                              templateId:
                                current[String(day.value)]?.kind === "work"
                                  ? current[String(day.value)].templateId
                                  : firstTemplate,
                            },
                          };
                        });
                      }}
                    >
                      <SelectTrigger dir={languageDir(language)} className="h-11 w-full rounded-2xl text-start">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="work">{tr(language, "عمل", "Work")}</SelectItem>
                        <SelectItem value="rest">{tr(language, "راحة", "Rest")}</SelectItem>
                      </SelectContent>
                    </Select>

                    {isWork ? (
                      <Select
                        value={config.templateId}
                        onValueChange={templateId => {
                          setWeekPlan(current => ({
                            ...current,
                            [String(day.value)]: { kind: "work", templateId },
                          }));
                        }}
                      >
                        <SelectTrigger dir={languageDir(language)} className="h-11 w-full rounded-2xl text-start">
                          <SelectValue placeholder={tr(language, "اختر الشفت", "Select Shift")} />
                        </SelectTrigger>
                        <SelectContent>
                          {templates
                            .filter(item => item.isActive)
                            .map(item => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name} · {formatHabatShiftRange(item.startTime, item.endTime, language)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex h-11 items-center rounded-2xl bg-slate-50 px-4 text-sm font-bold text-slate-500">
                        {tr(language, "لا يوجد شفت في يوم الراحة", "No shift on a rest day")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label={tr(language, "تطبيق الجدول من", "Apply Schedule From")}>
                <HabatDatePicker
                  value={assignmentFrom}
                  onChange={setAssignmentFrom}
                />
              </Field>

              <Field label={tr(language, "سبب التغيير (اختياري)", "Change Reason (Optional)")}>
                <Textarea
                  value={assignmentReason}
                  onChange={event => setAssignmentReason(event.target.value)}
                  className="min-h-20 rounded-2xl"
                />
              </Field>
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              {tr(language, "تاريخ السريان هو أول يوم يعمل فيه الجدول الجديد. لا تحدد تاريخ نهاية للجدول؛ النظام يحفظ النسخة السابقة تلقائيًا عند بدء نسخة جديدة.", "The effective date is the first day the new schedule applies. Do not set an end date; the system automatically preserves the previous version when a new version starts.")}
            </div>

            <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-600">
                {hasUnsavedScheduleChanges
                  ? tr(language, "احفظ التغييرات لتصبح هي الجدول الفعلي من تاريخ السريان.", "Save changes to make them the actual schedule from the effective date.")
                  : needsInitialScheduleSave
                    ? tr(language, "احفظ الجدول الحالي ليصبح جدول الموظف الفعلي.", "Save the current schedule to make it the employee's actual schedule.")
                  : tr(language, "لا توجد تغييرات غير محفوظة على الجدول الأسبوعي.", "No unsaved changes in the weekly schedule.")}
              </p>
              <Button
                type="submit"
                disabled={saving || !canSaveSchedule}
                className="rounded-xl bg-black"
              >
                <Plus className="h-4 w-4" />
                {tr(language, "حفظ جدول الموظف", "Save Employee Schedule")}
              </Button>
            </div>
          </form>

          {employeeId ? (
            <WorkforceScheduleControlPanel
              employeeId={employeeId}
              templates={templates}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="leaves" className="space-y-5">
          {employeeId ? <WorkforceAnnualLeavePanel employeeId={employeeId} serviceStartDate={file.employment?.serviceStartDate || null} /> : null}
          {employeeId ? <WorkforceLeaveLifecyclePanel employeeId={employeeId} onChanged={() => void load()} /> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><SectionTitle title={tr(language, "الإجازات", "Leaves")} description={tr(language, "الإجازات التشغيلية محفوظة في Workforce Core، ورصيد الإجازة السنوية له ledger مستقل قابل للتدقيق.", "Operational leave is stored in Workforce Core, while annual leave balance has a separate auditable ledger.")} icon={<Umbrella className="h-5 w-5" />} /><div className="mt-5 overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead className="text-start">{tr(language, "النوع", "Type")}</TableHead><TableHead className="text-start">{tr(language, "الفترة", "Period")}</TableHead><TableHead className="text-start">{tr(language, "المدة", "Duration")}</TableHead><TableHead className="text-start">{tr(language, "الحالة", "Status")}</TableHead><TableHead className="text-start">{tr(language, "السبب", "Reason")}</TableHead></TableRow></TableHeader><TableBody>{leaves.map(item => <TableRow key={item.id}><TableCell className="font-bold">{(language === "ar" ? leaveLabels[item.leave_type].ar : leaveLabels[item.leave_type].en)}</TableCell><TableCell>{dateText(item.start_date)}{item.end_date !== item.start_date ? ` — ${dateText(item.end_date)}` : ""}</TableCell><TableCell>{durationText(item, language)}</TableCell><TableCell>{(language === "ar" ? leaveStatusLabels[item.status].ar : leaveStatusLabels[item.status].en)}</TableCell><TableCell>{item.reason || "—"}</TableCell></TableRow>)}</TableBody></Table>{!leaves.length ? <p className="py-8 text-center text-sm text-slate-500">{tr(language, "لا توجد إجازات مسجلة.", "No leave records found.")}</p> : null}</div></section>
          <form onSubmit={createLeave} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h3 className="font-black">{tr(language, "تسجيل إجازة", "Create Leave")}</h3><div dir={languageDir(language)} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label={tr(language, "النوع", "Type")}><Select value={leaveType} onValueChange={value => setLeaveType(value as WorkforceLeave["leave_type"])}><SelectTrigger dir={languageDir(language)} className="h-11 w-full rounded-2xl text-start"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(leaveLabels).map(([value, label]) => <SelectItem key={value} value={value}>{language === "ar" ? label.ar : label.en}</SelectItem>)}</SelectContent></Select></Field><Field label={tr(language, "المدة", "Duration")}><Select value={leaveDuration} onValueChange={value => setLeaveDuration(value as WorkforceLeave["duration_kind"])}><SelectTrigger dir={languageDir(language)} className="h-11 w-full rounded-2xl text-start"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full_day">{tr(language, "يوم كامل", "Full Day")}</SelectItem><SelectItem value="half_day">{tr(language, "نصف يوم", "Half Day")}</SelectItem><SelectItem value="partial">{tr(language, "جزء من يوم", "Partial Day")}</SelectItem></SelectContent></Select></Field><Field label={tr(language, "من", "From")}><HabatDatePicker value={leaveStart} onChange={setLeaveStart} /></Field><Field label={tr(language, "إلى", "To")}><HabatDatePicker value={leaveEnd} onChange={setLeaveEnd} /></Field>{leaveDuration === "partial" ? <><Field label={tr(language, "من وقت", "From Time")}><HabatTimeInput value={leavePartialStart} onChange={value => setLeavePartialStart(value)} className="h-11 rounded-2xl" required /></Field><Field label={tr(language, "إلى وقت", "To Time")}><HabatTimeInput value={leavePartialEnd} onChange={value => setLeavePartialEnd(value)} className="h-11 rounded-2xl" required /></Field></> : null}</div><Field label={tr(language, "السبب / الملاحظة", "Reason / Note")}><Textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)} className="min-h-20 rounded-2xl" /></Field><Button type="submit" disabled={saving || !leaveStart} className="rounded-xl bg-black"><Plus className="h-4 w-4" /> {tr(language, "تسجيل الإجازة", "Save Leave")}</Button></form>
        </TabsContent>

        <TabsContent value="absences" className="space-y-5">
          {employeeId ? <WorkforceAttendanceOperationsPanel employeeId={employeeId} /> : null}
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><SectionTitle title={tr(language, "الغياب", "Absences")} description={tr(language, "سجل إداري مستقل مع توضيح المعالجة المقترحة للراتب بدون تنفيذ خصم تلقائي قبل جاهزية payroll attendance.", "Independent administrative record showing the proposed payroll treatment without applying an automatic deduction before payroll attendance is ready.")} icon={<UserX className="h-5 w-5" />} /><div className="mt-5 overflow-x-auto"><Table className="min-w-[700px]"><TableHeader><TableRow><TableHead className="text-start">{tr(language, "التاريخ", "Date")}</TableHead><TableHead className="text-start">{tr(language, "المدة", "Duration")}</TableHead><TableHead className="text-start">{tr(language, "المعالجة", "Treatment")}</TableHead><TableHead className="text-start">{tr(language, "السبب", "Reason")}</TableHead></TableRow></TableHeader><TableBody>{absences.map(item => <TableRow key={item.id}><TableCell>{dateText(item.absence_date)}</TableCell><TableCell>{item.day_portion === "half_day" ? tr(language, "نصف يوم", "Half Day") : tr(language, "يوم كامل", "Full Day")}</TableCell><TableCell>{item.payroll_treatment === "no_deduction" ? tr(language, "بدون خصم", "No Deduction") : item.payroll_treatment === "manual_review" ? tr(language, "مراجعة يدوية", "Manual Review") : tr(language, "سياسة الحضور", "Attendance Policy")}</TableCell><TableCell>{item.reason || "—"}</TableCell></TableRow>)}</TableBody></Table>{!absences.length ? <p className="py-8 text-center text-sm text-slate-500">{tr(language, "لا توجد غيابات مسجلة.", "No absences recorded.")}</p> : null}</div></section>
          <form onSubmit={createAbsence} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h3 className="font-black">{tr(language, "تسجيل غياب", "Record Absence")}</h3><div dir={languageDir(language)} className="grid gap-4 md:grid-cols-3"><Field label={tr(language, "التاريخ", "Date")}><HabatDatePicker value={absenceDate} onChange={setAbsenceDate} /></Field><Field label={tr(language, "المدة", "Duration")}><Select value={absencePortion} onValueChange={value => setAbsencePortion(value as WorkforceAbsence["day_portion"])}><SelectTrigger dir={languageDir(language)} className="h-11 w-full rounded-2xl text-start"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full_day">{tr(language, "يوم كامل", "Full Day")}</SelectItem><SelectItem value="half_day">{tr(language, "نصف يوم", "Half Day")}</SelectItem></SelectContent></Select></Field><Field label="المعالجة"><Select value={absenceTreatment} onValueChange={value => setAbsenceTreatment(value as WorkforceAbsence["payroll_treatment"])}><SelectTrigger dir={languageDir(language)} className="h-11 w-full rounded-2xl text-start"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="attendance_policy">{tr(language, "سياسة الحضور", "Attendance Policy")}</SelectItem><SelectItem value="no_deduction">{tr(language, "بدون خصم", "No Deduction")}</SelectItem><SelectItem value="manual_review">{tr(language, "مراجعة يدوية", "Manual Review")}</SelectItem></SelectContent></Select></Field></div><Field label={tr(language, "السبب", "Reason")}><Textarea value={absenceReason} onChange={e => setAbsenceReason(e.target.value)} className="min-h-20 rounded-2xl" /></Field><Button type="submit" disabled={saving || !absenceDate} className="rounded-xl bg-black"><Plus className="h-4 w-4" /> {tr(language, "تسجيل الغياب", "Save Absence")}</Button></form>
        </TabsContent>

        {legacyAttendance ? <TabsContent value="attendance"><div className="rounded-[28px] border border-slate-200 bg-white p-1 shadow-sm"><div className="rounded-[24px] bg-[#f5f5f3] p-3 sm:p-4">{legacyAttendance}</div></div></TabsContent> : null}
      </Tabs>
    </div>
  );
}
