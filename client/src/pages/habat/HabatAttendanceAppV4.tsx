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
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { auth } from "@/_core/firebase";
import { resolveLoginEmailForAuth } from "@/lib/loginIdentity";
import { cn } from "@/lib/utils";
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
const EN_MONTHS = [
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

function formatMinutes(value?: number | null) {
  if (value == null) return "--";
  const total = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} دقيقة`;
  if (!minutes) return `${hours} ساعة`;
  return `${hours} ساعة و${minutes} دقيقة`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${EN_MONTHS[monthNumber - 1] || month} ${year}`;
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

function extendedError(error: unknown) {
  const code = String((error as { code?: unknown; message?: unknown })?.code || (error as { message?: unknown })?.message || "");
  const map: Record<string, string> = {
    habat_employee_login_required_before_manual_record:
      "يجب أن يسجل الموظف دخوله إلى حبات الورق مرة واحدة قبل إضافة بصمة يدوية له.",
    habat_attendance_record_already_exists: "يوجد سجل حضور لهذا اليوم بالفعل.",
    habat_day_override_exists: "اليوم مسجل كغياب أو إجازة. احذف الحالة أولًا.",
    habat_day_has_attendance_record: "يوجد حضور فعلي لهذا اليوم. احذف البصمة أولًا إذا أردت تسجيل غياب أو إجازة.",
    habat_manual_record_fields_required: "حدد الموظف والتاريخ ووقت الحضور.",
    habat_day_override_fields_required: "تحقق من نوع الحالة وتاريخها.",
  };
  return map[code] || friendlyHabatError(error);
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "flex items-center gap-3" : "text-center"}>
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden bg-black",
          compact ? "h-11 w-11 rounded-2xl" : "mx-auto h-28 w-28 rounded-[28px]"
        )}
      >
        <img src="/habat-alwaraq-logo.svg" alt="حبات الورق" className="h-full w-full object-contain" />
      </div>
      <div className={compact ? "text-right" : "mt-4"}>
        <h1 className={compact ? "text-lg font-black" : "text-3xl font-black"}>حبات الورق</h1>
        <p className="mt-1 text-xs font-semibold text-slate-500">نظام الحضور والانصراف</p>
      </div>
    </div>
  );
}

