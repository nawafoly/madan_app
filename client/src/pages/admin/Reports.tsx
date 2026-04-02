// client/src/pages/admin/Reports.tsx
import { type ReactNode, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import AdminPanelStatCard from "@/components/AdminPanelStatCard";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";
import {
  formatCompactNumberEN,
  formatCurrencyEN,
  formatCurrencyShort,
  formatNumberEN,
  formatPercentEN,
} from "@/lib/formatters";
import { normalizeWorkflowStatus } from "@shared/investmentLifecycle";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Area,
  BarChart,
  Bar,
  ComposedChart,
  LabelList,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  TrendingUp,
  DollarSign,
  Users,
  Building2,
  Minus,
} from "lucide-react";
import { toast } from "sonner";

type AnyDoc = Record<string, any> & { id: string };
type ReportType =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";
type TrendKind = "increase" | "decrease" | "flat" | "new";
type TrendMeta = {
  kind: TrendKind;
  label: string;
  toneClassName: string;
};

type TimeSeriesRow = {
  label: string;
  fullLabel: string;
  investments: number;
  returns: number;
  recordCount: number;
  investmentChangeLabel: string;
  investmentChangeKind: TrendKind;
  returnsChangeLabel: string;
  returnsChangeKind: TrendKind;
};

type DistributionRow = {
  name: string;
  value: number;
  color: string;
  percent: number;
  displayValue: string;
};

type InvestmentReportStatusKey =
  | "processing"
  | "approved"
  | "active"
  | "completed"
  | "rejected"
  | "other";

const INVESTMENT_REPORT_STATUS_ORDER: InvestmentReportStatusKey[] = [
  "processing",
  "approved",
  "active",
  "completed",
  "rejected",
  "other",
];

const INVESTMENT_REPORT_STATUS_META: Record<
  InvestmentReportStatusKey,
  { label: string; color: string }
> = {
  processing: {
    label: "قيد المعالجة",
    color: "#F2B705",
  },
  approved: {
    label: "جاهزة للتفعيل",
    color: "#2563EB",
  },
  active: {
    label: "نشطة",
    color: "#10B981",
  },
  completed: {
    label: "مكتملة",
    color: "#6366F1",
  },
  rejected: {
    label: "مرفوضة",
    color: "#EF4444",
  },
  other: {
    label: "أخرى",
    color: "#64748B",
  },
};

const MONTH_NAMES_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function getReportTypeLabel(reportType: ReportType) {
  if (reportType === "daily") return "يومي";
  if (reportType === "weekly") return "أسبوعي";
  if (reportType === "monthly") return "شهري";
  if (reportType === "quarterly") return "ربع سنوي";
  return "سنوي";
}

function formatDayMonthLabel(date: Date) {
  return `${formatNumberEN(date.getDate())} ${MONTH_NAMES_AR[date.getMonth()]}`;
}

function formatDailyAxisLabel(date: Date) {
  return `${formatNumberEN(date.getDate())}/${formatNumberEN(date.getMonth() + 1)}`;
}

function formatDashboardPercent(value: number) {
  return formatPercentEN(value, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  });
}

