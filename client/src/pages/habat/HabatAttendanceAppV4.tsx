import {
  BarChart3,
  CalendarCheck2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  FileClock,
  Fingerprint,
  LogIn,
  Menu,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Umbrella,
  UserCog,
  UserRound,
  UserX,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import HabatDatePicker from "./HabatDatePicker";
import HabatTimeInput, { formatHabatShiftRange } from "./HabatTimeInput";
import { habatLogin, habatLogout, habatSession, habatChangePassword } from "./habatAuthClient";
import { ensureHabatRealtimeConnection, useHabatRealtimeRefresh } from "./habatRealtimeClient";
import WorkforceEmployeeFile from "@/features/workforce/WorkforceEmployeeFile";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

import HabatAccountManagement from "./HabatAccountManagement";
import { DashboardPage, ShiftsPage } from "./HabatAttendanceAdmin";
import HabatAttendanceSettings from "./HabatAttendanceSettings";
import { AuditLogPage, EmployeePortalPage } from "./HabatAttendancePortal";
import {
  friendlyHabatError,
  fromRiyadhDateTimeLocal,
  habatApi,
  readBrowserLocation,
  statusLabel,
  toDateTimeLocal,
  todayRiyadhKey,
  type HabatAccessAccount,
  type HabatContext,
  type HabatRecord,
  type HabatReport,
  type HabatShift,
} from "./habatAttendanceClient";

type AccessState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "change-password" }
  | { status: "forbidden"; message: string }
  | { status: "ready"; context: HabatContext };

type PageKey =
  | "clock"
  | "dashboard"
  | "profile"
  | "history"
  | "employees"
  | "employee-file"
  | "accounts"
  | "shifts"
  | "records"
  | "reports"
  | "audit"
  | "settings";

const HABAT_PAGE_STORAGE_KEY = "habat.currentPage";
const HABAT_EMPLOYEE_STORAGE_KEY = "habat.selectedEmployee";

const HABAT_PAGE_KEYS = new Set<PageKey>([
  "clock",
  "dashboard",
  "profile",
  "history",
  "employees",
  "employee-file",
  "accounts",
  "shifts",
  "records",
  "reports",
  "audit",
  "settings",
]);

function initialHabatPage(): PageKey {
  try {
    const stored = sessionStorage.getItem(HABAT_PAGE_STORAGE_KEY);
    return stored && HABAT_PAGE_KEYS.has(stored as PageKey)
      ? (stored as PageKey)
      : "clock";
  } catch {
    return "clock";
  }
}

