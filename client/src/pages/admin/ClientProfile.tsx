/* eslint-disable @typescript-eslint/no-unused-vars */
// client/src/pages/admin/ClientProfile.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  FileDown,
  UserRound,
  Mail,
  Phone,
  CalendarDays,
  ShieldCheck,
  CircleOff,
  Crown,
  Wallet,
  TrendingUp,
  Sparkles,
  BriefcaseBusiness,
  FolderKanban,
  History,
  ReceiptText,
  Minus,
} from "lucide-react";
import { toast } from "sonner";

import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/_core/firebase";
import { recomputeInvestorAggregates } from "@/_core/recomputeInvestorAggregates";

const EMPTY_VALUE = "غير متوفر";
const LIVE_UPDATE_INTERVAL_MS = 1000;
const LIVE_PROFIT_FRACTION_DIGITS = 3;
const LIVE_PROGRESS_FRACTION_DIGITS = 4;

type UserDoc = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  active?: boolean;
  vipStatus?: "regular" | "vip";
  vipTier?: string;
  internalNotes?: string;
  createdAt?: any;
  aggregatesUpdatedAt?: any;
  totalInvested?: number;
  expectedProfitTotal?: number;
  profitToDate?: number;
  phone?: string;
  mobile?: string;
  phoneNumber?: string;
};

type InvestmentDoc = {
  id: string;
  userId?: string;
  investorUid?: string;
  projectId?: string;
  amount?: number;
  approvedAmount?: number;
  estimatedReturn?: number;
  expectedProfit?: number;
  annualReturnAtSign?: number;
  durationMonthsAtSign?: number;
  durationMonths?: number;
  status?: string;
  createdAt?: any;
  startAt?: any;
  signedAt?: any;
  plannedEndAt?: any;
  actualEndAt?: any;
};

type InvestmentRow = {
  id: string;
  projectId: string;
  projectTitle: string;
  statusLabel: string;
  statusClassName: string;
  summaryLabel: string;
  summaryClassName: string;
  amount: number;
  expectedProfitTotal: number | null;
  currentProfit: number | null;
  totalValue: number | null;
  percent: number | null;
  durationMonths: number | null;
  startDate: Date | null;
  maturityDate: Date | null;
  progressRatio: number | null;
  progressPercent: number | null;
  growthDirection: "up" | "down" | "flat" | null;
  isEnded: boolean;
};

