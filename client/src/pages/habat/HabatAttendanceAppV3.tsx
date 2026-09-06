import {
  BarChart3,
  CalendarCheck2,
  CalendarClock,
  Clock3,
  Edit3,
  FileClock,
  Fingerprint,
  LogIn,
  LogOut,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCog,
  UserRound,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  type HabatAssignment,
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

const RIYADH_TIME_ZONE = "Asia/Riyadh";
const DEFAULT_SHIFT_ID = "habat_shift_default";
const arabicWeekdays = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
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

    const normalizeTextNode = (node: Node) => {
      if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue) return;
      const next = westernDigits(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    };

    const normalizeTree = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        normalizeTextNode(node);
        return;
      }
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        normalizeTextNode(current);
        current = walker.nextNode();
      }
    };

    normalizeTree(root);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(normalizeTree);
        if (mutation.type === "characterData") normalizeTextNode(mutation.target);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });

    const normalizeInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
      const next = westernDigits(target.value);
      if (next !== target.value) target.value = next;
    };
    root.addEventListener("input", normalizeInput, true);

    return () => {
      observer.disconnect();
      root.removeEventListener("input", normalizeInput, true);
    };
  }, []);
}

function formatTime(value?: string | null) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
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
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatMinutes(value?: number | null) {
  if (value == null) return "—";
  const total = Math.max(0, Number(value));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} د`;
  if (!minutes) return `${hours} س`;
  return `${hours} س ${minutes} د`;
}

function monthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    from: `${match[1]}-${match[2]}-01`,
    to: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`,
  };
}

function enumerateMonth(month: string) {
  const range = monthRange(month);
  if (!range) return [] as string[];
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = Number(range.to.slice(-2));
  return Array.from({ length: lastDay }, (_, index) =>
    `${year}-${String(monthNumber).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`
  );
}

function weekdayIndex(dateKey: string) {
  return new Date(`${dateKey}T12:00:00+03:00`).getDay();
}