function initialSelectedEmployee(): HabatAccessAccount | null {
  try {
    const raw = sessionStorage.getItem(HABAT_EMPLOYEE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HabatAccessAccount;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

type DayOverride = {
  id: string;
  accessId: string;
  date: string;
  type: "emergency_leave" | "absence";
  dayPortion: "full_day" | "half_day";
  reason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type MonthDay = {
  date: string;
  weekday: number;
  workingDay: boolean;
  state:
    | "complete"
    | "attention"
    | "incomplete"
    | "leave"
    | "absence"
    | "off"
    | "future"
    | "today_pending"
    | "pending";
  shift: HabatShift | null;
  record: HabatRecord | null;
  override: DayOverride | null;
};

type SavedSummary = {
  id: string;
  generatedAt: string;
  summary: MonthlySummary;
};

type MonthlySummary = {
  month: string;
  scheduledDays: number;
  attendedDays: number;
  absentDays: number;
  emergencyLeaveDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  incompleteDays: number;
  workedMinutes: number;
  daysWithAttendance: number;
  generatedAt: string;
};

type MonthWorkspace = {
  ok: true;
  access: HabatAccessAccount;
  month: string;
  from: string;
  to: string;
  days: MonthDay[];
  records: HabatRecord[];
  overrides: DayOverride[];
  savedSummary: SavedSummary | null;
};

const RIYADH_TIME_ZONE = "Asia/Riyadh";
const AR_WEEKDAYS = ["أحد", "اثن", "ثلث", "ربع", "خميس", "جمع", "سبت"];
const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function westernDigits(value: unknown) {
  return String(value ?? "")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function useWesternDigitsBoundary() {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const normalizeNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        const next = westernDigits(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let child = walker.nextNode();
        while (child) {
          if (child.nodeValue) {
            const next = westernDigits(child.nodeValue);
            if (next !== child.nodeValue) child.nodeValue = next;
          }
          child = walker.nextNode();
        }
      }
    };
    normalizeNode(root);
    const observer = new MutationObserver(items =>
      items.forEach(item => item.addedNodes.forEach(normalizeNode))
    );
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
}

function formatTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: RIYADH_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return westernDigits(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatMinutes(value: number | null | undefined, language: "ar" | "en" = "ar") {
  if (value == null) return "--";
  const total = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return tr(language, `${minutes} دقيقة`, `${minutes} min`);
  if (!minutes) return tr(language, `${hours} ساعة`, `${hours} hr`);
  return tr(language, `${hours} ساعة و${minutes} دقيقة`, `${hours} hr ${minutes} min`);
}

function monthLabel(month: string, language: "ar" | "en" = "ar") {
  const [year, monthNumber] = month.split("-").map(Number);
  const months = language === "ar" ? AR_MONTHS : EN_MONTHS;
  return `${months[monthNumber - 1] || month} ${year}`;
}

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(year, monthNumber, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}

function extendedError(error: unknown, language: "ar" | "en" = "ar") {
  const code = String((error as { code?: unknown; message?: unknown })?.code || (error as { message?: unknown })?.message || "");
  const map: Record<string, string> = {
    habat_employee_login_required_before_manual_record:
      tr(language, "يجب أن يسجل الموظف دخوله إلى حبات الورق مرة واحدة قبل إضافة بصمة يدوية له.", "The employee must sign in to Habat Alwaraq once before a manual attendance record can be added."),
    habat_attendance_record_already_exists: tr(language, "يوجد سجل حضور لهذا اليوم بالفعل.", "An attendance record already exists for this day."),
    habat_day_override_exists: tr(language, "اليوم مسجل كغياب أو إجازة. احذف الحالة أولًا.", "This day is already marked as absence or leave. Remove that status first."),
    habat_day_has_attendance_record: tr(language, "يوجد حضور فعلي لهذا اليوم. احذف البصمة أولًا إذا أردت تسجيل غياب أو إجازة.", "Attendance exists for this day. Delete the attendance record first if you want to mark absence or leave."),
    habat_manual_record_fields_required: tr(language, "حدد الموظف والتاريخ ووقت الحضور.", "Select the employee, date, and clock-in time."),
    habat_day_override_fields_required: tr(language, "تحقق من نوع الحالة وتاريخها.", "Check the status type and date."),
  };
  return map[code] || friendlyHabatError(error);
}

function Brand({ compact = false }: { compact?: boolean }) {
  const { language } = useLanguage();
  return (
    <div className={compact ? "flex items-center gap-3" : "text-center"}>
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden bg-black",
          compact ? "h-11 w-11 rounded-2xl" : "mx-auto h-28 w-28 rounded-[28px]"
        )}
      >
        <img src="/habat-alwaraq-logo.svg" alt={tr(language, "حبات الورق", "Habat Alwaraq")} className="h-full w-full object-contain" />
      </div>
      <div className={compact ? (language === "ar" ? "text-right" : "text-left") : "mt-4"}>
        <h1 className={compact ? "text-lg font-black" : "text-3xl font-black"}>{tr(language, "حبات الورق", "Habat Alwaraq")}</h1>
        <p className="mt-1 text-xs font-semibold text-slate-500">{tr(language, "نظام الحضور والانصراف", "Attendance System")}</p>
      </div>
    </div>
  );
}

function LoginScreen({
  onSignedIn,
}: {
  onSignedIn: () => Promise<void>;
}) {
  const { language } = useLanguage();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const email = identity.trim().toLowerCase();
      await habatLogin(email, password);
      await onSignedIn();
    } catch (caught) {
      setError(friendlyHabatError(caught));
      setBusy(false);
    }
  }

  return (
    <main dir={languageDir(language)} className="min-h-screen bg-[#f5f5f3] px-4 py-10 text-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <section className="w-full rounded-[32px] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 sm:p-9">
          <Brand />
          <div className="my-7 h-px bg-slate-100" />
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label>{tr(language, "البريد الإلكتروني", "Email")}</Label>
              <Input type="email" value={identity} onChange={event => setIdentity(event.target.value)} autoComplete="username" className="h-12 rounded-2xl bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label>{tr(language, "كلمة المرور", "Password")}</Label>
              <Input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" className="h-12 rounded-2xl bg-slate-50" />
            </div>
            {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
            <Button type="submit" disabled={busy || !identity.trim() || !password} className="h-12 w-full rounded-2xl bg-black">
              <LogIn className="h-4 w-4" /> {busy ? tr(language, "جاري الدخول...", "Signing in...") : tr(language, "دخول", "Sign In")}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

function ClockPage({ context, onRefresh }: { context: HabatContext; onRefresh: () => Promise<void> }) {
  const { language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const record = context.today;
  const checkedIn = Boolean(record?.checkInAt);
  const checkedOut = Boolean(record?.checkOutAt);
  const nextType: "check-in" | "check-out" | null = checkedOut ? null : checkedIn ? "check-out" : "check-in";

  async function submitClock() {
    if (!nextType || busy || !context.principal.canClock) return;
    if (nextType === "check-out" && !window.confirm(tr(language, "تأكيد تسجيل الانصراف؟", "Confirm clock out?"))) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const location = await readBrowserLocation(context.settings.locationRequired);
      await habatApi(`v2/${nextType}`, { method: "POST", body: JSON.stringify(location) });
      await onRefresh();
      setMessage(nextType === "check-in" ? tr(language, "تم تسجيل الحضور بنجاح.", "Clock-in recorded successfully.") : tr(language, "تم تسجيل الانصراف بنجاح.", "Clock-out recorded successfully."));
    } catch (caught) {
      setError(extendedError(caught));
    } finally {
      setBusy(false);
    }
  }

  const actionLabel = nextType === "check-in" ? tr(language, "تسجيل حضور", "Clock In") : nextType === "check-out" ? tr(language, "تسجيل انصراف", "Clock Out") : tr(language, "تم اكتمال الدوام", "Shift Completed");
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{tr(language, "مرحبًا", "Welcome")}</p>
          <h2 className="mt-1 text-2xl font-black">{context.principal.displayName || context.principal.email}</h2>
          <p className="mt-1 text-sm text-slate-500">{context.principal.email}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-start">
          <p dir="ltr" className="text-lg font-black">
            {new Intl.DateTimeFormat("en-US", { timeZone: RIYADH_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date())}
          </p>
          <p className="mt-1 text-xs text-slate-500">{tr(language, "بتوقيت الرياض", "Riyadh Time")}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl bg-slate-50 p-3 sm:p-4"><p className="text-xs text-slate-500">{tr(language, "الشفت", "Shift")}</p><p className="mt-1 text-sm font-black sm:text-base">{context.shift?.name || "غير محدد"}</p></div>
        <div className="rounded-2xl bg-slate-50 p-3 sm:p-4"><p className="text-xs text-slate-500">{tr(language, "الدوام", "Schedule")}</p><p dir="ltr" className="mt-1 text-start text-sm font-black sm:text-base">{context.shift ? formatHabatShiftRange(context.shift.startTime, context.shift.endTime, language) : "--"}</p></div>
        <div className="rounded-2xl bg-slate-50 p-3 sm:p-4"><p className="text-xs text-slate-500">{tr(language, "الموقع", "Location")}</p><p className="mt-1 text-start text-sm font-black sm:text-base">{context.settings.locationRequired ? <span dir="ltr">{`${context.settings.radiusM} m`}</span> : tr(language, "غير إلزامي", "Not Required")}</p></div>
      </div>

      <div className="mt-7 flex flex-col items-center">
        <button
          type="button"
          disabled={!nextType || busy || !context.principal.canClock}
          onClick={() => void submitClock()}
          className={cn(
            "flex h-28 w-28 items-center justify-center rounded-full border-2 bg-white shadow-lg transition sm:h-32 sm:w-32",
            nextType === "check-out" ? "border-rose-200 text-rose-700" : "border-emerald-200 text-emerald-700",
            (!nextType || !context.principal.canClock) && "opacity-40"
          )}
        >
          {busy ? <RefreshCw className="h-11 w-11 animate-spin" /> : <Fingerprint className="h-14 w-14" />}
        </button>
        <p className="mt-3 text-lg font-black">{actionLabel}</p>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label={tr(language, "الحضور", "Clock In")} value={formatTime(record?.checkInAt)} />
        <Metric label={tr(language, "الانصراف", "Clock Out")} value={formatTime(record?.checkOutAt)} />
        <Metric label={tr(language, "الحالة", "Status")} value={statusLabel(record?.attendanceStatus)} />
        <Metric label={tr(language, "ساعات العمل", "Worked Hours")} value={formatMinutes(record?.workedMinutes, language)} />
      </div>
      {message ? <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</p> : null}
      {error ? <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><div className="mt-1 font-black">{value}</div></div>;
}

function CorrectionDialog({ record, onClose, onSaved }: { record: HabatRecord | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { language } = useLanguage();
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!record) return;
    setCheckInAt(toDateTimeLocal(record.checkInAt).slice(11, 16));
    setCheckOutAt(record.checkOutAt ? toDateTimeLocal(record.checkOutAt).slice(11, 16) : "");
    setReason("");
    setError("");
  }, [record]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!record || saving) return;
    setSaving(true);
    setError("");
    try {
      await habatApi(`v2/records/${encodeURIComponent(record.id)}/correct`, {
        method: "POST",
        body: JSON.stringify({
          checkInAt: fromRiyadhDateTimeLocal(record.attendanceDate + "T" + checkInAt),
          checkOutAt: checkOutAt ? fromRiyadhDateTimeLocal(record.attendanceDate + "T" + checkOutAt) : null,
          reason,
        }),
      });
      await onSaved();
      onClose();
    } catch (caught) {
      setError(extendedError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(record)} onOpenChange={open => !open && onClose()}>
      <DialogContent className={cn("rounded-[28px] pl-14 sm:max-w-lg", language === "ar" ? "text-right" : "text-left")}>
        <DialogHeader className={language === "ar" ? "pr-0 text-right" : "pr-0 text-left"}>
          <DialogTitle>{tr(language, "تعديل البصمة", "Edit Attendance Record")}</DialogTitle>
          <DialogDescription>{record ? `${record.displayName || record.accountEmail} · ${formatDate(record.attendanceDate)}` : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2"><Label>{tr(language, "وقت الحضور", "Clock-in Time")}</Label><HabatTimeInput value={checkInAt} onChange={setCheckInAt} className="h-12 rounded-2xl" required /></div>
          <div className="space-y-2"><Label>{tr(language, "وقت الانصراف", "Clock-out Time")}</Label><HabatTimeInput value={checkOutAt} onChange={setCheckOutAt} className="h-12 rounded-2xl" /></div>
          <div className="space-y-2"><Label>{tr(language, "سبب التعديل", "Reason for Edit")}</Label><Textarea value={reason} onChange={event => setReason(event.target.value)} className="min-h-24 rounded-2xl" placeholder="سبب واضح للتعديل" required /></div>
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="submit" disabled={saving || reason.trim().length < 3} className="rounded-xl bg-black">
              <Save className="h-4 w-4" />
              {tr(language, "حفظ التعديل", "Save Changes")}
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              {tr(language, "إلغاء", "Cancel")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManualRecordDialog({ access, day, onClose, onSaved }: { access: HabatAccessAccount; day: MonthDay | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { language } = useLanguage();
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!day) return;
    setCheckInAt(day.shift?.startTime || "09:00");
    setCheckOutAt(day.shift?.endTime || "17:00");
    setReason("");
    setError("");
  }, [day]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!day || saving) return;
    setSaving(true);
    setError("");
    try {
      await habatApi("v3/records/manual", {
        method: "POST",
        body: JSON.stringify({
          accessId: access.id,
          date: day.date,
          checkInAt: fromRiyadhDateTimeLocal(day.date + "T" + checkInAt),
          checkOutAt: checkOutAt ? fromRiyadhDateTimeLocal(day.date + "T" + checkOutAt) : null,
          reason,
        }),
      });
      await onSaved();
      onClose();
    } catch (caught) {
      setError(extendedError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(day)} onOpenChange={open => !open && onClose()}>
      <DialogContent className={cn("rounded-[28px] pl-14 sm:max-w-lg", language === "ar" ? "text-right" : "text-left")}>
        <DialogHeader className={language === "ar" ? "pr-0 text-right" : "pr-0 text-left"}><DialogTitle>{tr(language, "إضافة بصمة يدوية", "Add Manual Attendance")}</DialogTitle><DialogDescription>{day ? formatDate(day.date) : ""}</DialogDescription></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2"><Label>{tr(language, "وقت الحضور", "Clock-in Time")}</Label><HabatTimeInput value={checkInAt} onChange={setCheckInAt} className="h-12 rounded-2xl" required /></div>
          <div className="space-y-2"><Label>{tr(language, "وقت الانصراف", "Clock-out Time")}</Label><HabatTimeInput value={checkOutAt} onChange={setCheckOutAt} className="h-12 rounded-2xl" /></div>
          <div className="space-y-2"><Label>{tr(language, "سبب الإضافة", "Reason for Addition")}</Label><Textarea value={reason} onChange={event => setReason(event.target.value)} className="min-h-24 rounded-2xl" required /></div>
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="submit" disabled={saving || reason.trim().length < 3} className="rounded-xl bg-black">
              <Save className="h-4 w-4" />
              {tr(language, "حفظ التعديل", "Save Changes")}
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              {tr(language, "إلغاء", "Cancel")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OverrideDialog({ access, day, type, onClose, onSaved }: { access: HabatAccessAccount; day: MonthDay | null; type: "absence" | "emergency_leave"; onClose: () => void; onSaved: () => Promise<void> }) {
  const { language } = useLanguage();
  const [portion, setPortion] = useState<"full_day" | "half_day">("full_day");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (day) { setPortion("full_day"); setReason(""); setError(""); } }, [day, type]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!day || saving) return;
    setSaving(true);
    setError("");
    try {
      await habatApi("v3/day-overrides", {
        method: "POST",
        body: JSON.stringify({ accessId: access.id, date: day.date, type, dayPortion: portion, reason }),
      });
      await onSaved();
      onClose();
    } catch (caught) {
      setError(extendedError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(day)} onOpenChange={open => !open && onClose()}>
      <DialogContent className={cn("rounded-[28px] pl-14 sm:max-w-lg", language === "ar" ? "text-right" : "text-left")}>
        <DialogHeader className={language === "ar" ? "pr-0 text-right" : "pr-0 text-left"}>
          <DialogTitle>{type === "emergency_leave" ? tr(language, "تسجيل إجازة مفاجئة", "Record Emergency Leave") : tr(language, "تسجيل غياب", "Record Absence")}</DialogTitle>
          <DialogDescription>{day ? formatDate(day.date) : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2"><Label>{tr(language, "المدة", "Duration")}</Label><Select value={portion} onValueChange={value => setPortion(value as "full_day" | "half_day")}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full_day">{tr(language, "يوم كامل", "Full Day")}</SelectItem><SelectItem value="half_day">{tr(language, "نصف يوم", "Half Day")}</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>{tr(language, "ملاحظة / سبب", "Note / Reason")}</Label><Textarea value={reason} onChange={event => setReason(event.target.value)} className="min-h-24 rounded-2xl" placeholder="حقل اختياري لتوضيح السبب أو أي ملاحظة داخلية" /></div>
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="submit"
              disabled={saving}
              className={cn("rounded-xl", type === "emergency_leave" ? "bg-blue-600 hover:bg-blue-700" : "bg-black")}
            >
              <Save className="h-4 w-4" />
              {type === "emergency_leave"
                ? tr(language, "تسجيل الإجازة", "Record Leave")
                : tr(language, "تسجيل الغياب", "Record Absence")}
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
              {tr(language, "إلغاء", "Cancel")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CalendarBoard({ days, selectedDate, onSelect, month, onMonthChange }: {
  days: MonthDay[]; selectedDate: string; onSelect: (date: string) => void; month: string; onMonthChange: (month: string) => void }) {
  const { language } = useLanguage();
  const firstOffset = days[0]?.weekday || 0;
  const cells: Array<MonthDay | null> = [...Array(firstOffset).fill(null), ...days];
  const stateClass = (day: MonthDay) => {
    if (day.date === selectedDate) return "bg-orange-500 text-white ring-8 ring-orange-500/10";
    if (day.state === "complete") return "after:bg-emerald-400";
    if (day.state === "leave") return "after:bg-blue-500";
    if (day.state === "attention" || day.state === "incomplete" || day.state === "absence") return "after:bg-rose-900";
    return "after:bg-slate-300/70";
  };

  return (
    <section className="rounded-[28px] bg-[#0f172a] p-4 text-white shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10 hover:text-white" onClick={() => onMonthChange(shiftMonth(month, -1))}><ChevronRight className="h-6 w-6" /></Button>
        <div className="text-center"><h3 className="text-xl font-black">{(language === "ar" ? AR_MONTHS : EN_MONTHS)[Number(month.slice(5, 7)) - 1]}</h3><p className="mt-1 text-lg text-slate-300">{month.slice(0, 4)}</p></div>
        <Button type="button" variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10 hover:text-white" onClick={() => onMonthChange(shiftMonth(month, 1))}><ChevronLeft className="h-6 w-6" /></Button>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-y-3 text-center text-xs font-semibold text-slate-400 sm:text-sm">
        {(language === "ar" ? AR_WEEKDAYS : EN_WEEKDAYS).map(day => <div key={day}>{day}</div>)}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-y-3 text-center">
        {cells.map((day, index) => day ? (
          <button key={day.date} type="button" onClick={() => onSelect(day.date)} className={cn("relative mx-auto flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold after:absolute after:-bottom-1.5 after:h-1 after:w-8 after:rounded-full sm:h-11 sm:w-11 sm:text-lg", stateClass(day))}>{Number(day.date.slice(-2))}</button>
        ) : <div key={`empty-${index}`} />)}
      </div>

      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 rounded-2xl border border-white/15 px-3 py-3 text-[11px] text-slate-200 sm:text-xs">
        <Legend color="bg-emerald-400" label={tr(language, "حضور مكتمل", "Complete Attendance")} />
        <Legend color="bg-orange-500" label={tr(language, "اليوم المحدد", "Selected Day")} />
        <Legend color="bg-rose-900" label={tr(language, "نقص/تأخير/غياب", "Shortage / Late / Absence")} />
        <Legend color="bg-blue-500" label={tr(language, "إجازة", "Leave")} />
        <Legend color="bg-slate-300" label={tr(language, tr(language, "لا يوجد سجل", "No Record"), "No Record")} />
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-full", color)} />{label}</span>;
}

function DayDetails({ day }: { day: MonthDay | null }) {
  const { language } = useLanguage();
  if (!day) return null;
  const scheduledMinutes = day.shift ? scheduleMinutes(day.shift.startTime, day.shift.endTime) : 0;
  const worked = Number(day.record?.workedMinutes || 0);
  const diff = worked - scheduledMinutes;
  const overtime = Math.max(0, diff);
  const shortage = Math.max(0, -diff);
  const adminState = day.override?.type === "emergency_leave"
    ? tr(language, "إجازة مفاجئة معتمدة", "Approved Emergency Leave")
    : day.override?.type === "absence"
      ? tr(language, "غياب مسجل", "Recorded Absence")
      : day.record?.checkInAt && day.record?.checkOutAt
        ? tr(language, "بصمة مكتملة", "Complete Attendance")
        : day.record?.checkInAt
          ? tr(language, "بصمة غير مكتملة", "Incomplete Attendance")
          : day.state === "off"
            ? tr(language, "يوم راحة", "Rest Day")
            : tr(language, "لا يوجد سجل", "No Record");

  return (
    <div className="space-y-4">
      {!day.record && !day.override && day.state !== "off" && day.state !== "future" ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><h4 className="font-black">{tr(language, "لم يتم تسجيل حضور لهذا اليوم حتى الآن", "No attendance has been recorded for this day yet")}</h4><p className="mt-1 text-sm text-slate-500">{tr(language, "لا توجد بيانات حضور فعلية لليوم المحدد.", "There is no actual attendance data for the selected day.")}</p></div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label={tr(language, "الدوام المعتمد", "Scheduled Shift")} value={day.shift ? formatHabatShiftRange(day.shift.startTime, day.shift.endTime, language) : "--"} />
        <Metric label={tr(language, "أول حضور", "First Clock In")} value={formatTime(day.record?.checkInAt)} />
        <Metric label={tr(language, "آخر انصراف", "Last Clock Out")} value={formatTime(day.record?.checkOutAt)} />
        <Metric label={tr(language, "مدة العمل الفعلية", "Actual Worked Time")} value={formatMinutes(day.record?.workedMinutes, language)} />
        <Metric label={tr(language, "صافي فرق الساعات", "Net Hours Difference")} value={day.record ? (diff >= 0 ? `زيادة ${formatMinutes(diff, language)}` : `نقص ${formatMinutes(-diff, language)}`) : `نقص ${formatMinutes(scheduledMinutes)}`} />
        <Metric label={tr(language, "الحالة الإدارية", "Administrative Status")} value={adminState} />
        <Metric label={tr(language, "التأخير الفعلي", "Actual Late Time")} value={formatMinutes(day.record?.lateMinutes || 0, language)} />
        <Metric label={tr(language, "عمل بعد نهاية الدوام", "Work After Shift End")} value={formatMinutes(overtime, language)} />
        <Metric label={tr(language, "نقص الساعات", "Hours Shortage")} value={formatMinutes(day.record ? shortage : scheduledMinutes, language)} />
        <Metric label={tr(language, "زيادة ساعات", "Extra Hours")} value={formatMinutes(overtime, language)} />
      </div>
    </div>
  );
}

function scheduleMinutes(startTime: string, endTime: string) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let total = eh * 60 + em - (sh * 60 + sm);
  if (total <= 0) total += 24 * 60;
  return total;
}

function AttendanceMonthWorkspace({ access, manager, onBack }: {
  access?: HabatAccessAccount; manager: boolean; onBack?: () => void }) {
  const { language } = useLanguage();
  const today = todayRiyadhKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [workspace, setWorkspace] = useState<MonthWorkspace | null>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [editing, setEditing] = useState<HabatRecord | null>(null);
  const [manualDay, setManualDay] = useState<MonthDay | null>(null);
  const [overrideDay, setOverrideDay] = useState<MonthDay | null>(null);
  const [overrideType, setOverrideType] = useState<"absence" | "emergency_leave">("absence");
  const [loading, setLoading] = useState(true);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ month });
      if (access?.id) params.set("accessId", access.id);
      const payload = await habatApi<MonthWorkspace>(`v3/month?${params.toString()}`);
      setWorkspace(payload);
      const preferred = payload.days.find(day => day.date === selectedDate) || payload.days.find(day => day.date === today) || payload.days[payload.days.length - 1];
      if (preferred) setSelectedDate(preferred.date);
    } catch (caught) {
      setError(extendedError(caught));
    } finally {
      setLoading(false);
    }
  }, [access?.id, month, selectedDate, today]);

  useEffect(() => { void refresh(); }, [month, access?.id]);

  const selectedDay = workspace?.days.find(day => day.date === selectedDate) || null;
  const effectiveAccess = workspace?.access || access || null;
  const attendanceCount = workspace?.days.filter(day => Boolean(day.record?.checkInAt)).length || 0;
  const leaves = workspace?.overrides.filter(item => item.type === "emergency_leave") || [];
  const absences = workspace?.overrides.filter(item => item.type === "absence") || [];

  async function deleteRecord(record: HabatRecord) {
    if (!window.confirm(tr(language, `مسح بصمة ${formatDate(record.attendanceDate)}؟ سيتم الاحتفاظ بالعملية في سجل التدقيق.`, `Delete attendance for ${formatDate(record.attendanceDate)}? The action will remain in the audit log.`))) return;
    setError("");
    try {
      await habatApi(`v3/records/${encodeURIComponent(record.id)}`, { method: "DELETE" });
      await refresh();
    } catch (caught) { setError(extendedError(caught)); }
  }

  async function deleteOverride(override: DayOverride) {
    if (!window.confirm(tr(language, "حذف الحالة المسجلة لهذا اليوم؟", "Delete the recorded status for this day?"))) return;
    try {
      await habatApi(`v3/day-overrides/${encodeURIComponent(override.id)}`, { method: "DELETE" });
      await refresh();
    } catch (caught) { setError(extendedError(caught)); }
  }

  async function generateSummary() {
    if (!effectiveAccess || summaryBusy) return;
    setSummaryBusy(true);
    setError("");
    try {
      await habatApi("v3/monthly-summary/generate", {
        method: "POST",
        body: JSON.stringify({ accessId: effectiveAccess.id, month }),
      });
      await refresh();
    } catch (caught) { setError(extendedError(caught)); }
    finally { setSummaryBusy(false); }
  }

  function openOverride(day: MonthDay, type: "absence" | "emergency_leave") {
    setOverrideType(type);
    setOverrideDay(day);
  }

  return (
    <div className="space-y-5">
      {manager && effectiveAccess ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>{onBack ? <Button type="button" variant="ghost" className="mb-2 -mr-3 rounded-xl" onClick={onBack}>{tr(language, "← رجوع للموظفين", "← Back to Employees")}</Button> : null}<h2 className="text-2xl font-black">{effectiveAccess.displayName || effectiveAccess.email}</h2><p className="mt-1 text-sm text-slate-500">{effectiveAccess.email}</p></div>
            <div className="w-full sm:w-[200px]"><Label className="mb-2 block text-xs">{tr(language, "الشهر", "Month")}</Label><HabatDatePicker mode="month" value={month} onChange={setMonth} /></div>
          </div>
        </section>
      ) : null}

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {loading || !workspace ? (
        <div className="rounded-[28px] border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
          <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" />
          {tr(language, "جاري تحميل الحضور...", "Loading attendance...")}
        </div>
      ) : (
        <>
          <CalendarBoard days={workspace.days} selectedDate={selectedDate} onSelect={setSelectedDate} month={month} onMonthChange={setMonth} />

          <Tabs defaultValue="records" dir={languageDir(language)} className="gap-4">
            <TabsList className="h-12 w-full rounded-2xl bg-white p-1 shadow-sm sm:w-auto">
              <TabsTrigger value="records" className="h-10 rounded-xl px-8">{tr(language, "السجلات", "Records")}</TabsTrigger>
              <TabsTrigger value="leaves" className="h-10 rounded-xl px-8">{tr(language, "إجازتي", "My Leave")}</TabsTrigger>
            </TabsList>

            <TabsContent value="records" className="space-y-5">
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-black">{tr(language, "ملخص الحضور الشهري", "Monthly Attendance Summary")}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {tr(language, "اختر شهرًا لتوليد أو عرض الملخص المحفوظ بدون حذف أو أرشفة السجلات.", "Select a month to generate or view the saved summary without deleting or archiving attendance records.")}
                    </p>
                  </div>
                  {manager ? (
                    <Button type="button" className="rounded-xl bg-black" disabled={summaryBusy} onClick={() => void generateSummary()}>
                      <Save className="h-4 w-4" />
                      {summaryBusy
                        ? tr(language, "جاري التوليد...", "Generating...")
                        : tr(language, "توليد ملخص الشهر", "Generate Monthly Summary")}
                    </Button>
                  ) : null}
                </div>
                {workspace.savedSummary ? (
                  <SummaryCards summary={workspace.savedSummary.summary} generatedAt={workspace.savedSummary.generatedAt} />
                ) : (
                  <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    {manager
                      ? tr(language, "لا يوجد ملخص محفوظ لهذا الشهر بعد. اضغط «توليد ملخص الشهر» لإنشاء القراءة الأولى.", "No saved summary exists for this month yet. Select Generate Monthly Summary to create the first snapshot.")
                      : tr(language, "لا يوجد ملخص محفوظ لهذا الشهر بعد.", "No saved summary exists for this month yet.")}
                  </p>
                )}
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 className="font-black">{tr(language, "سجل الغياب", "Absence Log")}</h3>
                {absences.length ? <><div className="mt-4 hidden md:block md:overflow-x-auto"><Table className="min-w-[620px]"><TableHeader><TableRow><TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "التاريخ", "Date")}</TableHead><TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "المدة", "Duration")}</TableHead><TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "الملاحظة", "Note")}</TableHead>{manager ? <TableHead /> : null}</TableRow></TableHeader><TableBody>{absences.map(item => <TableRow key={item.id}><TableCell>{formatDate(item.date)}</TableCell><TableCell>{item.dayPortion === "half_day" ? tr(language, "نصف يوم", "Half Day") : tr(language, "يوم كامل", "Full Day")}</TableCell><TableCell>{item.reason || "—"}</TableCell>{manager ? <TableCell><Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => void deleteOverride(item)}><Trash2 className="h-4 w-4" /></Button></TableCell> : null}</TableRow>)}</TableBody></Table></div><div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 md:hidden">{absences.map(item => <article key={item.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{formatDate(item.date)}</p><p className="mt-1 text-xs text-slate-500">{item.dayPortion === "half_day" ? tr(language, "نصف يوم", "Half Day") : tr(language, "يوم كامل", "Full Day")}</p></div>{manager ? <Button type="button" variant="ghost" size="icon" className="shrink-0 text-red-600" onClick={() => void deleteOverride(item)}><Trash2 className="h-4 w-4" /></Button> : null}</div><p className="mt-3 break-words text-sm text-slate-600">{item.reason || "—"}</p></article>)}</div></> : <p className="mt-4 text-sm text-slate-500">{tr(language, "لا توجد غيابات مسجلة لهذا الموظف حتى الآن.", "No absences recorded for this employee yet.")}</p>}
              </section>
            </TabsContent>

            <TabsContent value="leaves">
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 className="font-black">{tr(language, "الإجازات المسجلة", "Recorded Leave")}</h3>
                {leaves.length ? <><div className="mt-4 hidden md:block md:overflow-x-auto"><Table className="min-w-[620px]"><TableHeader><TableRow><TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "التاريخ", "Date")}</TableHead><TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "المدة", "Duration")}</TableHead><TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "الملاحظة", "Note")}</TableHead>{manager ? <TableHead /> : null}</TableRow></TableHeader><TableBody>{leaves.map(item => <TableRow key={item.id}><TableCell>{formatDate(item.date)}</TableCell><TableCell>{item.dayPortion === "half_day" ? tr(language, "نصف يوم", "Half Day") : tr(language, "يوم كامل", "Full Day")}</TableCell><TableCell>{item.reason || tr(language, "إجازة مفاجئة معتمدة", "Approved Emergency Leave")}</TableCell>{manager ? <TableCell><Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => void deleteOverride(item)}><Trash2 className="h-4 w-4" /></Button></TableCell> : null}</TableRow>)}</TableBody></Table></div><div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 md:hidden">{leaves.map(item => <article key={item.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{formatDate(item.date)}</p><p className="mt-1 text-xs text-slate-500">{item.dayPortion === "half_day" ? tr(language, "نصف يوم", "Half Day") : tr(language, "يوم كامل", "Full Day")}</p></div>{manager ? <Button type="button" variant="ghost" size="icon" className="shrink-0 text-red-600" onClick={() => void deleteOverride(item)}><Trash2 className="h-4 w-4" /></Button> : null}</div><p className="mt-3 break-words text-sm text-slate-600">{item.reason || tr(language, "إجازة مفاجئة معتمدة", "Approved Emergency Leave")}</p></article>)}</div></> : <p className="mt-4 text-sm text-slate-500">{tr(language, "لا توجد إجازات مسجلة لهذا الشهر.", "No leave recorded for this month.")}</p>}
              </section>
            </TabsContent>
          </Tabs>

          <p className="px-1 text-sm text-slate-500">{monthLabel(month, language)} · {tr(language, "أيام بها حضور", "Days with attendance")}: {attendanceCount}</p>
        </>
      )}

      <CorrectionDialog record={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      {effectiveAccess ? <ManualRecordDialog access={effectiveAccess} day={manualDay} onClose={() => setManualDay(null)} onSaved={refresh} /> : null}
      {effectiveAccess ? <OverrideDialog access={effectiveAccess} day={overrideDay} type={overrideType} onClose={() => setOverrideDay(null)} onSaved={refresh} /> : null}
    </div>
  );
}

