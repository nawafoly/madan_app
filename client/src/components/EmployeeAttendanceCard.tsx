import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Fingerprint,
  Loader2,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAttendanceRejectionLabel,
  getAttendanceSubmitErrorMessage,
  getAttendanceSuccessLabel,
  getAttendanceTypeLabel,
  isGeolocationPositionError,
  isGeolocationPermissionDenied,
  logAttendanceDebug,
  submitEmployeeAttendance,
  type AttendanceResponse,
  type AttendanceType,
} from "@/lib/attendance";
import {
  fetchAttendanceRecords,
  type AttendanceRecord,
} from "@/lib/attendanceRecords";
import {
  buildAttendanceLocationFeedback,
  buildGeolocationErrorFeedback,
  formatAttendanceDistance,
  formatAttendanceMeters,
  type AttendanceLocationFeedback,
} from "@/lib/attendanceLocationFeedback";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";

type EmployeeAttendanceCardProps = {
  employeeId?: string | null;
  employeeUid?: string | null;
  onRecorded?: (response: AttendanceResponse) => void;
  className?: string;
};

const RIYADH_TIME_ZONE = "Asia/Riyadh";

function getRiyadhTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDisplayTime(value?: string | null) {
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

function getTodayAttendanceState(records: AttendanceRecord[], language: "ar" | "en") {
  const sorted = [...records].sort(
    (left, right) =>
      Date.parse(left.serverTime || "") - Date.parse(right.serverTime || "")
  );
  const checkIn = sorted.find(record => record.type === "check_in") || null;
  const checkOut =
    [...sorted].reverse().find(record => record.type === "check_out") || null;
  const isCheckedIn = Boolean(checkIn && !checkOut);
  const isComplete = Boolean(checkIn && checkOut);

  return {
    checkIn,
    checkOut,
    nextType: isComplete ? null : isCheckedIn ? "check_out" : "check_in",
    statusLabel: isComplete
      ? tr(language, "تم تسجيل حضور وانصراف اليوم", "Today's check-in and check-out are recorded")
      : isCheckedIn
        ? tr(language, "تم تسجيل الحضور", "Check-in recorded")
        : tr(language, "لم يتم تسجيل الحضور", "No check-in recorded"),
    actionLabel: isComplete
      ? tr(language, "تم اكتمال الدوام", "Shift Complete")
      : isCheckedIn
        ? tr(language, "تسجيل انصراف", "Check Out")
        : tr(language, "تسجيل حضور", "Check In"),
  } satisfies {
    checkIn: AttendanceRecord | null;
    checkOut: AttendanceRecord | null;
    nextType: AttendanceType | null;
    statusLabel: string;
    actionLabel: string;
  };
}

function summarizeAttendanceRecordForDebug(record: AttendanceRecord | null) {
  if (!record) return null;
  return {
    id: record.id,
    type: record.type,
    result: record.result,
    rejectionReason: record.rejectionReason || null,
    serverTime: record.serverTime || null,
    zoneId: record.zoneId || null,
    distanceMeters: record.distanceMeters ?? null,
    accuracy: record.accuracy ?? null,
  };
}

export default function EmployeeAttendanceCard({
  employeeId,
  employeeUid,
  onRecorded,
  className,
}: EmployeeAttendanceCardProps) {
  const { language } = useLanguage();
  const [pendingType, setPendingType] = useState<AttendanceType | null>(null);
  const [lastResponse, setLastResponse] = useState<AttendanceResponse | null>(
    null
  );
  const [lastLocationFeedback, setLastLocationFeedback] =
    useState<AttendanceLocationFeedback | null>(null);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [loadingToday, setLoadingToday] = useState(false);
  const [showLocationPermissionHelp, setShowLocationPermissionHelp] =
    useState(false);

  const [todayKey, setTodayKey] = useState(() => getRiyadhTodayKey());
  const todayState = useMemo(
    () => getTodayAttendanceState(todayRecords, language),
    [language, todayRecords]
  );

  const loadTodayRecords = useCallback(async () => {
    const uid = String(employeeUid || employeeId || "").trim();
    if (!uid) {
      setTodayRecords([]);
      return;
    }

    setLoadingToday(true);
    try {
      const response = await fetchAttendanceRecords({
        employeeUid: uid,
        fromDate: todayKey,
        toDate: todayKey,
        result: "allowed",
        limit: 20,
      });
      setTodayRecords(response.records);
    } catch (error) {
      console.error("employee_today_attendance_failed", error);
      setTodayRecords([]);
    } finally {
      setLoadingToday(false);
    }
  }, [employeeId, employeeUid, todayKey]);

  useEffect(() => {
    void loadTodayRecords();
  }, [loadTodayRecords]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTodayKey(current => {
        const next = getRiyadhTodayKey();
        return next === current ? current : next;
      });
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const handleAttendance = async () => {
    const type = todayState.nextType;
    logAttendanceDebug("button-pressed", {
      employeeId: employeeId || null,
      employeeUid: employeeUid || null,
      todayKey,
      nextType: type,
      pendingType,
      todayRecordsCount: todayRecords.length,
      todayState: {
        checkIn: summarizeAttendanceRecordForDebug(todayState.checkIn),
        checkOut: summarizeAttendanceRecordForDebug(todayState.checkOut),
        nextType: todayState.nextType,
        statusLabel: todayState.statusLabel,
      },
    });

    if (pendingType || !type) {
      logAttendanceDebug("button-ignored", {
        employeeId: employeeId || null,
        employeeUid: employeeUid || null,
        reason: pendingType ? "request_already_pending" : "no_next_type",
        pendingType,
        nextType: type,
      });
      return;
    }

    if (
      type === "check_out" &&
      typeof window !== "undefined" &&
      !window.confirm(
        tr(
          language,
          "تأكيد تسجيل الانصراف؟\n\nلن يتم تسجيل الانصراف إلا بعد موافقتك.",
          "Confirm check-out?\n\nCheck-out will only be recorded after your approval."
        )
      )
    ) {
      logAttendanceDebug("button-checkout-cancelled", {
        employeeId: employeeId || null,
        employeeUid: employeeUid || null,
        type,
      });
      return;
    }

    setPendingType(type);
    try {
      const response = await submitEmployeeAttendance({
        employeeId: employeeId || null,
        type,
      });
      const locationFeedback = buildAttendanceLocationFeedback(response);
      setLastResponse(response);
      setLastLocationFeedback(locationFeedback);
      logAttendanceDebug("button-response-applied", {
        employeeId: employeeId || null,
        employeeUid: employeeUid || null,
        response,
        locationFeedback,
      });
      onRecorded?.(response);
      setShowLocationPermissionHelp(false);

      if (response.result === "allowed") {
        toast.success(getAttendanceSuccessLabel(response.type));
        await loadTodayRecords();
      } else {
        toast.error(
          locationFeedback?.message ||
            getAttendanceRejectionLabel(response.rejectionReason)
        );
        await loadTodayRecords();
      }
    } catch (error) {
      const locationFeedback = buildGeolocationErrorFeedback(error);
      setLastLocationFeedback(locationFeedback);
      if (locationFeedback) setLastResponse(null);
      logAttendanceDebug("button-error", {
        employeeId: employeeId || null,
        employeeUid: employeeUid || null,
        type,
        error,
        locationFeedback,
      });
      if (!isGeolocationPositionError(error)) {
        console.error("employee_attendance_submit_failed", error);
      }
      setShowLocationPermissionHelp(isGeolocationPermissionDenied(error));
      toast.error(
        locationFeedback?.message || getAttendanceSubmitErrorMessage(error)
      );
    } finally {
      setPendingType(null);
    }
  };

  const lastDistance = lastLocationFeedback
    ? lastLocationFeedback.distanceLabel
    : formatAttendanceDistance(lastResponse?.distanceMeters);
  const lastAccuracy = lastLocationFeedback
    ? lastLocationFeedback.accuracyLabel
    : formatAttendanceMeters(lastResponse?.accuracy);
  const lastAllowedRadius = lastLocationFeedback
    ? lastLocationFeedback.allowedRadiusLabel
    : formatAttendanceMeters(lastResponse?.allowedRadiusMeters);
  const statusTitle = lastResponse
    ? lastResponse.result === "allowed"
      ? getAttendanceSuccessLabel(lastResponse.type)
      : lastLocationFeedback?.title ||
        getAttendanceRejectionLabel(lastResponse.rejectionReason)
    : lastLocationFeedback?.title || null;
  const statusMessage =
    lastLocationFeedback?.message &&
    lastLocationFeedback.message !== statusTitle
      ? lastLocationFeedback.message
      : null;
  const hasLocationFailure = Boolean(lastLocationFeedback);
  const showRetryLocationButton = Boolean(hasLocationFailure && todayState.nextType);
  const checkInTime = formatDisplayTime(todayState.checkIn?.serverTime);
  const checkOutTime = formatDisplayTime(todayState.checkOut?.serverTime);
  const attendanceDone = Boolean(todayState.checkIn);
  const checkoutDone = Boolean(todayState.checkOut);
  const nextActionIsCheckout = todayState.nextType === "check_out";

  return (
    <Card
      dir={languageDir(language)}
      className={cn(
        "rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]",
        className
      )}
    >
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
            <Clock3 className="h-4 w-4" />
            {tr(language, "الحضور والانصراف", "Attendance")}
          </div>
          <Badge
            variant="outline"
            className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
          >
            GPS
          </Badge>
        </div>
        <CardTitle className="text-xl font-semibold text-slate-950">
          {tr(language, "تسجيل الدوام", "Attendance Log")}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 px-3 py-4 sm:px-5">
          <div className="min-w-0 text-center">
            <div className="text-sm font-semibold text-slate-500">
              {tr(language, "الحضور", "Check-in")}
            </div>
            <div className="mt-2 text-xl font-bold text-emerald-600">
              {checkInTime}
            </div>
            <div
              className={cn(
                "mx-auto mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold",
                attendanceDone
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-white text-slate-400"
              )}
            >
              {attendanceDone ? <CheckCircle2 className="h-4 w-4" /> : null}
              {attendanceDone
                ? tr(language, "تم الحضور", "Checked in")
                : tr(language, "لم يتم الحضور", "Not checked in")}
            </div>
          </div>

          <div className="flex min-w-[104px] flex-col items-center">
            <button
              type="button"
              className={cn(
                "flex h-24 w-24 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.55)] transition",
                nextActionIsCheckout
                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
                  : todayState.nextType
                    ? "hover:border-emerald-200 hover:text-emerald-700"
                    : "text-emerald-700",
                pendingType && "cursor-wait"
              )}
              disabled={!!pendingType || loadingToday || !todayState.nextType}
              onClick={() => void handleAttendance()}
              aria-label={todayState.actionLabel}
            >
              {pendingType || loadingToday ? (
                <Loader2 className="h-10 w-10 animate-spin" />
              ) : (
                <Fingerprint className="h-11 w-11 stroke-[1.9]" />
              )}
            </button>
            <div
              className={cn(
                "mt-3 text-center text-sm font-semibold",
                nextActionIsCheckout ? "text-rose-700" : "text-slate-600"
              )}
            >
              {todayState.actionLabel}
            </div>
          </div>

          <div className="min-w-0 text-center">
            <div className="text-sm font-semibold text-slate-500">
              {tr(language, "الانصراف", "Check-out")}
            </div>
            <div className="mt-2 text-xl font-bold text-slate-950">
              {checkOutTime}
            </div>
            <div
              className={cn(
                "mx-auto mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold",
                checkoutDone
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-white text-slate-400"
              )}
            >
              {checkoutDone ? <CheckCircle2 className="h-4 w-4" /> : null}
              {checkoutDone
                ? tr(language, "تم الانصراف", "Checked out")
                : tr(language, "لم يتم الانصراف", "Not checked out")}
            </div>
          </div>
        </div>

        <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-600">
          {loadingToday
            ? tr(language, "جاري تحديث حالة اليوم...", "Updating today's status...")
            : todayState.statusLabel}
        </div>

        {todayState.checkIn || todayState.checkOut ? (
          <div className="grid gap-3 rounded-[22px] border border-slate-200 bg-white px-4 py-4 text-sm shadow-sm shadow-slate-100 sm:grid-cols-2">
            <div className="rounded-[18px] border border-emerald-100 bg-emerald-50/70 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-emerald-800">
                  {tr(language, "سجل الحضور", "Check-in Record")}
                </span>
                <span dir="ltr" className="font-bold text-emerald-700">
                  {checkInTime}
                </span>
              </div>
              <div className="mt-1 text-xs text-emerald-700/80">
                {todayState.checkIn
                  ? tr(language, "موجود في سجلات اليوم", "Found in today's records")
                  : tr(language, "لا يوجد سجل حضور", "No check-in record")}
              </div>
            </div>

            <div className="rounded-[18px] border border-rose-100 bg-rose-50/70 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-rose-800">
                  {tr(language, "سجل الانصراف", "Check-out Record")}
                </span>
                <span dir="ltr" className="font-bold text-rose-700">
                  {checkOutTime}
                </span>
              </div>
              <div className="mt-1 text-xs text-rose-700/80">
                {todayState.checkOut
                  ? tr(language, "موجود في سجلات اليوم", "Found in today's records")
                  : tr(language, "لا يوجد سجل انصراف", "No check-out record")}
              </div>
            </div>
          </div>
        ) : null}

        {showLocationPermissionHelp ? (
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900">
            <div className="flex items-start gap-2 font-semibold">
              <AlertCircle className="mt-1 h-4 w-4 shrink-0" />
              <span>
                {tr(language, "صلاحية الموقع مرفوضة من المتصفح", "Location permission is blocked")}
              </span>
            </div>
            <p className="mt-2 text-xs leading-6 text-amber-800">
              {tr(
                language,
                "افتح أيقونة القفل بجانب رابط الموقع، ثم إعدادات الموقع، واجعل الموقع على السماح. بعد ذلك حدث الصفحة وحاول تسجيل الدوام مرة أخرى.",
                "Open the lock icon next to the site URL, go to site settings, and allow location access. Then refresh the page and try again."
              )}
            </p>
          </div>
        ) : null}

        <div
          className={cn(
            "rounded-[22px] border px-4 py-4 text-sm leading-7",
            lastResponse?.result === "allowed"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : lastResponse?.result === "rejected" || hasLocationFailure
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          {lastResponse || hasLocationFailure ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                <MapPin className="h-4 w-4" />
                <span>{statusTitle}</span>
              </div>
              {statusMessage ? (
                <p className="text-sm font-medium leading-7 text-rose-700">
                  {statusMessage}
                </p>
              ) : null}

              {hasLocationFailure ? (
                <div className="grid gap-2 text-xs font-semibold sm:grid-cols-2">
                  <Badge variant="outline" className="rounded-full bg-white/75">
                    {tr(language, "الحالة:", "Status:")} {lastLocationFeedback?.statusLabel}
                  </Badge>
                  {lastDistance ? (
                    <Badge variant="outline" className="rounded-full bg-white/75">
                      {tr(language, "المسافة:", "Distance:")} {lastDistance}
                    </Badge>
                  ) : null}
                  {lastAllowedRadius ? (
                    <Badge variant="outline" className="rounded-full bg-white/75">
                      {tr(language, "النطاق المسموح:", "Allowed Radius:")} {lastAllowedRadius}
                    </Badge>
                  ) : null}
                  {lastAccuracy ? (
                    <Badge variant="outline" className="rounded-full bg-white/75">
                      {tr(language, "دقة GPS:", "GPS Accuracy:")} {lastAccuracy}
                    </Badge>
                  ) : null}
                </div>
              ) : lastResponse ? (
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <Badge variant="outline" className="rounded-full bg-white/75">
                    {getAttendanceTypeLabel(lastResponse.type)}
                  </Badge>
                  {lastAccuracy ? (
                    <Badge variant="outline" className="rounded-full bg-white/75">
                      {tr(language, "الدقة:", "Accuracy:")} {lastAccuracy}
                    </Badge>
                  ) : null}
                  {lastDistance ? (
                    <Badge variant="outline" className="rounded-full bg-white/75">
                      {tr(language, "المسافة:", "Distance:")} {lastDistance}
                    </Badge>
                  ) : null}
                </div>
              ) : null}

              {showRetryLocationButton ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full border-rose-200 bg-white/85 text-rose-700 hover:bg-white hover:text-rose-800"
                  disabled={!!pendingType || loadingToday}
                  onClick={() => void handleAttendance()}
                >
                  {pendingType ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {tr(language, "إعادة فحص الموقع", "Recheck Location")}
                </Button>
              ) : null}
            </div>
          ) : (
            tr(
              language,
              "اضغط البصمة لتسجيل الحضور، والضغطة التالية في نفس اليوم تسجل الانصراف تلقائيًا.",
              "Tap the fingerprint to check in. The next tap on the same day records check-out automatically."
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