function LoginScreen() {
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
      const email = await resolveLoginEmailForAuth(identity);
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError("بيانات الدخول غير صحيحة أو الحساب غير موجود.");
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#f5f5f3] px-4 py-10 text-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <section className="w-full rounded-[32px] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 sm:p-9">
          <Brand />
          <div className="my-7 h-px bg-slate-100" />
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label>البريد أو اسم المستخدم</Label>
              <Input value={identity} onChange={event => setIdentity(event.target.value)} autoComplete="username" className="h-12 rounded-2xl bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
              <Input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" className="h-12 rounded-2xl bg-slate-50" />
            </div>
            {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
            <Button type="submit" disabled={busy || !identity.trim() || !password} className="h-12 w-full rounded-2xl bg-black">
              <LogIn className="h-4 w-4" /> {busy ? "جاري الدخول..." : "دخول"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

function ClockPage({ context, onRefresh }: { context: HabatContext; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const record = context.today;
  const checkedIn = Boolean(record?.checkInAt);
  const checkedOut = Boolean(record?.checkOutAt);
  const nextType: "check-in" | "check-out" | null = checkedOut ? null : checkedIn ? "check-out" : "check-in";

  async function submitClock() {
    if (!nextType || busy || !context.principal.canClock) return;
    if (nextType === "check-out" && !window.confirm("تأكيد تسجيل الانصراف؟")) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const location = await readBrowserLocation(context.settings.locationRequired);
      await habatApi(`v2/${nextType}`, { method: "POST", body: JSON.stringify(location) });
      await onRefresh();
      setMessage(nextType === "check-in" ? "تم تسجيل الحضور بنجاح." : "تم تسجيل الانصراف بنجاح.");
    } catch (caught) {
      setError(extendedError(caught));
    } finally {
      setBusy(false);
    }
  }

  const actionLabel = nextType === "check-in" ? "تسجيل حضور" : nextType === "check-out" ? "تسجيل انصراف" : "تم اكتمال الدوام";
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">مرحبًا</p>
          <h2 className="mt-1 text-2xl font-black">{context.principal.displayName || context.principal.email}</h2>
          <p className="mt-1 text-sm text-slate-500">{context.principal.email}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-left">
          <p dir="ltr" className="text-lg font-black">
            {new Intl.DateTimeFormat("en-US", { timeZone: RIYADH_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date())}
          </p>
          <p className="mt-1 text-xs text-slate-500">بتوقيت الرياض</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl bg-slate-50 p-3 sm:p-4"><p className="text-xs text-slate-500">الشفت</p><p className="mt-1 text-sm font-black sm:text-base">{context.shift?.name || "غير محدد"}</p></div>
        <div className="rounded-2xl bg-slate-50 p-3 sm:p-4"><p className="text-xs text-slate-500">الدوام</p><p dir="ltr" className="mt-1 text-sm font-black sm:text-base">{context.shift ? `${context.shift.startTime} - ${context.shift.endTime}` : "--"}</p></div>
        <div className="rounded-2xl bg-slate-50 p-3 sm:p-4"><p className="text-xs text-slate-500">الموقع</p><p className="mt-1 text-sm font-black sm:text-base">{context.settings.locationRequired ? `${context.settings.radiusM} m` : "غير إلزامي"}</p></div>
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
        <Metric label="الحضور" value={formatTime(record?.checkInAt)} />
        <Metric label="الانصراف" value={formatTime(record?.checkOutAt)} />
        <Metric label="الحالة" value={statusLabel(record?.attendanceStatus)} />
        <Metric label="ساعات العمل" value={formatMinutes(record?.workedMinutes)} />
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
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!record) return;
    setCheckInAt(toDateTimeLocal(record.checkInAt));
    setCheckOutAt(toDateTimeLocal(record.checkOutAt));
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
          checkInAt: fromRiyadhDateTimeLocal(checkInAt),
          checkOutAt: checkOutAt ? fromRiyadhDateTimeLocal(checkOutAt) : null,
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
      <DialogContent dir="rtl" className="rounded-[28px] sm:max-w-lg">
        <DialogHeader className="text-right">
          <DialogTitle>تعديل البصمة</DialogTitle>
          <DialogDescription>{record ? `${record.displayName || record.accountEmail} · ${formatDate(record.attendanceDate)}` : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2"><Label>وقت الحضور</Label><Input lang="en" dir="ltr" type="datetime-local" value={checkInAt} onChange={event => setCheckInAt(event.target.value)} className="h-11 rounded-2xl" required /></div>
          <div className="space-y-2"><Label>وقت الانصراف</Label><Input lang="en" dir="ltr" type="datetime-local" value={checkOutAt} onChange={event => setCheckOutAt(event.target.value)} className="h-11 rounded-2xl" /></div>
          <div className="space-y-2"><Label>سبب التعديل</Label><Textarea value={reason} onChange={event => setReason(event.target.value)} className="min-h-24 rounded-2xl" placeholder="سبب واضح للتعديل" required /></div>
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <DialogFooter className="gap-2 sm:justify-start"><Button type="submit" disabled={saving || reason.trim().length < 3} className="rounded-xl bg-black"><Save className="h-4 w-4" /> حفظ التعديل</Button><Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>إلغاء</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManualRecordDialog({ access, day, onClose, onSaved }: { access: HabatAccessAccount; day: MonthDay | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!day) return;
    setCheckInAt(`${day.date}T${day.shift?.startTime || "09:00"}`);
    setCheckOutAt(`${day.date}T${day.shift?.endTime || "17:00"}`);
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
          checkInAt: fromRiyadhDateTimeLocal(checkInAt),
          checkOutAt: checkOutAt ? fromRiyadhDateTimeLocal(checkOutAt) : null,
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
      <DialogContent dir="rtl" className="rounded-[28px] sm:max-w-lg">
        <DialogHeader className="text-right"><DialogTitle>إضافة بصمة يدوية</DialogTitle><DialogDescription>{day ? formatDate(day.date) : ""}</DialogDescription></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2"><Label>وقت الحضور</Label><Input lang="en" dir="ltr" type="datetime-local" value={checkInAt} onChange={event => setCheckInAt(event.target.value)} className="h-11 rounded-2xl" required /></div>
          <div className="space-y-2"><Label>وقت الانصراف</Label><Input lang="en" dir="ltr" type="datetime-local" value={checkOutAt} onChange={event => setCheckOutAt(event.target.value)} className="h-11 rounded-2xl" /></div>
          <div className="space-y-2"><Label>سبب الإضافة</Label><Textarea value={reason} onChange={event => setReason(event.target.value)} className="min-h-24 rounded-2xl" required /></div>
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <DialogFooter className="gap-2 sm:justify-start"><Button type="submit" disabled={saving || reason.trim().length < 3} className="rounded-xl bg-black"><Plus className="h-4 w-4" /> إضافة السجل</Button><Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>إلغاء</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OverrideDialog({ access, day, type, onClose, onSaved }: { access: HabatAccessAccount; day: MonthDay | null; type: "absence" | "emergency_leave"; onClose: () => void; onSaved: () => Promise<void> }) {
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
      <DialogContent dir="rtl" className="rounded-[28px] sm:max-w-lg">
        <DialogHeader className="text-right">
          <DialogTitle>{type === "emergency_leave" ? "تسجيل إجازة مفاجئة" : "تسجيل غياب"}</DialogTitle>
          <DialogDescription>{day ? formatDate(day.date) : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2"><Label>المدة</Label><Select value={portion} onValueChange={value => setPortion(value as "full_day" | "half_day")}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full_day">يوم كامل</SelectItem><SelectItem value="half_day">نصف يوم</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>ملاحظة / سبب</Label><Textarea value={reason} onChange={event => setReason(event.target.value)} className="min-h-24 rounded-2xl" placeholder="حقل اختياري لتوضيح السبب أو أي ملاحظة داخلية" /></div>
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <DialogFooter className="gap-2 sm:justify-start"><Button type="submit" disabled={saving} className={cn("rounded-xl", type === "emergency_leave" ? "bg-blue-600 hover:bg-blue-700" : "bg-black")}><Save className="h-4 w-4" /> {type === "emergency_leave" ? "تسجيل الإجازة" : "تسجيل الغياب"}</Button><Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>إلغاء</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CalendarBoard({ days, selectedDate, onSelect, month, onMonthChange }: { days: MonthDay[]; selectedDate: string; onSelect: (date: string) => void; month: string; onMonthChange: (month: string) => void }) {
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
        <div className="text-center"><h3 className="text-xl font-black">{EN_MONTHS[Number(month.slice(5, 7)) - 1]}</h3><p className="mt-1 text-lg text-slate-300">{month.slice(0, 4)}</p></div>
        <Button type="button" variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10 hover:text-white" onClick={() => onMonthChange(shiftMonth(month, 1))}><ChevronLeft className="h-6 w-6" /></Button>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-y-3 text-center text-xs font-semibold text-slate-400 sm:text-sm">
        {AR_WEEKDAYS.map(day => <div key={day}>{day}</div>)}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-y-3 text-center">
        {cells.map((day, index) => day ? (
          <button key={day.date} type="button" onClick={() => onSelect(day.date)} className={cn("relative mx-auto flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold after:absolute after:-bottom-1.5 after:h-1 after:w-8 after:rounded-full sm:h-11 sm:w-11 sm:text-lg", stateClass(day))}>{Number(day.date.slice(-2))}</button>
        ) : <div key={`empty-${index}`} />)}
      </div>

      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 rounded-2xl border border-white/15 px-3 py-3 text-[11px] text-slate-200 sm:text-xs">
        <Legend color="bg-emerald-400" label="حضور مكتمل" />
        <Legend color="bg-orange-500" label="اليوم المحدد" />
        <Legend color="bg-rose-900" label="نقص/تأخير/غياب" />
        <Legend color="bg-blue-500" label="إجازة" />
        <Legend color="bg-slate-300" label="لا يوجد سجل" />
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-full", color)} />{label}</span>;
}

function DayDetails({ day }: { day: MonthDay | null }) {
  if (!day) return null;
  const scheduledMinutes = day.shift ? scheduleMinutes(day.shift.startTime, day.shift.endTime) : 0;
  const worked = Number(day.record?.workedMinutes || 0);
  const diff = worked - scheduledMinutes;
  const overtime = Math.max(0, diff);
  const shortage = Math.max(0, -diff);
  const adminState = day.override?.type === "emergency_leave"
    ? "إجازة مفاجئة معتمدة"
    : day.override?.type === "absence"
      ? "غياب مسجل"
      : day.record?.checkInAt && day.record?.checkOutAt
        ? "بصمة مكتملة"
        : day.record?.checkInAt
          ? "بصمة غير مكتملة"
          : day.state === "off"
            ? "يوم راحة"
            : "لا يوجد سجل";

  return (
    <div className="space-y-4">
      {!day.record && !day.override && day.state !== "off" && day.state !== "future" ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><h4 className="font-black">لم يتم تسجيل حضور لهذا اليوم حتى الآن</h4><p className="mt-1 text-sm text-slate-500">لا توجد بيانات حضور فعلية لليوم المحدد.</p></div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="الدوام المعتمد" value={day.shift ? `${day.shift.startTime} — ${day.shift.endTime}` : "--"} />
        <Metric label="أول حضور" value={formatTime(day.record?.checkInAt)} />
        <Metric label="آخر انصراف" value={formatTime(day.record?.checkOutAt)} />
        <Metric label="مدة العمل الفعلية" value={formatMinutes(day.record?.workedMinutes)} />
        <Metric label="صافي فرق الساعات" value={day.record ? (diff >= 0 ? `زيادة ${formatMinutes(diff)}` : `نقص ${formatMinutes(-diff)}`) : `نقص ${formatMinutes(scheduledMinutes)}`} />
        <Metric label="الحالة الإدارية" value={adminState} />
        <Metric label="التأخير الفعلي" value={formatMinutes(day.record?.lateMinutes || 0)} />
        <Metric label="عمل بعد نهاية الدوام" value={formatMinutes(overtime)} />
        <Metric label="نقص الساعات" value={formatMinutes(day.record ? shortage : scheduledMinutes)} />
        <Metric label="زيادة ساعات" value={formatMinutes(overtime)} />
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

function AttendanceMonthWorkspace({ access, manager, onBack }: { access?: HabatAccessAccount; manager: boolean; onBack?: () => void }) {
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
    if (!window.confirm(`مسح بصمة ${formatDate(record.attendanceDate)}؟ سيتم الاحتفاظ بالعملية في سجل التدقيق.`)) return;
    setError("");
    try {
      await habatApi(`v3/records/${encodeURIComponent(record.id)}`, { method: "DELETE" });
      await refresh();
    } catch (caught) { setError(extendedError(caught)); }
  }

  async function deleteOverride(override: DayOverride) {
    if (!window.confirm("حذف الحالة المسجلة لهذا اليوم؟")) return;
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
            <div>{onBack ? <Button type="button" variant="ghost" className="mb-2 -mr-3 rounded-xl" onClick={onBack}>← رجوع للموظفين</Button> : null}<h2 className="text-2xl font-black">{effectiveAccess.displayName || effectiveAccess.email}</h2><p className="mt-1 text-sm text-slate-500">{effectiveAccess.email}</p></div>
            <div className="w-full sm:w-[200px]"><Label className="mb-2 block text-xs">الشهر</Label><Input lang="en" dir="ltr" type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-11 rounded-2xl" /></div>
          </div>
        </section>
      ) : null}

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {loading || !workspace ? <div className="rounded-[28px] border border-slate-200 bg-white py-16 text-center text-sm text-slate-500"><RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" />جاري تحميل الحضور...</div> : (
        <>
          <CalendarBoard days={workspace.days} selectedDate={selectedDate} onSelect={setSelectedDate} month={month} onMonthChange={setMonth} />

          <Tabs defaultValue="records" dir="rtl" className="gap-4">
            <TabsList className="h-12 w-full rounded-2xl bg-white p-1 shadow-sm sm:w-auto">
              <TabsTrigger value="records" className="h-10 rounded-xl px-8">السجلات</TabsTrigger>
              <TabsTrigger value="leaves" className="h-10 rounded-xl px-8">إجازتي</TabsTrigger>
            </TabsList>

            <TabsContent value="records" className="space-y-5">
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div><h3 className="font-black">{formatDate(selectedDate)}</h3><p className="mt-1 text-xs text-slate-500">{selectedDay ? AR_WEEKDAYS[selectedDay.weekday] : ""}</p></div>
                  {manager && selectedDay ? <div className="flex flex-wrap gap-2">
                    {selectedDay.record ? <><Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditing(selectedDay.record)}><Edit3 className="h-4 w-4" /> تعديل البصمة</Button><Button type="button" variant="outline" className="rounded-xl border-red-200 text-red-600" onClick={() => void deleteRecord(selectedDay.record!)}><Trash2 className="h-4 w-4" /> مسح البصمة</Button></> : selectedDay.state !== "off" && selectedDay.state !== "future" && !selectedDay.override ? <Button type="button" variant="outline" className="rounded-xl" onClick={() => setManualDay(selectedDay)}><Plus className="h-4 w-4" /> إضافة بصمة</Button> : null}
                    {selectedDay.override ? <Button type="button" variant="outline" className="rounded-xl border-red-200 text-red-600" onClick={() => void deleteOverride(selectedDay.override!)}><Trash2 className="h-4 w-4" /> حذف الحالة</Button> : null}
                  </div> : null}
                </div>
                <div className="mt-5"><DayDetails day={selectedDay} /></div>
              </section>

              {manager && selectedDay && !selectedDay.record && !selectedDay.override && selectedDay.state !== "off" && selectedDay.state !== "future" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <button type="button" onClick={() => openOverride(selectedDay, "emergency_leave")} className="rounded-[24px] border border-blue-200 bg-blue-50 p-5 text-right transition hover:bg-blue-100"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white"><Umbrella className="h-5 w-5" /></span><div><h3 className="font-black">إجازة مفاجئة لليوم</h3><p className="mt-1 text-xs leading-5 text-blue-700">يسجل اليوم كإجازة اضطرارية معتمدة ويستبعده من الغياب والحسابات المرتبطة بالحضور.</p></div></div></button>
                  <button type="button" onClick={() => openOverride(selectedDay, "absence")} className="rounded-[24px] border border-slate-200 bg-white p-5 text-right transition hover:bg-slate-50"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><UserX className="h-5 w-5" /></span><div><h3 className="font-black">تسجيل غياب</h3><p className="mt-1 text-xs leading-5 text-slate-500">سجل الغياب الحالي أو بأثر رجعي من قسم الحضور.</p></div></div></button>
                </div>
              ) : null}

              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><h3 className="font-black">ملخص الحضور الشهري</h3><p className="mt-1 text-sm text-slate-500">اختر شهرًا لتوليد أو عرض الملخص المحفوظ بدون حذف أو أرشفة للسجلات.</p></div>
                  {manager ? <Button type="button" className="rounded-xl bg-black" disabled={summaryBusy} onClick={() => void generateSummary()}><Save className="h-4 w-4" /> {summaryBusy ? "جاري التوليد..." : "توليد ملخص الشهر"}</Button> : null}
                </div>
                {workspace.savedSummary ? <SummaryCards summary={workspace.savedSummary.summary} generatedAt={workspace.savedSummary.generatedAt} /> : <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">لا يوجد ملخص محفوظ لهذا الشهر بعد.{manager ? " اضغط «توليد ملخص الشهر» لإنشاء القراءة الأولى." : ""}</p>}
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 className="font-black">سجل الغياب</h3>
                {absences.length ? <div className="mt-4 overflow-x-auto"><Table className="min-w-[620px]"><TableHeader><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">المدة</TableHead><TableHead className="text-right">الملاحظة</TableHead>{manager ? <TableHead /> : null}</TableRow></TableHeader><TableBody>{absences.map(item => <TableRow key={item.id}><TableCell>{formatDate(item.date)}</TableCell><TableCell>{item.dayPortion === "half_day" ? "نصف يوم" : "يوم كامل"}</TableCell><TableCell>{item.reason || "—"}</TableCell>{manager ? <TableCell><Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => void deleteOverride(item)}><Trash2 className="h-4 w-4" /></Button></TableCell> : null}</TableRow>)}</TableBody></Table></div> : <p className="mt-4 text-sm text-slate-500">لا توجد غيابات مسجلة لهذا الموظف حتى الآن.</p>}
              </section>
            </TabsContent>

            <TabsContent value="leaves">
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 className="font-black">الإجازات المسجلة</h3>
                {leaves.length ? <div className="mt-4 overflow-x-auto"><Table className="min-w-[620px]"><TableHeader><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">المدة</TableHead><TableHead className="text-right">الملاحظة</TableHead>{manager ? <TableHead /> : null}</TableRow></TableHeader><TableBody>{leaves.map(item => <TableRow key={item.id}><TableCell>{formatDate(item.date)}</TableCell><TableCell>{item.dayPortion === "half_day" ? "نصف يوم" : "يوم كامل"}</TableCell><TableCell>{item.reason || "إجازة مفاجئة معتمدة"}</TableCell>{manager ? <TableCell><Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => void deleteOverride(item)}><Trash2 className="h-4 w-4" /></Button></TableCell> : null}</TableRow>)}</TableBody></Table></div> : <p className="mt-4 text-sm text-slate-500">لا توجد إجازات مسجلة لهذا الشهر.</p>}
              </section>
            </TabsContent>
          </Tabs>

          <p className="px-1 text-sm text-slate-500">{monthLabel(month)} · أيام بها حضور: {attendanceCount}</p>
        </>
      )}

      <CorrectionDialog record={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      {effectiveAccess ? <ManualRecordDialog access={effectiveAccess} day={manualDay} onClose={() => setManualDay(null)} onSaved={refresh} /> : null}
      {effectiveAccess ? <OverrideDialog access={effectiveAccess} day={overrideDay} type={overrideType} onClose={() => setOverrideDay(null)} onSaved={refresh} /> : null}
    </div>
  );
}

function SummaryCards({ summary, generatedAt }: { summary: MonthlySummary; generatedAt: string }) {
  const cards: Array<[string, ReactNode]> = [
    ["أيام الدوام", summary.scheduledDays], ["الحضور", summary.attendedDays], ["الغياب", summary.absentDays], ["الإجازة", summary.emergencyLeaveDays],
    ["التأخير", summary.lateDays], ["الخروج المبكر", summary.earlyLeaveDays], ["ناقص انصراف", summary.incompleteDays], ["ساعات العمل", formatMinutes(summary.workedMinutes)],
  ];
  return <><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{cards.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div><p className="mt-3 text-xs text-slate-400">آخر توليد: {new Intl.DateTimeFormat("en-GB", { timeZone: RIYADH_TIME_ZONE, dateStyle: "medium", timeStyle: "short" }).format(new Date(generatedAt))}</p></>;
}

function EmployeesPage({ onOpenEmployee }: { onOpenEmployee: (account: HabatAccessAccount) => void }) {
  const [accounts, setAccounts] = useState<HabatAccessAccount[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const payload = await habatApi<{ ok: true; accounts: HabatAccessAccount[] }>("access");
      setAccounts(payload.accounts || []);
    } catch (caught) { setError(extendedError(caught)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  return <div className="space-y-5"><section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">الموظفون</h2><p className="mt-1 text-sm text-slate-500">افتح ملف أي موظف لمراجعة الشهر وتعديل أو إضافة أو مسح البصمات وتسجيل الغياب والإجازات.</p></div><Button variant="outline" className="rounded-xl" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /> تحديث</Button></div>{error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}</section><section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white"><div className="overflow-x-auto"><Table className="min-w-[720px]"><TableHeader className="bg-slate-50"><TableRow><TableHead className="text-right">الموظف</TableHead><TableHead className="text-right">الصلاحية</TableHead><TableHead className="text-right">البصمة</TableHead><TableHead className="text-right">الملف</TableHead></TableRow></TableHeader><TableBody>{accounts.filter(account => account.isActive).map(account => <TableRow key={account.id}><TableCell><p className="font-black">{account.displayName || account.email}</p><p className="mt-1 text-xs text-slate-500">{account.email}</p></TableCell><TableCell>{account.accessLevel === "manager" ? "إدارة" : "موظف"}</TableCell><TableCell>{account.clockEnabled ? "مفعلة" : "غير مفعلة"}</TableCell><TableCell><Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenEmployee(account)}><UserRound className="h-4 w-4" /> فتح الملف</Button></TableCell></TableRow>)}</TableBody></Table></div></section></div>;
}

function ManagerRecordsPage() {
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
    if (!window.confirm(`مسح بصمة ${record.displayName || record.accountEmail} بتاريخ ${formatDate(record.attendanceDate)}؟`)) return;
    try { await habatApi(`v3/records/${encodeURIComponent(record.id)}`, { method: "DELETE" }); await refresh(); }
    catch (caught) { setError(extendedError(caught)); }
  }

  return <div className="space-y-5"><section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-3"><div className="space-y-2"><Label>الشهر</Label><Input lang="en" dir="ltr" type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-11 rounded-2xl" /></div><div className="space-y-2"><Label>الموظف</Label><Select value={employeeEmail} onValueChange={setEmployeeEmail}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">جميع الموظفين</SelectItem>{accounts.filter(account => account.isActive).map(account => <SelectItem key={account.id} value={account.email}>{account.displayName || account.email}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>الحالة</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem><SelectItem value="present">حاضر</SelectItem><SelectItem value="late">متأخر</SelectItem><SelectItem value="early_leave">انصراف مبكر</SelectItem><SelectItem value="late_early_leave">متأخر + انصراف مبكر</SelectItem></SelectContent></Select></div></div>{error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}</section><RecordsTable records={records} onEdit={setEditing} onDelete={record => void remove(record)} /><CorrectionDialog record={editing} onClose={() => setEditing(null)} onSaved={refresh} /></div>;
}

function RecordsTable({ records, onEdit, onDelete }: { records: HabatRecord[]; onEdit?: (record: HabatRecord) => void; onDelete?: (record: HabatRecord) => void }) {
  return <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white"><div className="overflow-x-auto"><Table className="min-w-[980px]"><TableHeader className="bg-slate-50"><TableRow><TableHead className="text-right">الموظف</TableHead><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">الحضور</TableHead><TableHead className="text-right">الانصراف</TableHead><TableHead className="text-right">التأخير</TableHead><TableHead className="text-right">الخروج المبكر</TableHead><TableHead className="text-right">العمل</TableHead>{onEdit || onDelete ? <TableHead className="text-right">الإجراءات</TableHead> : null}</TableRow></TableHeader><TableBody>{records.map(record => <TableRow key={record.id}><TableCell><p className="font-black">{record.displayName || record.accountEmail}</p><p className="mt-1 text-xs text-slate-500">{record.accountEmail}</p></TableCell><TableCell>{formatDate(record.attendanceDate)}</TableCell><TableCell><Badge variant="outline" className="rounded-full">{statusLabel(record.attendanceStatus)}</Badge></TableCell><TableCell>{formatTime(record.checkInAt)}</TableCell><TableCell>{formatTime(record.checkOutAt)}</TableCell><TableCell>{formatMinutes(record.lateMinutes)}</TableCell><TableCell>{formatMinutes(record.earlyLeaveMinutes)}</TableCell><TableCell>{formatMinutes(record.workedMinutes)}</TableCell>{onEdit || onDelete ? <TableCell><div className="flex gap-1">{onEdit ? <Button type="button" variant="outline" size="icon" className="rounded-xl" onClick={() => onEdit(record)}><Edit3 className="h-4 w-4" /></Button> : null}{onDelete ? <Button type="button" variant="outline" size="icon" className="rounded-xl border-red-200 text-red-600" onClick={() => onDelete(record)}><Trash2 className="h-4 w-4" /></Button> : null}</div></TableCell> : null}</TableRow>)}</TableBody></Table></div>{!records.length ? <p className="py-10 text-center text-sm text-slate-500">لا توجد سجلات لهذا الاختيار.</p> : null}</section>;
}

function ReportsPage() {
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
  return <div className="space-y-5"><section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><div className="w-full max-w-xs space-y-2"><Label>الشهر</Label><Input lang="en" dir="ltr" type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-11 rounded-2xl" /></div>{error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}</section>{totals ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{[["أيام الدوام", totals.scheduledDays], ["حضور", totals.attendedDays], ["غياب", totals.absentDays], ["تأخير", totals.lateDays], ["خروج مبكر", totals.earlyLeaveDays], ["ناقص انصراف", totals.incompleteDays], ["ساعات العمل", formatMinutes(totals.workedMinutes)]].map(([label, value]) => <Metric key={String(label)} label={String(label)} value={value} />)}</div> : null}<section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white"><div className="overflow-x-auto"><Table className="min-w-[850px]"><TableHeader><TableRow><TableHead className="text-right">الموظف</TableHead><TableHead className="text-right">أيام الدوام</TableHead><TableHead className="text-right">حضور</TableHead><TableHead className="text-right">غياب</TableHead><TableHead className="text-right">تأخير</TableHead><TableHead className="text-right">خروج مبكر</TableHead><TableHead className="text-right">العمل</TableHead></TableRow></TableHeader><TableBody>{report?.employees.map(employee => <TableRow key={employee.accessId}><TableCell>{employee.displayName}</TableCell><TableCell>{employee.scheduledDays}</TableCell><TableCell>{employee.attendedDays}</TableCell><TableCell>{employee.absentDays}</TableCell><TableCell>{employee.lateDays}</TableCell><TableCell>{employee.earlyLeaveDays}</TableCell><TableCell>{formatMinutes(employee.workedMinutes)}</TableCell></TableRow>)}</TableBody></Table></div></section></div>;
}

type NavItem = { key: PageKey; label: string; icon: typeof Clock3 };

function SidebarNav({ items, page, onChange }: { items: NavItem[]; page: PageKey; onChange: (page: PageKey) => void }) {
  return <nav className="flex flex-col gap-2">{items.map(item => { const Icon = item.icon; const active = page === item.key || (page === "employee-file" && item.key === "employees"); return <button key={item.key} type="button" onClick={() => onChange(item.key)} className={cn("flex items-center gap-3 rounded-2xl px-4 py-3 text-right text-sm font-bold transition", active ? "bg-black text-white" : "text-slate-600 hover:bg-slate-100")}><Icon className="h-5 w-5 shrink-0" /><span>{item.label}</span></button>; })}</nav>;
}

function AttendanceShell({ context, onContextRefresh }: { context: HabatContext; onContextRefresh: () => Promise<void> }) {
  const [page, setPage] = useState<PageKey>("clock");
  const [selectedEmployee, setSelectedEmployee] = useState<HabatAccessAccount | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const managerItems: NavItem[] = [
    { key: "clock", label: "الحضور والانصراف", icon: Fingerprint },
    { key: "dashboard", label: "الرئيسية", icon: ShieldCheck },
    { key: "employees", label: "الموظفون", icon: Users },
    { key: "accounts", label: "إدارة الحسابات", icon: UserCog },
    { key: "shifts", label: "الدوام والشفتات", icon: CalendarClock },
    { key: "records", label: "سجل الحضور", icon: CalendarCheck2 },
    { key: "reports", label: "التقارير", icon: BarChart3 },
    { key: "audit", label: "سجل التدقيق", icon: FileClock },
    { key: "settings", label: "الإعدادات", icon: Settings2 },
  ];
  const employeeItems: NavItem[] = [
    { key: "clock", label: "الحضور والانصراف", icon: Fingerprint },
    { key: "history", label: "سجلي", icon: CalendarCheck2 },
    { key: "profile", label: "صفحتي", icon: UserRound },
  ];
  const items = context.principal.canManage ? managerItems : employeeItems;

  function navigate(next: PageKey) {
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
      case "employee-file": return selectedEmployee ? <AttendanceMonthWorkspace access={selectedEmployee} manager onBack={() => setPage("employees")} /> : <EmployeesPage onOpenEmployee={account => { setSelectedEmployee(account); setPage("employee-file"); }} />;
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
    <main dir="rtl" className="habat-attendance-shell min-h-screen bg-[#f5f5f3] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild><Button type="button" variant="outline" size="icon" className="rounded-xl lg:hidden"><Menu className="h-5 w-5" /></Button></SheetTrigger>
              <SheetContent side="right" dir="rtl" className="w-[86vw] max-w-[330px] p-0">
                <SheetHeader className="border-b border-slate-100 p-5"><SheetTitle className="text-right"><Brand compact /></SheetTitle></SheetHeader>
                <div className="flex-1 overflow-y-auto p-3"><SidebarNav items={items} page={page} onChange={navigate} /></div>
                <div className="border-t border-slate-100 p-4"><Button type="button" variant="outline" className="w-full rounded-xl" onClick={() => signOut(auth)}>تسجيل الخروج</Button></div>
              </SheetContent>
            </Sheet>
            <Brand compact />
          </div>
          <div className="flex items-center gap-2"><div className="hidden text-left sm:block"><p className="text-sm font-black">{context.principal.displayName || context.principal.email}</p><p className="text-xs text-slate-500">{context.principal.canManage ? "إدارة" : "موظف"}</p></div><Button type="button" variant="outline" className="hidden rounded-xl lg:inline-flex" onClick={() => signOut(auth)}>خروج</Button></div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-3 py-4 sm:px-4 sm:py-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden h-fit rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-24 lg:block"><SidebarNav items={items} page={page} onChange={navigate} /></aside>
        <div className="min-w-0">{content}</div>
      </div>
    </main>
  );
}

async function loadContext(): Promise<AccessState> {
  try { return { status: "ready", context: await habatApi<HabatContext>("v2/context") }; }
  catch (error) { return { status: "forbidden", message: extendedError(error) }; }
}

export default function HabatAttendanceAppV4() {
  useWesternDigitsBoundary();
  const [access, setAccess] = useState<AccessState>({ status: "loading" });

  useEffect(() => onAuthStateChanged(auth, async user => {
    if (!user) { setAccess({ status: "signed-out" }); return; }
    setAccess({ status: "loading" });
    setAccess(await loadContext());
  }), []);

  const refreshContext = useCallback(async () => { setAccess(await loadContext()); }, []);

  if (access.status === "loading") return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-4 font-bold text-slate-600"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin" />جاري تحميل نظام الحضور...</div></main>;
  if (access.status === "signed-out") return <LoginScreen />;
  if (access.status === "forbidden") return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-4"><section className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-sm"><ShieldCheck className="mx-auto mb-4 text-slate-400" size={34} /><h2 className="text-xl font-black">غير مصرح بالدخول</h2><p className="mt-2 text-sm text-slate-500">{access.message}</p><Button type="button" className="mt-5 rounded-xl bg-black" onClick={() => signOut(auth)}>تسجيل الخروج</Button></section></main>;
  return <AttendanceShell context={access.context} onContextRefresh={refreshContext} />;
}
