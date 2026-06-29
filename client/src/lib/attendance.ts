import { auth } from "@/_core/firebase";
import { buildDocumentWorkerUrl } from "@/lib/documentUploadService";

const ATTENDANCE_DEVICE_ID_STORAGE_KEY = "maedin_attendance_device_id";
const ATTENDANCE_DEVICE_ID_PREFIX = "maedin-web";
const ATTENDANCE_DEVICE_ID_VERSION_PREFIX = `${ATTENDANCE_DEVICE_ID_PREFIX}-v2-`;
const ATTENDANCE_DEBUG_PREFIX = "[attendance-debug]";

export type AttendanceType = "check_in" | "check_out";
export type AttendanceResult = "allowed" | "rejected";

export type AttendanceResponse = {
  ok: boolean;
  id: string;
  result: AttendanceResult;
  type: AttendanceType;
  rejectionReason?: string | null;
  accuracy?: number | null;
  zoneId?: string | null;
  distanceMeters?: number | null;
  allowedRadiusMeters?: number | null;
  previousStatus?: string | null;
  currentStatus?: string | null;
  debug?: Record<string, unknown> | null;
};

type AttendanceDebugPayload = {
  enabled: true;
  requestId: string;
  startedAt: string;
  pageUrl?: string | null;
};

type AttendanceRequest = {
  employeeId?: string | null;
  type: AttendanceType;
  clientTime: string;
  debug?: AttendanceDebugPayload;
  location: {
    lat: number;
    lng: number;
    accuracy: number;
  };
  deviceInfo: {
    deviceId: string;
    userAgent: string;
    platform: string;
    language: string;
    timeZone: string;
  };
};

type AttendanceDebugData =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null
  | undefined;

export function logAttendanceDebug(stage: string, data?: AttendanceDebugData) {
  if (typeof console === "undefined") return;
  const label = `${ATTENDANCE_DEBUG_PREFIX} ${stage}`;
  if (data === undefined) {
    console.log(label);
    return;
  }
  console.log(label, data);
}

function serializeAttendanceError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || null,
      code: (error as Error & { code?: unknown }).code ?? null,
      status: (error as Error & { status?: unknown }).status ?? null,
      payload: (error as Error & { payload?: unknown }).payload ?? null,
    };
  }

  if (error && typeof error === "object") {
    const maybeGeoError = error as Partial<GeolocationPositionError>;
    return {
      value: error,
      code: maybeGeoError.code ?? null,
      message: maybeGeoError.message ?? null,
    };
  }

  return { value: String(error) };
}

function createAttendanceDebugRequestId() {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `attendance-${Date.now().toString(36)}-${randomPart}`;
}

function getDebugPageUrl() {
  if (typeof window === "undefined") return null;
  try {
    return window.location.href;
  } catch {
    return null;
  }
}

