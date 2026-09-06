import { auth } from "@/_core/firebase";

export type HabatPrincipal = {
  uid: string | null;
  email: string | null;
  displayName: string | null;
  accessLevel: "employee" | "manager";
  canManage: boolean;
  canClock: boolean;
  bootstrapOwner?: boolean;
  accessId?: string | null;
};

export type HabatClockLocation = {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  distanceM: number | null;
};

export type HabatRecord = {
  id: string;
  accessId: string | null;
  accountUid: string;
  accountEmail: string | null;
  displayName: string | null;
  attendanceDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  shiftId: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  attendanceStatus: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number | null;
  checkInLocation: HabatClockLocation | null;
  checkOutLocation: HabatClockLocation | null;
  notes: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type HabatShift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  workingDays: number[];
  isActive: boolean;
};

export type HabatPublicSettings = {
  timezone: string;
  locationRequired: boolean;
  radiusM: number;
  maxAccuracyM: number;
  locationConfigured: boolean;
};

export type HabatSettings = HabatPublicSettings & {
  latitude: number | null;
  longitude: number | null;
  updatedAt?: string | null;
};

export type HabatContext = {
  ok: true;
  principal: HabatPrincipal;
  date: string;
  today: HabatRecord | null;
  shift: HabatShift | null;
  settings: HabatPublicSettings;
};

export type HabatAccessAccount = {
  id: string;
  uid: string | null;
  email: string;
  displayName: string | null;
  accessLevel: "employee" | "manager";
  clockEnabled: boolean;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type HabatAssignment = {
  id: string;
  accessId: string;
  shiftId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  shiftName: string | null;
  startTime: string | null;
  endTime: string | null;
  email: string | null;
  displayName: string | null;
};

export type HabatDashboard = {
  ok: true;
  date: string;
  timezone: string;
  counts: {
    employees: number;
    presentNow: number;
    checkedOut: number;
    late: number;
    absent: number;
    notStarted: number;
    offDay: number;
    incomplete: number;
  };
  employees: Array<{
    id: string;
    email: string;
    displayName: string;
    liveStatus: string;
    shift: HabatShift | null;
    record: HabatRecord | null;
  }>;
};

export type HabatReport = {
  ok: true;
  from: string;
  to: string;
  totals: {
    scheduledDays: number;
    attendedDays: number;
    absentDays: number;
    lateDays: number;
    earlyLeaveDays: number;
    incompleteDays: number;
    workedMinutes: number;
  };
  employees: Array<{
    accessId: string;
    email: string;
    displayName: string;
    scheduledDays: number;
    attendedDays: number;
    absentDays: number;
    lateDays: number;
    earlyLeaveDays: number;
    incompleteDays: number;
    workedMinutes: number;
  }>;
};

export class HabatApiError extends Error {
  status: number;
  code: string;
  payload: Record<string, unknown> | null;

  constructor(status: number, code: string, payload?: Record<string, unknown> | null) {
    super(code);
    this.status = status;
    this.code = code;
    this.payload = payload || null;
  }
}

export async function habatApi<T>(path: string, init?: RequestInit): Promise<T> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new HabatApiError(401, "authentication_required");

  const token = await currentUser.getIdToken();
  const headers = new Headers(init?.headers || {});
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/habat-api/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
  });
  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok || !payload) {
    throw new HabatApiError(
      response.status,
      String(payload?.message || `habat_http_${response.status}`),
      payload
    );
  }

  return payload as T;
}

export function friendlyHabatError(error: unknown): string {
  const code =
    error instanceof HabatApiError
      ? error.code
      : String((error as { message?: unknown })?.message || "");

  switch (code) {
    case "habat_access_forbidden":
      return "هذا الحساب غير مصرح له بالدخول إلى نظام حبات الورق.";
    case "habat_clock_forbidden":
      return "هذا الحساب لا يملك صلاحية تسجيل الحضور والانصراف.";
    case "habat_management_forbidden":
      return "هذه العملية مخصصة للإدارة.";
    case "habat_already_checked_in":
      return "تم تسجيل الحضور مسبقًا اليوم.";
    case "habat_check_in_required":
      return "يجب تسجيل الحضور أولًا.";
    case "habat_already_checked_out":
      return "تم تسجيل الانصراف مسبقًا اليوم.";
    case "habat_non_working_day":
      return "اليوم غير مدرج ضمن أيام دوامك.";
    case "habat_shift_not_configured":
      return "لم يتم إعداد شفت لهذا الحساب.";
    case "habat_location_required":
      return "يلزم السماح بالموقع لتسجيل الحضور أو الانصراف.";
    case "habat_location_not_configured":
      return "موقع الفرع لم يتم ضبطه من الإدارة بعد.";
    case "habat_location_accuracy_too_low":
      return "دقة الموقع غير كافية. انتظر تحسن إشارة GPS وحاول مجددًا.";
    case "habat_outside_location_range":
      return "أنت خارج نطاق الحضور المسموح.";
    case "habat_location_coordinates_required":
      return "حدد إحداثيات الفرع قبل تفعيل إلزام الموقع.";
    case "habat_correction_reason_required":
      return "اكتب سبب التصحيح الإداري.";
    case "habat_invalid_attendance_order":
      return "وقت الانصراف لا يمكن أن يكون قبل وقت الحضور.";
    case "habat_default_shift_cannot_be_deleted":
      return "الدوام الافتراضي لا يمكن تعطيله.";
    case "habat_working_days_required":
      return "حدد يوم عمل واحدًا على الأقل.";
    case "habat_invalid_shift_time":
      return "تحقق من وقت بداية ونهاية الدوام.";
    case "habat_shift_name_required":
      return "اسم الشفت مطلوب.";
    case "habat_attendance_database_unavailable":
    case "habat_access_lookup_failed":
      return "قاعدة حضور حبات الورق غير متاحة الآن.";
    default:
      return "تعذر تنفيذ العملية الآن. حاول مرة أخرى.";
  }
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ar-SA", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ar-SA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatMinutes(value: number | null | undefined): string {
  const total = Math.max(0, Number(value || 0));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} د`;
  if (!minutes) return `${hours} س`;
  return `${hours} س ${minutes} د`;
}

export function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case "present":
      return "حاضر";
    case "late":
      return "متأخر";
    case "early_leave":
      return "انصراف مبكر";
    case "late_early_leave":
      return "متأخر · انصراف مبكر";
    default:
      return status ? status : "—";
  }
}

export function liveStatusLabel(status: string): string {
  switch (status) {
    case "present_now":
      return "موجود الآن";
    case "checked_out":
      return "انصرف";
    case "late":
      return "متأخر";
    case "absent":
      return "غائب حتى الآن";
    case "not_started":
      return "لم يبدأ الدوام";
    case "off_day":
      return "راحة";
    default:
      return status;
  }
}

export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function fromRiyadhDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const timestamp = Date.parse(`${value}:00+03:00`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function todayRiyadhKey(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

export async function readBrowserLocation(
  required: boolean
): Promise<{ latitude?: number; longitude?: number; accuracyM?: number }> {
  if (!("geolocation" in navigator)) {
    if (required) throw new Error("geolocation_unavailable");
    return {};
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        }),
      error => {
        if (required) reject(error);
        else resolve({});
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
      }
    );
  });
}