function SummaryCards({ summary, generatedAt }: { summary: MonthlySummary; generatedAt: string }) {
  const { language } = useLanguage();
  const cards: Array<[string, ReactNode]> = [
    [tr(language, "أيام الدوام", "Scheduled Days"), summary.scheduledDays],
    [tr(language, "الحضور", "Attendance"), summary.attendedDays],
    [tr(language, "الغياب", "Absence"), summary.absentDays],
    [tr(language, "الإجازة", "Leave"), summary.emergencyLeaveDays],
    [tr(language, "التأخير", "Late"), summary.lateDays],
    [tr(language, "الخروج المبكر", "Early Leave"), summary.earlyLeaveDays],
    [tr(language, "ناقص انصراف", "Incomplete Clock-out"), summary.incompleteDays],
    [tr(language, "ساعات العمل", "Worked Hours"), formatMinutes(summary.workedMinutes, language)],
  ];
  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, value]) => <Metric key={label} label={label} value={value} />)}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        {tr(language, "آخر توليد", "Last generated")}:{" "}
        {new Intl.DateTimeFormat(language === "ar" ? "ar-SA-u-nu-latn" : "en-GB", {
          timeZone: RIYADH_TIME_ZONE,
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(generatedAt))}
      </p>
    </>
  );
}