function resolveAssignedShift(
  accessId: string,
  dateKey: string,
  assignments: HabatAssignment[],
  shifts: HabatShift[]
) {
  const assignment = assignments
    .filter(item => item.accessId === accessId)
    .filter(item => item.effectiveFrom <= dateKey && (!item.effectiveTo || item.effectiveTo >= dateKey))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];
  const shiftId = assignment?.shiftId || DEFAULT_SHIFT_ID;
  return shifts.find(shift => shift.id === shiftId) || shifts.find(shift => shift.id === DEFAULT_SHIFT_ID) || null;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "flex items-center gap-3" : "text-center"}>
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden bg-black",
          compact
            ? "h-11 w-11 rounded-2xl"
            : "mx-auto h-28 w-28 rounded-[28px] shadow-sm"
        )}
      >
        <img src="/habat-alwaraq-logo.svg" alt="حبات الورق" className="h-full w-full object-contain" />
      </div>
      <div className={compact ? "text-right" : "mt-4"}>
        <h1 className={compact ? "text-lg font-black" : "text-3xl font-black tracking-tight"}>حبات الورق</h1>
        <p className="mt-1 text-xs font-semibold tracking-[0.12em] text-slate-500">نظام الحضور والانصراف</p>
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
          <div className="mb-5">
            <h2 className="text-xl font-black">تسجيل الدخول</h2>
            <p className="mt-1 text-sm text-slate-500">الدخول للحسابات المصرح لها فقط</p>
          </div>
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
            <Button type="submit" disabled={busy || !identity.trim() || !password} className="h-12 w-full rounded-2xl bg-black font-bold text-white">
              <LogIn className="h-4 w-4" /> {busy ? "جاري الدخول..." : "دخول"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

function LiveRiyadhClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div dir="ltr" className="text-sm font-semibold text-slate-500">
      {new Intl.DateTimeFormat("en-US", {
        timeZone: RIYADH_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(now)}
    </div>
  );
}

function ClockPage({ context, onRefresh }: { context: HabatContext; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const record = context.today;
  const hasCheckIn = Boolean(record?.checkInAt);
  const hasCheckOut = Boolean(record?.checkOutAt);
  const nextType: "check-in" | "check-out" | null = hasCheckOut ? null : hasCheckIn ? "check-out" : "check-in";
  const nextLabel = nextType === "check-out" ? "تسجيل انصراف" : nextType === "check-in" ? "تسجيل حضور" : "تم اكتمال الدوام";

  async function clock() {
    if (!nextType || busy || !context.principal.canClock) return;
    if (nextType === "check-out" && !window.confirm("تأكيد تسجيل الانصراف؟")) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      let location: { latitude?: number; longitude?: number; accuracyM?: number } = {};
      try {
        location = await readBrowserLocation(context.settings.locationRequired);
      } catch {
        setError("تعذر الحصول على موقعك. فعّل إذن الموقع وGPS ثم حاول مرة أخرى.");
        return;
      }
      await habatApi(`v2/${nextType}`, {
        method: "POST",
        body: JSON.stringify(location),
      });
      await onRefresh();
      setMessage(nextType === "check-in" ? "تم تسجيل الحضور بنجاح." : "تم تسجيل الانصراف بنجاح.");
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
      <div className="space-y-3 border-b border-slate-100 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
            <Clock3 className="h-4 w-4" /> الحضور والانصراف
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none">
              {context.settings.locationRequired ? `GPS · ${context.settings.radiusM} m` : "GPS غير إلزامي"}
            </Badge>
            <LiveRiyadhClock />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-950">تسجيل الدوام</h2>
          <p className="mt-1 text-sm text-slate-500">{context.principal.displayName || context.principal.email}</p>
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 px-3 py-4 sm:px-5">
          <div className="min-w-0 text-center">
            <div className="text-sm font-semibold text-slate-500">الحضور</div>
            <div dir="ltr" className="mt-2 text-xl font-bold text-emerald-600">{formatTime(record?.checkInAt)}</div>
            <div className={cn("mx-auto mt-3 inline-flex min-h-9 items-center justify-center rounded-xl px-3 text-sm font-semibold", hasCheckIn ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-400")}>{hasCheckIn ? "تم الحضور" : "لم يتم الحضور"}</div>
          </div>

          <div className="flex min-w-[104px] flex-col items-center">
            <button
              type="button"
              onClick={() => void clock()}
              disabled={busy || !nextType || !context.principal.canClock}
              className={cn(
                "flex h-24 w-24 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.55)] transition disabled:cursor-not-allowed disabled:opacity-45",
                nextType === "check-out" ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : nextType ? "hover:border-emerald-200 hover:text-emerald-700" : "text-emerald-700"
              )}
              aria-label={nextLabel}
            >
              {busy ? <RefreshCw className="h-10 w-10 animate-spin" /> : <Fingerprint className="h-11 w-11 stroke-[1.9]" />}
            </button>
            <div className={cn("mt-3 text-center text-sm font-semibold", nextType === "check-out" ? "text-rose-700" : "text-slate-600")}>{busy ? "جاري التسجيل..." : nextLabel}</div>
          </div>

          <div className="min-w-0 text-center">
            <div className="text-sm font-semibold text-slate-500">الانصراف</div>
            <div dir="ltr" className="mt-2 text-xl font-bold text-slate-950">{formatTime(record?.checkOutAt)}</div>
            <div className={cn("mx-auto mt-3 inline-flex min-h-9 items-center justify-center rounded-xl px-3 text-sm font-semibold", hasCheckOut ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-400")}>{hasCheckOut ? "تم الانصراف" : "لم يتم الانصراف"}</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">الشفت</p>
            <p className="mt-1 font-bold">{context.shift?.name || "غير محدد"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">وقت الدوام</p>
            <p dir="ltr" className="mt-1 text-right font-bold">{context.shift ? `${context.shift.startTime} - ${context.shift.endTime}` : "—"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">الحالة</p>
            <p className="mt-1 font-bold">{statusLabel(record?.attendanceStatus)}</p>
          </div>
        </div>

        {record ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-500">التأخير: </span><strong>{record.lateMinutes || 0} د</strong></div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-500">الخروج المبكر: </span><strong>{record.earlyLeaveMinutes || 0} د</strong></div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-500">ساعات العمل: </span><strong>{formatMinutes(record.workedMinutes)}</strong></div>
          </div>
        ) : null}

        {!context.principal.canClock ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">هذا حساب إدارة فقط. يمكن تفعيل البصمة له من صفحة الموظفين.</p> : null}
        {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</p> : null}
        {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}

function FilterCard({ children }: { children: ReactNode }) {
  return <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">{children}</section>;
}

function RecordsTable({ records, onEdit }: { records: HabatRecord[]; onEdit?: (record: HabatRecord) => void }) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <Table className="min-w-[980px]">
          <TableHeader className="bg-slate-50/80">
            <TableRow>
              <TableHead className="text-right">الموظف</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">الحضور</TableHead>
              <TableHead className="text-right">الانصراف</TableHead>
              <TableHead className="text-right">التأخير</TableHead>
              <TableHead className="text-right">الخروج المبكر</TableHead>
              <TableHead className="text-right">العمل</TableHead>
              {onEdit ? <TableHead className="text-right">التعديل</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map(record => (
              <TableRow key={record.id}>
                <TableCell>
                  <div className="font-semibold text-slate-950">{record.displayName || record.accountEmail || "—"}</div>
                  <div className="mt-1 text-xs text-slate-500">{record.accountEmail}</div>
                </TableCell>
                <TableCell dir="ltr" className="text-right">{formatDate(record.attendanceDate)}</TableCell>
                <TableCell><StatusBadge value={statusLabel(record.attendanceStatus)} status={record.attendanceStatus} /></TableCell>
                <TableCell dir="ltr" className="text-right font-semibold">{formatTime(record.checkInAt)}</TableCell>
                <TableCell dir="ltr" className="text-right font-semibold">{formatTime(record.checkOutAt)}</TableCell>
                <TableCell>{record.lateMinutes ? `${record.lateMinutes} د` : "—"}</TableCell>
                <TableCell>{record.earlyLeaveMinutes ? `${record.earlyLeaveMinutes} د` : "—"}</TableCell>
                <TableCell>{formatMinutes(record.workedMinutes)}</TableCell>
                {onEdit ? <TableCell><Button type="button" variant="outline" size="icon" className="rounded-xl" onClick={() => onEdit(record)} title="تصحيح"><Edit3 className="h-4 w-4" /></Button></TableCell> : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!records.length ? <p className="py-10 text-center text-sm text-slate-500">لا توجد سجلات ضمن الفترة.</p> : null}
    </div>
  );
}

function StatusBadge({ value, status }: { value: string; status?: string | null }) {
  const tone = status?.includes("late")
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : status?.includes("early")
      ? "border-orange-200 bg-orange-50 text-orange-700"
      : status === "present"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  return <Badge variant="outline" className={cn("rounded-full shadow-none", tone)}>{value}</Badge>;
}

function CorrectionDialog({ record, open, onOpenChange, onSaved }: { record: HabatRecord | null; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => Promise<void> }) {
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!record || !open) return;
    setCheckInAt(toDateTimeLocal(record.checkInAt));
    setCheckOutAt(toDateTimeLocal(record.checkOutAt));
    setReason("");
    setError("");
  }, [open, record]);

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
      onOpenChange(false);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="rounded-[28px] sm:max-w-lg">
        <DialogHeader className="text-right">
          <DialogTitle>تصحيح سجل الحضور</DialogTitle>
          <DialogDescription>{record ? `${record.displayName || record.accountEmail} · ${formatDate(record.attendanceDate)}` : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>وقت الحضور</Label>
            <Input lang="en" dir="ltr" type="datetime-local" value={checkInAt} onChange={event => setCheckInAt(event.target.value)} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70" required />
          </div>
          <div className="space-y-2">
            <Label>وقت الانصراف</Label>
            <Input lang="en" dir="ltr" type="datetime-local" value={checkOutAt} onChange={event => setCheckOutAt(event.target.value)} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70" />
          </div>
          <div className="space-y-2">
            <Label>سبب التصحيح</Label>
            <Textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="سبب واضح للتعديل" className="min-h-24 rounded-2xl" required />
          </div>
          {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="submit" disabled={saving || reason.trim().length < 3} className="rounded-xl bg-black">{saving ? "جاري الحفظ..." : "حفظ التصحيح"}</Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>إلغاء</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MyHistoryPage() {
  const today = todayRiyadhKey();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [records, setRecords] = useState<HabatRecord[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const payload = await habatApi<{ ok: true; records: HabatRecord[] }>(`v2/my-history?from=${from}&to=${to}`);
      setRecords(payload.records || []);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }, [from, to]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="space-y-5">
      <FilterCard>
        <div className="mb-4 flex items-start gap-3 border-b border-slate-100 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white"><CalendarCheck2 className="h-5 w-5" /></span>
          <div><h2 className="text-sm font-semibold">سجلي</h2><p className="mt-1 text-xs text-slate-500">سجل حضورك وانصرافك</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
          <div className="space-y-2"><Label className="text-xs text-slate-600">من تاريخ</Label><Input lang="en" dir="ltr" type="date" value={from} onChange={event => setFrom(event.target.value)} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70" /></div>
          <div className="space-y-2"><Label className="text-xs text-slate-600">إلى تاريخ</Label><Input lang="en" dir="ltr" type="date" value={to} onChange={event => setTo(event.target.value)} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70" /></div>
        </div>
        {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      </FilterCard>
      <RecordsTable records={records} />
    </div>
  );
}

function ManagerRecordsPage() {
  const today = todayRiyadhKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const initialRange = monthRange(month)!;
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to > today ? today : initialRange.to);
  const [employeeEmail, setEmployeeEmail] = useState("all");
  const [status, setStatus] = useState("all");
  const [accounts, setAccounts] = useState<HabatAccessAccount[]>([]);
  const [records, setRecords] = useState<HabatRecord[]>([]);
  const [editing, setEditing] = useState<HabatRecord | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ from, to, limit: "500" });
      if (employeeEmail !== "all") params.set("email", employeeEmail);
      if (status !== "all") params.set("status", status);
      const [recordPayload, accountPayload] = await Promise.all([
        habatApi<{ ok: true; records: HabatRecord[] }>(`v2/records?${params.toString()}`),
        habatApi<{ ok: true; accounts: HabatAccessAccount[] }>("access"),
      ]);
      setRecords(recordPayload.records || []);
      setAccounts((accountPayload.accounts || []).filter(account => account.isActive && account.clockEnabled));
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }, [employeeEmail, from, status, to]);

  useEffect(() => { void refresh(); }, [refresh]);

  function changeMonth(next: string) {
    setMonth(next);
    const range = monthRange(next);
    if (!range) return;
    setFrom(range.from);
    setTo(range.to > today ? today : range.to);
  }

  return (
    <div className="space-y-5">
      <FilterCard>
        <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white"><CalendarCheck2 className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold">سجل الحضور</h2><p className="mt-1 text-xs text-slate-500">فلترة السجلات والتعديل الإداري</p></div></div>
          <Button variant="outline" className="h-11 rounded-2xl" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /> تحديث</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2"><Label className="text-xs text-slate-600">الشهر</Label><Input lang="en" dir="ltr" type="month" value={month} onChange={event => changeMonth(event.target.value)} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70" /></div>
          <div className="space-y-2"><Label className="text-xs text-slate-600">من تاريخ</Label><Input lang="en" dir="ltr" type="date" value={from} onChange={event => { setMonth(""); setFrom(event.target.value); }} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70" /></div>
          <div className="space-y-2"><Label className="text-xs text-slate-600">إلى تاريخ</Label><Input lang="en" dir="ltr" type="date" value={to} onChange={event => { setMonth(""); setTo(event.target.value); }} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70" /></div>
          <div className="space-y-2"><Label className="text-xs text-slate-600">الموظف</Label><Select value={employeeEmail} onValueChange={setEmployeeEmail}><SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-slate-50/70"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">جميع الموظفين</SelectItem>{accounts.map(account => <SelectItem key={account.id} value={account.email}>{account.displayName || account.email}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label className="text-xs text-slate-600">الحالة</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-slate-50/70"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الحالات</SelectItem><SelectItem value="present">حاضر</SelectItem><SelectItem value="late">متأخر</SelectItem><SelectItem value="early_leave">انصراف مبكر</SelectItem><SelectItem value="late_early_leave">متأخر + انصراف مبكر</SelectItem></SelectContent></Select></div>
        </div>
        {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      </FilterCard>
      <div className="flex items-center justify-between px-1"><h3 className="font-semibold">السجلات</h3><span className="text-sm text-slate-500">{records.length} سجل</span></div>
      <RecordsTable records={records} onEdit={setEditing} />
      <CorrectionDialog record={editing} open={Boolean(editing)} onOpenChange={open => !open && setEditing(null)} onSaved={refresh} />
    </div>
  );
}

function EmployeesWorkspace({ onOpenEmployee, onDataChanged }: { onOpenEmployee: (account: HabatAccessAccount) => void; onDataChanged: () => Promise<void> }) {
  const [accounts, setAccounts] = useState<HabatAccessAccount[]>([]);
  const [shifts, setShifts] = useState<HabatShift[]>([]);
  const [assignments, setAssignments] = useState<HabatAssignment[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accessLevel, setAccessLevel] = useState<"employee" | "manager">("employee");
  const [clockEnabled, setClockEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [accountPayload, shiftPayload, assignmentPayload] = await Promise.all([
        habatApi<{ ok: true; accounts: HabatAccessAccount[] }>("access"),
        habatApi<{ ok: true; shifts: HabatShift[] }>("v2/shifts"),
        habatApi<{ ok: true; assignments: HabatAssignment[] }>("v2/assignments"),
      ]);
      setAccounts(accountPayload.accounts || []);
      setShifts(shiftPayload.shifts || []);
      setAssignments(assignmentPayload.assignments || []);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const latestAssignment = useMemo(() => {
    const map = new Map<string, HabatAssignment>();
    [...assignments].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).forEach(item => { if (!map.has(item.accessId)) map.set(item.accessId, item); });
    return map;
  }, [assignments]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await habatApi("access", { method: "POST", body: JSON.stringify({ email: email.trim(), displayName: displayName.trim() || null, accessLevel, clockEnabled }) });
      setEmail(""); setDisplayName(""); setAccessLevel("employee"); setClockEnabled(true);
      await refresh(); await onDataChanged();
    } catch (caught) { setError(friendlyHabatError(caught)); } finally { setSaving(false); }
  }

  async function patch(account: HabatAccessAccount, values: Partial<Pick<HabatAccessAccount, "accessLevel" | "clockEnabled" | "isActive">>) {
    try {
      await habatApi(`access/${encodeURIComponent(account.id)}`, { method: "PATCH", body: JSON.stringify(values) });
      await refresh(); await onDataChanged();
    } catch (caught) { setError(friendlyHabatError(caught)); }
  }

  async function assignShift(accessId: string, shiftId: string) {
    try {
      await habatApi("v2/assignments", { method: "POST", body: JSON.stringify({ accessId, shiftId, effectiveFrom: todayRiyadhKey() }) });
      await refresh(); await onDataChanged();
    } catch (caught) { setError(friendlyHabatError(caught)); }
  }

  async function remove(account: HabatAccessAccount) {
    if (!window.confirm(`إلغاء صلاحية ${account.displayName || account.email}؟`)) return;
    try {
      await habatApi(`access/${encodeURIComponent(account.id)}`, { method: "DELETE" });
      await refresh(); await onDataChanged();
    } catch (caught) { setError(friendlyHabatError(caught)); }
  }

  return (
    <div className="space-y-5">
      <FilterCard>
        <div className="mb-4 flex items-start gap-3 border-b border-slate-100 pb-4"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white"><Users className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold">الموظفون</h2><p className="mt-1 text-xs text-slate-500">الحسابات، صلاحية البصمة، الشفت وملف الحضور</p></div></div>
        <form onSubmit={add} className="grid gap-3 lg:grid-cols-12">
          <Input type="email" placeholder="البريد الإلكتروني" value={email} onChange={event => setEmail(event.target.value)} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70 lg:col-span-4" required />
          <Input placeholder="الاسم" value={displayName} onChange={event => setDisplayName(event.target.value)} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70 lg:col-span-3" />
          <div className="lg:col-span-2"><Select value={accessLevel} onValueChange={value => setAccessLevel(value as "employee" | "manager")}><SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 bg-slate-50/70"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="employee">موظف</SelectItem><SelectItem value="manager">إدارة</SelectItem></SelectContent></Select></div>
          <label className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold lg:col-span-2"><input type="checkbox" checked={clockEnabled} onChange={event => setClockEnabled(event.target.checked)} /> بصمة</label>
          <Button disabled={saving} className="h-11 rounded-2xl bg-black lg:col-span-1">إضافة</Button>
        </form>
        {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      </FilterCard>

      <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <Table className="min-w-[960px]">
            <TableHeader className="bg-slate-50/80"><TableRow><TableHead className="text-right">الموظف</TableHead><TableHead className="text-right">الصلاحية</TableHead><TableHead className="text-right">البصمة</TableHead><TableHead className="text-right">الشفت</TableHead><TableHead className="text-right">ملف الحضور</TableHead><TableHead className="text-right">إلغاء</TableHead></TableRow></TableHeader>
            <TableBody>
              {accounts.map(account => {
                const assignment = latestAssignment.get(account.id);
                return (
                  <TableRow key={account.id}>
                    <TableCell><div className="font-semibold">{account.displayName || account.email}</div><div className="mt-1 text-xs text-slate-500">{account.email}</div></TableCell>
                    <TableCell><Select value={account.accessLevel} onValueChange={value => void patch(account, { accessLevel: value as "employee" | "manager" })}><SelectTrigger className="h-10 w-[130px] rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="employee">موظف</SelectItem><SelectItem value="manager">إدارة</SelectItem></SelectContent></Select></TableCell>
                    <TableCell><label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={account.clockEnabled} onChange={event => void patch(account, { clockEnabled: event.target.checked })} /> مفعلة</label></TableCell>
                    <TableCell><Select value={assignment?.shiftId || DEFAULT_SHIFT_ID} onValueChange={value => void assignShift(account.id, value)}><SelectTrigger className="h-10 min-w-[210px] rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{shifts.filter(shift => shift.isActive).map(shift => <SelectItem key={shift.id} value={shift.id}>{shift.name} · {shift.startTime}-{shift.endTime}</SelectItem>)}</SelectContent></Select></TableCell>
                    <TableCell><Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenEmployee(account)}><UserRound className="h-4 w-4" /> فتح الملف</Button></TableCell>
                    <TableCell><Button type="button" variant="ghost" size="icon" className="rounded-xl text-red-600" onClick={() => void remove(account)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

type EmployeeDayRow = {
  date: string;
  weekday: string;
  shift: HabatShift | null;
  record: HabatRecord | null;
  state: "record" | "absent" | "off" | "pending" | "future";
};

function EmployeeFilePage({ account, onBack }: { account: HabatAccessAccount; onBack: () => void }) {
  const today = todayRiyadhKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [records, setRecords] = useState<HabatRecord[]>([]);
  const [shifts, setShifts] = useState<HabatShift[]>([]);
  const [assignments, setAssignments] = useState<HabatAssignment[]>([]);
  const [editing, setEditing] = useState<HabatRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const range = monthRange(month);
    if (!range) return;
    setLoading(true); setError("");
    try {
      const [recordPayload, shiftPayload, assignmentPayload] = await Promise.all([
        habatApi<{ ok: true; records: HabatRecord[] }>(`v2/records?from=${range.from}&to=${range.to}&email=${encodeURIComponent(account.email)}&limit=500`),
        habatApi<{ ok: true; shifts: HabatShift[] }>("v2/shifts"),
        habatApi<{ ok: true; assignments: HabatAssignment[] }>(`v2/assignments?accessId=${encodeURIComponent(account.id)}`),
      ]);
      setRecords(recordPayload.records || []); setShifts(shiftPayload.shifts || []); setAssignments(assignmentPayload.assignments || []);
    } catch (caught) { setError(friendlyHabatError(caught)); } finally { setLoading(false); }
  }, [account.email, account.id, month]);

  useEffect(() => { void refresh(); }, [refresh]);

  const days = useMemo<EmployeeDayRow[]>(() => {
    const byDate = new Map(records.map(record => [record.attendanceDate, record]));
    return enumerateMonth(month).map(date => {
      const shift = resolveAssignedShift(account.id, date, assignments, shifts);
      const record = byDate.get(date) || null;
      const workingDay = shift ? shift.workingDays.includes(weekdayIndex(date)) : true;
      let state: EmployeeDayRow["state"] = record ? "record" : "pending";
      if (!record) {
        if (!workingDay) state = "off";
        else if (date < today) state = "absent";
        else if (date > today) state = "future";
      }
      return { date, weekday: arabicWeekdays[weekdayIndex(date)], shift, record, state };
    });
  }, [account.id, assignments, month, records, shifts, today]);

  const summary = useMemo(() => {
    const elapsed = days.filter(day => day.date <= today);
    return {
      scheduled: elapsed.filter(day => day.state !== "off").length,
      attended: elapsed.filter(day => Boolean(day.record?.checkInAt)).length,
      absent: elapsed.filter(day => day.state === "absent").length,
      late: elapsed.filter(day => String(day.record?.attendanceStatus || "").includes("late")).length,
      early: elapsed.filter(day => String(day.record?.attendanceStatus || "").includes("early_leave")).length,
      incomplete: elapsed.filter(day => day.record?.checkInAt && !day.record?.checkOutAt).length,
      worked: elapsed.reduce((sum, day) => sum + Number(day.record?.workedMinutes || 0), 0),
    };
  }, [days, today]);

  const currentShift = resolveAssignedShift(account.id, today, assignments, shifts);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <div className="grid gap-4 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_52%,#eefdf8_100%)] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
          <div><Button type="button" variant="ghost" className="mb-3 -mr-3 rounded-xl" onClick={onBack}>← رجوع للموظفين</Button><h2 className="text-2xl font-semibold">{account.displayName || account.email}</h2><p className="mt-1 text-sm text-slate-500">{account.email}</p><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline" className="rounded-full">{account.accessLevel === "manager" ? "إدارة" : "موظف"}</Badge><Badge variant="outline" className="rounded-full">{account.clockEnabled ? "البصمة مفعلة" : "البصمة غير مفعلة"}</Badge>{currentShift ? <Badge variant="outline" className="rounded-full">{currentShift.name} · {currentShift.startTime}-{currentShift.endTime}</Badge> : null}</div></div>
          <div className="space-y-2"><Label className="text-xs text-slate-600">الشهر</Label><Input lang="en" dir="ltr" type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-11 w-full rounded-2xl border-slate-200 bg-white sm:w-[190px]" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-slate-50/70 p-3 md:grid-cols-4 xl:grid-cols-7">
          {[ ["أيام الدوام", summary.scheduled], ["حضور", summary.attended], ["غياب", summary.absent], ["تأخير", summary.late], ["خروج مبكر", summary.early], ["ناقص انصراف", summary.incomplete], ["ساعات العمل", formatMinutes(summary.worked)] ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-2xl font-semibold">{value}</div><div className="mt-1 text-xs font-semibold text-slate-500">{label}</div></div>)}
        </div>
      </section>

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <section className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white">
        {loading ? <p className="py-10 text-center text-sm text-slate-500">جاري تحميل الشهر...</p> : <div className="overflow-x-auto"><Table className="min-w-[1120px]"><TableHeader className="bg-slate-50/80"><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">اليوم</TableHead><TableHead className="text-right">الشفت</TableHead><TableHead className="text-right">الحضور</TableHead><TableHead className="text-right">الانصراف</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">التأخير</TableHead><TableHead className="text-right">الخروج المبكر</TableHead><TableHead className="text-right">العمل</TableHead><TableHead className="text-right">التعديل</TableHead></TableRow></TableHeader><TableBody>{days.map(day => {
          const rowLabel = day.record ? statusLabel(day.record.attendanceStatus) : day.state === "absent" ? "غائب" : day.state === "off" ? "راحة" : day.state === "future" ? "قادمة" : "لم يسجل بعد";
          return <TableRow key={day.date} className={day.state === "off" ? "bg-slate-50/50" : undefined}><TableCell dir="ltr" className="text-right font-semibold">{formatDate(day.date)}</TableCell><TableCell>{day.weekday}</TableCell><TableCell>{day.shift ? <><div className="font-semibold">{day.shift.name}</div><div dir="ltr" className="mt-1 text-right text-xs text-slate-500">{day.shift.startTime} - {day.shift.endTime}</div></> : "—"}</TableCell><TableCell dir="ltr" className="text-right font-semibold">{formatTime(day.record?.checkInAt)}</TableCell><TableCell dir="ltr" className="text-right font-semibold">{formatTime(day.record?.checkOutAt)}</TableCell><TableCell><StatusBadge value={rowLabel} status={day.record?.attendanceStatus || (day.state === "absent" ? "absent" : null)} /></TableCell><TableCell>{day.record?.lateMinutes ? `${day.record.lateMinutes} د` : "—"}</TableCell><TableCell>{day.record?.earlyLeaveMinutes ? `${day.record.earlyLeaveMinutes} د` : "—"}</TableCell><TableCell>{formatMinutes(day.record?.workedMinutes)}</TableCell><TableCell>{day.record ? <Button type="button" variant="outline" size="icon" className="rounded-xl" onClick={() => setEditing(day.record)}><Edit3 className="h-4 w-4" /></Button> : <span className="text-xs text-slate-400">لا يوجد سجل</span>}</TableCell></TableRow>;
        })}</TableBody></Table></div>}
      </section>
      <CorrectionDialog record={editing} open={Boolean(editing)} onOpenChange={open => !open && setEditing(null)} onSaved={refresh} />
    </div>
  );
}

function ReportsPageMaedin() {
  const today = todayRiyadhKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const initialRange = monthRange(month)!;
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to > today ? today : initialRange.to);
  const [report, setReport] = useState<HabatReport | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try { setReport(await habatApi<HabatReport>(`v2/reports/summary?from=${from}&to=${to}`)); }
    catch (caught) { setError(friendlyHabatError(caught)); }
  }, [from, to]);
  useEffect(() => { void refresh(); }, [refresh]);

  function changeMonth(value: string) {
    setMonth(value); const range = monthRange(value); if (!range) return; setFrom(range.from); setTo(range.to > today ? today : range.to);
  }

  const totals = report?.totals;
  return <div className="space-y-5"><FilterCard><div className="mb-4 flex items-start gap-3 border-b border-slate-100 pb-4"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white"><BarChart3 className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold">التقارير</h2><p className="mt-1 text-xs text-slate-500">ملخص الحضور والغياب والتأخير وساعات العمل</p></div></div><div className="grid gap-3 sm:grid-cols-3 lg:max-w-3xl"><div className="space-y-2"><Label className="text-xs">الشهر</Label><Input lang="en" dir="ltr" type="month" value={month} onChange={event => changeMonth(event.target.value)} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70" /></div><div className="space-y-2"><Label className="text-xs">من تاريخ</Label><Input lang="en" dir="ltr" type="date" value={from} onChange={event => { setMonth(""); setFrom(event.target.value); }} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70" /></div><div className="space-y-2"><Label className="text-xs">إلى تاريخ</Label><Input lang="en" dir="ltr" type="date" value={to} onChange={event => { setMonth(""); setTo(event.target.value); }} className="h-11 rounded-2xl border-slate-200 bg-slate-50/70" /></div></div>{error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}</FilterCard>{totals ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{[["أيام الدوام", totals.scheduledDays], ["حضور", totals.attendedDays], ["غياب", totals.absentDays], ["تأخير", totals.lateDays], ["خروج مبكر", totals.earlyLeaveDays], ["ناقص انصراف", totals.incompleteDays], ["ساعات العمل", formatMinutes(totals.workedMinutes)]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-slate-500">{label}</div></div>)}</div> : null}<div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white"><div className="overflow-x-auto"><Table className="min-w-[900px]"><TableHeader className="bg-slate-50/80"><TableRow><TableHead className="text-right">الموظف</TableHead><TableHead className="text-right">أيام الدوام</TableHead><TableHead className="text-right">حضور</TableHead><TableHead className="text-right">غياب</TableHead><TableHead className="text-right">تأخير</TableHead><TableHead className="text-right">خروج مبكر</TableHead><TableHead className="text-right">ناقص انصراف</TableHead><TableHead className="text-right">العمل</TableHead></TableRow></TableHeader><TableBody>{report?.employees.map(employee => <TableRow key={employee.accessId}><TableCell><div className="font-semibold">{employee.displayName}</div><div className="mt-1 text-xs text-slate-500">{employee.email}</div></TableCell><TableCell>{employee.scheduledDays}</TableCell><TableCell>{employee.attendedDays}</TableCell><TableCell>{employee.absentDays}</TableCell><TableCell>{employee.lateDays}</TableCell><TableCell>{employee.earlyLeaveDays}</TableCell><TableCell>{employee.incompleteDays}</TableCell><TableCell>{formatMinutes(employee.workedMinutes)}</TableCell></TableRow>)}</TableBody></Table></div></div></div>;
}

function AttendanceShell({ context, onContextRefresh }: { context: HabatContext; onContextRefresh: () => Promise<void> }) {
  const principal = context.principal;
  const [page, setPage] = useState<PageKey>("clock");
  const [selectedEmployee, setSelectedEmployee] = useState<HabatAccessAccount | null>(null);

  const managerItems: Array<{ key: PageKey; label: string; icon: typeof Clock3 }> = [
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
  const employeeItems: typeof managerItems = [
    { key: "clock", label: "الحضور والانصراف", icon: Fingerprint },
    { key: "profile", label: "صفحتي", icon: UserRound },
    { key: "history", label: "سجلي", icon: CalendarClock },
  ];
  const items = principal.canManage ? managerItems : employeeItems;

  const content = useMemo(() => {
    switch (page) {
      case "clock": return <ClockPage context={context} onRefresh={onContextRefresh} />;
      case "dashboard": return <DashboardPage />;
      case "profile": return <EmployeePortalPage />;
      case "history": return <MyHistoryPage />;
      case "employees": return <EmployeesWorkspace onDataChanged={onContextRefresh} onOpenEmployee={account => { setSelectedEmployee(account); setPage("employee-file"); }} />;
      case "employee-file": return selectedEmployee ? <EmployeeFilePage account={selectedEmployee} onBack={() => setPage("employees")} /> : <EmployeesWorkspace onDataChanged={onContextRefresh} onOpenEmployee={account => { setSelectedEmployee(account); setPage("employee-file"); }} />;
      case "accounts": return <HabatAccountManagement onDataChanged={onContextRefresh} />;
      case "shifts": return <ShiftsPage onDataChanged={onContextRefresh} />;
      case "records": return <ManagerRecordsPage />;
      case "reports": return <ReportsPageMaedin />;
      case "audit": return <AuditLogPage />;
      case "settings": return <HabatAttendanceSettings onDataChanged={onContextRefresh} />;
      default: return <ClockPage context={context} onRefresh={onContextRefresh} />;
    }
  }, [context, onContextRefresh, page, selectedEmployee]);

  return (
    <main dir="rtl" className="habat-attendance-shell min-h-screen bg-[#f5f5f3] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 sm:gap-4"><Brand compact /><div className="flex shrink-0 items-center gap-2"><div className="hidden text-left sm:block"><p className="text-sm font-black">{principal.displayName || principal.email}</p><p className="text-xs text-slate-500">{principal.canManage ? "إدارة" : "موظف"}</p></div><Button type="button" variant="outline" className="rounded-xl" onClick={() => signOut(auth)}>خروج</Button></div></div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-6">
        <div className="lg:hidden">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><Label className="mb-2 block text-xs font-bold text-slate-500">القسم</Label><Select value={page === "employee-file" ? "employees" : page} onValueChange={value => setPage(value as PageKey)}><SelectTrigger className="h-12 w-full rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger><SelectContent>{items.map(item => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <aside className="hidden h-fit rounded-[24px] border border-slate-200 bg-white p-2 shadow-sm lg:sticky lg:top-24 lg:block"><nav className="flex flex-col gap-2">{items.map(item => { const Icon = item.icon; const active = page === item.key || (page === "employee-file" && item.key === "employees"); return <button key={item.key} onClick={() => setPage(item.key)} className={active ? "flex min-w-0 items-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-bold text-white" : "flex min-w-0 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"}><Icon size={18} className="shrink-0" /><span>{item.label}</span></button>; })}</nav></aside>
        <div className="min-w-0">{content}</div>
      </div>
    </main>
  );
}

async function loadContext(): Promise<AccessState> {
  try { return { status: "ready", context: await habatApi<HabatContext>("v2/context") }; }
  catch (error) { return { status: "forbidden", message: friendlyHabatError(error) }; }
}

export default function HabatAttendanceAppV3() {
  useWesternDigitsBoundary();
  const [access, setAccess] = useState<AccessState>({ status: "loading" });

  useEffect(() => onAuthStateChanged(auth, async user => {
    if (!user) { setAccess({ status: "signed-out" }); return; }
    setAccess({ status: "loading" });
    setAccess(await loadContext());
  }), []);

  const refreshContext = useCallback(async () => { setAccess(await loadContext()); }, []);

  if (access.status === "loading") return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-4 font-bold text-slate-600"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin" size={24} />جاري تحميل نظام الحضور...</div></main>;
  if (access.status === "signed-out") return <LoginScreen />;
  if (access.status === "forbidden") return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f5f5f3] px-4"><section className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-sm"><ShieldCheck className="mx-auto mb-4 text-slate-400" size={34} /><h2 className="text-xl font-black">غير مصرح بالدخول</h2><p className="mt-2 text-sm text-slate-500">{access.message}</p><Button type="button" className="mt-5 rounded-xl bg-black" onClick={() => signOut(auth)}>تسجيل الخروج</Button></section></main>;
  return <AttendanceShell context={access.context} onContextRefresh={refreshContext} />;
}
