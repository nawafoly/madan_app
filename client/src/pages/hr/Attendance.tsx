import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Download,
  ExternalLink,
  Filter,
  LogIn,
  LogOut,
  Navigation,
  RefreshCw,
  SearchX,
  ShieldX,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  fetchAttendanceRecords,
  type AttendanceRecord,
  type AttendanceRecordsFilters,
  type AttendanceRecordsResponse,
} from "@/lib/attendanceRecords";
import { fetchEmployeeDirectoryFromWorker } from "@/lib/employeeDirectoryWorker";
import { languageDir, tr } from "@/lib/i18n";

const PAGE_SIZE = 50;

type FilterState = {
  employeeUid: string;
  fromDate: string;
  toDate: string;
  type: string;
  result: string;
  deviceChanged: boolean;
};

const EMPTY_FILTERS: FilterState = {
  employeeUid: "all",
  fromDate: "",
  toDate: "",
  type: "all",
  result: "all",
  deviceChanged: false,
};

function toRequestFilters(filters: FilterState): AttendanceRecordsFilters {
  return {
    employeeUid:
      filters.employeeUid === "all" ? undefined : filters.employeeUid,
    fromDate: filters.fromDate || undefined,
    toDate: filters.toDate || undefined,
    type:
      filters.type === "check_in" || filters.type === "check_out"
        ? filters.type
        : undefined,
    result:
      filters.result === "allowed" || filters.result === "rejected"
        ? filters.result
        : undefined,
    deviceChanged: filters.deviceChanged ? true : undefined,
  };
}

function formatDateTime(value: string, language: "ar" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(date);
}