function EmployeesPage({ onOpenEmployee }: { onOpenEmployee: (account: HabatAccessAccount) => void }) {
  const { language } = useLanguage();
  const [accounts, setAccounts] = useState<HabatAccessAccount[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const payload = await habatApi<{ ok: true; accounts: HabatAccessAccount[] }>("access");
      setAccounts(payload.accounts || []);
    } catch (caught) { setError(extendedError(caught)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const activeAccounts = accounts.filter(account => account.isActive);

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{tr(language, "الموظفون", "Employees")}</h2>
            <p className="mt-1 text-sm text-slate-500">{tr(language, "اختر الموظف لفتح ملفه الكامل وإدارة الدوام والحضور والإجازات والراتب.", "Select an employee to open the full file and manage schedule, attendance, leave, and payroll.")}</p>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" /> {tr(language, "تحديث", "Refresh")}
          </Button>
        </div>
        {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      </section>

      {activeAccounts.length ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {activeAccounts.map(account => (
            <button
              key={account.id}
              type="button"
              onClick={() => onOpenEmployee(account)}
              className={`group min-h-[190px] rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 ${language === "ar" ? "text-right" : "text-left"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black text-slate-950">{account.displayName || account.email}</h3>
                  <p className="mt-1 truncate text-xs text-slate-500" dir="ltr">{account.email}</p>
                </div>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white transition group-hover:scale-105">
                  <UserRound className="h-6 w-6" />
                </span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">{tr(language, "الصلاحية", "Access")}</p>
                  <p className="mt-1 font-black">{account.accessLevel === "manager" ? tr(language, "إدارة", "Manager") : tr(language, "موظف", "Employee")}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">{tr(language, "البصمة", "Attendance")}</p>
                  <p className="mt-1 font-black">{account.clockEnabled ? tr(language, "مفعلة", "Enabled") : tr(language, "غير مفعلة", "Disabled")}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-black">
                <span>{tr(language, "فتح ملف الموظف", "Open Employee File")}</span>
                <ChevronLeft className="h-4 w-4 transition group-hover:-translate-x-1" />
              </div>
            </button>
          ))}
        </section>
      ) : (
        <section className="rounded-[28px] border border-slate-200 bg-white py-14 text-center text-sm text-slate-500">
          {tr(language, "لا توجد حسابات موظفين مفعلة.", "No active employee accounts.")}
        </section>
      )}
    </div>
  );
}

function ManagerRecordsPage() {
  const { language } = useLanguage();
  const today = todayRiyadhKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [employeeEmail, setEmployeeEmail] = useState("all");
  const [status, setStatus] = useState("all");
  const [accounts, setAccounts] = useState<HabatAccessAccount[]>([]);
  const [records, setRecords] = useState<HabatRecord[]>([]);
  const [editing, setEditing] = useState<HabatRecord | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const range = monthRange(month);
    const params = new URLSearchParams({ from: range.from, to: range.to > today ? today : range.to, limit: "500" });
    if (employeeEmail !== "all") params.set("email", employeeEmail);
    if (status !== "all") params.set("status", status);
    try {
      const [recordPayload, accountPayload] = await Promise.all([
        habatApi<{ ok: true; records: HabatRecord[] }>(`v2/records?${params.toString()}`),
        habatApi<{ ok: true; accounts: HabatAccessAccount[] }>("access"),
      ]);
      setRecords(recordPayload.records || []);
      setAccounts(accountPayload.accounts || []);
    } catch (caught) { setError(extendedError(caught)); }
  }, [employeeEmail, month, status, today]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function remove(record: HabatRecord) {
    if (!window.confirm(tr(language, `مسح بصمة ${record.displayName || record.accountEmail} بتاريخ ${formatDate(record.attendanceDate)}؟`, `Delete attendance for ${record.displayName || record.accountEmail} on ${formatDate(record.attendanceDate)}?`))) return;
    try { await habatApi(`v3/records/${encodeURIComponent(record.id)}`, { method: "DELETE" }); await refresh(); }
    catch (caught) { setError(extendedError(caught)); }
  }

  return <div className="space-y-5"><section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-3"><div className="space-y-2"><Label>{tr(language, "الشهر", "Month")}</Label><HabatDatePicker mode="month" value={month} onChange={setMonth} /></div><div className="space-y-2"><Label>{tr(language, "الموظف", "Employee")}</Label><Select value={employeeEmail} onValueChange={setEmployeeEmail}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{tr(language, "جميع الموظفين", "All Employees")}</SelectItem>{accounts.filter(account => account.isActive).map(account => <SelectItem key={account.id} value={account.email}>{account.displayName || account.email}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>{tr(language, "الحالة", "Status")}</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{tr(language, "كل الحالات", "All Statuses")}</SelectItem><SelectItem value="present">{tr(language, "حاضر", "Present")}</SelectItem><SelectItem value="late">{tr(language, "متأخر", "Late")}</SelectItem><SelectItem value="early_leave">{tr(language, "انصراف مبكر", "Early Leave")}</SelectItem><SelectItem value="late_early_leave">{tr(language, "متأخر + انصراف مبكر", "Late + Early Leave")}</SelectItem></SelectContent></Select></div></div>{error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}</section><RecordsTable records={records} onEdit={setEditing} onDelete={record => void remove(record)} /><CorrectionDialog record={editing} onClose={() => setEditing(null)} onSaved={refresh} /></div>;
}

function RecordsTable({ records, onEdit, onDelete }: {
  records: HabatRecord[]; onEdit?: (record: HabatRecord) => void; onDelete?: (record: HabatRecord) => void }) {
  const { language } = useLanguage();

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
      <div className="hidden md:block md:overflow-x-auto">
        <Table className="min-w-[980px]">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "الموظف", "Employee")}</TableHead>
              <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "التاريخ", "Date")}</TableHead>
              <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "الحالة", "Status")}</TableHead>
              <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "الحضور", "Clock In")}</TableHead>
              <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "الانصراف", "Clock Out")}</TableHead>
              <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "التأخير", "Late")}</TableHead>
              <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "الخروج المبكر", "Early Leave")}</TableHead>
              <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "العمل", "Worked")}</TableHead>
              {onEdit || onDelete ? <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "الإجراءات", "Actions")}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map(record => (
              <TableRow key={record.id}>
                <TableCell>
                  <p className="font-black">{record.displayName || record.accountEmail}</p>
                  <p className="mt-1 text-xs text-slate-500">{record.accountEmail}</p>
                </TableCell>
                <TableCell>{formatDate(record.attendanceDate)}</TableCell>
                <TableCell><Badge variant="outline" className="rounded-full">{statusLabel(record.attendanceStatus)}</Badge></TableCell>
                <TableCell>{formatTime(record.checkInAt)}</TableCell>
                <TableCell>{formatTime(record.checkOutAt)}</TableCell>
                <TableCell>{formatMinutes(record.lateMinutes, language)}</TableCell>
                <TableCell>{formatMinutes(record.earlyLeaveMinutes, language)}</TableCell>
                <TableCell>{formatMinutes(record.workedMinutes, language)}</TableCell>
                {onEdit || onDelete ? (
                  <TableCell>
                    <div className="flex gap-1">
                      {onEdit ? <Button type="button" variant="outline" size="icon" className="rounded-xl" onClick={() => onEdit(record)}><Edit3 className="h-4 w-4" /></Button> : null}
                      {onDelete ? <Button type="button" variant="outline" size="icon" className="rounded-xl border-red-200 text-red-600" onClick={() => onDelete(record)}><Trash2 className="h-4 w-4" /></Button> : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y divide-slate-100 md:hidden">
        {records.map(record => (
          <article key={record.id} className="p-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-black text-slate-950">{record.displayName || record.accountEmail}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{record.accountEmail}</p>
              </div>
              <Badge variant="outline" className="shrink-0 rounded-full">
                {statusLabel(record.attendanceStatus)}
              </Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
              {[
                [tr(language, "التاريخ", "Date"), formatDate(record.attendanceDate)],
                [tr(language, "الحضور", "Clock In"), formatTime(record.checkInAt)],
                [tr(language, "الانصراف", "Clock Out"), formatTime(record.checkOutAt)],
                [tr(language, "ساعات العمل", "Worked"), formatMinutes(record.workedMinutes, language)],
                [tr(language, "التأخير", "Late"), formatMinutes(record.lateMinutes, language)],
                [tr(language, "الخروج المبكر", "Early Leave"), formatMinutes(record.earlyLeaveMinutes, language)],
              ].map(([label, value]) => (
                <div key={String(label)} className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-400">{label}</p>
                  <p className="mt-1 break-words text-sm font-bold text-slate-800">{value}</p>
                </div>
              ))}
            </div>

            {onEdit || onDelete ? (
              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                {onEdit ? (
                  <Button type="button" variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => onEdit(record)}>
                    <Edit3 className="h-4 w-4" />
                    {tr(language, "تعديل", "Edit")}
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button type="button" variant="outline" className="h-10 flex-1 rounded-xl border-red-200 text-red-600" onClick={() => onDelete(record)}>
                    <Trash2 className="h-4 w-4" />
                    {tr(language, "حذف", "Delete")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {!records.length ? (
        <p className="py-10 text-center text-sm text-slate-500">
          {tr(language, "لا توجد سجلات لهذا الاختيار.", "No records for this selection.")}
        </p>
      ) : null}
    </section>
  );
}

function ReportsPage() {
  const { language } = useLanguage();
  const today = todayRiyadhKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [report, setReport] = useState<HabatReport | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const range = monthRange(month);
    try { setReport(await habatApi<HabatReport>(`v2/reports/summary?from=${range.from}&to=${range.to > today ? today : range.to}`)); }
    catch (caught) { setError(extendedError(caught)); }
  }, [month, today]);
  useEffect(() => { void refresh(); }, [refresh]);
  const totals = report?.totals;
  return <div className="space-y-5"><section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><div className="w-full max-w-xs space-y-2"><Label>{tr(language, "الشهر", "Month")}</Label><HabatDatePicker mode="month" value={month} onChange={setMonth} /></div>{error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}</section>{totals ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{[[tr(language, "أيام الدوام", "Scheduled Days"), totals.scheduledDays], [tr(language, "حضور", "Attendance"), totals.attendedDays], [tr(language, "غياب", "Absence"), totals.absentDays], [tr(language, "تأخير", "Late"), totals.lateDays], [tr(language, "خروج مبكر", "Early Leave"), totals.earlyLeaveDays], [tr(language, "ناقص انصراف", "Incomplete Clock-out"), totals.incompleteDays], [tr(language, "ساعات العمل", "Worked Hours"), formatMinutes(totals.workedMinutes)]].map(([label, value]) => <Metric key={String(label)} label={String(label)} value={value} />)}</div> : null}<section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
  <div className="hidden md:block md:overflow-x-auto">
    <Table className="min-w-[850px]">
      <TableHeader>
        <TableRow>
          <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "الموظف", "Employee")}</TableHead>
          <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "أيام الدوام", "Scheduled Days")}</TableHead>
          <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "حضور", "Attendance")}</TableHead>
          <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "غياب", "Absence")}</TableHead>
          <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "تأخير", "Late")}</TableHead>
          <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "خروج مبكر", "Early Leave")}</TableHead>
          <TableHead className={language === "ar" ? "text-right" : "text-left"}>{tr(language, "العمل", "Worked")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report?.employees.map(employee => (
          <TableRow key={employee.accessId}>
            <TableCell>{employee.displayName}</TableCell>
            <TableCell>{employee.scheduledDays}</TableCell>
            <TableCell>{employee.attendedDays}</TableCell>
            <TableCell>{employee.absentDays}</TableCell>
            <TableCell>{employee.lateDays}</TableCell>
            <TableCell>{employee.earlyLeaveDays}</TableCell>
            <TableCell>{formatMinutes(employee.workedMinutes)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>

  <div className="divide-y divide-slate-100 md:hidden">
    {report?.employees.map(employee => (
      <article key={employee.accessId} className="p-4">
        <div className="min-w-0">
          <p className="truncate font-black text-slate-950">{employee.displayName || employee.email}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{employee.email}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            [tr(language, "أيام الدوام", "Scheduled Days"), employee.scheduledDays],
            [tr(language, "حضور", "Attendance"), employee.attendedDays],
            [tr(language, "غياب", "Absence"), employee.absentDays],
            [tr(language, "تأخير", "Late"), employee.lateDays],
            [tr(language, "خروج مبكر", "Early Leave"), employee.earlyLeaveDays],
            [tr(language, "العمل", "Worked"), formatMinutes(employee.workedMinutes)],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] font-semibold text-slate-400">{label}</p>
              <p className="mt-1 text-base font-black text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      </article>
    ))}
  </div>
</section></div>;
}

type NavItem = { key: PageKey; label: string; icon: typeof Clock3 };

function SidebarNav({ items, page, onChange }: { items: NavItem[]; page: PageKey; onChange: (page: PageKey) => void }) {
  const { language } = useLanguage();

  return (
    <nav className="flex flex-col gap-2">
      {items.map(item => {
        const Icon = item.icon;
        const active = page === item.key || (page === "employee-file" && item.key === "employees");

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition",
              language === "ar" ? "text-right" : "text-left",
              active ? "bg-black text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function AttendanceShell({ context, onContextRefresh }: { context: HabatContext; onContextRefresh: () => Promise<void> }) {
  const { language, toggleLanguage } = useLanguage();
  const dir = languageDir(language);
  const [realtimeRevision, setRealtimeRevision] = useState(0);

  const refreshFromRealtime = useCallback(async () => {
    await onContextRefresh();
    setRealtimeRevision(value => value + 1);
  }, [onContextRefresh]);

  useHabatRealtimeRefresh(refreshFromRealtime);
  const [page, setPage] = useState<PageKey>(initialHabatPage);
  const [selectedEmployee, setSelectedEmployee] = useState<HabatAccessAccount | null>(initialSelectedEmployee);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(HABAT_PAGE_STORAGE_KEY, page);
    } catch {
      // Storage may be unavailable; navigation still works in-memory.
    }
  }, [page]);

  useEffect(() => {
    try {
      if (selectedEmployee) {
        sessionStorage.setItem(
          HABAT_EMPLOYEE_STORAGE_KEY,
          JSON.stringify(selectedEmployee)
        );
      } else {
        sessionStorage.removeItem(HABAT_EMPLOYEE_STORAGE_KEY);
      }
    } catch {
      // Storage may be unavailable; employee selection still works in-memory.
    }
  }, [selectedEmployee]);

  const managerItems: NavItem[] = [
    { key: "clock", label: tr(language, "الحضور والانصراف", "Clock In / Out"), icon: Fingerprint },
    { key: "dashboard", label: tr(language, "الرئيسية", "Dashboard"), icon: ShieldCheck },
    { key: "employees", label: tr(language, "الموظفون", "Employees"), icon: Users },
    { key: "accounts", label: tr(language, "إدارة الحسابات", "Account Management"), icon: UserCog },
    { key: "shifts", label: tr(language, "الدوام والشفتات", "Schedules & Shifts"), icon: CalendarClock },
    { key: "records", label: tr(language, "سجل الحضور", "Attendance Records"), icon: CalendarCheck2 },
    { key: "reports", label: tr(language, "التقارير", "Reports"), icon: BarChart3 },
    { key: "audit", label: tr(language, "سجل التدقيق", "Audit Log"), icon: FileClock },
    { key: "settings", label: tr(language, "الإعدادات", "Settings"), icon: Settings2 },
  ];
  const employeeItems: NavItem[] = [
    { key: "clock", label: tr(language, "الحضور والانصراف", "Clock In / Out"), icon: Fingerprint },
    { key: "history", label: tr(language, "سجلي", "My Attendance"), icon: CalendarCheck2 },
    { key: "profile", label: tr(language, "صفحتي", "My Profile"), icon: UserRound },
  ];
  const items = context.principal.canManage ? managerItems : employeeItems;

  function navigate(next: PageKey) {
    if (next !== "employee-file") {
      setSelectedEmployee(null);
    }
    setPage(next);
    setMobileOpen(false);
  }

  const content = useMemo(() => {
    switch (page) {
      case "clock": return <ClockPage context={context} onRefresh={onContextRefresh} />;
      case "dashboard": return <DashboardPage />;
      case "profile": return <EmployeePortalPage />;
      case "history": return <AttendanceMonthWorkspace manager={false} />;
      case "employees": return <EmployeesPage onOpenEmployee={account => { setSelectedEmployee(account); setPage("employee-file"); }} />;
      case "employee-file": return selectedEmployee ? (
        <WorkforceEmployeeFile
          identity={{
            accountUid: selectedEmployee.uid,
            accountEmail: selectedEmployee.email,
            fallbackName: selectedEmployee.displayName,
          }}
          onBack={() => setPage("employees")}
          legacyAttendance={
            <AttendanceMonthWorkspace
              access={selectedEmployee}
              manager
            />
          }
        />
      ) : <EmployeesPage onOpenEmployee={account => { setSelectedEmployee(account); setPage("employee-file"); }} />;
      case "accounts": return <HabatAccountManagement onDataChanged={onContextRefresh} />;
      case "shifts": return <ShiftsPage onDataChanged={onContextRefresh} />;
      case "records": return <ManagerRecordsPage />;
      case "reports": return <ReportsPage />;
      case "audit": return <AuditLogPage />;
      case "settings": return <HabatAttendanceSettings onDataChanged={onContextRefresh} />;
      default: return <ClockPage context={context} onRefresh={onContextRefresh} />;
    }
  }, [context, onContextRefresh, page, selectedEmployee]);

  return (
    <main dir={dir} className="habat-attendance-shell min-h-screen bg-[#f5f5f3] text-slate-950">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild><Button type="button" variant="outline" size="icon" className="rounded-xl lg:hidden"><Menu className="h-5 w-5" /></Button></SheetTrigger>
              <SheetContent side={language === "ar" ? "right" : "left"} dir={dir} className="w-[86vw] max-w-[330px] p-0">
                <SheetHeader className="border-b border-slate-100 p-5"><SheetTitle className={language === "ar" ? "text-right" : "text-left"}><Brand compact /></SheetTitle></SheetHeader>
                <div className="flex-1 overflow-y-auto p-3"><SidebarNav items={items} page={page} onChange={navigate} /></div>
                <div className="border-t border-slate-100 p-4"><Button type="button" variant="outline" className="w-full rounded-xl" onClick={() => void logoutHabatAndReload()}>{tr(language, "تسجيل الخروج", "Sign out")}</Button></div>
              </SheetContent>
            </Sheet>
            <Brand compact />
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden min-w-0 sm:block">
              <p dir="auto" className="max-w-[180px] truncate text-end text-sm font-black">
                {context.principal.displayName || context.principal.email}
              </p>
              <p className="text-end text-xs text-slate-500">
                {context.principal.canManage
                  ? tr(language, "إدارة", "Management")
                  : tr(language, "موظف", "Employee")}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-12 shrink-0 rounded-xl font-bold"
              onClick={toggleLanguage}
              aria-label={tr(language, "تغيير اللغة", "Change language")}
            >
              {language === "ar" ? "EN" : "AR"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="hidden shrink-0 rounded-xl lg:inline-flex"
              onClick={() => void logoutHabatAndReload()}
            >
              {tr(language, "خروج", "Sign out")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-3 pb-4 pt-[88px] sm:px-4 sm:pb-6 sm:pt-[92px] lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden h-fit rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-24 lg:block"><SidebarNav items={items} page={page} onChange={navigate} /></aside>
        <div key={realtimeRevision} className="min-w-0">{content}</div>
      </div>
    </main>
  );
}

async function logoutHabatAndReload() {
  try {
    await habatLogout();
  } finally {
    window.location.reload();
  }
}

async function loadContext(language: "ar" | "en"): Promise<AccessState> {
  try {
    const session = await habatSession();
    if (session.mustChangePassword) return { status: "change-password" };
    const context = await habatApi<HabatContext>("v2/context");
    ensureHabatRealtimeConnection();
    return { status: "ready", context };
  } catch (error) {
    if ((error as { status?: number })?.status === 401) {
      return { status: "signed-out" };
    }
    if ((error as { code?: string })?.code === "habat_password_change_required") {
      return { status: "change-password" };
    }
    return { status: "forbidden", message: extendedError(error, language) };
  }
}

function ChangePasswordScreen({ onChanged }: { onChanged: () => Promise<void> }) {
  const { language } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (newPassword.length < 10 || newPassword !== confirmation) {
      setError(tr(language, "استخدم 10 أحرف على الأقل وتأكد من تطابق كلمتي المرور.", "Use at least 10 characters and matching passwords."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await habatChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      await onChanged();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir={languageDir(language)} className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-4 py-10">
      <section className="w-full max-w-md space-y-5 rounded-[32px] border border-slate-200 bg-white p-7 shadow-xl">
        <Brand />
        <h2 className="text-center font-black">{tr(language, "تغيير كلمة المرور المؤقتة", "Change temporary password")}</h2>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-bold">{tr(language, "كلمة المرور الحالية", "Current password")}
            <Input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-2 h-12 rounded-2xl bg-slate-50" />
          </label>
          <label className="block text-sm font-bold">{tr(language, "كلمة المرور الجديدة (10 أحرف على الأقل)", "New password (at least 10 characters)")}
            <Input type="password" autoComplete="new-password" required minLength={10} value={newPassword} onChange={event => setNewPassword(event.target.value)} className="mt-2 h-12 rounded-2xl bg-slate-50" />
          </label>
          <label className="block text-sm font-bold">{tr(language, "تأكيد كلمة المرور", "Confirm password")}
            <Input type="password" autoComplete="new-password" required minLength={10} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 h-12 rounded-2xl bg-slate-50" />
          </label>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <Button disabled={busy} className="h-12 w-full rounded-2xl bg-black">{tr(language, "حفظ ومتابعة", "Save and continue")}</Button>
          <Button type="button" variant="outline" disabled={busy} className="w-full rounded-2xl" onClick={() => void logoutHabatAndReload()}>{tr(language, "تسجيل الخروج", "Sign out")}</Button>
        </form>
      </section>
    </main>
  );
}

function LoadingHabatScreen() {
  const { language } = useLanguage();
  return (
    <main
      dir={languageDir(language)}
      className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-4 font-bold text-slate-600"
    >
      <div className="text-center">
        <RefreshCw className="mx-auto mb-3 animate-spin" />
        {tr(language, "جاري تحميل نظام الحضور...", "Loading attendance system...")}
      </div>
    </main>
  );
}

export default function HabatAttendanceAppV4() {
  const { language } = useLanguage();
  useWesternDigitsBoundary();
  const [access, setAccess] = useState<AccessState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    void loadContext(language).then(next => {
      if (active) setAccess(next);
    });

    return () => {
      active = false;
    };
  }, [language]);

  const refreshContext = useCallback(async () => {
    setAccess(await loadContext(language));
  }, [language]);

  if (access.status === "loading") return <LoadingHabatScreen />;
  if (access.status === "signed-out") return <LoginScreen onSignedIn={refreshContext} />;
  if (access.status === "change-password") return <ChangePasswordScreen onChanged={refreshContext} />;
  if (access.status === "forbidden") return <main dir={languageDir(language)} className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-4"><section className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-sm"><ShieldCheck className="mx-auto mb-4 text-slate-400" size={34} /><h2 className="text-xl font-black">{tr(language, "غير مصرح بالدخول", "Access denied")}</h2><p className="mt-2 text-sm text-slate-500">{access.message}</p><Button type="button" className="mt-5 rounded-xl bg-black" onClick={() => void logoutHabatAndReload()}>{tr(language, "تسجيل الخروج", "Sign out")}</Button></section></main>;
  return <AttendanceShell context={access.context} onContextRefresh={refreshContext} />;
}
