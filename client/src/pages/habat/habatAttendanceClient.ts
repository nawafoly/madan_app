import { getHabatRealtimeClientId } from "./habatRealtimeClient";

function buildHabatApiUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/, "");
  return `/habat-api/${normalizedPath}`;
}

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
  locationId?: string | null;
  locationName?: string | null;
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
  credentialsProvisioned?: boolean;
  mustChangePassword?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type HabatAttendanceLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type HabatLocationAccount = {
  id: string;
  email: string;
  displayName: string;
  accessLevel: "employee" | "manager";
  locationIds: string[];
};

export type HabatAttendancePhoto = {
  id: string;
  recordId: string;
  accessId: string | null;
  attendanceDate: string;
  clockType: "check_in" | "check_out";
  contentType: string;
  sizeBytes: number;
  capturedAt: string;
  displayName: string;
  accountEmail: string | null;
  locationName: string | null;
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

function isClockMutation(path: string, init?: RequestInit) {
  const normalized = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return (
    String(init?.method || "GET").toUpperCase() === "POST" &&
    (normalized === "v2/check-in" || normalized === "v2/check-out")
  );
}

function parseJsonBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== "string") return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function ensureClockLocation(payload: Record<string, unknown>) {
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) return payload;

  const location = await readBrowserLocation(true);
  return { ...payload, ...location };
}

async function requestRearCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("habat_camera_unavailable");
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { exact: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
    });
  } catch {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
    });
    const facingMode = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
    if (facingMode === "user") {
      stream.getTracks().forEach(track => track.stop());
      throw new Error("habat_rear_camera_unavailable");
    }
    return stream;
  }
}

export async function captureHabatRearCameraPhoto(): Promise<File> {
  const stream = await requestRearCameraStream();

  return new Promise<File>((resolve, reject) => {
    const overlay = document.createElement("div");
    const panel = document.createElement("div");
    const title = document.createElement("div");
    const video = document.createElement("video");
    const actions = document.createElement("div");
    const captureButton = document.createElement("button");
    const cancelButton = document.createElement("button");

    overlay.dir = "rtl";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      background: "rgba(2,6,23,.92)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
    });
    Object.assign(panel.style, {
      width: "min(560px, 100%)",
      borderRadius: "24px",
      overflow: "hidden",
      background: "#fff",
      boxShadow: "0 24px 80px rgba(0,0,0,.35)",
    });
    Object.assign(title.style, {
      padding: "16px 18px",
      fontWeight: "800",
      fontFamily: "inherit",
      color: "#0f172a",
    });
    title.textContent = "تصوير البصمة بالكاميرا الخلفية";

    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    Object.assign(video.style, {
      display: "block",
      width: "100%",
      maxHeight: "62vh",
      objectFit: "cover",
      background: "#000",
    });

    Object.assign(actions.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px",
      padding: "14px",
    });
    for (const button of [captureButton, cancelButton]) {
      Object.assign(button.style, {
        minHeight: "48px",
        borderRadius: "14px",
        border: "0",
        fontWeight: "800",
        fontFamily: "inherit",
        cursor: "pointer",
      });
    }
    captureButton.textContent = "التقاط الصورة";
    captureButton.style.background = "#0f172a";
    captureButton.style.color = "#fff";
    cancelButton.textContent = "إلغاء";
    cancelButton.style.background = "#e2e8f0";
    cancelButton.style.color = "#0f172a";

    actions.append(captureButton, cancelButton);
    panel.append(title, video, actions);
    overlay.append(panel);
    document.body.append(overlay);

    const cleanup = () => {
      stream.getTracks().forEach(track => track.stop());
      overlay.remove();
    };

    cancelButton.onclick = () => {
      cleanup();
      reject(new Error("habat_camera_cancelled"));
    };

    captureButton.onclick = () => {
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) {
        cleanup();
        reject(new Error("habat_photo_capture_failed"));
        return;
      }

      const maxDimension = 1280;
      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        cleanup();
        reject(new Error("habat_photo_capture_failed"));
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => {
          cleanup();
          if (!blob) {
            reject(new Error("habat_photo_capture_failed"));
            return;
          }
          resolve(
            new File([blob], `habat-attendance-${Date.now()}.jpg`, {
              type: "image/jpeg",
              lastModified: Date.now(),
            })
          );
        },
        "image/jpeg",
        0.78
      );
    };

    void video.play().catch(() => undefined);
  });
}