function rejectionLabel(reason: string | null, language: "ar" | "en") {
  const labels: Record<string, { ar: string; en: string }> = {
    poor_accuracy: { ar: "دقة الموقع ضعيفة", en: "Poor GPS accuracy" },
    outside_zone: { ar: "خارج النطاق", en: "Outside work zone" },
    duplicate_check_in: { ar: "حضور مكرر", en: "Duplicate check-in" },
    not_checked_in: { ar: "لا يوجد حضور مفتوح", en: "No open check-in" },
    zone_not_found: { ar: "النطاق غير موجود", en: "Zone not found" },
    zone_invalid: { ar: "النطاق غير صالح", en: "Invalid zone" },
  };
  return reason ? labels[reason]?.[language] || reason : "-";
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv(records: AttendanceRecord[]) {
  const headers = [
    "employee_name",
    "employee_uid",
    "type",
    "result",
    "server_time",
    "zone_name",
    "distance_meters",
    "gps_accuracy",
    "latitude",
    "longitude",
    "device_id",
    "device_changed",
    "previous_device_id",
    "rejection_reason",
  ];
  const rows = records.map(record => [
    record.employeeName || "",
    record.employeeUid,
    record.type,
    record.result,
    record.serverTime,
    record.zoneName || "",
    record.distanceMeters ?? "",
    record.location.accuracy,
    record.location.lat,
    record.location.lng,
    record.deviceInfo.deviceId || "",
    Boolean(record.deviceInfo.deviceChanged),
    record.deviceInfo.previousDeviceId || "",
    record.rejectionReason || "",
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(csvCell).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function HrAttendancePage() {
  const { language } = useLanguage();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AttendanceRecordsResponse | null>(null);
  const [employees, setEmployees] = useState<
    Array<{ uid: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  const loadRecords = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetchAttendanceRecords({
        ...toRequestFilters(appliedFilters),
        page,
        limit: PAGE_SIZE,
      });
      if (requestId !== requestIdRef.current) return;
      setData(response);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      console.error("hr_attendance_records_failed", loadError);
      const message =
        loadError instanceof Error
          ? loadError.message
          : tr(
              language,
              "تعذر تحميل سجلات الحضور.",
              "Could not load attendance records."
            );
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [appliedFilters, language, page]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    let active = true;
    fetchEmployeeDirectoryFromWorker()
      .then(items => {
        if (active) {
          setEmployees(items.map(item => ({ uid: item.uid, name: item.name })));
        }
      })
      .catch(directoryError => {
        console.error(
          "hr_attendance_employee_directory_failed",
          directoryError
        );
        if (active) setEmployees([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const employeeOptions = useMemo(() => {
    const options = new Map(
      employees.map(employee => [employee.uid, employee.name])
    );
    for (const record of data?.records || []) {
      if (!options.has(record.employeeUid)) {
        options.set(
          record.employeeUid,
          record.employeeName || record.employeeUid
        );
      }
    }
    return Array.from(options, ([uid, name]) => ({ uid, name })).sort(
      (left, right) =>
        left.name.localeCompare(right.name, language === "ar" ? "ar" : "en")
    );
  }, [data?.records, employees, language]);

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));
  const summaryCards = [
    {
      label: tr(language, "حضور اليوم", "Today's check-ins"),
      value: data?.summary.checkIns ?? 0,
      icon: LogIn,
      tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
    },
    {
      label: tr(language, "انصراف اليوم", "Today's check-outs"),
      value: data?.summary.checkOuts ?? 0,
      icon: LogOut,
      tone: "text-sky-700 bg-sky-50 border-sky-200",
    },
    {
      label: tr(language, "المرفوض اليوم", "Rejected today"),
      value: data?.summary.rejected ?? 0,
      icon: ShieldX,
      tone: "text-rose-700 bg-rose-50 border-rose-200",
    },
    {
      label: tr(language, "أجهزة جديدة اليوم", "New devices today"),
      value: data?.summary.newDevices ?? 0,
      icon: Smartphone,
      tone: "text-amber-700 bg-amber-50 border-amber-200",
    },
    {
      label: tr(language, "متوسط دقة GPS", "Average GPS accuracy"),
      value:
        data?.summary.averageAccuracy == null
          ? "-"
          : `${Math.round(data.summary.averageAccuracy)} m`,
      icon: Navigation,
      tone: "text-violet-700 bg-violet-50 border-violet-200",
    },
  ];

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  const handleResetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const collected: AttendanceRecord[] = [];
      let cursor: string | undefined;
      do {
        const response = await fetchAttendanceRecords({
          ...toRequestFilters(appliedFilters),
          limit: 200,
          cursor,
        });
        collected.push(...response.records);
        cursor = response.nextCursor || undefined;
      } while (cursor && collected.length < 10000);
      exportCsv(collected);
      toast.success(
        tr(
          language,
          `تم تصدير ${collected.length} سجل.`,
          `Exported ${collected.length} records.`
        )
      );
    } catch (exportError) {
      console.error("hr_attendance_export_failed", exportError);
      toast.error(
        tr(language, "تعذر تصدير السجلات.", "Could not export records.")
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout area="hr">
      <main
        dir={languageDir(language)}
        className="min-h-screen space-y-6 bg-slate-50 px-2 py-3 sm:px-4"
      >
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CalendarCheck2 className="h-4 w-4" />
              {tr(language, "الموارد البشرية", "Human Resources")}
            </div>
            <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">
              {tr(language, "الحضور والانصراف", "Attendance")}
            </h1>
            <p className="text-sm text-slate-600">
              {tr(
                language,
                `${data?.total || 0} سجل مطابق`,
                `${data?.total || 0} matching records`
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void loadRecords()}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              {tr(language, "تحديث", "Refresh")}
            </Button>
            <Button
              onClick={() => void handleExport()}
              disabled={exporting || !data?.total}
            >
              <Download className="h-4 w-4" />
              {tr(language, "تصدير CSV", "Export CSV")}
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map(card => (
            <Card
              key={card.label}
              className="rounded-lg border-slate-200 shadow-none"
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${card.tone}`}
                >
                  <card.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-semibold text-slate-950">
                    {card.value}
                  </div>
                  <div className="text-xs leading-5 text-slate-500">
                    {card.label}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="border-y border-slate-200 bg-white py-4">
          <div className="grid gap-4 px-1 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-2 xl:col-span-2">
              <Label>{tr(language, "الموظف", "Employee")}</Label>
              <Select
                value={filters.employeeUid}
                onValueChange={value =>
                  setFilters(current => ({ ...current, employeeUid: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {tr(language, "جميع الموظفين", "All employees")}
                  </SelectItem>
                  {employeeOptions.map(employee => (
                    <SelectItem key={employee.uid} value={employee.uid}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendance-from">
                {tr(language, "من تاريخ", "From")}
              </Label>
              <Input
                id="attendance-from"
                type="date"
                value={filters.fromDate}
                onChange={event =>
                  setFilters(current => ({
                    ...current,
                    fromDate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendance-to">
                {tr(language, "إلى تاريخ", "To")}
              </Label>
              <Input
                id="attendance-to"
                type="date"
                value={filters.toDate}
                onChange={event =>
                  setFilters(current => ({
                    ...current,
                    toDate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{tr(language, "نوع العملية", "Type")}</Label>
              <Select
                value={filters.type}
                onValueChange={value =>
                  setFilters(current => ({ ...current, type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {tr(language, "الكل", "All")}
                  </SelectItem>
                  <SelectItem value="check_in">
                    {tr(language, "حضور", "Check-in")}
                  </SelectItem>
                  <SelectItem value="check_out">
                    {tr(language, "انصراف", "Check-out")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{tr(language, "النتيجة", "Result")}</Label>
              <Select
                value={filters.result}
                onValueChange={value =>
                  setFilters(current => ({ ...current, result: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {tr(language, "الكل", "All")}
                  </SelectItem>
                  <SelectItem value="allowed">
                    {tr(language, "مسموح", "Allowed")}
                  </SelectItem>
                  <SelectItem value="rejected">
                    {tr(language, "مرفوض", "Rejected")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={filters.deviceChanged}
                onCheckedChange={checked =>
                  setFilters(current => ({
                    ...current,
                    deviceChanged: checked === true,
                  }))
                }
              />
              {tr(language, "جهاز جديد فقط", "New device only")}
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleResetFilters}>
                {tr(language, "مسح", "Clear")}
              </Button>
              <Button onClick={handleApplyFilters}>
                <Filter className="h-4 w-4" />
                {tr(language, "تطبيق", "Apply")}
              </Button>
            </div>
          </div>
        </section>

        <Card className="overflow-hidden rounded-lg border-slate-200 shadow-none">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
                <AlertTriangle className="h-8 w-8 text-rose-600" />
                <p className="text-sm text-slate-700">{error}</p>
                <Button variant="outline" onClick={() => void loadRecords()}>
                  {tr(language, "إعادة المحاولة", "Retry")}
                </Button>
              </div>
            ) : !data?.records.length ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center text-slate-500">
                <SearchX className="h-8 w-8" />
                <p className="text-sm">
                  {tr(
                    language,
                    "لا توجد سجلات مطابقة.",
                    "No matching records."
                  )}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[1500px]">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>
                        {tr(language, "الموظف", "Employee")}
                      </TableHead>
                      <TableHead>{tr(language, "العملية", "Type")}</TableHead>
                      <TableHead>{tr(language, "النتيجة", "Result")}</TableHead>
                      <TableHead>
                        {tr(language, "التاريخ والوقت", "Date and time")}
                      </TableHead>
                      <TableHead>{tr(language, "النطاق", "Zone")}</TableHead>
                      <TableHead>
                        {tr(language, "المسافة", "Distance")}
                      </TableHead>
                      <TableHead>{tr(language, "GPS", "GPS")}</TableHead>
                      <TableHead>
                        {tr(language, "الموقع", "Location")}
                      </TableHead>
                      <TableHead>{tr(language, "الجهاز", "Device")}</TableHead>
                      <TableHead>
                        {tr(language, "سبب الرفض", "Rejection")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.records.map(record => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div className="font-medium text-slate-950">
                            {record.employeeName || record.employeeUid}
                          </div>
                          <div
                            className="mt-1 max-w-44 truncate font-mono text-[11px] text-slate-500"
                            title={record.employeeUid}
                          >
                            {record.employeeUid}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {record.type === "check_in"
                              ? tr(language, "حضور", "Check-in")
                              : tr(language, "انصراف", "Check-out")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              record.result === "allowed"
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                : "bg-rose-100 text-rose-800 hover:bg-rose-100"
                            }
                          >
                            {record.result === "allowed" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <ShieldX className="h-3.5 w-3.5" />
                            )}
                            {record.result === "allowed"
                              ? tr(language, "مسموح", "Allowed")
                              : tr(language, "مرفوض", "Rejected")}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(record.serverTime, language)}
                        </TableCell>
                        <TableCell>{record.zoneName || "-"}</TableCell>
                        <TableCell>
                          {record.distanceMeters == null
                            ? "-"
                            : `${record.distanceMeters} m`}
                        </TableCell>
                        <TableCell>
                          {Math.round(record.location.accuracy)} m
                        </TableCell>
                        <TableCell>
                          <div dir="ltr" className="font-mono text-xs">
                            {record.location.lat.toFixed(5)},{" "}
                            {record.location.lng.toFixed(5)}
                          </div>
                          <Button
                            variant="link"
                            className="h-auto p-0 text-xs"
                            asChild
                          >
                            <a
                              href={`https://www.google.com/maps?q=${record.location.lat},${record.location.lng}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {tr(
                                language,
                                "فتح في Google Maps",
                                "Open in Google Maps"
                              )}
                            </a>
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-52 break-all font-mono text-xs">
                            {record.deviceInfo.deviceId || "-"}
                          </div>
                          {record.deviceInfo.deviceChanged ? (
                            <div className="mt-2 space-y-1">
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                                <Smartphone className="h-3.5 w-3.5" />
                                {tr(language, "جهاز جديد", "New device")}
                              </Badge>
                              <div className="max-w-52 break-all font-mono text-[11px] text-slate-500">
                                {record.deviceInfo.previousDeviceId || "-"}
                              </div>
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-52 text-sm text-slate-600">
                          {rejectionLabel(record.rejectionReason, language)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <footer className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <span className="text-sm text-slate-500">
            {tr(
              language,
              `صفحة ${page} من ${totalPages}`,
              `Page ${page} of ${totalPages}`
            )}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage(current => Math.max(1, current - 1))}
            >
              {tr(language, "السابق", "Previous")}
            </Button>
            <Button
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(current => current + 1)}
            >
              {tr(language, "التالي", "Next")}
            </Button>
          </div>
        </footer>
      </main>
    </DashboardLayout>
  );
}
