import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Filter,
  LogIn,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
  SearchX,
  ShieldX,
  SlidersHorizontal,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { collection, getDocs } from "firebase/firestore";

import DashboardLayout from "@/components/DashboardLayout";
import { db } from "@/_core/firebase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  fetchWorkZones,
  normalizeAllowedZoneIds,
  type WorkZone,
} from "@/lib/workZones";

const PAGE_SIZE = 50;

type FilterState = {
  zoneId: string;
  month: string;
  employeeUid: string;
  fromDate: string;
  toDate: string;
  type: string;
  result: string;
  deviceChanged: boolean;
};

type MetricTone = "emerald" | "sky" | "rose" | "amber" | "violet";

type AttendanceEmployeeOption = {
  uid: string;
  name: string;
  employeeCode: string;
  allowedZoneIds: string[];
};

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function monthToDateRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return {
    fromDate: `${match[1]}-${match[2]}-01`,
    toDate: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`,
  };
}

function summarizeFilteredRecords(
  records: AttendanceRecord[],
  fallbackDate: string,
) {
  const acceptedAccuracy = records
    .map((record) => record.location.accuracy)
    .filter((value) => Number.isFinite(value) && value > 0);
  return {
    checkIns: records.filter(
      (record) => record.type === "check_in" && record.result === "allowed",
    ).length,
    checkOuts: records.filter(
      (record) => record.type === "check_out" && record.result === "allowed",
    ).length,
    rejected: records.filter((record) => record.result === "rejected").length,
    newDevices: records.filter((record) => record.deviceInfo.deviceChanged)
      .length,
    averageAccuracy: acceptedAccuracy.length
      ? acceptedAccuracy.reduce((sum, value) => sum + value, 0) /
        acceptedAccuracy.length
      : null,
    date: fallbackDate,
  };
}

const EMPTY_FILTERS: FilterState = {
  zoneId: "all",
  month: "",
  employeeUid: "all",
  fromDate: "",
  toDate: "",
  type: "all",
  result: "all",
  deviceChanged: false,
};

const metricToneClass: Record<MetricTone, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
};

const metricAccentClass: Record<MetricTone, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
};

function toRequestFilters(filters: FilterState): AttendanceRecordsFilters {
  const monthRange = monthToDateRange(filters.month);
  return {
    employeeUid:
      filters.employeeUid === "all" ? undefined : filters.employeeUid,
    fromDate: filters.fromDate || monthRange?.fromDate || undefined,
    toDate: filters.toDate || monthRange?.toDate || undefined,
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("en-GB", {
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Riyadh",
  }).format(date);
}

function rejectionLabel(reason: string | null, language: "ar" | "en") {
  const labels: Record<string, { ar: string; en: string }> = {
    poor_accuracy: { ar: "خارج النطاق", en: "Outside range" },
    outside_zone: { ar: "خارج النطاق", en: "Outside work zone" },
    office_ip_mismatch: { ar: "شبكة فرع غير مطابقة", en: "Office network mismatch" },
    office_ip_unavailable: { ar: "تعذر التحقق من الشبكة", en: "Office network unavailable" },
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

function formatMeters(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "-";
  }
  return `${Math.round(value)} m`;
}

function escapeExcelXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type ExcelXmlCellInput = {
  value: unknown;
  styleId?: string;
  mergeAcross?: number;
};

function excelXmlCell(
  input: unknown | ExcelXmlCellInput,
  fallbackStyleId = "Cell",
) {
  const cell =
    input && typeof input === "object" && "value" in input
      ? (input as ExcelXmlCellInput)
      : { value: input };
  const value = cell.value;
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const mergeAcross = Math.max(0, Number(cell.mergeAcross || 0));
  const mergeAttribute = mergeAcross
    ? ` ss:MergeAcross="${mergeAcross}"`
    : "";

  return `<Cell ss:StyleID="${cell.styleId || fallbackStyleId}"${mergeAttribute}><Data ss:Type="${
    isNumber ? "Number" : "String"
  }">${escapeExcelXml(value)}</Data></Cell>`;
}

function excelXmlRow(
  values: Array<unknown | ExcelXmlCellInput>,
  options?: { height?: number },
) {
  const height =
    typeof options?.height === "number" && Number.isFinite(options.height)
      ? ` ss:Height="${options.height}"`
      : "";
  return `<Row${height}>${values.map((value) => excelXmlCell(value)).join("")}</Row>`;
}

function getRiyadhDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatMonthLabel(month: string, language: "ar" | "en") {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || "").trim());
  if (!match) return month || "-";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    calendar: "gregory",
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function sanitizeExcelFileName(value: string) {
  return String(value || "attendance")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function readEmployeeCode(data: Record<string, any> | null | undefined) {
  return pickText(
    data?.employeeProfile?.employment?.employeeCode,
    data?.employment?.employeeCode,
    data?.profile?.employeeCode,
    data?.employeeCode,
    data?.employeeId,
  );
}

function exportAttendanceExcel(input: {
  records: AttendanceRecord[];
  employees: AttendanceEmployeeOption[];
  zone: WorkZone;
  month: string;
  language: "ar" | "en";
}) {
  const { records, employees, zone, month, language } = input;
  const isArabic = language === "ar";
  const monthLabel = formatMonthLabel(month, language);
  const generatedAt = formatDateTime(new Date().toISOString());
  const recordsByEmployee = new Map<string, AttendanceRecord[]>();
  const employeeCodeByUid = new Map(
    employees.map((employee) => [employee.uid, employee.employeeCode || "-"]),
  );

  records.forEach((record) => {
    const current = recordsByEmployee.get(record.employeeUid) || [];
    current.push(record);
    recordsByEmployee.set(record.employeeUid, current);
  });

  const summaryHeaders = isArabic
    ? [
        "الموظف",
        "الرقم الوظيفي",
        "نطاق الحضور",
        "الشهر",
        "أيام الحضور",
        "مرات الحضور",
        "مرات الانصراف",
        "العمليات المرفوضة",
        "أول عملية",
        "آخر عملية",
      ]
    : [
        "Employee",
        "Employee Number",
        "Attendance Zone",
        "Month",
        "Attendance Days",
        "Check-ins",
        "Check-outs",
        "Rejected Operations",
        "First Operation",
        "Last Operation",
      ];

  const summaryRows = employees.map((employee) => {
    const employeeRecords = [...(recordsByEmployee.get(employee.uid) || [])].sort(
      (left, right) =>
        new Date(left.serverTime).getTime() - new Date(right.serverTime).getTime(),
    );
    const presentDays = new Set(
      employeeRecords
        .filter(
          (record) => record.type === "check_in" && record.result === "allowed",
        )
        .map((record) => getRiyadhDateKey(record.serverTime))
        .filter(Boolean),
    ).size;

    return [
      employee.name,
      employee.employeeCode || "-",
      zone.name,
      monthLabel,
      presentDays,
      employeeRecords.filter(
        (record) => record.type === "check_in" && record.result === "allowed",
      ).length,
      employeeRecords.filter(
        (record) => record.type === "check_out" && record.result === "allowed",
      ).length,
      employeeRecords.filter((record) => record.result === "rejected").length,
      employeeRecords[0] ? formatDateTime(employeeRecords[0].serverTime) : "-",
      employeeRecords.length
        ? formatDateTime(employeeRecords[employeeRecords.length - 1].serverTime)
        : "-",
    ];
  });

  const detailsHeaders = isArabic
    ? [
        "الموظف",
        "الرقم الوظيفي",
        "نوع العملية",
        "النتيجة",
        "التاريخ والوقت",
        "اسم النطاق المسجل",
        "المسافة بالمتر",
        "دقة GPS",
        "خط العرض",
        "خط الطول",
        "معرف الجهاز",
        "جهاز جديد",
        "سبب الرفض",
      ]
    : [
        "Employee",
        "Employee Number",
        "Operation",
        "Result",
        "Date and Time",
        "Recorded Zone",
        "Distance (m)",
        "GPS Accuracy",
        "Latitude",
        "Longitude",
        "Device ID",
        "New Device",
        "Rejection Reason",
      ];

  const detailsRows = [...records]
    .sort((left, right) => {
      const nameCompare = String(left.employeeName || left.employeeUid).localeCompare(
        String(right.employeeName || right.employeeUid),
        isArabic ? "ar" : "en",
      );
      if (nameCompare !== 0) return nameCompare;
      return (
        new Date(left.serverTime).getTime() -
        new Date(right.serverTime).getTime()
      );
    })
    .map((record) => [
    record.employeeName || record.employeeUid,
    employeeCodeByUid.get(record.employeeUid) || "-",
    record.type === "check_in"
      ? isArabic
        ? "حضور"
        : "Check-in"
      : isArabic
        ? "انصراف"
        : "Check-out",
    record.result === "allowed"
      ? isArabic
        ? "مسموح"
        : "Allowed"
      : isArabic
        ? "مرفوض"
        : "Rejected",
    formatDateTime(record.serverTime),
    record.zoneName || "-",
    record.distanceMeters ?? "",
    record.location.accuracy,
    record.location.lat,
    record.location.lng,
    record.deviceInfo.deviceId || "",
    record.deviceInfo.deviceChanged
      ? isArabic
        ? "نعم"
        : "Yes"
      : isArabic
        ? "لا"
        : "No",
    record.result === "rejected"
      ? rejectionLabel(record.rejectionReason, language)
      : "-",
  ]);

  const summaryColumnWidths = [170, 210, 150, 125, 90, 90, 95, 105, 165, 165];
  const detailsColumnWidths = [
    170, 210, 95, 90, 165, 150, 95, 95, 110, 110, 190, 90, 170,
  ];

  const buildSummaryRowsXml = () =>
    summaryRows
      .map((row, rowIndex) => {
        const alternate = rowIndex % 2 === 1;
        return excelXmlRow(
          row.map((value, columnIndex) => {
            let styleId = alternate ? "CellAlt" : "Cell";

            if ([4, 5, 6, 7].includes(columnIndex)) {
              styleId = alternate ? "IntegerAlt" : "Integer";
            }
            if ([8, 9].includes(columnIndex)) {
              styleId = alternate ? "DateAlt" : "Date";
            }
            if (columnIndex === 4 && Number(value) === 0) {
              styleId = "ZeroAttendance";
            }
            if (columnIndex === 7 && Number(value) > 0) {
              styleId = "RejectedCount";
            }

            return { value, styleId };
          }),
          { height: 24 },
        );
      })
      .join("");

  const buildDetailsRowsXml = () =>
    detailsRows
      .map((row, rowIndex) => {
        const alternate = rowIndex % 2 === 1;
        return excelXmlRow(
          row.map((value, columnIndex) => {
            let styleId = alternate ? "CellAlt" : "Cell";

            if ([6, 7].includes(columnIndex)) {
              styleId = alternate ? "DecimalAlt" : "Decimal";
            }
            if ([8, 9].includes(columnIndex)) {
              styleId = alternate ? "CoordinateAlt" : "Coordinate";
            }
            if (columnIndex === 4) {
              styleId = alternate ? "DateAlt" : "Date";
            }
            if (columnIndex === 2) {
              styleId = String(value).includes("حضور") || value === "Check-in"
                ? "CheckIn"
                : "CheckOut";
            }
            if (columnIndex === 3) {
              styleId = String(value).includes("مسموح") || value === "Allowed"
                ? "Allowed"
                : "Rejected";
            }
            if (columnIndex === 11 && (value === "نعم" || value === "Yes")) {
              styleId = "NewDevice";
            }
            if (columnIndex === 12 && value !== "-") {
              styleId = "RejectedReason";
            }

            return { value, styleId };
          }),
          { height: 24 },
        );
      })
      .join("");

  const worksheet = (input: {
    name: string;
    title: string;
    headers: string[];
    rowsXml: string;
    rowCount: number;
    columnWidths: number[];
  }) => {
    const columnCount = input.headers.length;
    const headerRowNumber = 5;
    const finalRowNumber = headerRowNumber + input.rowCount;
    const filterRange = `R${headerRowNumber}C1:R${Math.max(
      headerRowNumber,
      finalRowNumber,
    )}C${columnCount}`;

    return `
    <Worksheet ss:Name="${escapeExcelXml(input.name)}">
      <Table ss:DefaultRowHeight="24">
        ${input.columnWidths
          .map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`)
          .join("")}
        ${excelXmlRow(
          [
            {
              value: input.title,
              styleId: "Title",
              mergeAcross: columnCount - 1,
            },
          ],
          { height: 34 },
        )}
        ${excelXmlRow(
          [
            {
              value: isArabic
                ? `النطاق: ${zone.name}    |    الشهر: ${monthLabel}`
                : `Zone: ${zone.name}    |    Month: ${monthLabel}`,
              styleId: "Subtitle",
              mergeAcross: columnCount - 1,
            },
          ],
          { height: 26 },
        )}
        ${excelXmlRow(
          [
            {
              value: isArabic
                ? `تاريخ إنشاء الكشف: ${generatedAt}    |    عدد الموظفين: ${employees.length}    |    عدد العمليات: ${records.length}`
                : `Generated: ${generatedAt}    |    Employees: ${employees.length}    |    Operations: ${records.length}`,
              styleId: "Meta",
              mergeAcross: columnCount - 1,
            },
          ],
          { height: 24 },
        )}
        ${excelXmlRow(
          [
            {
              value: "",
              styleId: "Spacer",
              mergeAcross: columnCount - 1,
            },
          ],
          { height: 10 },
        )}
        ${excelXmlRow(
          input.headers.map((header) => ({ value: header, styleId: "Header" })),
          { height: 30 },
        )}
        ${input.rowsXml}
      </Table>
      <AutoFilter x:Range="${filterRange}" xmlns="urn:schemas-microsoft-com:office:excel"/>
      <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
        ${isArabic ? "<DisplayRightToLeft/>" : ""}
        <Selected/>
        <FreezePanes/>
        <FrozenNoSplit/>
        <SplitHorizontal>${headerRowNumber}</SplitHorizontal>
        <TopRowBottomPane>${headerRowNumber}</TopRowBottomPane>
        <ActivePane>2</ActivePane>
        <PageSetup>
          <Layout x:Orientation="Landscape"/>
          <PageMargins x:Bottom="0.5" x:Left="0.25" x:Right="0.25" x:Top="0.5"/>
        </PageSetup>
        <FitToPage/>
        <Print>
          <FitHeight>0</FitHeight>
          <FitWidth>1</FitWidth>
          <HorizontalResolution>600</HorizontalResolution>
          <VerticalResolution>600</VerticalResolution>
        </Print>
        <ProtectObjects>False</ProtectObjects>
        <ProtectScenarios>False</ProtectScenarios>
      </WorksheetOptions>
    </Worksheet>`;
  };

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
  <?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
      <Title>${escapeExcelXml(
        isArabic ? "كشف الحضور الشهري حسب النطاق" : "Monthly Attendance by Zone",
      )}</Title>
      <Subject>${escapeExcelXml(zone.name)}</Subject>
      <Author>MAEDIN HR</Author>
      <Created>${new Date().toISOString()}</Created>
    </DocumentProperties>
    <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">
      <WindowHeight>12300</WindowHeight>
      <WindowWidth>28800</WindowWidth>
      <ProtectStructure>False</ProtectStructure>
      <ProtectWindows>False</ProtectWindows>
    </ExcelWorkbook>
    <Styles>
      <Style ss:ID="Default" ss:Name="Normal">
        <Alignment ss:Vertical="Center"/>
        <Borders/>
        <Font ss:FontName="Tahoma" ss:Size="10" ss:Color="#0F172A"/>
        <Interior/>
        <NumberFormat/>
        <Protection/>
      </Style>
      <Style ss:ID="Title">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Tahoma" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/>
        <Interior ss:Color="#030640" ss:Pattern="Solid"/>
        <Borders>
          <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="3" ss:Color="#F2B705"/>
        </Borders>
      </Style>
      <Style ss:ID="Subtitle">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Tahoma" ss:Size="11" ss:Bold="1" ss:Color="#030640"/>
        <Interior ss:Color="#FFF4BF" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="Meta">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Tahoma" ss:Size="9" ss:Color="#475569"/>
        <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
        <Borders>
          <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        </Borders>
      </Style>
      <Style ss:ID="Spacer">
        <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="Header">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
        <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#030640"/>
        <Interior ss:Color="#F2B705" ss:Pattern="Solid"/>
        <Borders>
          <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#030640"/>
          <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4A000"/>
          <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4A000"/>
          <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4A000"/>
        </Borders>
      </Style>
      <Style ss:ID="Cell">
        <Alignment ss:Horizontal="Right" ss:Vertical="Center" ss:WrapText="1"/>
        <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
        <Borders>
          <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
          <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
          <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
          <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        </Borders>
      </Style>
      <Style ss:ID="CellAlt" ss:Parent="Cell">
        <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="Integer" ss:Parent="Cell">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <NumberFormat ss:Format="0"/>
      </Style>
      <Style ss:ID="IntegerAlt" ss:Parent="Integer">
        <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="Decimal" ss:Parent="Cell">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <NumberFormat ss:Format="0.00"/>
      </Style>
      <Style ss:ID="DecimalAlt" ss:Parent="Decimal">
        <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="Coordinate" ss:Parent="Cell">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <NumberFormat ss:Format="0.000000"/>
      </Style>
      <Style ss:ID="CoordinateAlt" ss:Parent="Coordinate">
        <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="Date" ss:Parent="Cell">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      </Style>
      <Style ss:ID="DateAlt" ss:Parent="Date">
        <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="Allowed" ss:Parent="Cell">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#166534"/>
        <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="Rejected" ss:Parent="Cell">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#991B1B"/>
        <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="CheckIn" ss:Parent="Cell">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#075985"/>
        <Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="CheckOut" ss:Parent="Cell">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#5B21B6"/>
        <Interior ss:Color="#EDE9FE" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="NewDevice" ss:Parent="Cell">
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
        <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#92400E"/>
        <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="ZeroAttendance" ss:Parent="Integer">
        <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#991B1B"/>
        <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="RejectedCount" ss:Parent="Integer">
        <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#991B1B"/>
        <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
      </Style>
      <Style ss:ID="RejectedReason" ss:Parent="Cell">
        <Font ss:FontName="Tahoma" ss:Size="10" ss:Color="#991B1B"/>
        <Interior ss:Color="#FFF1F2" ss:Pattern="Solid"/>
      </Style>
    </Styles>
    ${worksheet({
      name: isArabic ? "سجل العمليات" : "Operation Log",
      title: isArabic
        ? "كل عمليات الحضور والانصراف — كل عملية في صف مستقل"
        : "All Attendance Operations — One Operation per Row",
      headers: detailsHeaders,
      rowsXml: buildDetailsRowsXml(),
      rowCount: detailsRows.length,
      columnWidths: detailsColumnWidths,
    })}
    ${worksheet({
      name: isArabic ? "ملخص الموظفين" : "Employee Summary",
      title: isArabic
        ? "ملخص الحضور الشهري حسب نطاق العمل"
        : "Monthly Attendance Summary by Work Zone",
      headers: summaryHeaders,
      rowsXml: buildSummaryRowsXml(),
      rowCount: summaryRows.length,
      columnWidths: summaryColumnWidths,
    })}
  </Workbook>`;

  const blob = new Blob(["\uFEFF", workbook], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeExcelFileName(zone.name)}-${month}-attendance.xls`;
  anchor.click();
  URL.revokeObjectURL(url);
}


function normalizeLookupKey(value: string | null | undefined) {
  return String(value || "").trim();
}

function buildEmployeeNameMap(employees: AttendanceEmployeeOption[]) {
  const names = new Map<string, string>();
  for (const employee of employees) {
    const uid = normalizeLookupKey(employee.uid);
    const name = normalizeLookupKey(employee.name);
    if (uid && name) names.set(uid, name);
  }
  return names;
}

function resolveAttendanceEmployeeName(
  record: AttendanceRecord,
  employeeNames: Map<string, string>,
) {
  return (
    normalizeLookupKey(record.employeeName) ||
    employeeNames.get(normalizeLookupKey(record.employeeUid)) ||
    employeeNames.get(normalizeLookupKey(record.employeeDocId)) ||
    null
  );
}

function enrichAttendanceRecordsWithNames(
  records: AttendanceRecord[],
  employeeNames: Map<string, string>,
) {
  if (!employeeNames.size) return records;

  return records.map((record) => {
    const employeeName = resolveAttendanceEmployeeName(record, employeeNames);
    const sharedDevice = record.deviceInfo.sharedDevice;
    const sharedEmployees = sharedDevice?.employees?.map((employee) => ({
      ...employee,
      name:
        normalizeLookupKey(employee.name) ||
        employeeNames.get(normalizeLookupKey(employee.uid)) ||
        null,
    }));

    if (
      employeeName === record.employeeName &&
      sharedEmployees === sharedDevice?.employees
    ) {
      return record;
    }

    return {
      ...record,
      employeeName,
      deviceInfo: {
        ...record.deviceInfo,
        sharedDevice: sharedDevice
          ? {
              ...sharedDevice,
              employees: sharedEmployees || sharedDevice.employees,
            }
          : sharedDevice,
      },
    };
  });
}

function TypeBadge({
  record,
  language,
}: {
  record: AttendanceRecord;
  language: "ar" | "en";
}) {
  const isCheckIn = record.type === "check_in";
  const Icon = isCheckIn ? LogIn : LogOut;

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-7 rounded-full px-2.5 text-xs font-semibold",
        isCheckIn
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-sky-200 bg-sky-50 text-sky-700",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {isCheckIn
        ? tr(language, "حضور", "Check-in")
        : tr(language, "انصراف", "Check-out")}
    </Badge>
  );
}

function ResultBadge({
  record,
  language,
}: {
  record: AttendanceRecord;
  language: "ar" | "en";
}) {
  const allowed = record.result === "allowed";
  const Icon = allowed ? CheckCircle2 : ShieldX;

  return (
    <Badge
      className={cn(
        "h-7 rounded-full px-2.5 text-xs font-semibold shadow-none",
        allowed
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
          : "bg-rose-100 text-rose-800 hover:bg-rose-100",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {allowed
        ? tr(language, "مسموح", "Allowed")
        : tr(language, "مرفوض", "Rejected")}
    </Badge>
  );
}

function EmployeeIdentity({ record }: { record: AttendanceRecord }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3">
      <div className="truncate text-sm font-semibold text-slate-950">
        {record.employeeName || record.employeeUid}
      </div>
      <div
        dir="ltr"
        className="mt-1 max-w-full truncate font-mono text-[11px] leading-5 text-slate-500"
        title={record.employeeUid}
      >
        {record.employeeUid}
      </div>
    </div>
  );
}

function TimeBlock({
  record,
  language,
}: {
  record: AttendanceRecord;
  language: "ar" | "en";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Clock3 className="h-4 w-4 text-slate-400" />
        {tr(language, "الوقت", "Time")}
      </div>
      <div
        dir="ltr"
        className="mt-2 text-sm font-semibold leading-6 text-slate-900"
      >
        {formatDateTime(record.serverTime)}
      </div>
    </div>
  );
}

function OperationBlock({
  record,
  language,
}: {
  record: AttendanceRecord;
  language: "ar" | "en";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-3",
        record.result === "allowed"
          ? "border-emerald-100 bg-emerald-50/40"
          : "border-rose-100 bg-rose-50/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge record={record} language={language} />
        <ResultBadge record={record} language={language} />
      </div>
      {record.rejectionReason ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-white/80 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {tr(language, "سبب الرفض", "Rejection reason")}
          </div>
          <div className="mt-1 text-xs font-semibold leading-5 text-rose-800">
            {rejectionLabel(record.rejectionReason, language)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AttendanceEventBlock({
  record,
  language,
}: {
  record: AttendanceRecord;
  language: "ar" | "en";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-3",
        record.result === "allowed"
          ? "border-emerald-100 bg-emerald-50/30"
          : "border-rose-100 bg-rose-50/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-950">
            {record.employeeName || record.employeeUid}
          </div>
          <div
            dir="ltr"
            className="mt-1 max-w-full truncate font-mono text-[11px] leading-5 text-slate-500"
            title={record.employeeUid}
          >
            {record.employeeUid}
          </div>
        </div>
        <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <Clock3 className="h-3.5 w-3.5" />
            {tr(language, "الوقت", "Time")}
          </div>
          <div dir="ltr" className="mt-1 text-xs font-semibold text-slate-900">
            {formatDateTime(record.serverTime)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TypeBadge record={record} language={language} />
        <ResultBadge record={record} language={language} />
      </div>

      {record.rejectionReason ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-white/85 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {tr(language, "سبب الرفض", "Rejection reason")}
          </div>
          <div className="mt-1 text-xs font-semibold leading-5 text-rose-800">
            {rejectionLabel(record.rejectionReason, language)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: typeof LogIn;
  tone: MetricTone;
}) {
  return (
    <div className="group relative min-h-[112px] overflow-hidden rounded-[1.35rem] border border-white/80 bg-white p-4 shadow-sm shadow-slate-200/80 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/80">
      <span
        className={cn("absolute inset-x-0 top-0 h-1", metricAccentClass[tone])}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-3xl font-semibold tracking-normal text-slate-950">
            {value}
          </div>
          <div className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            {label}
          </div>
        </div>
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
            metricToneClass[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function DeviceBlock({
  record,
  language,
  visibleDeviceIds,
  onToggleDevice,
}: {
  record: AttendanceRecord;
  language: "ar" | "en";
  visibleDeviceIds: Set<string>;
  onToggleDevice: (key: string) => void;
}) {
  const deviceKey = `${record.id}:device`;
  const previousDeviceKey = `${record.id}:previous-device`;
  const hasDevice = Boolean(record.deviceInfo.deviceId);
  const sharedDevice = record.deviceInfo.sharedDevice;
  const isSharedDevice = Boolean(
    sharedDevice && Number(sharedDevice.employeeCount || 0) > 1,
  );
  const deviceLabel = hasDevice
    ? visibleDeviceIds.has(deviceKey)
      ? record.deviceInfo.deviceId
      : shortDeviceId(record.deviceInfo.deviceId)
    : "-";

  return (
    <div className="min-w-0 space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold",
            isSharedDevice
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : record.deviceInfo.deviceChanged
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : hasDevice
                  ? "border-sky-200 bg-sky-50 text-sky-800"
                  : "border-slate-200 bg-slate-100 text-slate-500",
          )}
        >
          {isSharedDevice || record.deviceInfo.deviceChanged ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <Smartphone className="h-3.5 w-3.5" />
          )}
          {isSharedDevice
            ? tr(language, "جهاز مكرر", "Repeated device")
            : record.deviceInfo.deviceChanged
              ? tr(language, "جهاز جديد", "New device")
              : hasDevice
                ? tr(language, "جهاز موثق", "Verified device")
                : tr(language, "لا يوجد جهاز", "No device")}
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <Smartphone className="h-3.5 w-3.5" />
          {tr(language, "الجهاز الحالي", "Current device")}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <code
            dir="ltr"
            className={cn(
              "min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 font-mono text-xs",
              hasDevice
                ? "bg-slate-100 text-slate-700"
                : "bg-slate-50 text-slate-400",
            )}
            title={record.deviceInfo.deviceId || undefined}
          >
            {deviceLabel}
          </code>
          {hasDevice ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="h-8 w-8 shrink-0 rounded-full border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              onClick={() => onToggleDevice(deviceKey)}
              title={
                visibleDeviceIds.has(deviceKey)
                  ? tr(language, "إخفاء رقم الجهاز", "Hide device ID")
                  : tr(language, "إظهار رقم الجهاز", "Show device ID")
              }
            >
              {visibleDeviceIds.has(deviceKey) ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
        </div>
      </div>

      {isSharedDevice ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              {tr(
                language,
                "الجهاز مستخدم من أكثر من موظف",
                "Device used by multiple employees",
              )}
            </div>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700">
              {sharedDevice?.employeeCount || 0}
            </span>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
            {(sharedDevice?.employees || []).slice(0, 4).map((employee) => (
              <span
                key={employee.uid}
                className="max-w-full truncate rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-800"
                title={employee.uid}
              >
                {employee.name || employee.uid}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {record.deviceInfo.deviceChanged ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            {tr(language, "الجهاز السابق", "Previous device")}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <code
              dir="ltr"
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-amber-900"
              title={record.deviceInfo.previousDeviceId || undefined}
            >
              {record.deviceInfo.previousDeviceId
                ? visibleDeviceIds.has(previousDeviceKey)
                  ? record.deviceInfo.previousDeviceId
                  : shortDeviceId(record.deviceInfo.previousDeviceId)
                : "-"}
            </code>
            {record.deviceInfo.previousDeviceId ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="h-7 w-7 shrink-0 rounded-full border-amber-200 bg-white/80 text-amber-800 hover:bg-white"
                onClick={() => onToggleDevice(previousDeviceKey)}
                title={
                  visibleDeviceIds.has(previousDeviceKey)
                    ? tr(
                        language,
                        "إخفاء رقم الجهاز السابق",
                        "Hide previous device ID",
                      )
                    : tr(
                        language,
                        "إظهار رقم الجهاز السابق",
                        "Show previous device ID",
                      )
                }
              >
                {visibleDeviceIds.has(previousDeviceKey) ? (
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
  );
}

function LocationBlock({
  record,
  language,
  compact = false,
}: {
  record: AttendanceRecord;
  language: "ar" | "en";
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm shadow-slate-200">
              <MapPin className="h-4 w-4" />
            </span>
            <span className="min-w-0 truncate text-sm font-semibold text-slate-900">
              {record.zoneName || "-"}
            </span>
          </div>
        </div>
        <a
          href={`https://www.google.com/maps?q=${record.location.lat},${record.location.lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          title={tr(language, "فتح الخريطة", "Open map")}
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden 2xl:inline">
            {tr(language, "فتح", "Open")}
          </span>
        </a>
      </div>
      <div
        className={cn(
          "mt-3 grid gap-2 text-[11px] sm:grid-cols-2",
          compact && "mt-2",
        )}
      >
        <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 sm:col-span-2">
          <div className="text-slate-500">
            {tr(language, "الإحداثيات", "Coordinates")}
          </div>
          <div
            dir="ltr"
            className="mt-1 truncate font-mono font-semibold text-slate-700"
            title={`${record.location.lat}, ${record.location.lng}`}
          >
            {record.location.lat.toFixed(5)}, {record.location.lng.toFixed(5)}
          </div>
        </div>
        <div
          className={cn(
            "rounded-xl border px-2.5 py-2",
            record.location.accuracy > 100
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-white",
          )}
        >
          <div className="flex items-center gap-1.5 text-slate-500">
            <Activity className="h-3.5 w-3.5" />
            GPS
          </div>
          <div className="mt-1 font-semibold text-slate-800">
            {formatMeters(record.location.accuracy)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Navigation className="h-3.5 w-3.5" />
            {tr(language, "المسافة", "Distance")}
          </div>
          <div className="mt-1 font-semibold text-slate-800">
            {formatMeters(record.distanceMeters)}
          </div>
        </div>
      </div>
    </div>
  );
}

