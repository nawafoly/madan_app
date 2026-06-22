import { useState } from "react";
import {
  AlertCircle,
  Clock3,
  LogIn,
  LogOut,
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
  isGeolocationPermissionDenied,
  submitEmployeeAttendance,
  type AttendanceResponse,
  type AttendanceType,
} from "@/lib/attendance";
import { cn } from "@/lib/utils";

type EmployeeAttendanceCardProps = {
  employeeId?: string | null;
};

function formatMeters(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${Math.round(value)} م`;
}

export default function EmployeeAttendanceCard({
  employeeId,
}: EmployeeAttendanceCardProps) {
  const [pendingType, setPendingType] = useState<AttendanceType | null>(null);
  const [lastResponse, setLastResponse] = useState<AttendanceResponse | null>(
    null
  );
  const [showLocationPermissionHelp, setShowLocationPermissionHelp] =
    useState(false);

  const handleAttendance = async (type: AttendanceType) => {
    if (pendingType) return;

    setPendingType(type);
    try {
      const response = await submitEmployeeAttendance({
        employeeId: employeeId || null,
        type,
      });
      setLastResponse(response);
      setShowLocationPermissionHelp(false);

      if (response.result === "allowed") {
        toast.success(getAttendanceSuccessLabel(type));
      } else {
        toast.error(getAttendanceRejectionLabel(response.rejectionReason));
      }
    } catch (error) {
      console.error("employee_attendance_submit_failed", error);
      setShowLocationPermissionHelp(isGeolocationPermissionDenied(error));
      toast.error(getAttendanceSubmitErrorMessage(error));
    } finally {
      setPendingType(null);
    }
  };

  const lastDistance = formatMeters(lastResponse?.distanceMeters);
  const lastAccuracy = formatMeters(lastResponse?.accuracy);

  return (
    <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
            <Clock3 className="h-4 w-4" />
            الحضور والانصراف
          </div>
          <Badge
            variant="outline"
            className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
          >
            GPS
          </Badge>
        </div>
        <CardTitle className="text-xl font-semibold text-slate-950">
          تسجيل الدوام
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            className="h-12 rounded-2xl bg-emerald-600 px-5 text-white hover:bg-emerald-700"
            disabled={!!pendingType}
            onClick={() => void handleAttendance("check_in")}
          >
            {pendingType === "check_in" ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="ml-2 h-4 w-4" />
            )}
            تسجيل حضور
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-2xl border-slate-200 bg-slate-950 px-5 text-white hover:bg-slate-900 hover:text-white"
            disabled={!!pendingType}
            onClick={() => void handleAttendance("check_out")}
          >
            {pendingType === "check_out" ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="ml-2 h-4 w-4" />
            )}
            تسجيل انصراف
          </Button>
        </div>

        {showLocationPermissionHelp ? (
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900">
            <div className="flex items-start gap-2 font-semibold">
              <AlertCircle className="mt-1 h-4 w-4 shrink-0" />
              <span>صلاحية الموقع مرفوضة من المتصفح</span>
            </div>
            <p className="mt-2 text-xs leading-6 text-amber-800">
              افتح أيقونة القفل بجانب رابط الموقع، ثم إعدادات الموقع، واجعل
              الموقع على السماح. بعد ذلك حدّث الصفحة وحاول تسجيل الدوام مرة
              أخرى.
            </p>
          </div>
        ) : null}

        <div
          className={cn(
            "rounded-[22px] border px-4 py-4 text-sm leading-7",
            lastResponse?.result === "allowed"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : lastResponse?.result === "rejected"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          {lastResponse ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                <MapPin className="h-4 w-4" />
                <span>
                  {lastResponse.result === "allowed"
                    ? getAttendanceSuccessLabel(lastResponse.type)
                    : getAttendanceRejectionLabel(
                        lastResponse.rejectionReason
                      )}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <Badge variant="outline" className="rounded-full bg-white/75">
                  {getAttendanceTypeLabel(lastResponse.type)}
                </Badge>
                {lastAccuracy ? (
                  <Badge variant="outline" className="rounded-full bg-white/75">
                    الدقة: {lastAccuracy}
                  </Badge>
                ) : null}
                {lastDistance ? (
                  <Badge variant="outline" className="rounded-full bg-white/75">
                    المسافة: {lastDistance}
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : (
            "جاهز لتسجيل عملية الدوام."
          )}
        </div>
      </CardContent>
    </Card>
  );
}
