import { auth } from "@/_core/firebase";
import { buildDocumentWorkerUrl } from "@/lib/documentUploadService";

const ATTENDANCE_DEVICE_ID_STORAGE_KEY = "maedin_attendance_device_id";

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
  previousStatus?: string | null;
  currentStatus?: string | null;
};

type AttendanceRequest = {
  employeeId?: string | null;
  type: AttendanceType;
  clientTime: string;
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

export function getAttendanceDeviceId() {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage
      .getItem(ATTENDANCE_DEVICE_ID_STORAGE_KEY)
      ?.trim();
    if (existing) return existing;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  const deviceId = globalThis.crypto.randomUUID();
  try {
    window.localStorage.setItem(ATTENDANCE_DEVICE_ID_STORAGE_KEY, deviceId);
  } catch {
    // The current request can still carry the generated ID.
  }
  return deviceId;
}

async function recordAttendance(requestBody: AttendanceRequest) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Authentication required.");

  const requestUrl = buildDocumentWorkerUrl("/attendance/record");
  if (!requestUrl) throw new Error("Attendance worker URL is not configured.");

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

  if (!response.ok || !payload) {
    const error = new Error(
      String(
        payload?.message || payload?.detail || "Attendance request failed."
      )
    ) as Error & { status?: number; payload?: unknown };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function getCurrentGpsPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("الموقع الجغرافي غير مدعوم في هذا الجهاز."));
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      reject(
        new Error(
          "خدمة الموقع تعمل فقط عبر HTTPS أو localhost. افتح النظام من رابط آمن ثم حاول مرة أخرى."
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

export function getAttendanceTypeLabel(type: AttendanceType) {
  return type === "check_in" ? "تسجيل حضور" : "تسجيل انصراف";
}

export function getAttendanceSuccessLabel(type: AttendanceType) {
  return type === "check_in" ? "تم تسجيل الحضور" : "تم تسجيل الانصراف";
}

export function getAttendanceRejectionLabel(reason?: string | null) {
  switch (reason) {
    case "poor_accuracy":
      return "دقة الموقع ضعيفة. حاول من مكان أوضح أو فعّل GPS عالي الدقة.";
    case "outside_zone":
      return "الموقع خارج نطاق الدوام المسموح.";
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
  const geoError = error as Partial<GeolocationPositionError> | null;

  if (typeof geoError?.code === "number") {
    if (geoError.code === 1) {
      return "تم رفض إذن الموقع. فعّل صلاحية الموقع ثم حاول مرة أخرى.";
    }
    if (geoError.code === 2) {
      return "تعذر تحديد الموقع الحالي.";
    }
    if (geoError.code === 3) {
      return "انتهت مهلة تحديد الموقع. حاول مرة أخرى.";
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return "تعذر جلب موقع الجهاز.";
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
  const position = await getCurrentGpsPosition();
  const location = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };

  console.log(
    "[attendance:gps]",
    location.lat,
    location.lng,
    location.accuracy
  );

  return recordAttendance({
    employeeId: input.employeeId || null,
    type: input.type,
    clientTime: new Date().toISOString(),
    location,
    deviceInfo: getDeviceInfo(),
  });
}
