import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
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

function shortDeviceId(value: string | null | undefined) {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `...${value.slice(-8)}`;
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
  const [visibleDeviceIds, setVisibleDeviceIds] = useState<Set<string>>(
    () => new Set()
  );
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
      accent: "bg-emerald-500",
    },
    {
      label: tr(language, "انصراف اليوم", "Today's check-outs"),
      value: data?.summary.checkOuts ?? 0,
      icon: LogOut,
      tone: "text-sky-700 bg-sky-50 border-sky-200",
      accent: "bg-sky-500",
    },
    {
      label: tr(language, "المرفوض اليوم", "Rejected today"),
      value: data?.summary.rejected ?? 0,
      icon: ShieldX,
      tone: "text-rose-700 bg-rose-50 border-rose-200",
      accent: "bg-rose-500",
    },
    {
      label: tr(language, "أجهزة جديدة اليوم", "New devices today"),
      value: data?.summary.newDevices ?? 0,
      icon: Smartphone,
      tone: "text-amber-700 bg-amber-50 border-amber-200",
      accent: "bg-amber-500",
    },
    {
      label: tr(language, "متوسط دقة GPS", "Average GPS accuracy"),
      value:
        data?.summary.averageAccuracy == null
          ? "-"
          : `${Math.round(data.summary.averageAccuracy)} m`,
      icon: Navigation,
      tone: "text-violet-700 bg-violet-50 border-violet-200",
      accent: "bg-violet-500",
    },
  ];

  const activeFiltersCount = [
    appliedFilters.employeeUid !== EMPTY_FILTERS.employeeUid,
    Boolean(appliedFilters.fromDate),
    Boolean(appliedFilters.toDate),
    appliedFilters.type !== EMPTY_FILTERS.type,
    appliedFilters.result !== EMPTY_FILTERS.result,
    appliedFilters.deviceChanged,
  ].filter(Boolean).length;

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  const handleResetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const toggleDeviceVisibility = (key: string) => {
    setVisibleDeviceIds(current => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
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
        className="min-h-screen bg-[#f6f8fb] px-3 py-4 text-slate-950 sm:px-5 lg:px-7"
      >
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5">
          <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CalendarCheck2 className="h-4 w-4" />
                {tr(language, "الموارد البشرية", "Human Resources")}
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
                  {tr(language, "الحضور والانصراف", "Attendance")}
                </h1>
                <p className="text-sm text-slate-500">
                  {tr(
                    language,
                    `${data?.total || 0} سجل مطابق`,
                    `${data?.total || 0} matching records`
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-10 rounded-full border-slate-200 bg-white px-4 shadow-sm hover:bg-slate-50"
                onClick={() => void loadRecords()}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                {tr(language, "تحديث", "Refresh")}
              </Button>
              <Button
                className="h-10 rounded-full bg-slate-950 px-4 shadow-sm hover:bg-slate-800"
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
                className="overflow-hidden rounded-xl border-slate-200/80 bg-white shadow-sm shadow-slate-200/60"
              >
                <CardContent className="relative flex min-h-28 items-center justify-between gap-4 p-5">
                  <span
                    className={`absolute inset-y-0 start-0 w-1 ${card.accent}`}
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="text-2xl font-semibold leading-none text-slate-950">
                      {card.value}
                    </div>
                    <div className="text-xs font-medium leading-5 text-slate-500">
                      {card.label}
                    </div>
                  </div>
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${card.tone}`}
                  >
                    <card.icon className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60">
            <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">
                  {tr(language, "تصفية السجلات", "Filter records")}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {tr(
                    language,
                    activeFiltersCount
                      ? `${activeFiltersCount} فلتر نشط`
                      : "لا توجد فلاتر نشطة",
                    activeFiltersCount
                      ? `${activeFiltersCount} active filters`
                      : "No active filters"
                  )}
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
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
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div className="space-y-2 xl:col-span-2">
                <Label className="text-xs font-semibold text-slate-600">
                  {tr(language, "الموظف", "Employee")}
                </Label>
                <Select
                  value={filters.employeeUid}
                  onValueChange={value =>
                    setFilters(current => ({ ...current, employeeUid: value }))
                  }
                >
                  <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-slate-50/70">
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
                <Label
                  htmlFor="attendance-from"
                  className="text-xs font-semibold text-slate-600"
                >
                  {tr(language, "من تاريخ", "From")}
                </Label>
                <Input
                  id="attendance-from"
                  type="date"
                  className="h-10 rounded-lg border-slate-200 bg-slate-50/70"
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
                <Label
                  htmlFor="attendance-to"
                  className="text-xs font-semibold text-slate-600"
                >
                  {tr(language, "إلى تاريخ", "To")}
                </Label>
                <Input
                  id="attendance-to"
                  type="date"
                  className="h-10 rounded-lg border-slate-200 bg-slate-50/70"
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
                <Label className="text-xs font-semibold text-slate-600">
                  {tr(language, "نوع العملية", "Type")}
                </Label>
                <Select
                  value={filters.type}
                  onValueChange={value =>
                    setFilters(current => ({ ...current, type: value }))
                  }
                >
                  <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-slate-50/70">
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
                <Label className="text-xs font-semibold text-slate-600">
                  {tr(language, "النتيجة", "Result")}
                </Label>
                <Select
                  value={filters.result}
                  onValueChange={value =>
                    setFilters(current => ({ ...current, result: value }))
                  }
                >
                  <SelectTrigger className="h-10 rounded-lg border-slate-200 bg-slate-50/70">
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
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="ghost"
                className="h-10 rounded-full px-4"
                onClick={handleResetFilters}
              >
                {tr(language, "مسح", "Clear")}
              </Button>
              <Button
                className="h-10 rounded-full bg-slate-950 px-4 hover:bg-slate-800"
                onClick={handleApplyFilters}
              >
                <Filter className="h-4 w-4" />
                {tr(language, "تطبيق", "Apply")}
              </Button>
            </div>
          </section>

          <Card className="overflow-hidden rounded-xl border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
            <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">
                  {tr(language, "سجل العمليات", "Attendance log")}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {tr(
                    language,
                    "تفاصيل الموقع والجهاز لكل عملية حضور أو انصراف",
                    "Location and device details for every check-in or check-out"
                  )}
                </p>
              </div>
              <Badge
                variant="outline"
                className="w-fit rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600"
              >
                {tr(
                  language,
                  `${data?.records.length || 0} سجل في الصفحة`,
                  `${data?.records.length || 0} records on this page`
                )}
              </Badge>
            </div>
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
                <div className="max-h-[62vh] overflow-auto">
                  <Table className="min-w-[1120px]">
                    <TableHeader>
                      <TableRow className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
                        <TableHead className="h-12 w-[230px] px-5 text-xs font-semibold text-slate-500">
                          {tr(language, "الموظف", "Employee")}
                        </TableHead>
                        <TableHead className="h-12 w-[190px] px-4 text-xs font-semibold text-slate-500">
                          {tr(language, "الحالة", "Status")}
                        </TableHead>
                        <TableHead className="h-12 w-[180px] px-4 text-xs font-semibold text-slate-500">
                          {tr(language, "التاريخ والوقت", "Date and time")}
                        </TableHead>
                        <TableHead className="h-12 w-[150px] px-4 text-xs font-semibold text-slate-500">
                          {tr(language, "النطاق", "Zone")}
                        </TableHead>
                        <TableHead className="h-12 w-[260px] px-4 text-xs font-semibold text-slate-500">
                          {tr(language, "الموقع", "Location")}
                        </TableHead>
                        <TableHead className="h-12 w-[220px] px-4 text-xs font-semibold text-slate-500">
                          {tr(language, "الجهاز", "Device")}
                        </TableHead>
                        <TableHead className="h-12 w-[150px] px-5 text-xs font-semibold text-slate-500">
                          {tr(language, "سبب الرفض", "Rejection")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100">
                      {data.records.map(record => (
                        <TableRow
                          key={record.id}
                          className="border-0 odd:bg-white even:bg-slate-50/35 hover:bg-slate-100/70"
                        >
                          <TableCell className="px-5 py-4">
                            <div className="text-sm font-semibold text-slate-950">
                              {record.employeeName || record.employeeUid}
                            </div>
                            <div
                              className="mt-1 max-w-52 truncate font-mono text-[11px] leading-5 text-slate-500"
                              title={record.employeeUid}
                            >
                              {record.employeeUid}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={
                                  record.type === "check_in"
                                    ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "rounded-full border-sky-200 bg-sky-50 text-sky-700"
                                }
                              >
                                {record.type === "check_in" ? (
                                  <LogIn className="h-3.5 w-3.5" />
                                ) : (
                                  <LogOut className="h-3.5 w-3.5" />
                                )}
                                {record.type === "check_in"
                                  ? tr(language, "حضور", "Check-in")
                                  : tr(language, "انصراف", "Check-out")}
                              </Badge>
                              <Badge
                                className={
                                  record.result === "allowed"
                                    ? "rounded-full bg-emerald-100 text-emerald-800 shadow-sm shadow-emerald-100 hover:bg-emerald-100"
                                    : "rounded-full bg-rose-100 text-rose-800 shadow-sm shadow-rose-100 hover:bg-rose-100"
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
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap px-4 py-4 text-sm font-medium text-slate-700">
                            {formatDateTime(record.serverTime, language)}
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <div className="w-fit rounded-md bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">
                              {record.zoneName || "-"}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
                                  {tr(language, "المسافة", "Distance")}:{" "}
                                  {record.distanceMeters == null
                                    ? "-"
                                    : `${record.distanceMeters} m`}
                                </span>
                                <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
                                  GPS: {Math.round(record.location.accuracy)} m
                                </span>
                              </div>
                              <div
                                dir="ltr"
                                className="max-w-56 truncate font-mono text-xs text-slate-500"
                                title={`${record.location.lat}, ${record.location.lng}`}
                              >
                                {record.location.lat.toFixed(5)},{" "}
                                {record.location.lng.toFixed(5)}
                              </div>
                              <a
                                href={`https://www.google.com/maps?q=${record.location.lat},${record.location.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {tr(language, "فتح الخريطة", "Open map")}
                              </a>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <div className="space-y-2">
                              <div
                                className={
                                  record.deviceInfo.deviceChanged
                                    ? "inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800"
                                    : record.deviceInfo.deviceId
                                      ? "inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
                                      : "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500"
                                }
                              >
                                {record.deviceInfo.deviceChanged ? (
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                ) : record.deviceInfo.deviceId ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <Smartphone className="h-3.5 w-3.5" />
                                )}
                                {record.deviceInfo.deviceChanged
                                  ? tr(
                                      language,
                                      "تم تغيير الجهاز",
                                      "Device changed"
                                    )
                                  : record.deviceInfo.deviceId
                                    ? tr(language, "جهاز معروف", "Known device")
                                    : tr(language, "لا يوجد جهاز", "No device")}
                              </div>
                              <div className="flex items-center gap-2">
                                <div
                                  dir="ltr"
                                  className={
                                    record.deviceInfo.deviceId
                                      ? "max-w-48 truncate rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-700"
                                      : "rounded-md bg-slate-50 px-2.5 py-1 text-xs text-slate-400"
                                  }
                                >
                                  {record.deviceInfo.deviceId
                                    ? visibleDeviceIds.has(
                                        `${record.id}:device`
                                      )
                                      ? record.deviceInfo.deviceId
                                      : "••••••••"
                                    : "-"}
                                </div>
                                {record.deviceInfo.deviceId ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    className="h-7 w-7 rounded-full border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                    onClick={() =>
                                      toggleDeviceVisibility(
                                        `${record.id}:device`
                                      )
                                    }
                                    title={
                                      visibleDeviceIds.has(
                                        `${record.id}:device`
                                      )
                                        ? tr(
                                            language,
                                            "إخفاء رقم الجهاز",
                                            "Hide device ID"
                                          )
                                        : tr(
                                            language,
                                            "إظهار رقم الجهاز",
                                            "Show device ID"
                                          )
                                    }
                                  >
                                    {visibleDeviceIds.has(
                                      `${record.id}:device`
                                    ) ? (
                                      <EyeOff className="h-3.5 w-3.5" />
                                    ) : (
                                      <Eye className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                ) : null}
                              </div>
                              {record.deviceInfo.deviceChanged ? (
                                <div className="space-y-1 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
                                  <div className="text-[11px] font-semibold text-amber-800">
                                    {tr(
                                      language,
                                      "الجهاز السابق",
                                      "Previous device"
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div
                                      dir="ltr"
                                      className="max-w-40 truncate font-mono text-[11px] text-amber-900"
                                    >
                                      {record.deviceInfo.previousDeviceId
                                        ? visibleDeviceIds.has(
                                            `${record.id}:previous-device`
                                          )
                                          ? record.deviceInfo.previousDeviceId
                                          : "••••••••"
                                        : "-"}
                                    </div>
                                    {record.deviceInfo.previousDeviceId ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon-sm"
                                        className="h-7 w-7 rounded-full border-amber-200 bg-white/80 text-amber-800 hover:bg-white"
                                        onClick={() =>
                                          toggleDeviceVisibility(
                                            `${record.id}:previous-device`
                                          )
                                        }
                                        title={
                                          visibleDeviceIds.has(
                                            `${record.id}:previous-device`
                                          )
                                            ? tr(
                                                language,
                                                "إخفاء رقم الجهاز السابق",
                                                "Hide previous device ID"
                                              )
                                            : tr(
                                                language,
                                                "إظهار رقم الجهاز السابق",
                                                "Show previous device ID"
                                              )
                                        }
                                      >
                                        {visibleDeviceIds.has(
                                          `${record.id}:previous-device`
                                        ) ? (
                                          <EyeOff className="h-3.5 w-3.5" />
                                        ) : (
                                          <Eye className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm">
                            <span
                              className={
                                record.rejectionReason
                                  ? "text-rose-700"
                                  : "text-slate-400"
                              }
                            >
                              {rejectionLabel(record.rejectionReason, language)}
                            </span>
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
                className="h-10 rounded-full border-slate-200 bg-white px-4 shadow-sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage(current => Math.max(1, current - 1))}
              >
                {tr(language, "السابق", "Previous")}
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-full border-slate-200 bg-white px-4 shadow-sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(current => current + 1)}
              >
                {tr(language, "التالي", "Next")}
              </Button>
            </div>
          </footer>
        </div>
      </main>
    </DashboardLayout>
  );
}
