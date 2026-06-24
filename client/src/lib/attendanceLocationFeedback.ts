import { formatNumberEN } from "@/lib/formatters";

export const ATTENDANCE_MAX_GPS_ACCURACY_METERS = 100;

export type AttendanceLocationErrorType =
  | "permission_denied"
  | "location_unavailable"
  | "missing_attendance_radius"
  | "out_of_range"
  | "low_accuracy"
  | "unknown_error";

export type AttendanceLocationFeedback = {
  type: AttendanceLocationErrorType;
  statusLabel: string;
  title: string;
  message: string;
  distanceLabel: string | null;
  allowedRadiusLabel: string | null;
  accuracyLabel: string | null;
};

type AttendanceLocationResponseLike = {
  result?: string | null;
  rejectionReason?: string | null;
  accuracy?: number | null;
  distanceMeters?: number | null;
  allowedRadiusMeters?: number | null;
};

function finiteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function formatAttendanceDistance(value?: number | null) {
  const meters = finiteNumber(value);
  if (meters === null) return null;

  if (Math.abs(meters) >= 1000) {
    return `${formatNumberEN(meters / 1000, {
      maximumFractionDigits: 1,
    })} كم`;
  }

  return `${formatNumberEN(Math.round(meters))} م`;
}

export function formatAttendanceMeters(value?: number | null) {
  const meters = finiteNumber(value);
  if (meters === null) return null;
  return `${formatNumberEN(Math.round(meters))} م`;
}

export function buildAttendanceLocationFeedback(
  response: AttendanceLocationResponseLike
): AttendanceLocationFeedback | null {
  if (response.result !== "rejected") return null;

  const distance = finiteNumber(response.distanceMeters);
  const allowedRadius = finiteNumber(response.allowedRadiusMeters);
  const accuracy = finiteNumber(response.accuracy);
  const hasLowAccuracy =
    response.rejectionReason === "poor_accuracy" ||
    (accuracy !== null && accuracy > ATTENDANCE_MAX_GPS_ACCURACY_METERS);
  const isLocationRejection =
    response.rejectionReason === "zone_not_found" ||
    response.rejectionReason === "zone_invalid" ||
    response.rejectionReason === "outside_zone" ||
    response.rejectionReason === "poor_accuracy";
  const isMissingAttendanceRadius =
    response.rejectionReason === "zone_not_found" ||
    response.rejectionReason === "zone_invalid" ||
    (isLocationRejection && allowedRadius === null) ||
    (allowedRadius !== null && allowedRadius <= 0);
  const isOutOfRange =
    response.rejectionReason === "outside_zone" ||
    (distance !== null &&
      allowedRadius !== null &&
      allowedRadius > 0 &&
      distance > allowedRadius);

  const distanceLabel = formatAttendanceDistance(distance);
  const allowedRadiusLabel =
    allowedRadius !== null && allowedRadius > 0
      ? formatAttendanceMeters(allowedRadius)
      : null;
  const accuracyLabel = formatAttendanceMeters(accuracy);

  if (isMissingAttendanceRadius) {
    return {
      type: "missing_attendance_radius",
      statusLabel: "نطاق الحضور غير مضبوط",
      title: "لم يتم ضبط نطاق الحضور",
      message:
        "لم يتم ضبط نطاق الحضور لهذا الموظف أو الفرع. يرجى مراجعة الموارد البشرية.",
      distanceLabel,
      allowedRadiusLabel,
      accuracyLabel,
    };
  }

  if (isOutOfRange) {
    return {
      type: "out_of_range",
      statusLabel: "خارج النطاق",
      title: "خارج نطاق تسجيل الحضور",
      message: distanceLabel
        ? `موقعك الحالي يبعد ${distanceLabel} عن موقع العمل.`
        : "موقعك الحالي خارج نطاق موقع العمل.",
      distanceLabel,
      allowedRadiusLabel,
      accuracyLabel,
    };
  }

  if (hasLowAccuracy) {
    return {
      type: "low_accuracy",
      statusLabel: "دقة ضعيفة",
      title: "دقة الموقع ضعيفة",
      message: `دقة الموقع ضعيفة: ${accuracyLabel ?? "غير متوفرة"}. حاول من مكان مفتوح أو فعّل GPS عالي الدقة.`,
      distanceLabel,
      allowedRadiusLabel,
      accuracyLabel,
    };
  }

  return null;
}

export function buildGeolocationErrorFeedback(
  error: unknown
): AttendanceLocationFeedback | null {
  const geoError = error as
    | (Partial<GeolocationPositionError> & {
        attendanceLocationErrorType?: AttendanceLocationErrorType;
      })
    | null;

  if (geoError?.code === 1) {
    return {
      type: "permission_denied",
      statusLabel: "إذن الموقع مرفوض",
      title: "إذن الموقع مرفوض",
      message:
        "تم رفض إذن الوصول للموقع. فعّل إذن الموقع من إعدادات المتصفح ثم حاول مرة أخرى.",
      distanceLabel: null,
      allowedRadiusLabel: null,
      accuracyLabel: null,
    };
  }

  if (
    geoError?.code === 2 ||
    geoError?.code === 3 ||
    geoError?.attendanceLocationErrorType === "location_unavailable"
  ) {
    return {
      type: "location_unavailable",
      statusLabel: "تعذر تحديد الموقع",
      title: "تعذر الحصول على موقعك",
      message:
        "تعذر الحصول على موقعك. تأكد من تفعيل خدمة الموقع ومنح الإذن للمتصفح.",
      distanceLabel: null,
      allowedRadiusLabel: null,
      accuracyLabel: null,
    };
  }

  return null;
}