export async function habatApi<T>(path: string, init?: RequestInit): Promise<T> {
  let body = init?.body;

  if (isClockMutation(path, init) && !(typeof FormData !== "undefined" && body instanceof FormData)) {
    const payload = await ensureClockLocation(parseJsonBody(body));
    const photo = await captureHabatRearCameraPhoto();
    const form = new FormData();
    form.append("payload", JSON.stringify(payload));
    form.append("photo", photo, photo.name);
    body = form;
  }

  const headers = new Headers(init?.headers || {});
  headers.set("X-Habat-Client-Id", getHabatRealtimeClientId());
  headers.set("Accept", "application/json");
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body && !headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(buildHabatApiUrl(path), {
    ...init,
    body,
    headers,
    credentials: "same-origin",
    cache: "no-store",
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
    case "invalid_credentials":
      return "البريد الإلكتروني أو كلمة المرور غير صحيحة، أو لم تُجهّز بيانات الدخول بعد.";
    case "account_temporarily_locked":
      return "تم إيقاف المحاولات مؤقتًا. انتظر 15 دقيقة أو تواصل مع الإدارة.";
    case "habat_session_required":
      return "انتهت جلسة الدخول. سجّل الدخول مجددًا.";
    case "habat_password_change_required":
      return "يجب تغيير كلمة المرور المؤقتة قبل متابعة العمل.";
    case "password_too_short":
      return "كلمة المرور يجب أن تكون 10 أحرف على الأقل.";
    case "new_password_must_differ":
      return "اختر كلمة مرور مختلفة عن كلمة المرور الحالية.";
    case "invalid_current_password":
      return "كلمة المرور الحالية غير صحيحة.";
    case "habat_credentials_already_exist":
      return "بيانات الدخول موجودة بالفعل. استخدم إعادة كلمة المرور عند الحاجة.";
    case "habat_credentials_not_found":
    case "habat_credentials_missing":
      return "لم تُجهّز بيانات الدخول لهذا الحساب بعد. حدّث القائمة ثم اختر تجهيز الدخول.";
    case "habat_access_inactive":
      return "فعّل صلاحية الحساب قبل تجهيز كلمة المرور.";
    case "habat_manager_required":
    case "habat_management_forbidden":
      return "هذه العملية مخصصة للإدارة.";
    case "habat_auth_origin_forbidden":
      return "افتح نظام حبات الورق من عنوانه المعتمد لتنفيذ العملية.";
    case "habat_access_forbidden":
      return "هذا الحساب غير مصرح له بالدخول إلى نظام حبات الورق.";
    case "habat_clock_forbidden":
      return "هذا الحساب لا يملك صلاحية تسجيل الحضور والانصراف.";
    case "habat_already_checked_in":
      return "تم تسجيل الحضور مسبقًا اليوم.";
    case "habat_check_in_required":
      return "يجب تسجيل الحضور أولًا.";
    case "habat_already_checked_out":
      return "تم تسجيل الانصراف مسبقًا اليوم.";
    case "habat_checkout_cooldown": {
      const payload = error instanceof HabatApiError ? error.payload : null;
      const seconds = Number(payload?.retryAfterSeconds);
      return Number.isFinite(seconds)
        ? `انتظر ${Math.max(1, Math.ceil(seconds))} ثانية قبل تسجيل الانصراف.`
        : "انتظر دقيقة بعد تسجيل الحضور قبل تسجيل الانصراف.";
    }
    case "habat_non_working_day":
      return "اليوم غير مدرج ضمن أيام دوامك.";
    case "habat_shift_not_configured":
      return "لم يتم إعداد شفت لهذا الحساب.";
    case "habat_location_required":
    case "geolocation_unavailable":
      return "يلزم السماح بالموقع لتسجيل الحضور أو الانصراف.";
    case "habat_clock_location_not_assigned":
      return "لم تحدد الإدارة موقع بصمة مسموح لهذا الموظف.";
    case "habat_location_accuracy_too_low": {
      const payload = error instanceof HabatApiError ? error.payload : null;
      const accuracyM = Number(payload?.accuracyM);
      const maxAccuracyM = Number(payload?.maxAccuracyM);
      if (Number.isFinite(accuracyM) && Number.isFinite(maxAccuracyM)) {
        return `دقة الموقع الحالية ±${Math.round(accuracyM)}م، والحد المسموح ±${Math.round(maxAccuracyM)}م. انتظر تحسن إشارة GPS وحاول مجددًا.`;
      }
      return "دقة الموقع غير كافية. انتظر تحسن إشارة GPS وحاول مجددًا.";
    }
    case "habat_outside_location_range":
    case "habat_outside_assigned_location_range": {
      const payload = error instanceof HabatApiError ? error.payload : null;
      const distanceM = Number(payload?.distanceM);
      const radiusM = Number(payload?.radiusM);
      const locationName = String(payload?.locationName || "الموقع المسموح");
      if (Number.isFinite(distanceM) && Number.isFinite(radiusM)) {
        return `أنت تبعد ${Math.round(distanceM)}م عن ${locationName}، والنطاق المسموح ${Math.round(radiusM)}م.`;
      }
      return "أنت خارج نطاق مواقع البصمة المسموحة لك.";
    }
    case "habat_camera_unavailable":
      return "الكاميرا غير متاحة في هذا الجهاز أو المتصفح.";
    case "habat_rear_camera_unavailable":
      return "تعذر تشغيل الكاميرا الخلفية. تحقق من صلاحية الكاميرا وحاول مجددًا.";
    case "habat_camera_cancelled":
      return "تم إلغاء التصوير ولم تُسجل البصمة.";
    case "habat_photo_capture_failed":
      return "تعذر التقاط الصورة. حاول مرة أخرى.";
    case "habat_photo_required":
      return "الصورة مطلوبة لإكمال تسجيل الحضور أو الانصراف.";
    case "habat_invalid_attendance_photo":
      return "صيغة صورة البصمة غير مدعومة.";
    case "habat_attendance_photo_too_large":
      return "حجم صورة البصمة أكبر من الحد المسموح.";
    case "habat_photo_storage_unavailable":
    case "habat_photo_storage_failed":
      return "تعذر حفظ صورة البصمة الآن. حاول مرة أخرى.";
    case "habat_location_name_required":
      return "اكتب اسمًا واضحًا لموقع البصمة.";
    case "habat_invalid_location_assignment":
      return "أحد مواقع البصمة المحددة غير صالح أو غير مفعل.";
    case "habat_location_assignment_failed":
      return "تعذر حفظ مواقع الموظف المسموحة.";
    case "habat_location_not_found":
      return "موقع البصمة غير موجود.";
    case "habat_location_coordinates_required":
      return "حدد إحداثيات الموقع قبل الحفظ.";
    case "habat_correction_reason_required":
      return "اكتب سبب التصحيح الإداري.";
    case "habat_invalid_attendance_order":
      return "وقت الانصراف لا يمكن أن يكون قبل وقت الحضور.";
    case "habat_attendance_punch_required":
      return "حدد بصمة حضور أو انصراف واحدة على الأقل.";
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
  return date.toLocaleTimeString("ar-SA-u-nu-latn", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ar-SA-u-nu-latn", {
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
    case "incomplete":
      return "بصمة ناقصة";
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