function formatSignedDashboardPercent(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatDashboardPercent(Math.abs(value))}`;
}

function getTrendMeta(current: number, previous: number): TrendMeta {
  if (previous === 0 && current > 0) {
    return {
      kind: "new",
      label: "جديد",
      toneClassName: "text-blue-700",
    };
  }

  if (previous === 0 && current === 0) {
    return {
      kind: "flat",
      label: formatSignedDashboardPercent(0),
      toneClassName: "text-slate-600",
    };
  }

  const value = ((current - previous) / previous) * 100;

  if (Math.abs(value) < 0.05) {
    return {
      kind: "flat",
      label: formatSignedDashboardPercent(0),
      toneClassName: "text-slate-600",
    };
  }

  if (value > 0) {
    return {
      kind: "increase",
      label: formatSignedDashboardPercent(value),
      toneClassName: "text-emerald-700",
    };
  }

  return {
    kind: "decrease",
    label: formatSignedDashboardPercent(value),
    toneClassName: "text-rose-700",
  };
}

function buildYAxisDomain(values: number[]) {
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);

  if (max <= 0) return [0, 1];

  if (max === min) {
    const padding = Math.max(max * 0.15, 1);
    return [Math.max(0, max - padding), max + padding];
  }

  const range = max - min;
  const padding = Math.max(range * 0.22, max * 0.08, 1);
  return [Math.max(0, min - padding), max + padding];
}

function TrendIcon({
  kind,
  className = "h-4 w-4",
}: {
  kind: TrendKind;
  className?: string;
}) {
  if (kind === "increase" || kind === "new") {
    return <ArrowUpRight className={className} />;
  }

  if (kind === "decrease") {
    return <ArrowDownRight className={className} />;
  }

  return <Minus className={className} />;
}

export default function Reports() {
  const [reportType, setReportType] = useState<ReportType>("monthly");
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));

  const [projects, setProjects] = useState<AnyDoc[]>([]);
  const [investments, setInvestments] = useState<AnyDoc[]>([]);
  const [users, setUsers] = useState<AnyDoc[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  /* =========================
     Helpers
  ========================= */
  const toNumberSafe = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const cleanText = (value: unknown) => {
    const text = String(value ?? "").trim();
    return text && text !== "undefined" && text !== "null" ? text : "";
  };

  const toDateSafe = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (typeof value?.toDate === "function") return value.toDate();
    if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
    if (typeof value === "number") return new Date(value);
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  };

  const firstDate = (...values: unknown[]) => {
    for (const value of values) {
      const date = toDateSafe(value);
      if (date) return date;
    }
    return null;
  };

  // Reporting must not depend on createdAt alone.
  // Some live records only become reliably dateable through workflow fields
  // such as approvedAt / signedAt / startAt, and older payloads may use
  // created_at / date / timestamp / submittedAt.
  const getInvestmentReportDate = (investment: AnyDoc) =>
    firstDate(
      investment?.createdAt,
      investment?.created_at,
      investment?.approvedAt,
      investment?.signedAt,
      investment?.startAt,
      investment?.date,
      investment?.timestamp,
      investment?.submittedAt
    );

  const getInvestmentAmount = (investment: AnyDoc) =>
    toNumberSafe(investment?.approvedAmount ?? investment?.amount ?? 0);

  const getEstimatedReturnValue = (investment: AnyDoc) =>
    toNumberSafe(
      investment?.expectedProfit ??
        investment?.estimatedReturn ??
        investment?.earnedProfit ??
        0
    );

  const getProjectTypeKey = (project: AnyDoc) => {
    const rawType =
      project?.projectType ??
      project?.type ??
      project?.category ??
      ((project?.isVip === true || project?.isVip === "true") ? "vip_exclusive" : "");

    return String(rawType ?? "").trim().toLowerCase();
  };

  const getInvestmentStatusKey = (
    status: unknown
  ): InvestmentReportStatusKey => {
    const normalized = normalizeWorkflowStatus(status);

    if (
      [
        "pending",
        "pending_review",
        "reviewing",
        "new",
        "in_progress",
        "needs_account",
        "pending_contract",
        "signing",
        "signed",
      ].includes(normalized)
    ) {
      return "processing";
    }

    if (normalized === "approved") return "approved";
    if (normalized === "active") return "active";
    if (["completed", "closed", "resolved"].includes(normalized)) return "completed";
    if (["rejected", "cancelled"].includes(normalized)) return "rejected";

    return "other";
  };

  const findInvestorUserRecord = (investment: AnyDoc) => {
    const directIds = [
      investment?.investorUid,
      investment?.userId,
      investment?.investorId,
      investment?.clientId,
      investment?.uid,
      investment?.userSnapshot?.uid,
      investment?.userSnapshot?.userId,
      investment?.userSnapshot?.authUid,
    ]
      .map(cleanText)
      .filter(Boolean);

    if (directIds.length > 0) {
      const linkedUser = users.find((user) => {
        const userIds = [user?.id, user?.uid, user?.userId, user?.authUid]
          .map(cleanText)
          .filter(Boolean);

        return directIds.some((id) => userIds.includes(id));
      });

      if (linkedUser) return linkedUser;
    }

    const emailCandidates = [
      investment?.investorEmail,
      investment?.userSnapshot?.email,
    ]
      .map((value) => cleanText(value).toLowerCase())
      .filter(Boolean);

    if (emailCandidates.length > 0) {
      return (
        users.find((user) =>
          emailCandidates.includes(cleanText(user?.email).toLowerCase())
        ) ?? null
      );
    }

    return null;
  };

  const getInvestorIdentityKey = (investment: AnyDoc) => {
    const linkedUser = findInvestorUserRecord(investment);
    const linkedUserKey = [
      linkedUser?.id,
      linkedUser?.uid,
      linkedUser?.userId,
      linkedUser?.authUid,
    ]
      .map(cleanText)
      .find(Boolean);

    if (linkedUserKey) return `user:${linkedUserKey}`;

    const directIdKey = [
      investment?.investorUid,
      investment?.userId,
      investment?.investorId,
      investment?.clientId,
      investment?.uid,
      investment?.userSnapshot?.uid,
      investment?.userSnapshot?.userId,
      investment?.userSnapshot?.authUid,
    ]
      .map(cleanText)
      .find(Boolean);

    if (directIdKey) return `user:${directIdKey}`;

    const emailKey = [
      investment?.investorEmail,
      investment?.userSnapshot?.email,
      linkedUser?.email,
    ]
      .map((value) => cleanText(value).toLowerCase())
      .find(Boolean);

    if (emailKey) return `email:${emailKey}`;

    const phoneKey = [
      investment?.investorPhone,
      investment?.userSnapshot?.phone,
      linkedUser?.phone,
    ]
      .map((value) => cleanText(value).replace(/\s+/g, ""))
      .find(Boolean);

    if (phoneKey) return `phone:${phoneKey}`;

    const nameKey = [
      investment?.investorName,
      investment?.userSnapshot?.displayName,
      investment?.userSnapshot?.name,
      linkedUser?.displayName,
      linkedUser?.name,
      linkedUser?.fullName,
      linkedUser?.profile?.name,
    ]
      .map((value) => cleanText(value).toLowerCase())
      .find(Boolean);

    if (nameKey) return `name:${nameKey}`;

    return "";
  };

  const monthNames = MONTH_NAMES_AR;

  /* =========================
     Load data (Realtime)
  ========================= */
  useEffect(() => {
    setLoading(true);
    setError("");

    const unsubs: Array<() => void> = [];
    const loadedCollections = new Set<string>();
    const markCollectionDone = (colName: string) => {
      loadedCollections.add(colName);
      if (loadedCollections.size >= 3) {
        setLoading(false);
      }
    };

    const sub = (colName: string, setter: (rows: AnyDoc[]) => void) => {
      const unsub = onSnapshot(
        collection(db, colName),
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          setter(rows);
          markCollectionDone(colName);
        },
        (err) => {
          console.error(`${colName} snapshot error:`, err);
          setError("تعذر تحميل بيانات التقارير (صلاحيات/اتصال).");
          markCollectionDone(colName);
        }
      );
      unsubs.push(unsub);
    };

    // ✅ نعتبر المشاريع هي التي توقف التحميل
    sub("projects", setProjects);
    sub("investments", setInvestments);
    sub("users", setUsers);

    return () => unsubs.forEach((u) => u());
  }, []);

  /* =========================
     Filters
  ========================= */
  const availableReportYears = useMemo(() => {
    const years = new Set<number>();

    for (const investment of investments) {
      const date = getInvestmentReportDate(investment);
      if (date) years.add(date.getFullYear());
    }

    return Array.from(years).sort((left, right) => right - left).map(String);
  }, [investments]);

  useEffect(() => {
    if (availableReportYears.length === 0) return;
    if (!availableReportYears.includes(selectedYear)) {
      setSelectedYear(availableReportYears[0]);
    }
  }, [availableReportYears, selectedYear]);

  const yearOptions = useMemo(() => {
    if (availableReportYears.length > 0) return availableReportYears;
    return [String(new Date().getFullYear())];
  }, [availableReportYears]);

  const yearNum = useMemo(() => {
    const fallbackYear = yearOptions[0] ?? String(new Date().getFullYear());
    return Number(selectedYear || fallbackYear);
  }, [selectedYear, yearOptions]);
  const reportTypeLabel = useMemo(
    () => getReportTypeLabel(reportType),
    [reportType]
  );

  const investmentsInYear = useMemo(() => {
    return investments.filter((inv) => {
      const dt = getInvestmentReportDate(inv);
      return dt ? dt.getFullYear() === yearNum : false;
    });
  }, [investments, yearNum]);

  /* =========================
     Calculations
  ========================= */
  const totalInvestments = useMemo(
    () =>
      investmentsInYear.reduce(
        (sum, investment) => sum + getInvestmentAmount(investment),
        0
      ),
    [investmentsInYear]
  );

  const totalProjects = projects.length;

  // NOTE: حسب كودك السابق تعتبر المستثمرين = users.role === "user"
  const totalInvestors = useMemo(() => {
    const uniqueInvestorKeys = new Set<string>();

    for (const investment of investmentsInYear) {
      const identityKey = getInvestorIdentityKey(investment);
      if (identityKey) uniqueInvestorKeys.add(identityKey);
    }

    return uniqueInvestorKeys.size;
  }, [investmentsInYear, users]);

  const avgInvestment = totalInvestors > 0 ? totalInvestments / totalInvestors : 0;

  /* =========================
     Charts data (Dynamic)
  ========================= */

  const timeSeriesData = useMemo<TimeSeriesRow[]>(() => {
    const yearStart = new Date(yearNum, 0, 1);
    const yearEnd = new Date(yearNum, 11, 31);
    const totalDaysInYear = Math.round(
      (new Date(yearNum + 1, 0, 1).getTime() - yearStart.getTime()) /
        (1000 * 60 * 60 * 24)
    );

    const addRow = (
      label: string,
      fullLabel: string,
      investmentsValue: number,
      returnsValue: number,
      recordCount: number
    ) => ({
      label,
      fullLabel,
      investments: Math.round(investmentsValue),
      returns: Math.round(returnsValue),
      recordCount,
    });

    let rows: Array<{
      label: string;
      fullLabel: string;
      investments: number;
      returns: number;
      recordCount: number;
    }> = [];

    if (reportType === "yearly") {
      const totalReturns = investmentsInYear.reduce(
        (sum, investment) => sum + getEstimatedReturnValue(investment),
        0
      );

      rows = [
        addRow(
          String(yearNum),
          `سنة ${yearNum}`,
          totalInvestments,
          totalReturns,
          investmentsInYear.length
        ),
      ];
    } else if (reportType === "quarterly") {
      const quarters = [
        { label: "Q1", fullLabel: `الربع الأول ${yearNum}`, months: [0, 1, 2] },
        { label: "Q2", fullLabel: `الربع الثاني ${yearNum}`, months: [3, 4, 5] },
        { label: "Q3", fullLabel: `الربع الثالث ${yearNum}`, months: [6, 7, 8] },
        { label: "Q4", fullLabel: `الربع الرابع ${yearNum}`, months: [9, 10, 11] },
      ];

      rows = quarters.map((quarter) => {
        const investmentsTotal = investmentsInYear.reduce((sum, investment) => {
          const dt = getInvestmentReportDate(investment);
          if (!dt || !quarter.months.includes(dt.getMonth())) return sum;
          return sum + getInvestmentAmount(investment);
        }, 0);

        const returnsTotal = investmentsInYear.reduce((sum, investment) => {
          const dt = getInvestmentReportDate(investment);
          if (!dt || !quarter.months.includes(dt.getMonth())) return sum;
          return sum + getEstimatedReturnValue(investment);
        }, 0);

        const recordCount = investmentsInYear.filter((investment) => {
          const dt = getInvestmentReportDate(investment);
          return Boolean(dt && quarter.months.includes(dt.getMonth()));
        }).length;

        return addRow(
          quarter.label,
          quarter.fullLabel,
          investmentsTotal,
          returnsTotal,
          recordCount
        );
      });
    } else if (reportType === "weekly") {
      const totalWeeks = Math.ceil(totalDaysInYear / 7);

      rows = Array.from({ length: totalWeeks }, (_, weekIndex) => {
        const rangeStart = new Date(yearNum, 0, 1 + weekIndex * 7);
        const rangeEndExclusive = new Date(yearNum, 0, 1 + weekIndex * 7 + 7);
        const rangeEnd = new Date(Math.min(rangeEndExclusive.getTime() - 1, yearEnd.getTime()));

        let investmentsTotal = 0;
        let returnsTotal = 0;
        let recordCount = 0;

        for (const investment of investmentsInYear) {
          const dt = getInvestmentReportDate(investment);
          if (!dt) continue;
          if (dt < rangeStart || dt >= rangeEndExclusive) continue;

          investmentsTotal += getInvestmentAmount(investment);
          returnsTotal += getEstimatedReturnValue(investment);
          recordCount += 1;
        }

        return addRow(
          `أسبوع ${formatNumberEN(weekIndex + 1)}`,
          `الأسبوع ${formatNumberEN(weekIndex + 1)} - ${formatDayMonthLabel(
            rangeStart
          )} - ${formatDayMonthLabel(rangeEnd)} ${yearNum}`,
          investmentsTotal,
          returnsTotal,
          recordCount
        );
      });
    } else if (reportType === "daily") {
      rows = Array.from({ length: totalDaysInYear }, (_, dayIndex) => {
        const currentDate = new Date(yearNum, 0, 1 + dayIndex);

        let investmentsTotal = 0;
        let returnsTotal = 0;
        let recordCount = 0;

        for (const investment of investmentsInYear) {
          const dt = getInvestmentReportDate(investment);
          if (!dt) continue;
          if (
            dt.getFullYear() !== currentDate.getFullYear() ||
            dt.getMonth() !== currentDate.getMonth() ||
            dt.getDate() !== currentDate.getDate()
          ) {
            continue;
          }

          investmentsTotal += getInvestmentAmount(investment);
          returnsTotal += getEstimatedReturnValue(investment);
          recordCount += 1;
        }

        return addRow(
          formatDailyAxisLabel(currentDate),
          `${formatDayMonthLabel(currentDate)} ${yearNum}`,
          investmentsTotal,
          returnsTotal,
          recordCount
        );
      });
    } else {
      rows = monthNames.map((name, monthIndex) => {
        const investmentsTotal = investmentsInYear.reduce((sum, investment) => {
          const dt = getInvestmentReportDate(investment);
          if (!dt || dt.getMonth() !== monthIndex) return sum;
          return sum + getInvestmentAmount(investment);
        }, 0);

        const returnsTotal = investmentsInYear.reduce((sum, investment) => {
          const dt = getInvestmentReportDate(investment);
          if (!dt || dt.getMonth() !== monthIndex) return sum;
          return sum + getEstimatedReturnValue(investment);
        }, 0);

        const recordCount = investmentsInYear.filter((investment) => {
          const dt = getInvestmentReportDate(investment);
          return Boolean(dt && dt.getMonth() === monthIndex);
        }).length;

        return addRow(
          name,
          `${name} ${yearNum}`,
          investmentsTotal,
          returnsTotal,
          recordCount
        );
      });
    }

    return rows.map((row, index) => {
      const previous = rows[index - 1];
      const investmentsChange = getTrendMeta(row.investments, previous?.investments ?? 0);
      const returnsChange = getTrendMeta(row.returns, previous?.returns ?? 0);

      return {
        ...row,
        investmentChangeLabel: investmentsChange.label,
        investmentChangeKind: investmentsChange.kind,
        returnsChangeLabel: returnsChange.label,
        returnsChangeKind: returnsChange.kind,
      };
    });
  }, [reportType, yearNum, investmentsInYear, totalInvestments, monthNames]);

  const timeSeriesSummary = useMemo(() => {
    const totalReturns = timeSeriesData.reduce((sum, row) => sum + row.returns, 0);
    const hasData = timeSeriesData.some(
      (row) => row.recordCount > 0 || row.investments > 0 || row.returns > 0
    );
    const hasReturnsData = timeSeriesData.some((row) => row.returns > 0);
    const bestRow =
      [...timeSeriesData].sort((a, b) => b.investments - a.investments)[0] ?? null;
    const latestRow = timeSeriesData[timeSeriesData.length - 1] ?? null;
    const previousRow = timeSeriesData[timeSeriesData.length - 2] ?? null;
    const latestTrend = getTrendMeta(
      latestRow?.investments ?? 0,
      previousRow?.investments ?? 0
    );
    const uniquePoints = new Set(
      timeSeriesData.map((row) => `${row.investments}-${row.returns}`)
    ).size;
    const lowData =
      hasData &&
      (timeSeriesData.filter((row) => row.recordCount > 0).length <= 2 ||
        uniquePoints <= 2);

    return {
      totalReturns,
      hasData,
      hasReturnsData,
      bestRow: bestRow && bestRow.investments > 0 ? bestRow : null,
      latestTrend,
      lowData,
      yAxisDomain: buildYAxisDomain(
        timeSeriesData.flatMap((row) => [row.investments, row.returns])
      ),
    };
  }, [timeSeriesData]);

  const projectDistribution = useMemo(() => {
    const rows = [
      {
        name: "صكوك",
        value: projects.filter((project) => getProjectTypeKey(project) === "sukuk").length,
        color: "#F2B705",
      },
      {
        name: "تطوير أراضي",
        value: projects.filter((project) => getProjectTypeKey(project) === "land_development").length,
        color: "#030640",
      },
      {
        name: "VIP حصري",
        value: projects.filter((project) => getProjectTypeKey(project) === "vip_exclusive").length,
        color: "#8B7355",
      },
      {
        name: "أخرى",
        value: projects.filter((project) => {
          const typeKey = getProjectTypeKey(project);
          return !["sukuk", "land_development", "vip_exclusive"].includes(typeKey);
        }).length,
        color: "#64748B",
      },
    ];

    const total = rows.reduce((sum, row) => sum + row.value, 0);
    const enhancedRows = rows
      .map((row) => ({
        ...row,
        percent: total > 0 ? (row.value / total) * 100 : 0,
        displayValue:
          total > 0
            ? `${formatNumberEN(row.value)} مشروع | ${formatDashboardPercent(
                (row.value / total) * 100
              )}`
            : formatNumberEN(row.value),
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
      total,
      rows: enhancedRows,
      dominant: enhancedRows[0] ?? null,
    };
  }, [projects]);

  const investmentStatusDistribution = useMemo(() => {
    const counts = new Map<InvestmentReportStatusKey, number>();

    for (const statusKey of INVESTMENT_REPORT_STATUS_ORDER) {
      counts.set(statusKey, 0);
    }

    for (const investment of investmentsInYear) {
      const statusKey = getInvestmentStatusKey(investment?.status);
      counts.set(statusKey, (counts.get(statusKey) ?? 0) + 1);
    }

    const rows = INVESTMENT_REPORT_STATUS_ORDER.map((statusKey) => ({
      name: INVESTMENT_REPORT_STATUS_META[statusKey].label,
      value: counts.get(statusKey) ?? 0,
      color: INVESTMENT_REPORT_STATUS_META[statusKey].color,
    }));

    const total = rows.reduce((sum, row) => sum + row.value, 0);
    const enhancedRows = rows
      .map((row) => ({
        ...row,
        percent: total > 0 ? (row.value / total) * 100 : 0,
        displayValue:
          total > 0
            ? `${formatNumberEN(row.value)} حالة | ${formatDashboardPercent(
                (row.value / total) * 100
              )}`
            : formatNumberEN(row.value),
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
      total,
      rows: enhancedRows,
      dominant: enhancedRows[0] ?? null,
      smallest: enhancedRows[enhancedRows.length - 1] ?? null,
    };
  }, [investmentsInYear]);

  /* =========================
     Export (placeholder)
  ========================= */
  const handleExportPDF = () => {
    toast.success("تصدير PDF (لاحقًا)");
  };

  const handleExportExcel = () => {
    toast.success("تصدير Excel (لاحقًا)");
  };

  /* =========================
     UI
  ========================= */
  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              التقارير المالية
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-500">
              قسم تقارير تنفيذي لقراءة الاستثمار والمشاريع وحالات السجلات بسرعة، مع
              تركيز أكبر على الوضوح البصري واستغلال المساحة والتحليل السريع.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={reportType} onValueChange={(value: ReportType) => setReportType(value)}>
              <SelectTrigger className="w-[140px] sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">يومي</SelectItem>
                <SelectItem value="weekly">أسبوعي</SelectItem>
                <SelectItem value="monthly">شهري</SelectItem>
                <SelectItem value="quarterly">ربع سنوي</SelectItem>
                <SelectItem value="yearly">سنوي</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[110px] sm:w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={handleExportPDF}>
              <Download className="mr-2 h-4 w-4" /> PDF
            </Button>
            <Button className="bg-[#F2B705] hover:bg-[#d9a504]" onClick={handleExportExcel}>
              <Download className="mr-2 h-4 w-4" /> Excel
            </Button>
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center">جاري التحميل...</CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-10 text-center text-red-600">{error}</CardContent>
          </Card>
        ) : null}

        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminPanelStatCard
            title="إجمالي الاستثمارات"
            value={formatCurrencyEN(totalInvestments)}
            description="القيمة الإجمالية للاستثمارات المحتسبة ضمن بيانات التقارير المحملة حاليًا."
            helper={`سنة التقرير: ${selectedYear}`}
            icon={<DollarSign className="h-5 w-5" />}
            accent="amber"
            valueClassName="text-3xl sm:text-4xl"
          />
          <AdminPanelStatCard
            title="عدد المشاريع"
            value={totalProjects}
            description="إجمالي المشاريع الداخلة في التقارير والتحليلات الحالية عبر النظام."
            helper={`نوع العرض: ${reportTypeLabel}`}
            icon={<Building2 className="h-5 w-5" />}
            accent="blue"
          />
          <AdminPanelStatCard
            title="عدد المستثمرين"
            value={totalInvestors}
            description="عدد المستثمرين الفريدين المرتبطين بسجلات الاستثمار الظاهرة داخل الفترة الحالية."
            helper={`محتسب من ${formatNumberEN(investmentsInYear.length)} سجل استثمار داخل سنة ${selectedYear}`}
            icon={<Users className="h-5 w-5" />}
            accent="emerald"
          />
          <AdminPanelStatCard
            title="متوسط الاستثمار"
            value={formatCurrencyEN(Math.round(avgInvestment))}
            description="متوسط الاستثمار لكل مستثمر فريد ضمن نفس السجلات المستخدمة في التقرير الحالي."
            helper={`موزع على ${formatNumberEN(totalInvestors)} مستثمر`}
            icon={<TrendingUp className="h-5 w-5" />}
            accent="slate"
            valueClassName="text-3xl sm:text-4xl"
          />
        </div>

        <Card className="overflow-hidden border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_100%)] shadow-[0_18px_48px_-28px_rgba(15,23,42,0.18)]">
          <CardHeader className="border-b border-slate-100/90 pb-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="text-xl text-slate-950">
                  اتجاه الاستثمارات {reportTypeLabel} ({selectedYear})
                </CardTitle>
                <CardDescription className="max-w-3xl text-sm leading-6 text-slate-500">
                  قراءة تنفيذية لحركة الاستثمارات والعوائد التقديرية داخل الفترة
                  المعروضة، مع إبراز أفضل فترة وآخر اتجاه نمو.
                </CardDescription>
              </div>

              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                الفترة المعروضة: {reportTypeLabel} {selectedYear}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ExecutiveMetric
                label="إجمالي الاستثمار السنوي"
                value={formatCurrencyShort(totalInvestments, {
                  maximumFractionDigits: 1,
                })}
                helper={`${formatNumberEN(investmentsInYear.length)} سجل ضمن السنة`}
              />
              <ExecutiveMetric
                label="إجمالي العوائد التقديرية"
                value={formatCurrencyShort(timeSeriesSummary.totalReturns, {
                  maximumFractionDigits: 1,
                })}
                helper={
                  timeSeriesSummary.hasReturnsData
                    ? "محسوبة من الحقول التقديرية المتاحة"
                    : "العوائد التقديرية غير متوفرة بشكل كافٍ حاليًا"
                }
              />
              <ExecutiveMetric
                label="أفضل فترة"
                value={timeSeriesSummary.bestRow?.label || "لا توجد"}
                helper={
                  timeSeriesSummary.bestRow
                    ? formatCurrencyShort(timeSeriesSummary.bestRow.investments, {
                        maximumFractionDigits: 1,
                      })
                    : "لا توجد بيانات كافية"
                }
              />
              <ExecutiveMetric
                label="آخر تغير"
                value={timeSeriesSummary.latestTrend.label}
                helper="مقارنة بالفترة السابقة"
                trend={timeSeriesSummary.latestTrend.kind}
              />
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            {timeSeriesSummary.hasData ? (
              <div className="space-y-4">
                {timeSeriesSummary.lowData ? (
                  <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    البيانات الحالية محدودة، وسيظهر التحليل بشكل أوضح مع زيادة السجلات
                    داخل الفترة المختارة.
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <LegendChip
                    label="الاستثمارات"
                    color="#F2B705"
                    helper={formatCurrencyShort(totalInvestments, {
                      maximumFractionDigits: 1,
                    })}
                  />
                  <LegendChip
                    label="العوائد التقديرية"
                    color="#10B981"
                    helper={formatCurrencyShort(timeSeriesSummary.totalReturns, {
                      maximumFractionDigits: 1,
                    })}
                  />
                </div>

                <div className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm">
                  <ResponsiveContainer width="100%" height={440}>
                    <ComposedChart
                      data={timeSeriesData}
                      margin={{ top: 16, right: 12, left: 6, bottom: 8 }}
                    >
                      <defs>
                        <linearGradient
                          id="reports-investments-fill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#F2B705" stopOpacity={0.24} />
                          <stop offset="100%" stopColor="#F2B705" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        vertical={false}
                        stroke="#E2E8F0"
                        strokeDasharray="4 4"
                      />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tickMargin={10}
                        minTickGap={0}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={58}
                        tickMargin={10}
                        tickFormatter={(value) =>
                          formatCompactNumberEN(value, { maximumFractionDigits: 1 })
                        }
                        domain={timeSeriesSummary.yAxisDomain}
                      />
                      <Tooltip
                        cursor={{ stroke: "#CBD5E1", strokeDasharray: "4 4" }}
                        content={<TimeSeriesTooltip />}
                      />
                      <Area
                        type="monotone"
                        dataKey="investments"
                        fill="url(#reports-investments-fill)"
                        stroke="none"
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="investments"
                        stroke="#F2B705"
                        strokeWidth={3.5}
                        dot={{
                          r: 4.5,
                          strokeWidth: 3,
                          stroke: "#F2B705",
                          fill: "#ffffff",
                        }}
                        activeDot={{
                          r: 6.5,
                          strokeWidth: 2,
                          stroke: "#ffffff",
                          fill: "#F2B705",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="returns"
                        stroke="#10B981"
                        strokeWidth={2.75}
                        strokeDasharray={timeSeriesSummary.hasReturnsData ? undefined : "6 6"}
                        dot={{
                          r: 3.8,
                          strokeWidth: 2,
                          stroke: "#10B981",
                          fill: "#ffffff",
                        }}
                        activeDot={{
                          r: 5.5,
                          strokeWidth: 2,
                          stroke: "#ffffff",
                          fill: "#10B981",
                        }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <ExecutiveEmptyState
                icon={<TrendingUp className="size-5" />}
                title="لا توجد بيانات كافية لعرض الاتجاه"
                description="سيظهر التحليل الزمني بشكل أوضح بعد توفر سجلات استثمارية أو عوائد تقديرية ضمن الفترة المختارة."
              />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <StatusDistributionCard
            title="حالة الاستثمارات (حسب السنة)"
            total={investmentStatusDistribution.total}
            data={investmentStatusDistribution.rows}
            dominant={investmentStatusDistribution.dominant}
            smallest={investmentStatusDistribution.smallest}
          />
          <ProjectDistributionCard
            title="توزيع المشاريع"
            total={projectDistribution.total}
            data={projectDistribution.rows}
            dominant={projectDistribution.dominant}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}

function ExecutiveMetric({
  label,
  value,
  helper,
  trend,
}: {
  label: string;
  value: string;
  helper: string;
  trend?: TrendKind;
}) {
  const toneClassName =
    trend === "increase"
      ? "text-emerald-700"
      : trend === "decrease"
      ? "text-rose-700"
      : trend === "new"
      ? "text-blue-700"
      : "text-slate-950";

  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white/90 px-4 py-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div
        className={`mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight ${toneClassName}`}
      >
        {trend ? <TrendIcon kind={trend} /> : null}
        <span>{value}</span>
      </div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{helper}</div>
    </div>
  );
}

function LegendChip({
  label,
  color,
  helper,
}: {
  label: string;
  color: string;
  helper: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-medium text-slate-700">{label}</span>
      <span className="text-slate-500">{helper}</span>
    </div>
  );
}

function ExecutiveEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Empty className="min-h-[320px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-[#F2B705]/12 text-[#030640]">
          {icon}
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function TimeSeriesTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as TimeSeriesRow | undefined;
  if (!row) return null;

  const investmentTone =
    row.investmentChangeKind === "increase"
      ? "text-emerald-700"
      : row.investmentChangeKind === "decrease"
      ? "text-rose-700"
      : row.investmentChangeKind === "new"
      ? "text-blue-700"
      : "text-slate-600";

  const returnsTone =
    row.returnsChangeKind === "increase"
      ? "text-emerald-700"
      : row.returnsChangeKind === "decrease"
      ? "text-rose-700"
      : row.returnsChangeKind === "new"
      ? "text-blue-700"
      : "text-slate-600";

  return (
    <div className="min-w-[240px] rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-xl">
      <div className="text-sm font-semibold text-slate-950">{row.fullLabel}</div>

      <div className="mt-3 space-y-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-500">الاستثمارات</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-950">
              {formatCurrencyShort(row.investments, { maximumFractionDigits: 1 })}
            </div>
            <div className={`flex items-center gap-1 text-xs font-semibold ${investmentTone}`}>
              <TrendIcon kind={row.investmentChangeKind} className="h-3.5 w-3.5" />
              <span>{row.investmentChangeLabel}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-500">العوائد التقديرية</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-950">
              {formatCurrencyShort(row.returns, { maximumFractionDigits: 1 })}
            </div>
            <div className={`flex items-center gap-1 text-xs font-semibold ${returnsTone}`}>
              <TrendIcon kind={row.returnsChangeKind} className="h-3.5 w-3.5" />
              <span>{row.returnsChangeLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as DistributionRow | undefined;
  if (!row) return null;

  return (
    <div className="min-w-[190px] rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-xl">
      <div className="text-sm font-semibold text-slate-950">{row.name}</div>
      <div className="mt-2 text-xs text-slate-500">
        {formatNumberEN(row.value)} حالة - {formatDashboardPercent(row.percent)}
      </div>
    </div>
  );
}

function StatusCategoryTick({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const label = String(payload?.value || "");
  const words = label.split(" ").filter(Boolean);
  const firstLine =
    words.length <= 2 ? words.join(" ") : words.slice(0, 2).join(" ");
  const secondLine = words.length > 2 ? words.slice(2).join(" ") : "";

  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text
        x={0}
        y={8}
        textAnchor="middle"
        direction="rtl"
        unicodeBidi="plaintext"
        fill="#0F172A"
        fontSize={12}
        fontWeight={600}
      >
        <tspan x={0} dy={0}>
          {firstLine}
        </tspan>
        {secondLine ? (
          <tspan x={0} dy={16}>
            {secondLine}
          </tspan>
        ) : null}
      </text>
    </g>
  );
}

function StatusCountLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  value?: string | number;
}) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const label = formatNumberEN(props.value ?? 0);

  if (!Number.isFinite(Number(props.value ?? 0))) return null;

  return (
    <text
      x={x + width / 2}
      y={y - 10}
      textAnchor="middle"
      fill="#0F172A"
      fontSize={12}
      fontWeight={700}
    >
      {label}
    </text>
  );
}

function ProjectDistributionTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as DistributionRow | undefined;
  if (!row) return null;

  return (
    <div className="min-w-[190px] rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-xl">
      <div className="text-sm font-semibold text-slate-950">{row.name}</div>
      <div className="mt-2 text-xs text-slate-500">
        {formatNumberEN(row.value)} مشروع - {formatDashboardPercent(row.percent)}
      </div>
    </div>
  );
}

function StatusDistributionCard({
  title,
  total,
  data,
  dominant,
  smallest,
}: {
  title: string;
  total: number;
  data: DistributionRow[];
  dominant?: DistributionRow | null;
  smallest?: DistributionRow | null;
}) {
  return (
    <Card className="h-full overflow-hidden border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_100%)] shadow-[0_18px_48px_-28px_rgba(15,23,42,0.18)]">
      <CardHeader className="border-b border-slate-100/90 pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-lg text-slate-950">{title}</CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6 text-slate-500">
              توزيع الحالات الرئيسية للسجلات ضمن السنة المختارة مع قراءة سريعة
              للأكثر ظهورًا والأقل ظهورًا.
            </CardDescription>
          </div>

          <div className="min-w-[160px] rounded-[20px] border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
            <div className="text-xs font-medium text-slate-500">إجمالي الحالات</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              {formatNumberEN(total)}
            </div>
          </div>
        </div>

        {total > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ExecutiveMetric
              label="الأكثر ظهورًا"
              value={dominant?.name || "لا يوجد"}
              helper={
                dominant
                  ? `${formatNumberEN(dominant.value)} حالة - ${formatDashboardPercent(
                      dominant.percent
                    )}`
                  : "لا توجد بيانات"
              }
            />
            <ExecutiveMetric
              label="الأقل ظهورًا"
              value={smallest?.name || "لا يوجد"}
              helper={
                smallest
                  ? `${formatNumberEN(smallest.value)} حالة - ${formatDashboardPercent(
                      smallest.percent
                    )}`
                  : "لا توجد بيانات"
              }
            />
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="pt-6">
        {total > 0 ? (
          <div className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart
                data={data}
                margin={{ top: 28, right: 12, left: 6, bottom: 18 }}
                barCategoryGap={22}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#E2E8F0"
                  strokeDasharray="4 4"
                />
                <XAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={14}
                  interval={0}
                  height={56}
                  tick={<StatusCategoryTick />}
                />
                <YAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  width={46}
                  tickMargin={10}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(15,23,42,0.04)" }}
                  content={<StatusBarTooltip />}
                />
                <Bar
                  dataKey="value"
                  radius={[10, 10, 0, 0]}
                  barSize={44}
                  maxBarSize={52}
                >
                  {data.map((row) => (
                    <Cell key={row.name} fill={row.color} />
                  ))}
                  <LabelList dataKey="value" content={<StatusCountLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ExecutiveEmptyState
            icon={<DollarSign className="size-5" />}
            title="لا توجد بيانات كافية لعرض الحالات"
            description="سيظهر توزيع حالات الاستثمار هنا عند توفر سجلات ضمن السنة المختارة."
          />
        )}
      </CardContent>
    </Card>
  );
}

function ProjectDistributionCard({
  title,
  total,
  data,
  dominant,
}: {
  title: string;
  total: number;
  data: DistributionRow[];
  dominant?: DistributionRow | null;
}) {
  return (
    <Card className="h-full overflow-hidden border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_100%)] shadow-[0_18px_48px_-28px_rgba(15,23,42,0.18)]">
      <CardHeader className="border-b border-slate-100/90 pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-lg text-slate-950">{title}</CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6 text-slate-500">
              توزيع أنواع المشاريع داخل المنصة مع Donut أوضح وLegend يشرح
              النسب والعدد من أول نظرة.
            </CardDescription>
          </div>

          <div className="min-w-[160px] rounded-[20px] border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
            <div className="text-xs font-medium text-slate-500">إجمالي المشاريع</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              {formatNumberEN(total)}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {total > 0 ? (
          <div className="grid items-center gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="relative mx-auto h-[320px] w-full max-w-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<ProjectDistributionTooltip />} />
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={84}
                    outerRadius={118}
                    paddingAngle={3}
                    cornerRadius={12}
                    stroke="none"
                  >
                    {data.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="text-xs font-medium text-slate-500">إجمالي المشاريع</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
                  {formatNumberEN(total)}
                </div>
                <div className="text-xs text-slate-500">
                  {dominant ? `الأعلى: ${dominant.name}` : "لا توجد بيانات"}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {data.map((row) => (
                <div
                  key={row.name}
                  className="rounded-[20px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm transition-colors hover:border-slate-300/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-1 h-3 w-3 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-950">
                          {row.name}
                        </div>
                        <div className="text-xs leading-6 text-slate-500">
                          {formatNumberEN(row.value)} مشاريع
                        </div>
                      </div>
                    </div>

                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                      {formatDashboardPercent(row.percent)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ExecutiveEmptyState
            icon={<Building2 className="size-5" />}
            title="لا توجد بيانات كافية لعرض توزيع المشاريع"
            description="سيظهر توزيع المشاريع هنا فور توفر أنواع مشاريع مسجلة داخل المنصة."
          />
        )}
      </CardContent>
    </Card>
  );
}
