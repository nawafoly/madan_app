import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import DashboardLayout from "@/components/DashboardLayout";
import AdminPanelStatCard from "@/components/AdminPanelStatCard";
import {
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Users,
  Building2,
  MessageSquare,
  DollarSign,
  Minus,
} from "lucide-react";
import { useAuth, hasPermission } from "@/_core/hooks/useAuth";
import { AUDIT_ACTIONS, auditedUpdateDoc, buildAuditSource } from "@/lib/auditLog";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/_core/firebase";
import {
  formatCurrencyEN,
  formatCurrencyShort,
  formatDateTimeEN,
  formatCompactNumberEN,
  formatNumberEN,
  formatPercentEN,
} from "@/lib/formatters";
import {
  buildProjectsMap,
  extractProjectId,
  getProjectDisplayTitleById,
} from "@/lib/projectDisplay";
import {
  buildUserIdentityIndex,
  getLinkedUserDisplayName,
} from "@/lib/userDisplay";
import {
  buildAdminInboxItems,
  type AdminInboxViewModel,
} from "@/lib/adminInbox";
import { normalizeWorkflowStatus } from "@shared/investmentLifecycle";
import {
  Area,
  ComposedChart,
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

type AnyDoc = Record<string, any> & { id: string };
type InboxFilterKey = "needsAction" | "new" | "seen" | "handled";
type ProjectDistributionStatusKey = "published" | "draft" | "completed" | "closed" | "other";
type InvestmentDistributionKey =
  | "processing"
  | "approved"
  | "active"
  | "completed"
  | "rejected"
  | "other";

type ProjectDistributionMeta = {
  label: string;
  description: string;
  color: string;
  badgeClassName: string;
  surfaceClassName: string;
};

type InvestmentDistributionMeta = {
  label: string;
  description: string;
  color: string;
  badgeClassName: string;
};

type GrowthChangeKind = "increase" | "decrease" | "flat" | "new";
type GrowthChangeMeta = {
  kind: GrowthChangeKind;
  label: string;
  toneClassName: string;
};

const PROJECT_DISTRIBUTION_ORDER: ProjectDistributionStatusKey[] = [
  "published",
  "completed",
  "draft",
  "closed",
  "other",
];

const PROJECT_DISTRIBUTION_META: Record<
  ProjectDistributionStatusKey,
  ProjectDistributionMeta
> = {
  published: {
    label: "نشطة",
    description: "مشاريع منشورة ومتاحة حاليًا داخل المنصة.",
    color: "#10B981",
    badgeClassName: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
    surfaceClassName: "border-emerald-100/80 bg-emerald-50/50",
  },
  completed: {
    label: "مكتملة",
    description: "مشاريع انتهت أو اكتمل تنفيذها بنجاح.",
    color: "#0EA5E9",
    badgeClassName: "border-sky-200/80 bg-sky-50 text-sky-700",
    surfaceClassName: "border-sky-100/80 bg-sky-50/55",
  },
  draft: {
    label: "قيد المراجعة",
    description: "مسودات ومشاريع ما قبل النشر أو قيد الإعداد.",
    color: "#F2B705",
    badgeClassName: "border-amber-200/80 bg-amber-50 text-amber-700",
    surfaceClassName: "border-amber-100/80 bg-amber-50/70",
  },
  closed: {
    label: "مغلقة",
    description: "مشاريع أغلقت ولم تعد متاحة حاليًا للاستثمار.",
    color: "#64748B",
    badgeClassName: "border-slate-200 bg-slate-100 text-slate-700",
    surfaceClassName: "border-slate-200/80 bg-slate-50/80",
  },
  other: {
    label: "أخرى",
    description: "حالات إضافية غير مصنفة ضمن العرض القياسي.",
    color: "#030640",
    badgeClassName: "border-[#030640]/10 bg-[#030640]/5 text-[#030640]",
    surfaceClassName: "border-[#030640]/10 bg-[#030640]/[0.03]",
  },
};

const INVESTMENT_DISTRIBUTION_ORDER: InvestmentDistributionKey[] = [
  "processing",
  "approved",
  "active",
  "completed",
  "rejected",
  "other",
];

const INVESTMENT_DISTRIBUTION_META: Record<
  InvestmentDistributionKey,
  InvestmentDistributionMeta
> = {
  processing: {
    label: "قيد المعالجة",
    description: "طلبات وسجلات لم تصل بعد إلى مرحلة التفعيل النهائي.",
    color: "#F2B705",
    badgeClassName: "border-amber-200/80 bg-amber-50 text-amber-700",
  },
  approved: {
    label: "جاهزة للتفعيل",
    description: "سجلات معتمدة بانتظار بدء التفعيل الفعلي.",
    color: "#2563EB",
    badgeClassName: "border-blue-200/80 bg-blue-50 text-blue-700",
  },
  active: {
    label: "نشطة",
    description: "استثمارات فعالة بدأت فعليًا داخل الدورة الاستثمارية.",
    color: "#10B981",
    badgeClassName: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
  },
  completed: {
    label: "مكتملة",
    description: "استثمارات أغلقت أو اكتملت خلال الدورة.",
    color: "#64748B",
    badgeClassName: "border-slate-200 bg-slate-100 text-slate-700",
  },
  rejected: {
    label: "مرفوضة",
    description: "استثمارات لم تستكمل وأغلقت بالرفض أو الإلغاء.",
    color: "#E11D48",
    badgeClassName: "border-rose-200/80 bg-rose-50 text-rose-700",
  },
  other: {
    label: "أخرى",
    description: "حالات إضافية غير مصنفة ضمن المراحل التشغيلية الأساسية.",
    color: "#030640",
    badgeClassName: "border-[#030640]/10 bg-[#030640]/5 text-[#030640]",
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

const INBOX_FILTER_META: Array<{ key: InboxFilterKey; label: string }> = [
  { key: "needsAction", label: "يحتاج إجراء" },
  { key: "new", label: "جديد" },
  { key: "seen", label: "تم الاطلاع" },
  { key: "handled", label: "تم التعامل" },
];

const INBOX_SLA_LATE_HOURS = 24;
const INBOX_SLA_CRITICAL_HOURS = 48;

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value === "number") return new Date(value);
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDateTimeAR(value: any) {
  return formatDateTimeEN(toDateSafe(value)) || "بدون تاريخ";
}

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function getInboxFilterKey(item: AdminInboxViewModel): InboxFilterKey {
  if (item.needsAction) return "needsAction";
  if (item.isNew) return "new";
  if (item.isSeen || item.isInProgress) return "seen";
  return "handled";
}

function getInboxSortTimestamp(item: AdminInboxViewModel) {
  return item.updatedAt?.getTime() || item.createdAt?.getTime() || 0;
}

function sortInboxItems(items: AdminInboxViewModel[]) {
  return [...items].sort((a, b) => {
    const rankDiff =
      INBOX_FILTER_META.findIndex((entry) => entry.key === getInboxFilterKey(a)) -
      INBOX_FILTER_META.findIndex((entry) => entry.key === getInboxFilterKey(b));

    if (rankDiff !== 0) return rankDiff;
    return getInboxSortTimestamp(b) - getInboxSortTimestamp(a);
  });
}

function buildInboxFilterCounts(items: AdminInboxViewModel[]) {
  return items.reduce<Record<InboxFilterKey, number>>(
    (acc, item) => {
      acc[getInboxFilterKey(item)] += 1;
      return acc;
    },
    {
      needsAction: 0,
      new: 0,
      seen: 0,
      handled: 0,
    }
  );
}

function getInboxSlaMeta(item: AdminInboxViewModel) {
  if (getInboxFilterKey(item) !== "needsAction") return null;

  const startedAt = item.adminSeenAt || item.adminReadAt || item.updatedAt || item.createdAt;
  if (!(startedAt instanceof Date)) return null;

  const ageHours = (Date.now() - startedAt.getTime()) / (60 * 60 * 1000);
  if (ageHours >= INBOX_SLA_CRITICAL_HOURS) {
    return {
      label: "متأخر جدًا",
      className: "border-rose-300 bg-rose-100 text-rose-900",
    };
  }

  if (ageHours >= INBOX_SLA_LATE_HOURS) {
    return {
      label: "متأخر",
      className: "border-amber-300 bg-amber-100 text-amber-900",
    };
  }

  return null;
}

function getProjectDistributionStatusKey(status: unknown): ProjectDistributionStatusKey {
  const normalized = String(status ?? "").trim().toLowerCase();

  if (normalized === "published" || normalized === "active") return "published";
  if (normalized === "completed") return "completed";
  if (normalized === "closed") return "closed";
  if (["draft", "reviewing", "pending_review"].includes(normalized)) return "draft";

  return "other";
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

function buildGrowthChangeMeta(current: number, previous: number): GrowthChangeMeta {
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

function getInvestmentDistributionKey(status: unknown): InvestmentDistributionKey {
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
}

function getClientDisplayName(row: AnyDoc) {
  return pickText(
    row?.name,
    row?.investorName,
    row?.userSnapshot?.displayName,
    row?.email,
    row?.createdByEmail,
    "عميل غير محدد"
  );
}

function getProjectDisplayName(row: AnyDoc) {
  return pickText(
    row?.projectTitle,
    row?.projectSnapshot?.titleAr,
    row?.projectSnapshot?.title,
    "بدون مشروع مرتبط"
  );
}

function getLinkedRequestId(row: AnyDoc) {
  return pickText(row?.parentRequestId, row?.requestId, row?.parentMessageId);
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const canSeeProjects = hasPermission(user, "projects.view");
  const canSeeInvestments = hasPermission(user, "investments.view");
  const canSeeUsers = hasPermission(user, "users.view");
  const canSeeMessages = hasPermission(user, "messages.view");
  const canManageMessages = hasPermission(user, "messages.manage");
  const canSeeRequests = canSeeMessages;
  const canAccessInbox = canSeeRequests || canSeeMessages;

  const [projects, setProjects] = useState<AnyDoc[]>([]);
  const [investments, setInvestments] = useState<AnyDoc[]>([]);
  const [usersRows, setUsersRows] = useState<AnyDoc[]>([]);
  const [requests, setRequests] = useState<AnyDoc[]>([]);
  const [messages, setMessages] = useState<AnyDoc[]>([]);
  const [isInboxDialogOpen, setIsInboxDialogOpen] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<InboxFilterKey>("needsAction");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    const unsubs: Array<() => void> = [];

    const sub = (
      colName: string,
      setter: (rows: AnyDoc[]) => void,
      markLoaded?: boolean
    ) => {
      const unsub = onSnapshot(
        collection(db, colName),
        (snap) => {
          setter(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as any),
            }))
          );

          if (markLoaded) setLoading(false);
        },
        (err) => {
          console.error(`${colName} snapshot error:`, err);

          if (colName === "projects") {
            setError("تعذر تحميل بيانات لوحة التحكم.");
          }

          if (markLoaded) setLoading(false);
          setter([]);
        }
      );

      unsubs.push(unsub);
    };

    const loaders: Array<{
      allowed: boolean;
      col: string;
      setter: (rows: AnyDoc[]) => void;
    }> = [
      { allowed: canSeeProjects, col: "projects", setter: setProjects },
      { allowed: canSeeInvestments, col: "investments", setter: setInvestments },
      { allowed: canSeeUsers, col: "users", setter: setUsersRows },
      { allowed: canSeeRequests, col: "interest_requests", setter: setRequests },
      { allowed: canSeeMessages, col: "messages", setter: setMessages },
    ];

    const firstLoader = loaders.find((row) => row.allowed);

    if (!canSeeProjects) setProjects([]);
    if (!canSeeInvestments) setInvestments([]);
    if (!canSeeUsers) setUsersRows([]);
    if (!canSeeRequests) setRequests([]);
    if (!canSeeMessages) setMessages([]);

    if (canSeeProjects) sub("projects", setProjects, firstLoader?.col === "projects");
    if (canSeeInvestments) {
      sub("investments", setInvestments, firstLoader?.col === "investments");
    }
    if (canSeeUsers) sub("users", setUsersRows, firstLoader?.col === "users");
    if (canSeeRequests) {
      sub("interest_requests", setRequests, firstLoader?.col === "interest_requests");
    }
    if (canSeeMessages) sub("messages", setMessages, firstLoader?.col === "messages");

    if (!firstLoader) setLoading(false);

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [canSeeProjects, canSeeInvestments, canSeeUsers, canSeeRequests, canSeeMessages]);

  const toNumberSafe = (value: unknown) => {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
  };

  const totalInvestedAmount = useMemo(
    () => investments.reduce((sum, inv) => sum + toNumberSafe(inv.amount), 0),
    [investments]
  );
  const projectsMap = useMemo(() => buildProjectsMap(projects), [projects]);
  const userIdentityIndex = useMemo(
    () => buildUserIdentityIndex(usersRows),
    [usersRows]
  );

  const inboxItems = useMemo(
    () =>
      buildAdminInboxItems({
        requests,
        messages,
        projectsMap,
        userIdentityIndex,
      }),
    [messages, projectsMap, requests, userIdentityIndex]
  );

  const unifiedInboxItems = useMemo(() => sortInboxItems(inboxItems), [inboxItems]);

  const inboxCounts = useMemo(
    () => buildInboxFilterCounts(unifiedInboxItems),
    [unifiedInboxItems]
  );

  const filteredInboxItems = useMemo(
    () => unifiedInboxItems.filter((item) => getInboxFilterKey(item) === inboxFilter),
    [unifiedInboxItems, inboxFilter]
  );

  const inboxAttentionCount = inboxCounts.needsAction + inboxCounts.new;

  const stats = useMemo(
    () => ({
      totalProjects: projects.length,
      publishedProjects: projects.filter((row) => row.status === "published").length,
      totalInvestments: investments.length,
      totalUsers: usersRows.length,
      vipUsers: usersRows.filter((row) => row.vipStatus === "vip").length,
      pendingRequests: inboxCounts.new,
      newMessages: inboxCounts.new,
      totalInboxItems: unifiedInboxItems.length,
      newInboxItems: inboxCounts.new,
      attentionInboxItems: inboxAttentionCount,
    }),
    [
      inboxAttentionCount,
      inboxCounts.new,
      investments.length,
      projects,
      unifiedInboxItems.length,
      usersRows,
    ]
  );

  const resolveProjectDisplayName = (row: AnyDoc) =>
    getProjectDisplayTitleById(
      projectsMap,
      extractProjectId(row),
      row?.projectTitle,
      row?.projectSnapshot?.titleAr,
      row?.projectSnapshot?.title,
      "بدون مشروع مرتبط"
    ) || "بدون مشروع مرتبط";

  const resolveClientDisplayName = (row: AnyDoc) =>
    getLinkedUserDisplayName(
      row,
      userIdentityIndex,
      "ط¹ظ…ظٹظ„ ط؛ظٹط± ظ…ط­ط¯ط¯"
    );

  const approvedInvestments = useMemo(
    () =>
      investments.filter((row) =>
        ["active", "completed"].includes(String(row.status || ""))
      ).length,
    [investments]
  );

  const recentInvestments = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    return investments.filter((row) => {
      const date = toDateSafe(row.createdAt);
      return Boolean(date && date >= start && date <= now);
    });
  }, [investments]);

  const investmentsGrowthData = useMemo(() => {
    const totalsByMonth = new Map<string, { year: number; month: number; amount: number }>();
    const now = new Date();
    const buckets: Array<{ year: number; month: number }> = [];

    for (const inv of recentInvestments) {
      const date = toDateSafe(inv.createdAt);
      if (!date) continue;

      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      const previous = totalsByMonth.get(key);
      const amount = toNumberSafe(inv.amount);

      if (previous) previous.amount += amount;
      else totalsByMonth.set(key, { year, month, amount });
    }

    for (let offset = 5; offset >= 0; offset -= 1) {
      const bucketDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      buckets.push({ year: bucketDate.getFullYear(), month: bucketDate.getMonth() });
    }

    const rows = buckets.map(({ year, month }) => {
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      const amount = Math.round(totalsByMonth.get(key)?.amount ?? 0);

      return {
        month: MONTH_NAMES_AR[month],
        monthLabel: `${MONTH_NAMES_AR[month]} ${year}`,
        amount,
      };
    });

    return rows.map((row, index) => {
      const previousAmount = index > 0 ? rows[index - 1].amount : 0;
      const change = buildGrowthChangeMeta(row.amount, previousAmount);

      return {
        ...row,
        previousAmount,
        changeKind: change.kind,
        changeLabel: change.label,
      };
    });
  }, [recentInvestments]);

  const investmentGrowthSummary = useMemo(() => {
    const total = investmentsGrowthData.reduce((sum, row) => sum + row.amount, 0);
    const latest = investmentsGrowthData[investmentsGrowthData.length - 1] ?? null;
    const previous = investmentsGrowthData[investmentsGrowthData.length - 2] ?? null;
    const change = buildGrowthChangeMeta(latest?.amount ?? 0, previous?.amount ?? 0);
    const bestMonth =
      [...investmentsGrowthData].sort((a, b) => b.amount - a.amount)[0] ?? null;
    const hasData = investmentsGrowthData.some((row) => row.amount > 0);

    return {
      total,
      latest,
      previous,
      change,
      bestMonth: bestMonth?.amount ? bestMonth : null,
      hasData,
    };
  }, [investmentsGrowthData]);

  const investmentGrowthYAxisDomain = useMemo(() => {
    const values = investmentsGrowthData.map((row) => row.amount);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);

    if (max <= 0) return [0, 1];

    if (max === min) {
      const padding = Math.max(max * 0.15, 1);
      return [Math.max(0, max - padding), max + padding];
    }

    const range = max - min;
    const padding = Math.max(range * 0.25, max * 0.08, 1);

    return [Math.max(0, min - padding), max + padding];
  }, [investmentsGrowthData]);

  const investmentStatusDistribution = useMemo(() => {
    const buckets = INVESTMENT_DISTRIBUTION_ORDER.reduce(
      (acc, key) => ({
        ...acc,
        [key]: { count: 0, amount: 0 },
      }),
      {} as Record<InvestmentDistributionKey, { count: number; amount: number }>
    );

    for (const investment of recentInvestments) {
      const key = getInvestmentDistributionKey(investment.status);
      buckets[key].count += 1;
      buckets[key].amount += toNumberSafe(investment.amount);
    }

    const totalCount = recentInvestments.length;
    const rows = INVESTMENT_DISTRIBUTION_ORDER.map((key) => {
      const meta = INVESTMENT_DISTRIBUTION_META[key];
      const count = buckets[key].count;
      const amount = buckets[key].amount;
      const percent = totalCount > 0 ? (count / totalCount) * 100 : 0;

      return {
        key,
        count,
        amount,
        percent,
        ...meta,
      };
    })
      .filter((row) => row.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return (
          INVESTMENT_DISTRIBUTION_ORDER.indexOf(a.key) -
          INVESTMENT_DISTRIBUTION_ORDER.indexOf(b.key)
        );
      });

    return {
      totalCount,
      rows,
      dominant: rows[0] ?? null,
    };
  }, [recentInvestments]);

  const projectStatusDistribution = useMemo(() => {
    const counts = PROJECT_DISTRIBUTION_ORDER.reduce(
      (acc, key) => ({ ...acc, [key]: 0 }),
      {} as Record<ProjectDistributionStatusKey, number>
    );

    for (const project of projects) {
      const key = getProjectDistributionStatusKey(project.status);
      counts[key] += 1;
    }

    const total = projects.length;

    const rows = PROJECT_DISTRIBUTION_ORDER.map((key) => {
      const meta = PROJECT_DISTRIBUTION_META[key];
      const value = counts[key];
      const percent = total > 0 ? (value / total) * 100 : 0;

      return {
        key,
        value,
        percent,
        ...meta,
      };
    })
      .filter((row) => row.value > 0)
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return (
          PROJECT_DISTRIBUTION_ORDER.indexOf(a.key) -
          PROJECT_DISTRIBUTION_ORDER.indexOf(b.key)
        );
      });

    return {
      total,
      rows,
      dominant: rows[0] ?? null,
    };
  }, [projects]);

  const markMessageAsRead = async (item: AdminInboxViewModel) => {
    if (!canManageMessages) return;
    if (!item.messageId || !item.isUnread) return;

    await auditedUpdateDoc({
      ref: doc(db, "messages", item.messageId),
      data: {
        adminReadAt: serverTimestamp(),
        adminReadByUid: user?.uid || null,
        adminReadByEmail: user?.email || null,
        isRead: true,
        updatedAt: serverTimestamp(),
      },
      action: AUDIT_ACTIONS.MESSAGE_REVIEWED,
      category: "message",
      entityType: "message",
      source: buildAuditSource({
        area: "admin",
        page: "Dashboard",
        method: "mark_read",
      }),
      message: `Marked message ${item.messageId} as read`,
      relatedIds: {
        requestId: item.requestId || undefined,
      },
      meta: {
        inboxKind: item.kind,
      },
      ignoreFields: [],
    });
  };

  const markRequestAsSeen = async (item: AdminInboxViewModel) => {
    if (!canManageMessages) return;
    if (!item.requestId || !item.isUnread) return;

    await auditedUpdateDoc({
      ref: doc(db, "interest_requests", item.requestId),
      data: {
        adminSeenAt: serverTimestamp(),
        adminSeenByUid: user?.uid || null,
        adminSeenByEmail: user?.email || null,
        updatedAt: serverTimestamp(),
      },
      action: AUDIT_ACTIONS.REQUEST_REVIEWED,
      category: "request",
      entityType: "request",
      source: buildAuditSource({
        area: "admin",
        page: "Dashboard",
        method: "mark_seen",
      }),
      message: `Marked request ${item.requestId} as seen`,
      relatedIds: { requestId: item.requestId },
      meta: {
        inboxKind: item.kind,
      },
      ignoreFields: [],
    });
  };

  const handleOpenInboxItem = async (item: AdminInboxViewModel) => {
    try {
      if (item.sourceCollection === "messages") {
        await markMessageAsRead(item);
      } else {
        await markRequestAsSeen(item);
      }
    } catch (error) {
      console.error("mark inbox item failed", error);
    }

    setIsInboxDialogOpen(false);
    if (item.actionHref) {
      setLocation(item.actionHref);
    }
  };

  const openInboxDialog = (_scope?: "messages" | "requests") => {
    setInboxFilter("needsAction");
    setIsInboxDialogOpen(true);
  };

  const getInboxKindMeta = (kind: AdminInboxViewModel["kind"]) => {
    if (kind === "investment_request") {
      return {
        label: "طلب استثماري",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    }

    if (kind === "interest_request") {
      return {
        label: "طلب اهتمام",
        className: "border-amber-200 bg-amber-50 text-amber-800",
      };
    }

    if (kind === "request_followup") {
      return {
        label: "متابعة عميل",
        className: "border-sky-200 bg-sky-50 text-sky-800",
      };
    }

    return {
      label: "سجل ناقص",
      className: "border-rose-200 bg-rose-50 text-rose-800",
    };
  };

  const getInboxTrackingMeta = (item: AdminInboxViewModel) => {
    if (item.isHandled) {
      return {
        label: "تم التعامل",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    }

    if (item.isInProgress) {
      return {
        label: "تحت الإجراء",
        className: "border-sky-200 bg-sky-50 text-sky-800",
      };
    }

    if (item.isSeen) {
      return {
        label: "تم الاطلاع",
        className: "border-slate-200 bg-slate-100 text-slate-700",
      };
    }

    return {
      label: "جديد",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  };

  const renderInboxCard = (item: AdminInboxViewModel) => {
    const kindMeta = getInboxKindMeta(item.kind);
    const trackingMeta = getInboxTrackingMeta(item);
    const slaMeta = getInboxSlaMeta(item);
    const projectTitle =
      item.projectTitle === "سجل مشروع غير مكتمل" ? "غير محدد" : item.projectTitle;
    const clientMeta = item.clientEmail || item.clientPhone || "لا توجد بيانات تواصل";
    const timeLabel = formatDateTimeAR(item.createdAt);

    return (
      <div
        key={item.entityId}
        className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.28)] transition-colors hover:border-slate-300/90"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-slate-950">{item.clientName}</div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${trackingMeta.className}`}
                  >
                    {trackingMeta.label}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${kindMeta.className}`}
                  >
                    {kindMeta.label}
                  </span>
                  {slaMeta ? (
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${slaMeta.className}`}
                    >
                      {slaMeta.label}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500">{clientMeta}</div>
              </div>


              <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  المشروع: {projectTitle}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  الوقت: {timeLabel}
                </span>
              </div>
            </div>

            <div className="space-y-2 rounded-[18px] border border-slate-100 bg-slate-50/70 px-3.5 py-3">
              <div className="text-[11px] font-medium text-slate-500">العنوان</div>
              <div className="text-sm font-semibold leading-6 text-slate-950">{item.title}</div>
              <div className="text-[11px] font-medium text-slate-500">الوصف</div>
              <div className="text-sm leading-6 whitespace-pre-line break-words text-slate-600">
                {item.preview}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 justify-end lg:min-w-[132px] lg:self-stretch lg:items-end">
            <Button
              size="sm"
              className="h-10 min-w-[120px] rounded-xl bg-[#F2B705] text-black shadow-sm hover:bg-[#d9a305]"
              onClick={() => void handleOpenInboxItem(item)}
            >
              {item.actionLabel}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const activeFilterMeta =
    INBOX_FILTER_META.find((entry) => entry.key === inboxFilter) || INBOX_FILTER_META[0];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">لوحة التحكم</h1>
          <p className="text-muted-foreground text-lg">نظرة عامة على أداء المنصة</p>
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {canSeeProjects && (
            <AdminPanelStatCard
              title="إجمالي المشاريع"
              value={stats.totalProjects}
              description="صورة سريعة لكل المشاريع المسجلة في المنصة والمستخدمة داخل لوحات التشغيل."
              helper={`${formatNumberEN(stats.publishedProjects)} مشروع منشور وجاهز للعرض`}
              icon={<Building2 className="h-5 w-5" />}
              accent="amber"
            />
          )}

          {canSeeInvestments && (
            <AdminPanelStatCard
              title="إجمالي الاستثمارات"
              value={stats.totalInvestments}
              description="كل سجلات الاستثمار المرتبطة بالمشاريع والعملاء عبر النظام حتى هذه اللحظة."
              helper={`${formatNumberEN(approvedInvestments)} استثمار في الحالات المعتمدة أو النشطة`}
              icon={<DollarSign className="h-5 w-5" />}
              accent="emerald"
            />
          )}

          {canSeeUsers && (
            <AdminPanelStatCard
              title="إجمالي المستخدمين"
              value={stats.totalUsers}
              description="عدد الحسابات المسجلة التي يمكن متابعتها من خلال لوحة الإدارة."
              helper={`${formatNumberEN(stats.vipUsers)} حسابات بعلامة VIP`}
              icon={<Users className="h-5 w-5" />}
              accent="blue"
            />
          )}
        </div>

        <button
          type="button"
          dir="rtl"
          className="group block w-full rounded-[32px] text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B705]/70 focus-visible:ring-offset-2"
          onClick={() => openInboxDialog()}
        >
          <Card className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.96)_54%,rgba(242,183,5,0.08)_100%)] shadow-[0_24px_70px_-40px_rgba(15,23,42,0.3)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-[#F2B705]/35 group-hover:shadow-[0_30px_80px_-42px_rgba(15,23,42,0.34)]">
            <CardContent className="flex flex-col gap-6 p-6 text-right lg:flex-row-reverse lg:items-center lg:justify-between">
              <div className="space-y-4 lg:flex-1">
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#F2B705]/20 bg-[#F2B705]/10 px-3 py-1 text-xs font-medium text-[#7a5b00]">
                    <MessageSquare className="h-4 w-4 text-[#030640]" />
                    مدخل تشغيلي
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                    الوارد
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-slate-500">
                    {canAccessInbox
                      ? "نافذة موحدة لمتابعة الطلبات والمتابعات من مكان واحد، مع التركيز على العناصر التي تحتاج إجراء أو ما زالت جديدة."
                      : "المدخل متاح دائمًا داخل اللوحة، وفتح الوارد يعرض لك حالة الوصول والمحتوى المتاح حسب صلاحياتك الحالية."}
                  </p>
                </div>

                <div className="flex flex-wrap justify-start gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800">
                    <span className="text-amber-600">يحتاج إجراء</span>
                    <span>{formatNumberEN(stats.attentionInboxItems)}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800">
                    <span className="text-sky-700">جديد</span>
                    <span>{formatNumberEN(stats.newInboxItems)}</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3 text-right lg:min-w-[280px] lg:max-w-[320px]">
                <div className="rounded-[24px] border border-slate-200/80 bg-white/90 px-5 py-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.4)]">
                  <div className="text-xs font-medium text-slate-500">
                    {canAccessInbox ? "إجمالي العناصر" : "حالة الوصول"}
                  </div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
                    {canAccessInbox ? formatNumberEN(stats.totalInboxItems) : "—"}
                  </div>
                  <div className="mt-2 text-sm text-slate-500">
                    {canAccessInbox
                      ? `${formatNumberEN(inboxCounts.handled)} تم التعامل معه`
                      : "يمكنك فتح الوارد لمعرفة العناصر المتاحة لك"}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-[22px] bg-[#030640] px-4 py-3 text-right text-white shadow-[0_18px_42px_-30px_rgba(3,6,64,0.7)]">
                  <div className="space-y-1 text-right">
                    <div className="text-sm font-semibold">فتح الوارد</div>
                    <div className="text-xs text-white/70">
                      {canAccessInbox ? "مراجعة العناصر الحالية" : "عرض حالة الصلاحية"}
                    </div>
                  </div>
                  <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
                    {canAccessInbox ? "عرض التفاصيل" : "فتح النافذة"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        {canSeeInvestments && (
          <Card>
            <CardHeader>
              <CardTitle className="flex gap-2 items-center">
                <TrendingUp className="w-5 h-5" /> نظرة مالية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <Metric
                  label="إجمالي الاستثمارات"
                  value={formatCurrencyEN(totalInvestedAmount)}
                />
                <Metric
                  label="متوسط الاستثمار"
                  value={
                    stats.totalInvestments
                      ? formatCurrencyEN(totalInvestedAmount / stats.totalInvestments)
                      : formatCurrencyEN(0)
                  }
                />
                <Metric
                  label="معدل الموافقة"
                  value={
                    stats.totalInvestments
                      ? formatPercentEN((approvedInvestments / stats.totalInvestments) * 100, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })
                      : formatPercentEN(0)
                  }
                />
              </div>
            </CardContent>
          </Card>
        )}


        <Dialog open={isInboxDialogOpen} onOpenChange={setIsInboxDialogOpen}>
          <DialogContent
            dir="rtl"
            className="grid max-h-[88vh] w-[min(94vw,68rem)] max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.985)_0%,rgba(248,250,252,0.96)_100%)] p-0 text-right shadow-[0_40px_120px_-42px_rgba(15,23,42,0.42)]"
          >
            <div className="shrink-0 border-b border-slate-200/80 bg-white/92 px-6 pb-4 pt-6">
              <DialogHeader className="gap-3 text-right">
                <DialogTitle className="text-xl tracking-tight text-slate-950">
                  الوارد
                </DialogTitle>
                <div className="text-sm leading-6 text-slate-500">
                  جميع الطلبات والمتابعات المرتبطة بها داخل نافذة واحدة، مع الفرز حسب
                  حالة المتابعة فقط.
                </div>
              </DialogHeader>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-500">إجمالي الوارد</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                    {formatNumberEN(stats.totalInboxItems)}
                  </div>
                </div>
                <div className="rounded-[20px] border border-amber-200/80 bg-amber-50/80 px-4 py-3">
                  <div className="text-[11px] font-medium text-amber-700">يحتاج متابعة</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-amber-900">
                    {formatNumberEN(stats.attentionInboxItems)}
                  </div>
                </div>
                <div className="rounded-[20px] border border-slate-200/80 bg-white px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-500">معروض الآن</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                    {formatNumberEN(filteredInboxItems.length)}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {INBOX_FILTER_META.map((filter) => {
                  const isActive = filter.key === inboxFilter;
                  return (
                    <Button
                      key={filter.key}
                      type="button"
                      variant="outline"
                      className={
                        isActive
                          ? "h-11 rounded-2xl border-[#F2B705] bg-[#F2B705]/15 px-4 text-[#7a5b00] shadow-[0_12px_26px_-20px_rgba(242,183,5,0.8)] hover:bg-[#F2B705]/20"
                          : "h-11 rounded-2xl border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50"
                      }
                      onClick={() => setInboxFilter(filter.key)}
                    >
                      <span>{filter.label}</span>
                      <span className="mr-2 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] text-slate-700">
                        {inboxCounts[filter.key]}
                      </span>
                    </Button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>{`الحالة الحالية: ${activeFilterMeta.label}`}</span>
                <span>{`${formatNumberEN(filteredInboxItems.length)} عنصر`}</span>
              </div>
            </div>

            <div className="min-h-0 overflow-hidden bg-slate-50/55">
              <ScrollArea
                dir="rtl"
                className="h-full min-h-0 [&>[data-slot=scroll-area-viewport]]:h-full"
              >
                <div className="space-y-3 px-6 py-5 text-right">
                  {canAccessInbox && filteredInboxItems.length > 0 ? (
                    filteredInboxItems.map((item) => renderInboxCard(item))
                  ) : (
                    <Empty className="min-h-[300px] rounded-[24px] border border-dashed border-slate-200 bg-white/70">
                      <EmptyHeader>
                        <EmptyMedia
                          variant="icon"
                          className="bg-[#F2B705]/12 text-[#030640]"
                        >
                          <MessageSquare className="size-5" />
                        </EmptyMedia>
                        <EmptyTitle>
                          {canAccessInbox ? "لا توجد عناصر ضمن هذه الحالة" : "لا توجد صلاحية لعرض الوارد"}
                        </EmptyTitle>
                        <EmptyDescription>
                          {canAccessInbox
                            ? "جرّب تبديل الفلتر من الأعلى لعرض العناصر الجديدة أو العناصر التي تم التعامل معها."
                            : "يبقى مدخل الوارد ظاهرًا داخل اللوحة، لكن عرض العناصر يتطلب صلاحية الوصول المناسبة."}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </div>
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>

        <div className="grid md:grid-cols-2 gap-6">
          {canSeeInvestments && (
            <Card className="overflow-hidden border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_100%)] shadow-[0_18px_48px_-28px_rgba(15,23,42,0.18)]">
              <CardHeader className="border-b border-slate-100/90 pb-5">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <CardTitle className="text-lg text-slate-950">
                      نمو الاستثمارات (آخر 6 شهور)
                    </CardTitle>
                    <CardDescription className="max-w-3xl text-sm leading-6 text-slate-500">
                      لوحة مركزة لقراءة النمو الشهري وتوزيع السجلات خلال نفس الفترة
                      الزمنية دون مغادرة الكرت.
                    </CardDescription>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <InsightMetric
                      label="إجمالي الاستثمارات خلال الفترة"
                      value={formatCurrencyShort(investmentGrowthSummary.total, {
                        maximumFractionDigits: 1,
                      })}
                      helper={
                        investmentGrowthSummary.hasData
                          ? `${formatNumberEN(recentInvestments.length)} سجل خلال آخر 6 شهور`
                          : "لا توجد حركة مالية مسجلة خلال الفترة"
                      }
                    />

                    <InsightMetric
                      label="النمو الشهري"
                      value={investmentGrowthSummary.change.label}
                      helper="مقارنة بالشهر السابق"
                      trend={investmentGrowthSummary.change.kind}
                    />

                    <InsightMetric
                      label="أفضل شهر"
                      value={investmentGrowthSummary.bestMonth?.month || "لا يوجد"}
                      helper={
                        investmentGrowthSummary.bestMonth
                          ? formatCurrencyShort(investmentGrowthSummary.bestMonth.amount, {
                              maximumFractionDigits: 1,
                            })
                          : "لا توجد بيانات كافية"
                      }
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                {investmentGrowthSummary.hasData ? (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.95fr)]">
                    <div className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">
                            النمو الزمني
                          </div>
                          <div className="text-xs leading-6 text-slate-500">
                            القيم المعروضة مختصرة بصيغة مالية مثل 500M و 1B.
                          </div>
                        </div>

                        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                          {investmentGrowthSummary.latest
                            ? `آخر شهر: ${investmentGrowthSummary.latest.month} - ${formatCurrencyShort(
                                investmentGrowthSummary.latest.amount,
                                { maximumFractionDigits: 1 }
                              )}`
                            : "آخر شهر: لا توجد بيانات"}
                        </div>
                      </div>

                      <ResponsiveContainer width="100%" height={320}>
                        <ComposedChart
                          data={investmentsGrowthData}
                          margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="investment-growth-fill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#F2B705" stopOpacity={0.24} />
                              <stop offset="100%" stopColor="#F2B705" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>

                          <CartesianGrid
                            vertical={false}
                            stroke="#E2E8F0"
                            strokeDasharray="4 4"
                          />
                          <XAxis
                            dataKey="month"
                            axisLine={false}
                            tickLine={false}
                            tickMargin={10}
                            minTickGap={0}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            width={56}
                            tickMargin={10}
                            tickFormatter={(value) =>
                              formatCompactNumberEN(value, { maximumFractionDigits: 1 })
                            }
                            domain={investmentGrowthYAxisDomain}
                          />
                          <Tooltip
                            cursor={{ stroke: "#CBD5E1", strokeDasharray: "4 4" }}
                            content={<InvestmentGrowthTooltip />}
                          />
                          <Area
                            type="monotone"
                            dataKey="amount"
                            fill="url(#investment-growth-fill)"
                            stroke="none"
                            isAnimationActive={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="amount"
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
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/75 px-4 py-4 shadow-sm">
                      <div className="mb-4">
                        <div className="text-sm font-semibold text-slate-950">
                          توزيع الاستثمارات
                        </div>
                        <div className="text-xs leading-6 text-slate-500">
                          توزيع سجلات الفترة حسب المرحلة التشغيلية الحالية.
                        </div>
                      </div>

                      <div className="relative mx-auto h-[220px] w-full max-w-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Tooltip content={<InvestmentDistributionTooltip />} />
                            <Pie
                              data={investmentStatusDistribution.rows}
                              dataKey="count"
                              nameKey="label"
                              innerRadius={60}
                              outerRadius={84}
                              paddingAngle={3}
                              cornerRadius={10}
                              stroke="none"
                            >
                              {investmentStatusDistribution.rows.map((item) => (
                                <Cell key={item.key} fill={item.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>

                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <div className="text-[11px] font-medium text-slate-500">
                            إجمالي السجلات
                          </div>
                          <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                            {formatNumberEN(investmentStatusDistribution.totalCount)}
                          </div>
                          <div className="text-xs text-slate-500">آخر 6 شهور</div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2.5">
                        {investmentStatusDistribution.rows.map((item) => (
                          <div
                            key={item.key}
                            className="rounded-[20px] border border-white/80 bg-white px-3 py-3 shadow-sm transition-colors hover:border-slate-300/80"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5">
                                <span
                                  className="mt-1 h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                <div>
                                  <div className="text-sm font-semibold text-slate-950">
                                    {item.label}
                                  </div>
                                  <div className="text-xs leading-5 text-slate-500">
                                    {formatNumberEN(item.count)} استثمار
                                  </div>
                                </div>
                              </div>

                              <div className="text-left">
                                <div
                                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${item.badgeClassName}`}
                                >
                                  {formatDashboardPercent(item.percent)}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {formatCurrencyShort(item.amount, {
                                    maximumFractionDigits: 1,
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Empty className="min-h-[320px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                    <EmptyHeader>
                      <EmptyMedia
                        variant="icon"
                        className="bg-[#F2B705]/12 text-[#030640]"
                      >
                        <TrendingUp className="size-5" />
                      </EmptyMedia>
                      <EmptyTitle>لا توجد بيانات كافية لعرض النمو</EmptyTitle>
                      <EmptyDescription>
                        سيظهر تحليل النمو وتوزيع الاستثمارات هنا فور توفر بيانات مالية ضمن
                        آخر 6 شهور.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>
          )}

          {canSeeProjects && (
            <Card className="overflow-hidden border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_100%)] shadow-[0_18px_48px_-28px_rgba(15,23,42,0.18)]">
              <CardHeader className="border-b border-slate-100/90 pb-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <CardTitle className="text-lg text-slate-950">توزيع المشاريع</CardTitle>
                    <CardDescription className="max-w-2xl text-sm leading-6 text-slate-500">
                      قراءة سريعة لحالات المشاريع الحالية داخل المنصة بدون الحاجة لتفسير
                      الألوان أو الأرقام يدويًا.
                    </CardDescription>
                  </div>

                  <div className="min-w-[170px] rounded-[20px] border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
                    <div className="text-xs font-medium text-slate-500">إجمالي المشاريع</div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                      {formatNumberEN(projectStatusDistribution.total)}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                {projectStatusDistribution.total > 0 ? (
                  <div className="space-y-6">
                    <div className="space-y-3.5">
                      {projectStatusDistribution.rows.map((item) => (
                        <div
                          key={item.key}
                          className={`rounded-[22px] border px-4 py-4 shadow-sm ${item.surfaceClassName}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-3">
                                <span
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                <div className="text-sm font-semibold text-slate-950">
                                  {item.label}
                                </div>
                              </div>
                              <div className="pr-6 text-xs leading-6 text-slate-500">
                                {item.description}
                              </div>
                            </div>

                            <div className="text-left">
                              <div
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${item.badgeClassName}`}
                              >
                                {formatDashboardPercent(item.percent)}
                              </div>
                              <div className="mt-2 text-base font-semibold text-slate-950">
                                {formatNumberEN(item.value)} مشاريع
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200/70">
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{
                                width: `${item.percent}%`,
                                minWidth: item.value > 0 ? "1.75rem" : undefined,
                                backgroundColor: item.color,
                              }}
                              title={`${item.label} - ${formatNumberEN(item.value)} مشاريع - ${formatDashboardPercent(item.percent)}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                        <div className="text-xs font-medium text-slate-500">أعلى حالة</div>
                        <div className="mt-2 text-lg font-semibold text-slate-950">
                          {projectStatusDistribution.dominant?.label || "-"}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {projectStatusDistribution.dominant
                            ? `${formatNumberEN(projectStatusDistribution.dominant.value)} مشاريع • ${formatDashboardPercent(projectStatusDistribution.dominant.percent)}`
                            : "لا توجد بيانات كافية"}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-[#030640]/10 bg-[#030640] px-4 py-4 text-white shadow-sm">
                        <div className="text-xs font-medium text-white/70">
                          الحالات الظاهرة
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {formatNumberEN(projectStatusDistribution.rows.length)} حالات
                        </div>
                        <div className="mt-1 text-sm leading-6 text-white/72">
                          توزيع مباشر بالأسماء والنسب والعدادات لقراءة أسرع داخل اللوحة.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Empty className="min-h-[280px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                    <EmptyHeader>
                      <EmptyMedia
                        variant="icon"
                        className="bg-[#F2B705]/12 text-[#030640]"
                      >
                        <Building2 className="size-5" />
                      </EmptyMedia>
                      <EmptyTitle>لا توجد مشاريع لعرض التوزيع</EmptyTitle>
                      <EmptyDescription>
                        سيظهر توزيع حالات المشاريع هنا فور إضافة أول مشروع إلى المنصة.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}

function TrendIcon({ kind, className = "h-4 w-4" }: { kind: GrowthChangeKind; className?: string }) {
  if (kind === "increase" || kind === "new") {
    return <ArrowUpRight className={className} />;
  }

  if (kind === "decrease") {
    return <ArrowDownRight className={className} />;
  }

  return <Minus className={className} />;
}

function InsightMetric({
  label,
  value,
  helper,
  trend,
}: {
  label: string;
  value: string;
  helper: string;
  trend?: GrowthChangeKind;
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
      <div className={`mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight ${toneClassName}`}>
        {trend ? <TrendIcon kind={trend} /> : null}
        <span>{value}</span>
      </div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{helper}</div>
    </div>
  );
}

function InvestmentGrowthTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  const change = buildGrowthChangeMeta(Number(row?.amount || 0), Number(row?.previousAmount || 0));

  return (
    <div className="min-w-[210px] rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-xl">
      <div className="text-sm font-semibold text-slate-950">{row?.monthLabel || row?.month}</div>
      <div className="mt-2 text-xs font-medium text-slate-500">قيمة الاستثمارات</div>
      <div className="mt-1 text-base font-semibold text-slate-950">
        {formatCurrencyShort(row?.amount || 0, { maximumFractionDigits: 1 })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
        <div className="text-xs text-slate-500">التغير عن الشهر السابق</div>
        <div className={`flex items-center gap-1 text-xs font-semibold ${change.toneClassName}`}>
          <TrendIcon kind={change.kind} className="h-3.5 w-3.5" />
          <span>{change.label}</span>
        </div>
      </div>
    </div>
  );
}

function InvestmentDistributionTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;

  return (
    <div className="min-w-[190px] rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-xl">
      <div className="text-sm font-semibold text-slate-950">{row?.label}</div>
      <div className="mt-2 text-xs text-slate-500">
        {formatNumberEN(row?.count || 0)} استثمار - {formatDashboardPercent(row?.percent || 0)}
      </div>
      <div className="mt-1 text-xs font-medium text-slate-500">إجمالي القيمة</div>
      <div className="mt-1 text-base font-semibold text-slate-950">
        {formatCurrencyShort(row?.amount || 0, { maximumFractionDigits: 1 })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