function getSafeWorkerUrlLabel(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

export function getAttendanceDeviceId() {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage
      .getItem(ATTENDANCE_DEVICE_ID_STORAGE_KEY)
      ?.trim();
    if (existing && existing.startsWith(ATTENDANCE_DEVICE_ID_VERSION_PREFIX)) {
      return existing;
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  const deviceId = buildStableAttendanceDeviceId();
  try {
    window.localStorage.setItem(ATTENDANCE_DEVICE_ID_STORAGE_KEY, deviceId);
  } catch {
    // The current request can still carry the generated ID.
  }
  return deviceId;
}

function buildStableAttendanceDeviceId() {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

  return `${ATTENDANCE_DEVICE_ID_VERSION_PREFIX}${randomId}`;
}

async function recordAttendance(requestBody: AttendanceRequest) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Authentication required.");

  const requestUrl = buildDocumentWorkerUrl("/attendance/record");
  if (!requestUrl) throw new Error("Attendance worker URL is not configured.");
  const requestId = requestBody.debug?.requestId || "no-debug-request-id";
  const deviceInfo = requestBody.deviceInfo;

  logAttendanceDebug("worker-request", {
    requestId,
    url: getSafeWorkerUrlLabel(requestUrl),
    employeeId: requestBody.employeeId || null,
    type: requestBody.type,
    clientTime: requestBody.clientTime,
    location: requestBody.location,
    deviceInfo: {
      deviceId: deviceInfo.deviceId,
      platform: deviceInfo.platform,
      language: deviceInfo.language,
      timeZone: deviceInfo.timeZone,
      userAgent: deviceInfo.userAgent,
    },
    currentUser: {
      uid: currentUser.uid,
      email: currentUser.email || null,
    },
  });

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${await currentUser.getIdToken()}`,
    },
    body: JSON.stringify(requestBody),
  });
  const payload = (await response.json().catch(() => null)) as
    | (AttendanceResponse & { message?: string; detail?: string })
    | null;

  logAttendanceDebug("worker-response", {
    requestId,
    httpStatus: response.status,
    httpOk: response.ok,
    payload,
  });

  if (!response.ok || !payload) {
    const error = new Error(
      String(
        payload?.message || payload?.detail || "Attendance request failed."
      )
    ) as Error & { status?: number; payload?: unknown };
    error.status = response.status;
    error.payload = payload;
    logAttendanceDebug("worker-error", {
      requestId,
      error: serializeAttendanceError(error),
    });
    throw error;
  }

  return payload;
}

function createLocationUnavailableError(message: string) {
  const error = new Error(message) as Error & {
    attendanceLocationErrorType?: "location_unavailable";
  };
  error.attendanceLocationErrorType = "location_unavailable";
  return error;
}

function getCurrentGpsPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(
        createLocationUnavailableError(
          "تعذر الحصول على موقعك. تأكد من تفعيل خدمة الموقع ومنح الإذن للمتصفح."
        )
      );
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      reject(
        createLocationUnavailableError(
          "تعذر الحصول على موقعك. تأكد من تفعيل خدمة الموقع ومنح الإذن للمتصفح."
        )
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });
  });
}

function getDeviceInfo() {
  return {
    deviceId: getAttendanceDeviceId(),
    userAgent:
      typeof navigator !== "undefined" ? navigator.userAgent || "" : "",
    platform: typeof navigator !== "undefined" ? navigator.platform || "" : "",
    language: typeof navigator !== "undefined" ? navigator.language || "" : "",
    timeZone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || ""
        : "",
  };
}

export function isGeolocationPermissionDenied(error: unknown) {
  const geoError = error as Partial<GeolocationPositionError> | null;
  return typeof geoError?.code === "number" && geoError.code === 1;
}

export function isGeolocationPositionError(error: unknown) {
  const geoError = error as Partial<GeolocationPositionError> | null;
  return (
    typeof geoError?.code === "number" &&
    geoError.code >= 1 &&
    geoError.code <= 3
  );
}

export function getAttendanceTypeLabel(type: AttendanceType) {
  return type === "check_in" ? "تسجيل حضور" : "تسجيل انصراف";
}

export function getAttendanceSuccessLabel(type: AttendanceType) {
  return type === "check_in" ? "تم تسجيل الحضور" : "تم تسجيل الانصراف";
}

export function getAttendanceRejectionLabel(reason?: string | null) {
  switch (reason) {
    case "poor_accuracy":
      return "دقة الموقع ضعيفة. حاول من مكان مفتوح أو فعّل GPS عالي الدقة.";
    case "outside_zone":
      return "أنت خارج نطاق تسجيل الحضور.";
    case "duplicate_check_in":
      return "يوجد حضور مسجل بالفعل ولم يتم تسجيل انصراف بعد.";
    case "not_checked_in":
      return "لا يوجد حضور مفتوح لتسجيل الانصراف.";
    case "zone_not_found":
      return "لم يتم العثور على نطاق دوام مرتبط بالموظف.";
    case "zone_invalid":
      return "إعدادات نطاق الدوام غير مكتملة.";
    case "unsupported_zone_type":
      return "نوع نطاق الدوام غير مدعوم حالياً.";
    default:
      return "تعذر قبول عملية الحضور الآن.";
  }
}

export function getGeolocationErrorMessage(error: unknown) {
  const geoError = error as
    | (Partial<GeolocationPositionError> & {
        attendanceLocationErrorType?: "location_unavailable";
      })
    | null;

  if (typeof geoError?.code === "number") {
    if (geoError.code === 1) {
      return "تم رفض إذن الوصول للموقع. فعّل إذن الموقع من إعدادات المتصفح ثم حاول مرة أخرى.";
    }
    if (geoError.code === 2 || geoError.code === 3) {
      return "تعذر الحصول على موقعك. تأكد من تفعيل خدمة الموقع ومنح الإذن للمتصفح.";
    }
  }

  if (geoError?.attendanceLocationErrorType === "location_unavailable") {
    return "تعذر الحصول على موقعك. تأكد من تفعيل خدمة الموقع ومنح الإذن للمتصفح.";
  }

  if (error instanceof Error && error.message) return error.message;
  return "تعذر الحصول على موقعك. تأكد من تفعيل خدمة الموقع ومنح الإذن للمتصفح.";
}

export function getAttendanceSubmitErrorMessage(error: unknown) {
  if (isGeolocationPermissionDenied(error)) {
    return getGeolocationErrorMessage(error);
  }

  const maybeFirebaseError = error as {
    code?: string;
    message?: string;
  } | null;
  const code = String(maybeFirebaseError?.code || "").toLowerCase();

  if (
    code.includes("functions/internal") ||
    code.includes("internal") ||
    maybeFirebaseError?.message === "internal"
  ) {
    return "تعذر الاتصال بخدمة تسجيل الدوام. تأكد أن دالة الحضور منشورة في Firebase ثم حاول مرة أخرى.";
  }

  return getGeolocationErrorMessage(error);
}

export async function submitEmployeeAttendance(input: {
  employeeId?: string | null;
  type: AttendanceType;
}) {
  const requestId = createAttendanceDebugRequestId();

  logAttendanceDebug("submit-start", {
    requestId,
    employeeId: input.employeeId || null,
    type: input.type,
    isSecureContext:
      typeof window !== "undefined" ? window.isSecureContext : null,
    geolocationAvailable:
      typeof navigator !== "undefined" && Boolean(navigator.geolocation),
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    pageUrl: getDebugPageUrl(),
  });

  let position: GeolocationPosition;
  try {
    logAttendanceDebug("gps-request", { requestId });
    position = await getCurrentGpsPosition();
    logAttendanceDebug("gps-success", {
      requestId,
      timestamp: position.timestamp,
      location: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        altitudeAccuracy: position.coords.altitudeAccuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
      },
    });
  } catch (error) {
    logAttendanceDebug("gps-error", {
      requestId,
      error: serializeAttendanceError(error),
    });
    throw error;
  }

  const location = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
  const debug: AttendanceDebugPayload = {
    enabled: true,
    requestId,
    startedAt: new Date().toISOString(),
    pageUrl: getDebugPageUrl(),
  };

  try {
    const response = await recordAttendance({
      employeeId: input.employeeId || null,
      type: input.type,
      clientTime: new Date().toISOString(),
      debug,
      location,
      deviceInfo: getDeviceInfo(),
    });
    logAttendanceDebug("submit-complete", {
      requestId,
      result: response.result,
      rejectionReason: response.rejectionReason || null,
      response,
    });
    return response;
  } catch (error) {
    logAttendanceDebug("submit-error", {
      requestId,
      error: serializeAttendanceError(error),
    });
    throw error;
  }
}