function AttendanceMobileCard({
  record,
  language,
  visibleDeviceIds,
  onToggleDevice,
}: {
  record: AttendanceRecord;
  language: "ar" | "en";
  visibleDeviceIds: Set<string>;
  onToggleDevice: (key: string) => void;
}) {
  return (
    <article className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-sm shadow-slate-200/80">
      <span className="absolute inset-x-0 top-0 h-1 bg-slate-950" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-950">
            {record.employeeName || record.employeeUid}
          </div>
          <div
            dir="ltr"
            className="mt-1 truncate font-mono text-[11px] text-slate-500"
            title={record.employeeUid}
          >
            {record.employeeUid}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <TypeBadge record={record} language={language} />
          <ResultBadge record={record} language={language} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Clock3 className="h-4 w-4" />
          {tr(language, "التاريخ والوقت", "Date and time")}
        </div>
        <div dir="ltr" className="mt-1 text-sm font-semibold text-slate-950">
          {formatDateTime(record.serverTime)}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <LocationBlock record={record} language={language} compact />
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
          <DeviceBlock
            record={record}
            language={language}
            visibleDeviceIds={visibleDeviceIds}
            onToggleDevice={onToggleDevice}
          />
        </div>
        {record.rejectionReason ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {tr(language, "سبب الرفض", "Rejection")}:{" "}
            {rejectionLabel(record.rejectionReason, language)}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function HrAttendancePage() {
  const { language } = useLanguage();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AttendanceRecordsResponse | null>(null);
  const [employees, setEmployees] = useState<AttendanceEmployeeOption[]>([]);
  const [workZones, setWorkZones] = useState<WorkZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [visibleDeviceIds, setVisibleDeviceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  const loadRecords = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    try {
      if (appliedFilters.zoneId !== "all") {
        const collected: AttendanceRecord[] = [];
        let cursor: string | undefined;
        do {
          const response = await fetchAttendanceRecords({
            ...toRequestFilters(appliedFilters),
            employeeUid: undefined,
            limit: 200,
            cursor,
          });
          collected.push(...response.records);
          cursor = response.nextCursor || undefined;
        } while (cursor && collected.length < 10000);

        const allowedUids = new Set(
          employees
            .filter((employee) =>
              employee.allowedZoneIds.includes(appliedFilters.zoneId),
            )
            .map((employee) => employee.uid),
        );
        const filtered = collected.filter((record) => {
          if (!allowedUids.has(record.employeeUid)) return false;
          return (
            appliedFilters.employeeUid === "all" ||
            record.employeeUid === appliedFilters.employeeUid
          );
        });
        const start = (page - 1) * PAGE_SIZE;
        if (requestId !== requestIdRef.current) return;
        setData({
          records: filtered.slice(start, start + PAGE_SIZE),
          total: filtered.length,
          page,
          limit: PAGE_SIZE,
          nextCursor: null,
          summary: summarizeFilteredRecords(
            filtered,
            toRequestFilters(appliedFilters).toDate ||
              new Date().toISOString().slice(0, 10),
          ),
        });
      } else {
        const response = await fetchAttendanceRecords({
          ...toRequestFilters(appliedFilters),
          page,
          limit: PAGE_SIZE,
        });
        if (requestId !== requestIdRef.current) return;
        setData(response);
      }
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      console.error("hr_attendance_records_failed", loadError);
      const message =
        loadError instanceof Error
          ? loadError.message
          : tr(
              language,
              "تعذر تحميل سجلات الحضور.",
              "Could not load attendance records.",
            );
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [appliedFilters, employees, language, page]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchEmployeeDirectoryFromWorker(),
      getDocs(collection(db, "users")),
      getDocs(collection(db, "employees")),
      fetchWorkZones(),
    ])
      .then(([items, usersSnapshot, employeesSnapshot, zones]) => {
        if (!active) return;

        const allowedZonesByUid = new Map<string, Set<string>>();
        const employeeCodeByUid = new Map<string, string>();
        const addEmployeeCode = (
          uid: string,
          data: Record<string, any> | null | undefined,
        ) => {
          if (!uid) return;
          const employeeCode = readEmployeeCode(data);
          if (employeeCode && !employeeCodeByUid.has(uid)) {
            employeeCodeByUid.set(uid, employeeCode);
          }
        };
        const addAllowedZones = (uid: string, value: unknown) => {
          if (!uid) return;
          const existing = allowedZonesByUid.get(uid) || new Set<string>();
          normalizeAllowedZoneIds(value).forEach((zoneId) => existing.add(zoneId));
          allowedZonesByUid.set(uid, existing);
        };
        const readAllowedZoneIds = (data: Record<string, any>) =>
          data.allowedZoneIds ||
          data.employment?.allowedZoneIds ||
          data.employeeProfile?.employment?.allowedZoneIds ||
          [];

        usersSnapshot.docs.forEach((snapshot) => {
          const data = snapshot.data() as Record<string, any>;
          const uid = pickText(data.uid, snapshot.id);
          addAllowedZones(uid, readAllowedZoneIds(data));
          addEmployeeCode(uid, data);
        });

        employeesSnapshot.docs.forEach((snapshot) => {
          const data = snapshot.data() as Record<string, any>;
          const uid = pickText(
            data.linkedUserUid,
            data.uid,
            data.userId,
            snapshot.id,
          );
          addAllowedZones(uid, readAllowedZoneIds(data));
          addEmployeeCode(uid, data);
          addEmployeeCode(snapshot.id, data);
        });

        setWorkZones(zones);
        setEmployees(
          items.map((item) => ({
            uid: item.uid,
            name: item.name,
            employeeCode: employeeCodeByUid.get(item.uid) || "-",
            allowedZoneIds: Array.from(allowedZonesByUid.get(item.uid) || []),
          })),
        );
      })
      .catch((directoryError) => {
        console.error(
          "hr_attendance_employee_directory_failed",
          directoryError,
        );
        if (active) {
          setEmployees([]);
          setWorkZones([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const employeeNameMap = useMemo(
    () => buildEmployeeNameMap(employees),
    [employees],
  );
  const displayRecords = useMemo(
    () =>
      enrichAttendanceRecordsWithNames(data?.records || [], employeeNameMap),
    [data?.records, employeeNameMap],
  );

  const zoneOptions = useMemo(
    () =>
      [...workZones].sort((left, right) =>
        left.name.localeCompare(right.name, language === "ar" ? "ar" : "en"),
      ),
    [language, workZones],
  );

  const selectedZoneEmployees = useMemo(() => {
    if (appliedFilters.zoneId === "all") return employees;
    return employees.filter((employee) =>
      employee.allowedZoneIds.includes(appliedFilters.zoneId),
    );
  }, [appliedFilters.zoneId, employees]);

  const employeeOptions = useMemo(() => {
    const eligibleEmployees = employees.filter(
      (employee) =>
        filters.zoneId === "all" ||
        employee.allowedZoneIds.includes(filters.zoneId),
    );
    const eligibleEmployeeUids = new Set(
      eligibleEmployees.map((employee) => employee.uid),
    );
    const options = new Map<string, string>(
      eligibleEmployees.map((employee) => [employee.uid, employee.name]),
    );
    for (const record of displayRecords) {
      if (
        (filters.zoneId === "all" ||
          eligibleEmployeeUids.has(record.employeeUid)) &&
        !options.has(record.employeeUid)
      ) {
        options.set(
          record.employeeUid,
          record.employeeName || record.employeeUid,
        );
      }
    }
    return Array.from(options, ([uid, name]) => ({ uid, name })).sort(
      (left, right) =>
        left.name.localeCompare(right.name, language === "ar" ? "ar" : "en"),
    );
  }, [displayRecords, employees, filters.zoneId, language]);

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));
  const summaryCards = [
    {
      label: tr(language, "عمليات الحضور", "Check-ins"),
      value: data?.summary.checkIns ?? 0,
      icon: LogIn,
      tone: "emerald" as const,
    },
    {
      label: tr(language, "عمليات الانصراف", "Check-outs"),
      value: data?.summary.checkOuts ?? 0,
      icon: LogOut,
      tone: "sky" as const,
    },
    {
      label: tr(language, "العمليات المرفوضة", "Rejected"),
      value: data?.summary.rejected ?? 0,
      icon: ShieldX,
      tone: "rose" as const,
    },
    {
      label: tr(language, "الأجهزة الجديدة", "New devices"),
      value: data?.summary.newDevices ?? 0,
      icon: Smartphone,
      tone: "amber" as const,
    },
    {
      label: tr(language, "متوسط دقة GPS", "Average GPS accuracy"),
      value:
        data?.summary.averageAccuracy == null
          ? "-"
          : `${Math.round(data.summary.averageAccuracy)} m`,
      icon: Navigation,
      tone: "violet" as const,
    },
  ];

  const activeFiltersCount = [
    appliedFilters.zoneId !== EMPTY_FILTERS.zoneId,
    Boolean(appliedFilters.month),
    appliedFilters.employeeUid !== EMPTY_FILTERS.employeeUid,
    Boolean(appliedFilters.fromDate),
    Boolean(appliedFilters.toDate),
    appliedFilters.type !== EMPTY_FILTERS.type,
    appliedFilters.result !== EMPTY_FILTERS.result,
    appliedFilters.deviceChanged,
  ].filter(Boolean).length;

  const handleApplyFilters = () => {
    if (
      filters.fromDate &&
      filters.toDate &&
      filters.fromDate > filters.toDate
    ) {
      toast.error(
        tr(
          language,
          "تاريخ البداية يجب أن يسبق تاريخ النهاية.",
          "Start date must be before end date.",
        ),
      );
      return;
    }
    setPage(1);
    setAppliedFilters(filters);
  };

  const handleResetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const toggleDeviceVisibility = (key: string) => {
    setVisibleDeviceIds((current) => {
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
    if (appliedFilters.zoneId === "all") {
      toast.error(
        tr(language, "اختر نطاق الحضور أولًا.", "Select a work zone first."),
      );
      return;
    }
    if (!appliedFilters.month) {
      toast.error(tr(language, "اختر الشهر أولًا.", "Select a month first."));
      return;
    }

    const selectedZone = workZones.find(
      (zone) => zone.id === appliedFilters.zoneId,
    );
    if (!selectedZone) {
      toast.error(
        tr(language, "تعذر تحديد نطاق الحضور.", "Could not resolve work zone."),
      );
      return;
    }

    setExporting(true);
    try {
      const collected: AttendanceRecord[] = [];
      let cursor: string | undefined;
      do {
        const response = await fetchAttendanceRecords({
          ...toRequestFilters(appliedFilters),
          employeeUid: undefined,
          limit: 200,
          cursor,
        });
        collected.push(...response.records);
        cursor = response.nextCursor || undefined;
      } while (cursor && collected.length < 10000);

      const assignedEmployees = selectedZoneEmployees.filter(
        (employee) =>
          appliedFilters.employeeUid === "all" ||
          employee.uid === appliedFilters.employeeUid,
      );
      const assignedEmployeeUids = new Set(
        assignedEmployees.map((employee) => employee.uid),
      );
      const exportedRecords = enrichAttendanceRecordsWithNames(
        collected.filter((record) => assignedEmployeeUids.has(record.employeeUid)),
        employeeNameMap,
      );

      exportAttendanceExcel({
        records: exportedRecords,
        employees: assignedEmployees,
        zone: selectedZone,
        month: appliedFilters.month,
        language,
      });
      toast.success(
        tr(
          language,
          `تم إنشاء كشف Excel لنطاق ${selectedZone.name} ويشمل ${assignedEmployees.length} موظفًا.`,
          `Excel report created for ${selectedZone.name} with ${assignedEmployees.length} employees.`,
        ),
      );
    } catch (exportError) {
      console.error("hr_attendance_export_failed", exportError);
      toast.error(
        tr(language, "تعذر إنشاء كشف Excel.", "Could not create Excel report."),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout area="hr">
      <main
        dir={languageDir(language)}
        className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_42%,#f8fafc_100%)] px-3 py-4 text-slate-950 sm:px-5 lg:px-7"
      >
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5">
          <header className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
            <div className="grid gap-5 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_52%,#eefdf8_100%)] px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-6">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <CalendarCheck2 className="h-4 w-4" />
                  {tr(language, "الموارد البشرية", "Human Resources")}
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                  <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
                    {tr(language, "الحضور والانصراف", "Attendance")}
                  </h1>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {tr(
                      language,
                      `${data?.total || 0} سجل مطابق`,
                      `${data?.total || 0} matching records`,
                    )}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Button
                  variant="outline"
                  className="h-11 rounded-2xl border-slate-200 bg-white px-4 shadow-sm hover:bg-slate-50"
                  onClick={() => void loadRecords()}
                  disabled={loading}
                >
                  <RefreshCw
                    className={cn("h-4 w-4", loading && "animate-spin")}
                  />
                  {tr(language, "تحديث", "Refresh")}
                </Button>
                <Button
                  className="h-11 rounded-2xl bg-slate-950 px-4 shadow-sm hover:bg-slate-800"
                  onClick={() => void handleExport()}
                  disabled={exporting}
                >
                  <Download className="h-4 w-4" />
                  {tr(language, "تصدير Excel", "Export Excel")}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 p-px md:grid-cols-5">
              {summaryCards.map((card) => (
                <MetricCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  icon={card.icon}
                  tone={card.tone}
                />
              ))}
            </div>
          </header>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <SlidersHorizontal className="h-5 w-5" />
                </span>
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
                        : "No active filters",
                    )}
                  </p>
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                <Checkbox
                  checked={filters.deviceChanged}
                  onCheckedChange={(checked) =>
                    setFilters((current) => ({
                      ...current,
                      deviceChanged: checked === true,
                    }))
                  }
                />
                {tr(language, "جهاز جديد فقط", "New device only")}
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
              <div className="space-y-2 xl:col-span-2">
                <Label className="text-xs font-semibold text-slate-600">
                  {tr(language, "نطاق الحضور", "Work zone")}
                </Label>
                <Select
                  value={filters.zoneId}
                  onValueChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      zoneId: value,
                      employeeUid: "all",
                    }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-2xl border-slate-200 bg-slate-50/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {tr(language, "جميع النطاقات", "All work zones")}
                    </SelectItem>
                    {zoneOptions.map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>
                        {zone.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 xl:col-span-2">
                <Label
                  htmlFor="attendance-month"
                  className="text-xs font-semibold text-slate-600"
                >
                  {tr(language, "الشهر", "Month")}
                </Label>
                <Input
                  id="attendance-month"
                  type="month"
                  className="h-11 rounded-2xl border-slate-200 bg-slate-50/70"
                  value={filters.month}
                  onChange={(event) => {
                    const month = event.target.value;
                    const range = monthToDateRange(month);
                    setFilters((current) => ({
                      ...current,
                      month,
                      fromDate: range?.fromDate || "",
                      toDate: range?.toDate || "",
                    }));
                  }}
                />
              </div>

              <div className="space-y-2 xl:col-span-2">
                <Label className="text-xs font-semibold text-slate-600">
                  {tr(language, "الموظف", "Employee")}
                </Label>
                <Select
                  value={filters.employeeUid}
                  onValueChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      employeeUid: value,
                    }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-2xl border-slate-200 bg-slate-50/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {tr(language, `جميع الموظفين (${employeeOptions.length})`, `All employees (${employeeOptions.length})`)}
                    </SelectItem>
                    {employeeOptions.map((employee) => (
                      <SelectItem key={employee.uid} value={employee.uid}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 xl:col-span-2">
                <Label
                  htmlFor="attendance-from"
                  className="text-xs font-semibold text-slate-600"
                >
                  {tr(language, "من تاريخ", "From")}
                </Label>
                <Input
                  id="attendance-from"
                  type="date"
                  className="h-11 rounded-2xl border-slate-200 bg-slate-50/70"
                  value={filters.fromDate}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      month: "",
                      fromDate: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2 xl:col-span-2">
                <Label
                  htmlFor="attendance-to"
                  className="text-xs font-semibold text-slate-600"
                >
                  {tr(language, "إلى تاريخ", "To")}
                </Label>
                <Input
                  id="attendance-to"
                  type="date"
                  className="h-11 rounded-2xl border-slate-200 bg-slate-50/70"
                  value={filters.toDate}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      month: "",
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
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, type: value }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-2xl border-slate-200 bg-slate-50/70">
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
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, result: value }))
                  }
                >
                  <SelectTrigger className="h-11 rounded-2xl border-slate-200 bg-slate-50/70">
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

            <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
              <Button
                variant="ghost"
                className="h-10 rounded-2xl px-4"
                onClick={handleResetFilters}
              >
                {tr(language, "مسح", "Clear")}
              </Button>
              <Button
                className="h-10 rounded-2xl bg-slate-950 px-4 hover:bg-slate-800"
                onClick={handleApplyFilters}
              >
                <Filter className="h-4 w-4" />
                {tr(language, "تطبيق", "Apply")}
              </Button>
            </div>
          </section>

          <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Activity className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">
                    {tr(language, "سجل العمليات", "Attendance log")}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {tr(
                      language,
                      "عرض مدمج للموقع والجهاز والنتيجة لكل عملية",
                      "A compact view of location, device and result for each event",
                    )}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className="w-fit rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600"
              >
                {tr(
                  language,
                  `${displayRecords.length} سجل في الصفحة`,
                  `${displayRecords.length} records on this page`,
                )}
              </Badge>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-2xl" />
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
            ) : !displayRecords.length ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center text-slate-500">
                <SearchX className="h-8 w-8" />
                <p className="text-sm">
                  {tr(
                    language,
                    "لا توجد سجلات مطابقة.",
                    "No matching records.",
                  )}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3 p-3 xl:hidden">
                  {displayRecords.map((record) => (
                    <AttendanceMobileCard
                      key={record.id}
                      record={record}
                      language={language}
                      visibleDeviceIds={visibleDeviceIds}
                      onToggleDevice={toggleDeviceVisibility}
                    />
                  ))}
                </div>

                <div className="hidden max-h-[62vh] overflow-x-hidden overflow-y-auto bg-slate-50/60 px-3 pb-3 xl:block">
                  <Table className="w-full table-fixed border-separate border-spacing-y-3">
                    <TableHeader>
                      <TableRow className="sticky top-0 z-10 border-0 bg-slate-50/95 backdrop-blur">
                        <TableHead className="h-12 w-[34%] px-5 text-xs font-semibold text-slate-500">
                          {tr(language, "الموظف", "Employee")}
                        </TableHead>
                        <TableHead className="hidden">
                          {tr(language, "العملية والنتيجة", "Operation")}
                        </TableHead>
                        <TableHead className="hidden">
                          {tr(language, "التاريخ والوقت", "Date and time")}
                        </TableHead>
                        <TableHead className="h-12 w-[28%] px-4 text-xs font-semibold text-slate-500">
                          {tr(language, "الموقع", "Location")}
                        </TableHead>
                        <TableHead className="h-12 w-[38%] px-5 text-xs font-semibold text-slate-500">
                          {tr(language, "الجهاز", "Device")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayRecords.map((record) => (
                        <TableRow
                          key={record.id}
                          className="group border-0 transition"
                        >
                          <TableCell className="rounded-r-[1.25rem] border-y border-r border-slate-200 bg-white px-3 py-3 align-top shadow-sm shadow-slate-200/60 transition group-hover:bg-slate-50/60">
                            <AttendanceEventBlock
                              record={record}
                              language={language}
                            />
                          </TableCell>
                          <TableCell className="hidden">
                            <OperationBlock
                              record={record}
                              language={language}
                            />
                          </TableCell>
                          <TableCell className="hidden">
                            <TimeBlock record={record} language={language} />
                          </TableCell>
                          <TableCell className="border-y border-slate-200 bg-white px-3 py-3 align-top shadow-sm shadow-slate-200/60 transition group-hover:bg-slate-50/60">
                            <LocationBlock
                              record={record}
                              language={language}
                            />
                          </TableCell>
                          <TableCell className="rounded-l-[1.25rem] border-y border-l border-slate-200 bg-white px-3 py-3 align-top shadow-sm shadow-slate-200/60 transition group-hover:bg-slate-50/60">
                            <DeviceBlock
                              record={record}
                              language={language}
                              visibleDeviceIds={visibleDeviceIds}
                              onToggleDevice={toggleDeviceVisibility}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <span className="text-sm text-slate-500">
              {tr(
                language,
                `صفحة ${page} من ${totalPages}`,
                `Page ${page} of ${totalPages}`,
              )}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-10 rounded-2xl border-slate-200 bg-white px-4 shadow-sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {tr(language, "السابق", "Previous")}
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-2xl border-slate-200 bg-white px-4 shadow-sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => current + 1)}
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