function toDateSafe(value: any): Date | null {
  try {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (typeof value?.toDate === "function") return value.toDate();
    if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

const pick = (...values: any[]) => {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
};

function fallbackText(...values: any[]) {
  return pick(...values) || EMPTY_VALUE;
}

function formatDate(date: Date | null) {
  return date
    ? date.toLocaleDateString("ar-SA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : EMPTY_VALUE;
}

function formatDateTime(date: Date | null) {
  return date
    ? date.toLocaleString("ar-SA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : EMPTY_VALUE;
}

function money(
  value: any,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
) {
  const amount = Number(value);
  const safeValue = Number.isFinite(amount) ? amount : 0;
  return `${safeValue.toLocaleString("ar-SA", {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
  })} ر.س`;
}

function formatPercent(
  value: number | null,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
) {
  if (!Number.isFinite(value as number)) return EMPTY_VALUE;
  return `${Number(value).toLocaleString("ar-SA", {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  })}%`;
}

function liveMoney(value: number | null) {
  if (!Number.isFinite(value as number)) return EMPTY_VALUE;
  return money(value, {
    minimumFractionDigits: LIVE_PROFIT_FRACTION_DIGITS,
    maximumFractionDigits: LIVE_PROFIT_FRACTION_DIGITS,
  });
}

function formatLiveProgress(value: number | null) {
  if (!Number.isFinite(value as number)) return EMPTY_VALUE;

  const safeValue = clampNumber(Number(value), 0, 100);
  const fractionDigits = safeValue > 0 && safeValue < 100 ? LIVE_PROGRESS_FRACTION_DIGITS : 0;

  return formatPercent(safeValue, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function durationLabel(value: number | null) {
  if (!Number.isFinite(value as number)) return EMPTY_VALUE;
  const rounded =
    Math.abs((value as number) - Math.round(value as number)) < 0.1
      ? Math.round(value as number)
      : Number((value as number).toFixed(1));
  return `${rounded.toLocaleString("ar-SA")} شهر`;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveExpectedProfit(inv: InvestmentDoc, percent: number | null, durationMonths: number | null) {
  const explicitValue = Number(inv.expectedProfit ?? inv.estimatedReturn);
  if (Number.isFinite(explicitValue)) return explicitValue;

  const amount = Number(inv.approvedAmount ?? inv.amount ?? 0);
  if (!amount || percent == null || durationMonths == null || durationMonths <= 0) return null;

  return amount * (percent / 100) * (durationMonths / 12);
}

function calculateProgress(startDate: Date | null, endDate: Date | null, now: Date) {
  if (!startDate || !endDate) {
    return { ratio: null, percent: null };
  }

  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { ratio: null, percent: null };
  }

  const nowMs = now.getTime();
  const ratio = clampNumber((nowMs - startMs) / (endMs - startMs), 0, 1);

  return {
    ratio,
    percent: ratio * 100,
  };
}

function projectName(projectId: any, projectsMap: Record<string, any>) {
  const pid = String(projectId || "").trim();
  if (!pid) return EMPTY_VALUE;
  const project = projectsMap[pid];
  if (!project) return EMPTY_VALUE;
  return pick(project?.titleAr, project?.nameAr, project?.title, project?.name) || EMPTY_VALUE;
}

function durationMonthsFromDates(inv: any): number | null {
  const start = toDateSafe(inv?.startAt) || toDateSafe(inv?.signedAt) || toDateSafe(inv?.createdAt);
  const end = toDateSafe(inv?.plannedEndAt) || toDateSafe(inv?.actualEndAt);

  if (!start || !end) return null;

  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= 0) return null;

  return durationMs / (1000 * 60 * 60 * 24 * 30.4375);
}

function projectProfitPercent(inv: any, projectsMap: Record<string, any>) {
  const snapshotValue = Number(inv?.annualReturnAtSign);
  if (Number.isFinite(snapshotValue)) return snapshotValue;

  const principal = Number(inv?.approvedAmount ?? inv?.amount ?? 0);
  const expected = Number(inv?.expectedProfit ?? inv?.estimatedReturn ?? 0);
  const directDuration = Number(inv?.durationMonthsAtSign ?? inv?.durationMonths ?? 0);
  const duration =
    Number.isFinite(directDuration) && directDuration > 0
      ? directDuration
      : durationMonthsFromDates(inv);

  if (principal > 0 && expected >= 0 && duration && duration > 0) {
    return (expected / (principal * (duration / 12))) * 100;
  }

  const pid = String(inv?.projectId || "").trim();
  if (!pid) return null;

  const project = projectsMap[pid];
  if (!project) return null;

  const value =
    project?.annualReturn ??
    project?.profitPercent ??
    project?.profitRate ??
    project?.roiPercent ??
    project?.returnPercent;

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function projectDurationMonths(inv: any, projectsMap: Record<string, any>) {
  const snapshotValue = Number(inv?.durationMonthsAtSign ?? inv?.durationMonths);
  if (Number.isFinite(snapshotValue)) return snapshotValue;

  const fromDates = durationMonthsFromDates(inv);
  if (Number.isFinite(fromDates)) return fromDates;

  const pid = String(inv?.projectId || "").trim();
  if (!pid) return null;

  const project = projectsMap[pid];
  if (!project) return null;

  const value = project?.durationMonths ?? project?.duration ?? project?.durationInMonths;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + Number(months || 0));
  return next;
}

function normalizeStatusKey(status: any) {
  return String(status || "").trim().toLowerCase();
}

function isClosedInvestmentStatus(status: any) {
  const key = normalizeStatusKey(status);
  return key.includes("completed") || key.includes("closed");
}

function statusLabel(status: any) {
  const key = normalizeStatusKey(status);
  if (!key) return EMPTY_VALUE;

  const map: Record<string, string> = {
    active: "نشط",
    completed: "منتهي",
    closed: "مقفل",
    pending: "قيد الانتظار",
    approved: "مقبول",
    rejected: "مرفوض",
    signing: "قيد الإجراء",
    signed: "تمت الموافقة",
    pending_review: "بانتظار المراجعة",
    pending_contract: "بانتظار العقد",
  };

  return map[key] || String(status || EMPTY_VALUE);
}

function getInvestmentStatusBadge(status: any) {
  const key = normalizeStatusKey(status);

  if (key === "active") {
    return {
      label: statusLabel(status),
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (key === "completed" || key === "closed") {
    return {
      label: statusLabel(status),
      className: "border-slate-300 bg-slate-100 text-slate-700",
    };
  }

  if (key === "pending" || key === "pending_review" || key === "pending_contract") {
    return {
      label: statusLabel(status),
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (key === "approved" || key === "signed" || key === "signing") {
    return {
      label: statusLabel(status),
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  if (key === "rejected") {
    return {
      label: statusLabel(status),
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  return {
    label: statusLabel(status),
    className: "border-slate-200 bg-slate-50 text-slate-600",
  };
}

function getInvestmentSummaryBadge(status: any) {
  return isClosedInvestmentStatus(status)
    ? {
        label: "منتهي",
        className: "border-slate-300 bg-slate-950 text-amber-200",
      }
    : {
        label: "مستمر",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
}

function getRoleBadge(role?: string) {
  const key = String(role || "").trim().toLowerCase();
  const map: Record<string, { label: string; className: string }> = {
    owner: {
      label: "المالك",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    admin: {
      label: "الإدارة",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    },
    accountant: {
      label: "المحاسب",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    staff: {
      label: "الموظف",
      className: "border-indigo-200 bg-indigo-50 text-indigo-700",
    },
    client: {
      label: "العميل",
      className: "border-slate-200 bg-slate-100 text-slate-700",
    },
  };

  return map[key] || {
    label: role || EMPTY_VALUE,
    className: "border-slate-200 bg-slate-100 text-slate-700",
  };
}

function getAccountBadge(user: UserDoc | null) {
  if (typeof user?.active === "boolean") {
    return user.active
      ? {
          label: "نشط",
          className: "border-emerald-200 bg-emerald-50 text-emerald-700",
          icon: ShieldCheck,
        }
      : {
          label: "غير نشط",
          className: "border-slate-200 bg-slate-100 text-slate-600",
          icon: CircleOff,
        };
  }

  return {
    label: EMPTY_VALUE,
    className: "border-slate-200 bg-slate-50 text-slate-600",
    icon: CircleOff,
  };
}

function getVipBadge(user: UserDoc | null) {
  if (user?.vipStatus === "vip") {
    return {
      label: user.vipTier ? `VIP - ${user.vipTier}` : "VIP",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      featured: true,
    };
  }

  return {
    label: "عميل عادي",
    className: "border-slate-200 bg-slate-50 text-slate-600",
    featured: false,
  };
}

function getUserPhone(user: UserDoc | null) {
  if (!user) return EMPTY_VALUE;

  return (
    pick(
      user.phone,
      user.mobile,
      user.phoneNumber,
      (user as any)?.contact?.phone,
      (user as any)?.profile?.phone
    ) || EMPTY_VALUE
  );
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function InfoTile({
  label,
  value,
  icon: Icon,
  className,
  valueClassName,
  breakAll = false,
}: {
  label: string;
  value: string;
  icon: any;
  className?: string;
  valueClassName?: string;
  breakAll?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm", className)}>
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-sm font-semibold leading-7 text-slate-900",
          breakAll ? "break-all" : "break-words",
          valueClassName
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  helper,
  icon: Icon,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: any;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm", className)}>
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={cn("mt-3 text-2xl font-bold text-slate-950", valueClassName)}>{value}</div>
      {helper ? <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p> : null}
    </div>
  );
}

export default function ClientProfile() {
  const userId = new URLSearchParams(window.location.search).get("id") || "";

  const [user, setUser] = useState<UserDoc | null>(null);
  const [investments, setInvestments] = useState<InvestmentDoc[]>([]);
  const [projectsMap, setProjectsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const load = async () => {
    if (!userId) {
      toast.error("معرف العميل غير موجود");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      await recomputeInvestorAggregates(userId, {
        source: {
          area: "admin",
          page: "ClientProfile",
          method: "manual_recompute",
        },
        reason: "client_profile_open_recompute",
        relatedIds: { userId },
      });

      const userSnapshot = await getDoc(doc(db, "users", userId));
      const nextUser = userSnapshot.exists()
        ? ({ id: userSnapshot.id, ...(userSnapshot.data() as any) } as UserDoc)
        : null;

      const investmentsRef = collection(db, "investments");
      const userInvestmentsSnapshot = await getDocs(query(investmentsRef, where("userId", "==", userId)));
      let investmentDocs = userInvestmentsSnapshot.docs;

      if (investmentDocs.length === 0) {
        const investorSnapshot = await getDocs(
          query(investmentsRef, where("investorUid", "==", userId))
        );
        investmentDocs = investorSnapshot.docs;
      }

      const investmentRows = investmentDocs.map((row) => ({
        id: row.id,
        ...(row.data() as any),
      }));

      const projectsSnapshot = await getDocs(collection(db, "projects"));
      const nextProjectsMap: Record<string, any> = {};
      projectsSnapshot.docs.forEach((row) => {
        nextProjectsMap[row.id] = { id: row.id, ...(row.data() as any) };
      });

      setUser(nextUser);
      setInvestments(investmentRows);
      setProjectsMap(nextProjectsMap);
      setLoading(false);
    } catch (error) {
      console.error(error);
      toast.error("تعذر تحميل ملف العميل");
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, LIVE_UPDATE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const totalInvested = useMemo(() => {
    if (typeof user?.totalInvested === "number") return user.totalInvested;

    return investments.reduce((sum, inv) => sum + Number(inv.approvedAmount ?? inv.amount ?? 0), 0);
  }, [user?.totalInvested, investments]);

  const expectedProfitTotal = useMemo(() => {
    if (typeof user?.expectedProfitTotal === "number") return user.expectedProfitTotal;

    return investments.reduce(
      (sum, inv) => sum + Number(inv.expectedProfit ?? inv.estimatedReturn ?? 0),
      0
    );
  }, [user?.expectedProfitTotal, investments]);

  const profitToDate = useMemo(() => {
    if (typeof user?.profitToDate === "number") return user.profitToDate;
    return 0;
  }, [user?.profitToDate]);

  const investmentRows = useMemo<InvestmentRow[]>(() => {
    return investments
      .map((inv) => {
        const startDate =
          toDateSafe(inv.startAt) || toDateSafe(inv.signedAt) || toDateSafe(inv.createdAt);
        const durationMonths = projectDurationMonths(inv, projectsMap);
        const maturityDateDirect =
          toDateSafe(inv.plannedEndAt) || toDateSafe(inv.actualEndAt);
        const maturityDateComputed =
          !maturityDateDirect && startDate && durationMonths
            ? addMonths(startDate, durationMonths)
            : null;
        const maturityDate = maturityDateDirect || maturityDateComputed;

        const percent = projectProfitPercent(inv, projectsMap);
        const amount = Number(inv.approvedAmount ?? inv.amount ?? 0);
        const expectedProfitTotal = resolveExpectedProfit(inv, percent, durationMonths);
        const totalValue = expectedProfitTotal == null ? null : amount + expectedProfitTotal;
        const progress = calculateProgress(startDate, maturityDate, now);
        const currentProfit =
          expectedProfitTotal == null || progress.ratio == null
            ? null
            : expectedProfitTotal * progress.ratio;
        const statusBadge = getInvestmentStatusBadge(inv.status);
        const summaryBadge = getInvestmentSummaryBadge(inv.status);
        const projectId = pick(inv.projectId);
        const growthDirection: InvestmentRow["growthDirection"] =
          currentProfit == null || progress.ratio == null
            ? null
            : currentProfit > 0
            ? expectedProfitTotal != null && expectedProfitTotal < 0
              ? "down"
              : "up"
            : progress.ratio > 0
            ? "flat"
            : "flat";

        return {
          id: inv.id,
          projectId,
          projectTitle: projectName(inv.projectId, projectsMap),
          statusLabel: statusBadge.label,
          statusClassName: statusBadge.className,
          summaryLabel: summaryBadge.label,
          summaryClassName: summaryBadge.className,
          amount,
          expectedProfitTotal,
          currentProfit,
          totalValue,
          percent,
          durationMonths,
          startDate,
          maturityDate,
          progressRatio: progress.ratio,
          progressPercent: progress.percent,
          growthDirection,
          isEnded: isClosedInvestmentStatus(inv.status),
        };
      })
      .sort((left, right) => {
        const leftTime = left.startDate?.getTime() ?? 0;
        const rightTime = right.startDate?.getTime() ?? 0;
        return rightTime - leftTime;
      });
  }, [investments, now, projectsMap]);

  const investmentDates = useMemo(
    () =>
      investmentRows
        .map((row) => row.startDate)
        .filter((date): date is Date => Boolean(date))
        .sort((left, right) => left.getTime() - right.getTime()),
    [investmentRows]
  );

  const firstInvestmentDate = investmentDates[0] ?? null;
  const lastInvestmentDate = investmentDates[investmentDates.length - 1] ?? null;

  const activeInvestmentsCount = investmentRows.filter((row) => !row.isEnded).length;
  const completedInvestmentsCount = investmentRows.filter((row) => row.isEnded).length;

  const activeProjectsCount = useMemo(() => {
    const ids = new Set(
      investmentRows.filter((row) => !row.isEnded && row.projectId).map((row) => row.projectId)
    );
    return ids.size;
  }, [investmentRows]);

  const completedProjectsCount = useMemo(() => {
    const ids = new Set(
      investmentRows.filter((row) => row.isEnded && row.projectId).map((row) => row.projectId)
    );
    return ids.size;
  }, [investmentRows]);

  const dynamicProfitRows = investmentRows.filter(
    (row) => row.currentProfit != null && row.progressRatio != null
  );

  const dynamicCurrentProfitTotal = dynamicProfitRows.reduce(
    (sum, row) => sum + Number(row.currentProfit ?? 0),
    0
  );

  const dynamicProfitCoverageCount = dynamicProfitRows.length;
  const hasAnyDynamicProfit = dynamicProfitCoverageCount > 0;
  const displayProfitToDate = hasAnyDynamicProfit ? dynamicCurrentProfitTotal : profitToDate;

  const latestAggregatesUpdate = toDateSafe(user?.aggregatesUpdatedAt);
  const createdAt = toDateSafe(user?.createdAt);
  const userPhone = getUserPhone(user);
  const roleBadge = getRoleBadge(user?.role);
  const accountBadge = getAccountBadge(user);
  const vipBadge = getVipBadge(user);
  const AccountIcon = accountBadge.icon;

  const downloadClientReportPdf = () => {
    if (!user) return;

    const reportDate = new Date();

    const rowsHtml = investmentRows
      .map((row, index) => {
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.projectTitle)}</td>
            <td>${escapeHtml(row.statusLabel)}</td>
            <td>${escapeHtml(money(row.amount))}</td>
            <td>${escapeHtml(formatPercent(row.percent))}</td>
            <td>${escapeHtml(row.expectedProfitTotal != null ? money(row.expectedProfitTotal) : EMPTY_VALUE)}</td>
            <td><b>${escapeHtml(money(row.totalValue))}</b></td>
            <td>${escapeHtml(formatDate(row.startDate))}</td>
            <td>${escapeHtml(formatDate(row.maturityDate))}</td>
            <td>${escapeHtml(row.summaryLabel)}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>ملف العميل</title>
        <style>
          body { font-family: Arial, "Tahoma", sans-serif; margin: 24px; color:#0f172a; background:#fff; }
          .hdr { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
          .box { border:1px solid #e2e8f0; border-radius:14px; padding:16px; background:#fff; }
          h1 { margin:0 0 8px 0; font-size:24px; }
          .muted { color:#64748b; font-size:12px; }
          .grid { display:grid; grid-template-columns: 1.4fr 1fr; gap:12px; margin-top:14px; }
          .grid-tiles { display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; margin-top:12px; }
          .sum { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin-top:14px; }
          .k { color:#64748b; font-size:12px; margin-bottom:6px; }
          .v { font-weight:700; line-height:1.7; }
          table { width:100%; border-collapse:collapse; margin-top:14px; }
          th, td { border:1px solid #e2e8f0; padding:10px; font-size:12px; vertical-align:top; text-align:right; }
          th { background:#f8fafc; }
          .notes { white-space:pre-wrap; line-height:1.8; }
          @media print {
            button { display:none; }
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="hdr">
          <div>
            <h1>ملف العميل</h1>
            <div class="muted">تاريخ التقرير: ${escapeHtml(formatDateTime(reportDate))}</div>
          </div>
          <div>
            <button onclick="window.print()" style="padding:10px 14px;border:0;border-radius:10px;background:#111827;color:#fff;cursor:pointer;">
              طباعة / حفظ PDF
            </button>
          </div>
        </div>

        <div class="grid">
          <div class="box">
            <div class="k">الاسم</div>
            <div class="v">${escapeHtml(fallbackText(user.name))}</div>
            <div class="grid-tiles">
              <div>
                <div class="k">البريد الإلكتروني</div>
                <div class="v">${escapeHtml(fallbackText(user.email))}</div>
              </div>
              <div>
                <div class="k">رقم الجوال</div>
                <div class="v">${escapeHtml(userPhone)}</div>
              </div>
              <div>
                <div class="k">الحالة</div>
                <div class="v">${escapeHtml(accountBadge.label)}</div>
              </div>
              <div>
                <div class="k">الدور</div>
                <div class="v">${escapeHtml(roleBadge.label)}</div>
              </div>
              <div>
                <div class="k">نوع العميل</div>
                <div class="v">${escapeHtml(vipBadge.label)}</div>
              </div>
              <div>
                <div class="k">تاريخ التسجيل</div>
                <div class="v">${escapeHtml(formatDate(createdAt))}</div>
              </div>
            </div>
          </div>

          <div class="box">
            <div class="k">مؤشرات إضافية</div>
            <div class="grid-tiles">
              <div>
                <div class="k">عدد الاستثمارات</div>
                <div class="v">${escapeHtml(String(investmentRows.length))}</div>
              </div>
              <div>
                <div class="k">المشاريع النشطة</div>
                <div class="v">${escapeHtml(String(activeProjectsCount))}</div>
              </div>
              <div>
                <div class="k">المشاريع المكتملة</div>
                <div class="v">${escapeHtml(String(completedProjectsCount))}</div>
              </div>
              <div>
                <div class="k">آخر تحديث للتجميعات</div>
                <div class="v">${escapeHtml(formatDateTime(latestAggregatesUpdate))}</div>
              </div>
              <div>
                <div class="k">أول دخول استثماري</div>
                <div class="v">${escapeHtml(formatDate(firstInvestmentDate))}</div>
              </div>
              <div>
                <div class="k">آخر استثمار</div>
                <div class="v">${escapeHtml(formatDate(lastInvestmentDate))}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="sum">
          <div class="box">
            <div class="k">إجمالي الاستثمار</div>
            <div class="v">${escapeHtml(money(totalInvested))}</div>
          </div>
          <div class="box">
            <div class="k">الربح حتى اليوم</div>
            <div class="v">${escapeHtml(money(displayProfitToDate))}</div>
          </div>
          <div class="box">
            <div class="k">العائد المتوقع</div>
            <div class="v">${escapeHtml(money(expectedProfitTotal))}</div>
          </div>
        </div>

        <div class="box" style="margin-top:14px;">
          <div class="k">ملاحظات داخلية</div>
          <div class="v notes">${escapeHtml(fallbackText(user.internalNotes))}</div>
        </div>

        <div class="box" style="margin-top:14px;">
          <div class="k" style="font-weight:700;">هيستوري الاستثمارات</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>اسم المشروع</th>
                <th>الحالة</th>
                <th>المبلغ</th>
                <th>النسبة</th>
                <th>الربح</th>
                <th>الإجمالي المتوقع</th>
                <th>تاريخ الدخول</th>
                <th>يوم الاستحقاق</th>
                <th>الملخص</th>
              </tr>
            </thead>
            <tbody>
              ${
                rowsHtml ||
                `<tr><td colspan="10" style="text-align:center;color:#64748b;">لا توجد استثمارات لهذا العميل</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </body>
    </html>
    `;

  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    toast.error("المتصفح منع فتح نافذة التقرير. فعّل popups للموقع.");
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Card className="border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-white shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-3">
                <div className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-slate-600">
                  CLIENT PROFILE
                </div>

                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                    ملف العميل
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                    صفحة تفصيلية لعرض هوية العميل، ملخصه المالي، ومتابعة سجل الاستثمارات
                    بطريقة أوضح وأكثر احترافية داخل النظام.
                  </p>
                </div>

                {!loading && user ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span className="font-semibold text-slate-900">
                      {fallbackText(user.name)}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>{fallbackText(user.email)}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 xl:justify-end">
                <Button
                  variant="outline"
                  className="h-10 w-full sm:w-auto"
                  onClick={() => window.history.back()}
                >
                  <ArrowRight className="w-4 h-4 ml-1" />
                  رجوع
                </Button>

                <Button
                  variant="outline"
                  className="h-10 w-full sm:w-auto"
                  onClick={load}
                  disabled={loading}
                >
                  <RefreshCw className={cn("w-4 h-4 ml-1", loading ? "animate-spin" : "")} />
                  تحديث
                </Button>

                <Button
                  className="h-10 w-full sm:w-auto"
                  onClick={downloadClientReportPdf}
                  disabled={!user || loading}
                >
                  <FileDown className="w-4 h-4 ml-1" />
                  تحميل PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="rounded-2xl py-14 text-center text-muted-foreground">
              جاري التحميل...
            </CardContent>
          </Card>
        ) : !user ? (
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="rounded-2xl py-14 text-center text-muted-foreground">
              العميل غير موجود
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
              <Card className="border-slate-200/80 shadow-sm">
                <CardHeader className="gap-4 border-b border-slate-200/70 pb-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle>معلومات العميل الأساسية</CardTitle>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        الهوية الأساسية للعميل مع الحالة والدور ونوع الحساب والبيانات التعريفية
                        المتاحة.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={accountBadge.className}>
                        <AccountIcon className="ml-1 h-3.5 w-3.5" />
                        {accountBadge.label}
                      </Badge>

                      <Badge variant="outline" className={roleBadge.className}>
                        {roleBadge.label}
                      </Badge>

                      <Badge variant="outline" className={vipBadge.className}>
                        {vipBadge.featured ? <Crown className="ml-1 h-3.5 w-3.5" /> : null}
                        {vipBadge.label}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-6">
                  <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-5 shadow-sm">
                    <div className="flex flex-col gap-2">
                      <div className="inline-flex w-fit items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
                        هوية العميل
                      </div>
                      <h2 className="text-2xl font-bold text-slate-950">
                        {fallbackText(user.name)}
                      </h2>
                      <p className="text-sm text-slate-500 break-all">
                        {fallbackText(user.email)}
                      </p>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <InfoTile
                        label="الاسم"
                        value={fallbackText(user.name)}
                        icon={UserRound}
                      />
                      <InfoTile
                        label="البريد الإلكتروني"
                        value={fallbackText(user.email)}
                        icon={Mail}
                        breakAll
                      />
                      <InfoTile
                        label="رقم الجوال"
                        value={userPhone}
                        icon={Phone}
                      />
                      <InfoTile
                        label="تاريخ التسجيل"
                        value={formatDate(createdAt)}
                        icon={CalendarDays}
                      />
                      <InfoTile
                        label="نوع العميل"
                        value={vipBadge.label}
                        icon={Crown}
                        className={vipBadge.featured ? "border-amber-200 bg-amber-50/70" : undefined}
                      />
                      <InfoTile
                        label="معرف العميل"
                        value={fallbackText(user.id)}
                        icon={ReceiptText}
                        breakAll
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="border-slate-200/80 shadow-sm">
                  <CardHeader className="gap-2 border-b border-slate-200/70 pb-5">
                    <CardTitle>مؤشرات إضافية</CardTitle>
                    <p className="text-sm leading-6 text-muted-foreground">
                      ملخص سريع يساعد على فهم وضع العميل الاستثماري من أول نظرة.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <InfoTile
                        label="عدد الاستثمارات"
                        value={String(investmentRows.length)}
                        icon={BriefcaseBusiness}
                      />
                      <InfoTile
                        label="أول دخول استثماري"
                        value={formatDate(firstInvestmentDate)}
                        icon={CalendarDays}
                      />
                      <InfoTile
                        label="آخر استثمار"
                        value={formatDate(lastInvestmentDate)}
                        icon={History}
                      />
                      <InfoTile
                        label="آخر تحديث للتجميعات"
                        value={formatDateTime(latestAggregatesUpdate)}
                        icon={Sparkles}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80 shadow-sm">
                  <CardHeader className="gap-2 border-b border-slate-200/70 pb-5">
                    <CardTitle>ملاحظات داخلية</CardTitle>
                    <p className="text-sm leading-6 text-muted-foreground">
                      مساحة مرجعية لعرض الملاحظات المرتبطة بهذا العميل إن كانت متوفرة.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm leading-8 text-slate-700 whitespace-pre-wrap break-words">
                      {fallbackText(user.internalNotes)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">الملخص المالي</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  بطاقات سريعة لقراءة حجم المحفظة الاستثمارية وحالة المشاريع المرتبطة بالعميل.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <MetricTile
                  label="إجمالي الاستثمار"
                  value={money(totalInvested)}
                  helper="إجمالي المبالغ المرتبطة بسجلات الاستثمار الحالية."
                  icon={Wallet}
                />
                <MetricTile
                  label="الربح حتى اليوم"
                  value={hasAnyDynamicProfit ? liveMoney(displayProfitToDate) : money(displayProfitToDate)}
                  helper={
                    hasAnyDynamicProfit
                      ? dynamicProfitCoverageCount === investmentRows.length
                        ? "محسوب حيًا حسب تقدم الاستثمارات الحالية ويتحدث تلقائيًا كل ثانية."
                        : `محسوب حيًا لـ ${dynamicProfitCoverageCount.toLocaleString("ar-SA")} من أصل ${investmentRows.length.toLocaleString("ar-SA")} استثمار، ويتحدث تلقائيًا كل ثانية.`
                      : "تعذر حساب الربح الحي لعدم اكتمال تواريخ البداية والاستحقاق."
                  }
                  icon={TrendingUp}
                  className="border-emerald-100 bg-emerald-50/70"
                  valueClassName="text-emerald-700"
                />
                <MetricTile
                  label="العائد المتوقع"
                  value={money(expectedProfitTotal)}
                  helper="إجمالي الأرباح المتوقعة من الاستثمارات الحالية."
                  icon={Sparkles}
                  className="border-sky-100 bg-sky-50/70"
                  valueClassName="text-sky-700"
                />
                <MetricTile
                  label="عدد الاستثمارات"
                  value={String(investmentRows.length)}
                  helper="عدد السجلات الاستثمارية المرتبطة بهذا العميل."
                  icon={BriefcaseBusiness}
                />
                <MetricTile
                  label="المشاريع النشطة"
                  value={String(activeProjectsCount)}
                  helper={`${activeInvestmentsCount.toLocaleString("ar-SA")} استثمارًا مستمرًا`}
                  icon={FolderKanban}
                />
                <MetricTile
                  label="المشاريع المكتملة"
                  value={String(completedProjectsCount)}
                  helper={`${completedInvestmentsCount.toLocaleString("ar-SA")} استثمارًا منتهيًا`}
                  icon={History}
                  className="border-slate-200 bg-slate-50/90"
                />
              </div>
            </section>

            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="gap-4 border-b border-slate-200/70 pb-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle>هيستوري الاستثمارات</CardTitle>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      سجل منظم لكل استثمار مع اسم المشروع، الحالة، الأرقام المالية، وتواريخ
                      الدخول والاستحقاق.
                    </p>
                  </div>

                  <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
                    {investmentRows.length.toLocaleString("ar-SA")} سجل استثماري
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                {investmentRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 py-12 text-center text-muted-foreground">
                    لا توجد استثمارات لهذا العميل
                  </div>
                ) : (
                  <div className="space-y-4">
                    {investmentRows.map((row, index) => (
                      <article
                        key={row.id}
                        className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-5 shadow-sm ring-1 ring-slate-100/80 transition-shadow hover:shadow-md"
                      >
                        {(() => {
                          const GrowthIcon =
                            row.growthDirection === "down"
                              ? ArrowDownRight
                              : row.growthDirection === "flat"
                              ? Minus
                              : ArrowUpRight;
                          const growthLabel =
                            row.growthDirection === "down"
                              ? "تراجع"
                              : row.growthDirection === "flat"
                              ? "ثابت"
                              : "نمو";
                          const growthClassName =
                            row.growthDirection === "down"
                              ? "text-rose-700 bg-rose-50 border-rose-100"
                              : row.growthDirection === "flat"
                              ? "text-slate-600 bg-slate-100 border-slate-200"
                              : "text-emerald-700 bg-emerald-50 border-emerald-100";

                          return (
                        <>
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0">
                            <div className="inline-flex w-fit items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-600">
                              استثمار #{(index + 1).toLocaleString("ar-SA")}
                            </div>

                            <h3 className="mt-3 text-lg font-semibold text-slate-950 break-words">
                              {row.projectTitle}
                            </h3>

                            <p className="mt-1 text-sm text-slate-500">
                              يوم الدخول: {formatDate(row.startDate)}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={row.statusClassName}>
                              {row.statusLabel}
                            </Badge>
                            <Badge variant="outline" className={row.summaryClassName}>
                              {row.summaryLabel}
                            </Badge>
                            {row.growthDirection ? (
                              <div
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                                  growthClassName
                                )}
                              >
                                <GrowthIcon className="ml-1 h-3.5 w-3.5" />
                                {growthLabel}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold tracking-[0.14em] text-emerald-700">
                                الربح الحالي
                              </div>
                              <div className="mt-2 break-words text-2xl font-bold text-emerald-700">
                                {row.currentProfit != null ? liveMoney(row.currentProfit) : EMPTY_VALUE}
                              </div>
                              <p className="mt-2 text-sm leading-6 text-emerald-800/80">
                                {row.expectedProfitTotal != null
                                  ? `من إجمالي متوقع ${money(row.expectedProfitTotal)}`
                                  : "تعذر حساب الإجمالي المتوقع من البيانات الحالية"}
                              </p>
                            </div>

                            <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm">
                              <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                                نسبة التقدم
                              </div>
                              <div className="mt-2 text-lg font-bold text-slate-900">
                                {formatLiveProgress(row.progressPercent)}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                              <span className="text-slate-600">تقدم الاستثمار</span>
                              <span className="font-semibold text-slate-900">
                                {row.progressPercent != null
                                  ? formatLiveProgress(row.progressPercent)
                                  : "بيانات التقدم غير متوفرة"}
                              </span>
                            </div>

                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-[width] duration-700 ease-out"
                                style={{
                                  width:
                                    row.progressPercent != null
                                      ? `${row.progressPercent}%`
                                      : "0%",
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <InfoTile
                            label="المبلغ"
                            value={money(row.amount)}
                            icon={Wallet}
                            valueClassName="text-base"
                          />
                          <InfoTile
                            label="النسبة"
                            value={formatPercent(row.percent)}
                            icon={Sparkles}
                            valueClassName="text-base"
                          />
                          <InfoTile
                            label="الربح المتوقع"
                            value={row.expectedProfitTotal != null ? money(row.expectedProfitTotal) : EMPTY_VALUE}
                            icon={TrendingUp}
                            className="border-emerald-100 bg-emerald-50/70"
                            valueClassName="text-base text-emerald-700"
                          />
                          <InfoTile
                            label="الإجمالي المتوقع"
                            value={row.totalValue != null ? money(row.totalValue) : EMPTY_VALUE}
                            icon={BriefcaseBusiness}
                            valueClassName="text-base"
                          />
                          <InfoTile
                            label="تاريخ الدخول"
                            value={formatDate(row.startDate)}
                            icon={CalendarDays}
                            valueClassName="text-base"
                          />
                          <InfoTile
                            label="يوم الاستحقاق"
                            value={formatDate(row.maturityDate)}
                            icon={History}
                            valueClassName="text-base"
                          />
                          <InfoTile
                            label="مدة الاستثمار"
                            value={durationLabel(row.durationMonths)}
                            icon={ReceiptText}
                            valueClassName="text-base"
                          />
                          <InfoTile
                            label="اسم المشروع"
                            value={row.projectTitle}
                            icon={FolderKanban}
                            valueClassName="text-base"
                          />
                        </div>
                        </>
                          );
                        })()}
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
