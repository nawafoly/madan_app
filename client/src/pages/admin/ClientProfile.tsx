/* eslint-disable @typescript-eslint/no-unused-vars */
// client/src/pages/admin/ClientProfile.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Download,
  Eye,
  ExternalLink,
  RefreshCw,
  FileDown,
  FileText,
  LayoutGrid,
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
  getClientContractStatusLabel,
  getClientInvestmentStatusLabel,
  normalizeWorkflowStatus,
} from "@shared/investmentLifecycle";

import {
  doc,
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/_core/firebase";
import { recomputeInvestorAggregates } from "@/_core/recomputeInvestorAggregates";
import {
  formatCurrencyEN,
  formatDateEN,
  formatDateTimeEN,
  formatNumberEN,
  formatPercentEN,
} from "@/lib/formatters";
import { buildR2DownloadUrl } from "@/lib/documentUploadService";
import { deriveInvestmentStage } from "@/lib/investmentStage";
import {
  emailLocalPart,
  getUserDisplayName,
  investmentMatchesUser,
} from "@/lib/investorIdentity";
import { getOwnerRoleLabel } from "@/lib/ownerAccounts";
import {
  buildProjectsMap,
  getProjectDisplayTitleById,
} from "@/lib/projectDisplay";
import { getProjectProfitFallback } from "@/lib/projectProfitFallback";
import { downloadCorporateClientProfilePdf } from "@/lib/clientProfilePdf";
import { resolveUserAccountStatus } from "@/lib/userAccountStatus";
import {
  getInvestmentProfitSnapshot,
  hasReadableInvestmentProfit,
  roundMoney,
} from "@shared/investmentProfit";

const EMPTY_VALUE = "غير متوفر";
const LIVE_UPDATE_INTERVAL_MS = 1000;
const LIVE_PROFIT_FRACTION_DIGITS = 3;
const LIVE_PROGRESS_FRACTION_DIGITS = 4;

type UserDoc = {
  id: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  uid?: string;
  userId?: string;
  authUid?: string;
  role?: string;
  active?: boolean | string | number | null;
  isActive?: boolean | string | number | null;
  status?: string | boolean | number | null;
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
  profile?: Record<string, any>;
  contact?: Record<string, any>;
};

type InvestmentDoc = {
  id: string;
  userId?: string;
  investorUid?: string;
  investorId?: string;
  clientId?: string;
  investorName?: string;
  investorEmail?: string;
  projectId?: string;
  amount?: number;
  approvedAmount?: number;
  estimatedReturn?: number;
  expectedProfit?: number;
  annualReturnAtSign?: number;
  durationMonthsAtSign?: number;
  durationMonths?: number;
  status?: string;
  contractStatus?: string;
  createdAt?: any;
  startAt?: any;
  signedAt?: any;
  plannedEndAt?: any;
  actualEndAt?: any;
  updatedAt?: any;
  verifiedAt?: any;
  originalContract?: Record<string, any>;
  contractFile?: Record<string, any>;
  signedContract?: Record<string, any>;
  signedContractFile?: Record<string, any>;
  originalContractPath?: string;
  originalContractUrl?: string;
  signedContractPath?: string;
  signedContractUrl?: string;
  signedContractOutdated?: boolean;
  requiresResign?: boolean;
  userSnapshot?: Record<string, any>;
};

type InvestmentBucketKey =
  | "under_review"
  | "awaiting_signature"
  | "active"
  | "completed"
  | "cancelled";

type ProfileTabKey =
  | "overview"
  | "requests"
  | "active"
  | "completed"
  | "documents";

type InvestmentDocumentLink = {
  id: string;
  label: string;
  fileName: string;
  viewUrl?: string;
  downloadUrl?: string;
  uploadedAt: Date | null;
};

type InvestmentRow = {
  id: string;
  projectId: string;
  projectTitle: string;
  referenceLabel: string;
  bucketKey: InvestmentBucketKey;
  bucketLabel: string;
  statusLabel: string;
  statusClassName: string;
  rawStatus: string;
  contractStatus: string;
  contractStatusLabel: string;
  contractStatusClassName: string;
  summaryLabel: string;
  summaryClassName: string;
  amount: number;
  expectedProfitTotal: number | null;
  currentProfit: number | null;
  totalValue: number | null;
  percent: number | null;
  durationMonths: number | null;
  requestDate: Date | null;
  startDate: Date | null;
  maturityDate: Date | null;
  actualEndDate: Date | null;
  lastUpdatedAt: Date | null;
  sortDate: Date | null;
  progressRatio: number | null;
  progressPercent: number | null;
  growthDirection: "up" | "down" | "flat" | null;
  isEnded: boolean;
  documents: InvestmentDocumentLink[];
  hasAnyDocuments: boolean;
};

function toDateSafe(value: any): Date | null {
  try {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (typeof value?.toDate === "function") return value.toDate();
    if (typeof value?.seconds === "number")
      return new Date(value.seconds * 1000);

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

function readNestedValue(source: any, path: string) {
  const keys = String(path || "")
    .split(".")
    .map((value) => value.trim())
    .filter(Boolean);

  let current = source;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = current[key];
  }

  return current;
}

function resolveDocValue(source: any, candidates: string[]) {
  for (const candidate of candidates) {
    const value = readNestedValue(source, candidate);
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return undefined;
}

function resolveDocPath(source: any, candidates: string[]) {
  const value = resolveDocValue(source, candidates);
  return typeof value === "string" ? value.trim() : "";
}

function getFileNameFromPath(path: any) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/\\/g, "/");
  return normalized.split("/").pop()?.trim() || "";
}

function toSortedDateValue(...values: Array<Date | null | undefined>) {
  const dates = values
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime());
  return dates[0] ?? null;
}

function formatInvestmentReference(id: string) {
  const raw = String(id || "").trim();
  if (!raw) return EMPTY_VALUE;
  const compact = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `INV-${(compact || raw.toUpperCase()).slice(0, 8)}`;
}

function formatDate(date: Date | null) {
  return date ? formatDateEN(date) : EMPTY_VALUE;
}

function formatDateTime(date: Date | null) {
  return date ? formatDateTimeEN(date) : EMPTY_VALUE;
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
  return formatCurrencyEN(safeValue, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
  });
}

function formatPercent(
  value: number | null,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
) {
  if (!Number.isFinite(value as number)) return EMPTY_VALUE;
  return formatPercentEN(Number(value), {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  });
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
  const fractionDigits =
    safeValue > 0 && safeValue < 100 ? LIVE_PROGRESS_FRACTION_DIGITS : 0;

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
  return `${formatNumberEN(rounded)} شهر`;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveExpectedProfit(
  inv: InvestmentDoc,
  percent: number | null,
  durationMonths: number | null
) {
  const explicitValue = Number(inv.expectedProfit ?? inv.estimatedReturn);
  if (Number.isFinite(explicitValue)) return explicitValue;

  const amount = Number(inv.approvedAmount ?? inv.amount ?? 0);
  if (
    !amount ||
    percent == null ||
    durationMonths == null ||
    durationMonths <= 0
  )
    return null;

  return amount * (percent / 100) * (durationMonths / 12);
}

function calculateProgress(
  startDate: Date | null,
  endDate: Date | null,
  now: Date
) {
  if (!startDate || !endDate) {
    return { ratio: null, percent: null };
  }

  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
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
  return (
    getProjectDisplayTitleById(projectsMap, projectId, EMPTY_VALUE) ||
    EMPTY_VALUE
  );
}

function durationMonthsFromDates(inv: any): number | null {
  const start =
    toDateSafe(inv?.startAt) ||
    toDateSafe(inv?.signedAt) ||
    toDateSafe(inv?.createdAt);
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
  const directDuration = Number(
    inv?.durationMonthsAtSign ?? inv?.durationMonths ?? 0
  );
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
  const snapshotValue = Number(
    inv?.durationMonthsAtSign ?? inv?.durationMonths
  );
  if (Number.isFinite(snapshotValue)) return snapshotValue;

  const fromDates = durationMonthsFromDates(inv);
  if (Number.isFinite(fromDates)) return fromDates;

  const pid = String(inv?.projectId || "").trim();
  if (!pid) return null;

  const project = projectsMap[pid];
  if (!project) return null;

  const value =
    project?.durationMonths ?? project?.duration ?? project?.durationInMonths;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + Number(months || 0));
  return next;
}

const INVESTMENT_BUCKET_META: Record<
  InvestmentBucketKey,
  {
    title: string;
    shortTitle: string;
    description: string;
    className: string;
    accentClassName: string;
    borderClassName: string;
    icon: any;
    tab: Exclude<ProfileTabKey, "overview" | "documents">;
  }
> = {
  under_review: {
    title: "تحت الطلب / قيد المراجعة",
    shortTitle: "تحت الطلب",
    description: "طلبات استثمار ما زالت في مرحلة المراجعة الأولية أو استكمال التحقق.",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    accentClassName: "from-amber-500/15 via-amber-100/60 to-white",
    borderClassName: "border-amber-200/80",
    icon: BriefcaseBusiness,
    tab: "requests",
  },
  awaiting_signature: {
    title: "بانتظار التوقيع / تجهيز العقد",
    shortTitle: "بانتظار التوقيع",
    description: "استثمارات وصلت لمرحلة تجهيز العقد أو تنتظر توقيع العميل ومتابعة المستندات.",
    className: "border-sky-200 bg-sky-50 text-sky-800",
    accentClassName: "from-sky-500/15 via-sky-100/60 to-white",
    borderClassName: "border-sky-200/80",
    icon: ReceiptText,
    tab: "requests",
  },
  active: {
    title: "الاستثمارات النشطة / المستمرة",
    shortTitle: "النشطة",
    description: "استثمارات مفعلة أو جارية أو وصلت لمرحلة التوقيع النهائي والمتابعة التشغيلية.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    accentClassName: "from-emerald-500/15 via-emerald-100/60 to-white",
    borderClassName: "border-emerald-200/80",
    icon: TrendingUp,
    tab: "active",
  },
  completed: {
    title: "الاستثمارات المكتملة / المنتهية",
    shortTitle: "المكتملة",
    description: "استثمارات أغلقت أو اكتملت مدتها وتم إنهاؤها بنجاح.",
    className: "border-slate-300 bg-slate-100 text-slate-800",
    accentClassName: "from-slate-400/15 via-slate-100/70 to-white",
    borderClassName: "border-slate-200/90",
    icon: History,
    tab: "completed",
  },
  cancelled: {
    title: "الملغية / المرفوضة",
    shortTitle: "الملغية",
    description: "طلبات أو استثمارات تم رفضها أو إلغاؤها ولن تنتقل للمراحل اللاحقة.",
    className: "border-rose-200 bg-rose-50 text-rose-800",
    accentClassName: "from-rose-500/15 via-rose-100/60 to-white",
    borderClassName: "border-rose-200/80",
    icon: CircleOff,
    tab: "requests",
  },
};

function normalizeStatusKey(status: any) {
  return normalizeWorkflowStatus(status);
}

function isClosedInvestmentStatus(status: any) {
  const key = normalizeStatusKey(status);
  return (
    key.includes("completed") ||
    key.includes("closed") ||
    key.includes("finished")
  );
}

function statusLabel(status: any) {
  const key = normalizeStatusKey(status);
  if (!key) return EMPTY_VALUE;
  if (key === "cancelled") return "ملغي";
  return getClientInvestmentStatusLabel(key) || String(status || EMPTY_VALUE);
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

  if (
    key === "pending" ||
    key === "pending_review" ||
    key === "pending_contract" ||
    key === "reviewing"
  ) {
    return {
      label: statusLabel(status),
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (
    key === "approved" ||
    key === "signed" ||
    key === "signing" ||
    key === "pending_signature" ||
    key === "awaiting_signature"
  ) {
    return {
      label: statusLabel(status),
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  if (key === "rejected" || key === "cancelled") {
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

function getContractStatusBadge(status: any) {
  const key = normalizeStatusKey(status);
  if (!key) {
    return {
      label: EMPTY_VALUE,
      className: "border-slate-200 bg-slate-50 text-slate-500",
    };
  }

  if (
    ["draft", "generated", "contract_ready", "sent", "issued"].includes(key)
  ) {
    return {
      label: getClientContractStatusLabel(key),
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  if (["awaiting_signature", "pending_signature"].includes(key)) {
    return {
      label: getClientContractStatusLabel(key),
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (
    [
      "signed",
      "signed_uploaded",
      "under_review",
      "pending_approval",
      "submitted_for_review",
      "uploaded",
    ].includes(key)
  ) {
    return {
      label: getClientContractStatusLabel(key),
      className: "border-violet-200 bg-violet-50 text-violet-700",
    };
  }

  if (["approved", "verified"].includes(key)) {
    return {
      label: getClientContractStatusLabel(key),
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  return {
    label: getClientContractStatusLabel(key),
    className: "border-slate-200 bg-slate-50 text-slate-600",
  };
}

function resolveInvestmentDocument(
  investment: InvestmentDoc,
  kind: "original" | "signed"
): InvestmentDocumentLink | null {
  const path =
    kind === "original"
      ? resolveDocPath(investment, [
          "originalContract.path",
          "contractFile.path",
          "originalContractPath",
        ])
      : resolveDocPath(investment, [
          "signedContract.path",
          "signedContractFile.path",
          "signedContractPath",
        ]);

  const url =
    kind === "original"
      ? pick(
          resolveDocValue(investment, [
            "originalContract.url",
            "contractFile.url",
            "originalContractUrl",
          ]),
          investment.originalContractUrl
        )
      : pick(
          resolveDocValue(investment, [
            "signedContract.url",
            "signedContractFile.url",
            "signedContractUrl",
          ]),
          investment.signedContractUrl
        );

  const fileName =
    kind === "original"
      ? pick(
          resolveDocValue(investment, [
            "originalContract.fileName",
            "contractFile.fileName",
          ]),
          getFileNameFromPath(path),
          "original.pdf"
        )
      : pick(
          resolveDocValue(investment, [
            "signedContract.fileName",
            "signedContractFile.fileName",
          ]),
          getFileNameFromPath(path),
          "signed.pdf"
        );

  const viewUrl = pick(url, buildR2DownloadUrl(path, false));
  const downloadUrl = pick(buildR2DownloadUrl(path, true), url, viewUrl);
  const uploadedAt = toDateSafe(
    kind === "original"
      ? resolveDocValue(investment, [
          "originalContract.uploadedAt",
          "contractFile.uploadedAt",
        ])
      : resolveDocValue(investment, [
          "signedContract.uploadedAt",
          "signedContractFile.uploadedAt",
        ])
  );

  if (!path && !url && !viewUrl && !downloadUrl) return null;

  return {
    id: kind,
    label: kind === "original" ? "العقد الأصلي" : "العقد الموقّع",
    fileName,
    viewUrl,
    downloadUrl,
    uploadedAt,
  };
}

function classifyInvestmentBucket(investment: InvestmentDoc) {
  const originalDocument = resolveInvestmentDocument(investment, "original");
  const signedDocument = resolveInvestmentDocument(investment, "signed");
  const contractStatus = normalizeStatusKey(investment.contractStatus);
  const stage = deriveInvestmentStage({
    investmentStatus: investment.status,
    contractStatus: investment.contractStatus,
    hasInvestment: true,
    hasOriginalContract: Boolean(originalDocument),
    hasSignedContract: Boolean(signedDocument),
    hasVerifiedContract:
      Boolean(investment.verifiedAt) ||
      contractStatus === "approved" ||
      contractStatus === "verified",
  });

  if (stage === "completed") return "completed" as const;
  if (stage === "cancelled" || stage === "rejected") {
    return "cancelled" as const;
  }
  if (
    stage === "active" ||
    stage === "contract_under_review" ||
    stage === "contract_verified"
  ) {
    return "active" as const;
  }
  if (stage === "contract_preparing" || stage === "awaiting_signature") {
    return "awaiting_signature" as const;
  }
  return "under_review" as const;
}

function getRoleBadge(role?: string, email?: string) {
  const key = String(role || "")
    .trim()
    .toLowerCase();
  const map: Record<string, { label: string; className: string }> = {
    owner: {
      label: getOwnerRoleLabel(email),
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

  return (
    map[key] || {
      label: role || EMPTY_VALUE,
      className: "border-slate-200 bg-slate-100 text-slate-700",
    }
  );
}

function getAccountBadge(user: UserDoc | null) {
  const { isActive: active } = resolveUserAccountStatus(user);
  return active
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
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm",
        className
      )}
    >
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
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm",
        className
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={cn("mt-3 text-2xl font-bold text-slate-950", valueClassName)}
      >
        {value}
      </div>
      {helper ? (
        <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
      ) : null}
    </div>
  );
}

function DetailCell({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-slate-50/90 p-4",
        emphasized && "border-slate-300 bg-white"
      )}
    >
      <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-sm font-semibold leading-7 text-slate-900 break-words",
          emphasized && "text-base"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SectionEmptyState({
  bucketKey,
  title,
  description,
}: {
  bucketKey: InvestmentBucketKey;
  title: string;
  description: string;
}) {
  const meta = INVESTMENT_BUCKET_META[bucketKey];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "rounded-[28px] border border-dashed bg-white/70 px-6 py-10 text-center",
        meta.borderClassName
      )}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function OverviewCategoryCard({
  bucketKey,
  count,
  onOpenTab,
}: {
  bucketKey: InvestmentBucketKey;
  count: number;
  onOpenTab: (tab: Exclude<ProfileTabKey, "overview" | "documents">) => void;
}) {
  const meta = INVESTMENT_BUCKET_META[bucketKey];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onOpenTab(meta.tab)}
      className={cn(
        "group relative overflow-hidden rounded-[28px] border bg-white p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg",
        meta.borderClassName
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l", meta.accentClassName)} />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
              meta.className
            )}
          >
            <Icon className="ml-1 h-3.5 w-3.5" />
            {meta.shortTitle}
          </div>
          <div className="text-3xl font-bold tracking-tight text-slate-950">
            {formatNumberEN(count)}
          </div>
          <p className="text-sm leading-6 text-slate-500">{meta.description}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors group-hover:border-slate-300 group-hover:bg-white">
          فتح القسم
          <ExternalLink className="mr-1 inline h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  );
}

function DocumentActionButtons({
  document,
}: {
  document: InvestmentDocumentLink;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {document.viewUrl ? (
        <Button asChild variant="outline" size="sm" className="rounded-full px-4">
          <a href={document.viewUrl} target="_blank" rel="noreferrer">
            <Eye className="h-4 w-4" />
            عرض
          </a>
        </Button>
      ) : null}

      {document.downloadUrl ? (
        <Button asChild variant="outline" size="sm" className="rounded-full px-4">
          <a href={document.downloadUrl} rel="noreferrer" download={document.fileName || true}>
            <Download className="h-4 w-4" />
            تنزيل
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function InvestmentCardPanel({
  row,
  onOpenDetails,
}: {
  row: InvestmentRow;
  onOpenDetails: (investmentId: string) => void;
}) {
  const bucketMeta = INVESTMENT_BUCKET_META[row.bucketKey];
  const progressValue =
    row.progressPercent != null ? clampNumber(row.progressPercent, 0, 100) : 0;

  return (
    <article className="group relative overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className={cn("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l", bucketMeta.accentClassName)} />

      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {row.referenceLabel}
              </span>
              <Badge variant="outline" className={row.statusClassName}>
                {row.statusLabel}
              </Badge>
              {row.contractStatus ? (
                <Badge variant="outline" className={row.contractStatusClassName}>
                  {row.contractStatusLabel}
                </Badge>
              ) : null}
            </div>

            <div>
              <h3 className="text-xl font-semibold text-slate-950 break-words">
                {row.projectTitle}
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                طلب بتاريخ {formatDate(row.requestDate)}، وآخر تحديث {formatDateTime(row.lastUpdatedAt)}.
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 shadow-sm xl:min-w-[240px]">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              المبلغ المستثمر
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
              {money(row.amount)}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl bg-white px-3 py-2">
                <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                  العائد المتوقع
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {row.expectedProfitTotal != null
                    ? money(row.expectedProfitTotal)
                    : EMPTY_VALUE}
                </div>
              </div>
              <div className="rounded-2xl bg-white px-3 py-2">
                <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                  الربح الحالي
                </div>
                <div className="mt-1 text-sm font-semibold text-emerald-700">
                  {row.currentProfit != null ? liveMoney(row.currentProfit) : EMPTY_VALUE}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DetailCell label="تاريخ الطلب" value={formatDate(row.requestDate)} />
          <DetailCell label="تاريخ البداية" value={formatDate(row.startDate)} />
          <DetailCell
            label="تاريخ النهاية"
            value={formatDate(row.actualEndDate || row.maturityDate)}
          />
          <DetailCell
            label="المدة / العائد"
            value={`${durationLabel(row.durationMonths)} • ${formatPercent(row.percent)}`}
          />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  التقدم الزمني للاستثمار
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {row.progressPercent != null
                    ? `بلغت نسبة التقدم ${formatLiveProgress(row.progressPercent)} حتى الآن.`
                    : "لا توجد بيانات زمنية كافية لحساب تقدم الاستثمار حالياً."}
                </p>
              </div>
              <div className="rounded-2xl border border-white bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm">
                {row.progressPercent != null
                  ? formatLiveProgress(row.progressPercent)
                  : EMPTY_VALUE}
              </div>
            </div>

            <Progress
              value={progressValue}
              className="h-2.5 bg-slate-200 [&_[data-slot=progress-indicator]]:bg-slate-900"
            />

            <div className="flex flex-wrap items-center gap-2">
              {row.hasAnyDocuments ? (
                row.documents.map(document => (
                  <Badge
                    key={document.id}
                    variant="outline"
                    className="border-slate-200 bg-white text-slate-700"
                  >
                    <FileText className="ml-1 h-3.5 w-3.5" />
                    {document.label}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-slate-500">
                  لا توجد مستندات أو عقود مرتبطة بهذا الاستثمار حالياً.
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <Button
              variant="outline"
              className="rounded-full px-5"
              onClick={() => onOpenDetails(row.id)}
            >
              <Eye className="ml-2 h-4 w-4" />
              تفاصيل الاستثمار
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function DocumentRecordCard({
  row,
  onOpenDetails,
}: {
  row: InvestmentRow;
  onOpenDetails: (investmentId: string) => void;
}) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {row.referenceLabel}
            </span>
            <Badge variant="outline" className={row.statusClassName}>
              {row.statusLabel}
            </Badge>
          </div>
          <h3 className="text-lg font-semibold text-slate-950">{row.projectTitle}</h3>
          <p className="text-sm text-slate-500">
            آخر تحديث للمستندات: {formatDateTime(row.lastUpdatedAt)}
          </p>
        </div>

        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => onOpenDetails(row.id)}
        >
          <Eye className="ml-2 h-4 w-4" />
          تفاصيل الاستثمار
        </Button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {row.documents.map(document => (
          <div
            key={`${row.id}-${document.id}`}
            className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  {document.label}
                </div>
                <div className="mt-1 break-all text-sm text-slate-500">
                  {document.fileName}
                </div>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                PDF
              </div>
            </div>

            <div className="mt-4">
              <DocumentActionButtons document={document} />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function DialogDetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 break-words text-sm font-semibold leading-7 text-slate-900">
        {value}
      </div>
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
  const [activeTab, setActiveTab] = useState<ProfileTabKey>("overview");
  const [selectedInvestmentId, setSelectedInvestmentId] = useState<string | null>(null);

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

      const investmentsSnapshot = await getDocs(collection(db, "investments"));
      const allInvestments = investmentsSnapshot.docs.map(row => ({
        id: row.id,
        ...(row.data() as any),
      })) as InvestmentDoc[];
      const linkedInvestments = allInvestments.filter(investment => {
        if (nextUser) return investmentMatchesUser(investment, nextUser);

        return [
          investment?.investorUid,
          investment?.userId,
          investment?.investorId,
          investment?.clientId,
        ]
          .map(value => String(value || "").trim())
          .some(value => value && value === userId);
      });

      const projectsSnapshot = await getDocs(collection(db, "projects"));
      const nextProjectsMap = buildProjectsMap(
        projectsSnapshot.docs.map(row => ({
          id: row.id,
          ...(row.data() as any),
        }))
      );

      setUser(nextUser);
      setInvestments(linkedInvestments);
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
    const unsub = onSnapshot(
      collection(db, "projects"),
      snap => {
        setProjectsMap(
          buildProjectsMap(
            snap.docs.map(row => ({ id: row.id, ...(row.data() as any) }))
          )
        );
      },
      error => {
        console.error(error);
      }
    );

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, LIVE_UPDATE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const investmentSnapshots = useMemo(
    () =>
      investments.map(investment => {
        const projectId = String(investment?.projectId || "").trim();
        return getInvestmentProfitSnapshot(investment, {
          now,
          projectFallback: getProjectProfitFallback(projectsMap[projectId]),
        });
      }),
    [investments, now, projectsMap]
  );

  const hasLinkedInvestments = investments.length > 0;

  const totalInvested = useMemo(() => {
    if (hasLinkedInvestments) {
      return roundMoney(
        investmentSnapshots.reduce(
          (sum, snapshot) => sum + snapshot.principalAmount,
          0
        )
      );
    }

    const storedValue = Number(user?.totalInvested);
    return Number.isFinite(storedValue) ? storedValue : 0;
  }, [hasLinkedInvestments, investmentSnapshots, user?.totalInvested]);

  const expectedProfitTotal = useMemo(() => {
    if (hasLinkedInvestments) {
      return roundMoney(
        investmentSnapshots.reduce(
          (sum, snapshot) => sum + snapshot.expectedProfit,
          0
        )
      );
    }

    const storedValue = Number(user?.expectedProfitTotal);
    return Number.isFinite(storedValue) ? storedValue : 0;
  }, [hasLinkedInvestments, investmentSnapshots, user?.expectedProfitTotal]);

  const storedProfitToDate = useMemo(() => {
    const storedValue = Number(user?.profitToDate);
    return Number.isFinite(storedValue) ? storedValue : 0;
  }, [user?.profitToDate]);

  const investmentRows = useMemo<InvestmentRow[]>(() => {
    return investments
      .map((inv, index) => {
        const snapshot = investmentSnapshots[index];
        const statusBadge = getInvestmentStatusBadge(inv.status);
        const contractStatusBadge = getContractStatusBadge(inv.contractStatus);
        const summaryBadge = getInvestmentSummaryBadge(inv.status);
        const projectId = pick(inv.projectId);
        const bucketKey = classifyInvestmentBucket(inv);
        const bucketMeta = INVESTMENT_BUCKET_META[bucketKey];
        const canDisplayProfit = hasReadableInvestmentProfit(snapshot);
        const originalDocument = resolveInvestmentDocument(inv, "original");
        const signedDocument = resolveInvestmentDocument(inv, "signed");
        const documents = [originalDocument, signedDocument].filter(
          (document): document is InvestmentDocumentLink => Boolean(document)
        );
        const amount = roundMoney(snapshot.principalAmount);
        const expectedProfitTotal =
          canDisplayProfit || snapshot.expectedProfit > 0
            ? roundMoney(snapshot.expectedProfit)
            : null;
        const currentProfit = canDisplayProfit
          ? roundMoney(snapshot.currentProfit)
          : null;
        const totalValue =
          expectedProfitTotal == null
            ? null
            : roundMoney(amount + expectedProfitTotal);
        const progressRatio =
          snapshot.totalMs > 0 || snapshot.progressRatio === 1
            ? snapshot.progressRatio
            : null;
        const progressPercent =
          progressRatio == null ? null : roundMoney(progressRatio * 100);
        const growthDirection: InvestmentRow["growthDirection"] =
          currentProfit == null
            ? null
            : currentProfit > 0
              ? "up"
              : progressPercent != null
                ? "flat"
                : null;
        const requestDate = toDateSafe(inv.createdAt);
        const startDate = snapshot.startAt || toDateSafe(inv.startAt) || toDateSafe(inv.signedAt);
        const actualEndDate = toDateSafe(inv.actualEndAt);
        const maturityDate =
          actualEndDate || snapshot.displayEndAt || snapshot.plannedEndAt || toDateSafe(inv.plannedEndAt);
        const lastUpdatedAt = toSortedDateValue(
          toDateSafe(inv.updatedAt),
          toDateSafe(inv.verifiedAt),
          actualEndDate,
          toDateSafe(inv.signedAt),
          documents[0]?.uploadedAt ?? null,
          documents[1]?.uploadedAt ?? null,
          startDate,
          requestDate
        );
        const isEnded =
          isClosedInvestmentStatus(inv.status) ||
          snapshot.freezeReason === "completed" ||
          snapshot.freezeReason === "timeline_ended";

        return {
          id: inv.id,
          projectId,
          projectTitle: projectName(inv.projectId, projectsMap),
          referenceLabel: formatInvestmentReference(inv.id),
          bucketKey,
          bucketLabel: bucketMeta.shortTitle,
          statusLabel: statusBadge.label,
          statusClassName: statusBadge.className,
          rawStatus: normalizeStatusKey(inv.status),
          contractStatus: normalizeStatusKey(inv.contractStatus),
          contractStatusLabel: contractStatusBadge.label,
          contractStatusClassName: contractStatusBadge.className,
          summaryLabel: summaryBadge.label,
          summaryClassName: summaryBadge.className,
          amount,
          expectedProfitTotal,
          currentProfit,
          totalValue,
          percent: snapshot.returnPercent,
          durationMonths: snapshot.durationMonths,
          requestDate,
          startDate,
          maturityDate,
          actualEndDate,
          lastUpdatedAt,
          sortDate: lastUpdatedAt || startDate || requestDate || maturityDate,
          progressRatio,
          progressPercent,
          growthDirection,
          isEnded,
          documents,
          hasAnyDocuments: documents.length > 0,
        };
      })
      .sort((left, right) => {
        const leftTime = left.sortDate?.getTime() ?? 0;
        const rightTime = right.sortDate?.getTime() ?? 0;
        return rightTime - leftTime;
      });
  }, [investmentSnapshots, investments, projectsMap]);

  const investmentDates = useMemo(
    () =>
      investmentRows
        .map(row => row.startDate)
        .filter((date): date is Date => Boolean(date))
        .sort((left, right) => left.getTime() - right.getTime()),
    [investmentRows]
  );

  const firstInvestmentDate = investmentDates[0] ?? null;
  const lastInvestmentDate =
    investmentDates[investmentDates.length - 1] ?? null;

  const investmentSections = useMemo(
    () => ({
      under_review: investmentRows.filter(row => row.bucketKey === "under_review"),
      awaiting_signature: investmentRows.filter(
        row => row.bucketKey === "awaiting_signature"
      ),
      active: investmentRows.filter(row => row.bucketKey === "active"),
      completed: investmentRows.filter(row => row.bucketKey === "completed"),
      cancelled: investmentRows.filter(row => row.bucketKey === "cancelled"),
    }),
    [investmentRows]
  );

  const activeInvestmentsCount = investmentSections.active.length;
  const completedInvestmentsCount = investmentSections.completed.length;
  const requestsInProgressCount =
    investmentSections.under_review.length +
    investmentSections.awaiting_signature.length;
  const cancelledInvestmentsCount = investmentSections.cancelled.length;

  const activeProjectsCount = useMemo(() => {
    const ids = new Set(
      investmentSections.active
        .filter(row => row.projectId)
        .map(row => row.projectId)
    );
    return ids.size;
  }, [investmentSections.active]);

  const completedProjectsCount = useMemo(() => {
    const ids = new Set(
      investmentSections.completed
        .filter(row => row.projectId)
        .map(row => row.projectId)
    );
    return ids.size;
  }, [investmentSections.completed]);

  const dynamicProfitRows = investmentRows.filter(
    row => row.currentProfit != null
  );

  const dynamicCurrentProfitTotal = roundMoney(
    dynamicProfitRows.reduce(
      (sum, row) => sum + Number(row.currentProfit ?? 0),
      0
    )
  );

  const dynamicProfitCoverageCount = dynamicProfitRows.length;
  const hasAnyDynamicProfit = dynamicProfitCoverageCount > 0;
  const displayProfitToDate = hasAnyDynamicProfit
    ? dynamicCurrentProfitTotal
    : storedProfitToDate;

  const latestAggregatesUpdate = toDateSafe(user?.aggregatesUpdatedAt);
  const createdAt = toDateSafe(user?.createdAt);
  const userPhone = getUserPhone(user);
  const linkedNameFallbacks = useMemo(
    () =>
      investments.flatMap(investment => [
        pick(
          investment?.investorName,
          investment?.userSnapshot?.displayName,
          investment?.userSnapshot?.name
        ),
        emailLocalPart(investment?.investorEmail),
        emailLocalPart(investment?.userSnapshot?.email),
      ]),
    [investments]
  );
  const displayName = useMemo(
    () => getUserDisplayName(user, ...linkedNameFallbacks),
    [linkedNameFallbacks, user]
  );
  const displayEmail = useMemo(
    () =>
      pick(
        user?.email,
        user?.profile?.email,
        user?.contact?.email,
        ...investments.map(investment =>
          pick(investment?.investorEmail, investment?.userSnapshot?.email)
        )
      ) || EMPTY_VALUE,
    [investments, user]
  );
  const profitToDateHelper = hasAnyDynamicProfit
    ? dynamicProfitCoverageCount === investmentRows.length
      ? "محسوب حيًا من نفس الاستثمارات المرتبطة ويتحدث عند تغير البيانات."
      : `محسوب حيًا لـ ${formatNumberEN(dynamicProfitCoverageCount)} من أصل ${formatNumberEN(investmentRows.length)} استثمار، والباقي لا يحتوي شروط ربح كافية للحساب الحي.`
    : hasLinkedInvestments && storedProfitToDate > 0
      ? "معروض من آخر تجميع محفوظ لأن بيانات الربح الحي غير مكتملة في السجلات الحالية."
      : hasLinkedInvestments
        ? "البيانات الحالية لا تكفي لحساب الربح الحي بعد."
        : "لا توجد استثمارات مرتبطة بهذا العميل بعد.";
  const roleBadge = getRoleBadge(user?.role, displayEmail);
  const accountBadge = getAccountBadge(user);
  const vipBadge = getVipBadge(user);
  const AccountIcon = accountBadge.icon;
  const documentedInvestments = useMemo(
    () => investmentRows.filter(row => row.hasAnyDocuments),
    [investmentRows]
  );
  const originalContractCount = useMemo(
    () =>
      documentedInvestments.filter(row =>
        row.documents.some(document => document.id === "original")
      ).length,
    [documentedInvestments]
  );
  const signedContractCount = useMemo(
    () =>
      documentedInvestments.filter(row =>
        row.documents.some(document => document.id === "signed")
      ).length,
    [documentedInvestments]
  );
  const selectedInvestment = useMemo(
    () =>
      investmentRows.find(investment => investment.id === selectedInvestmentId) ||
      null,
    [investmentRows, selectedInvestmentId]
  );
  const overviewHighlights = useMemo(
    () =>
      [
        ...investmentSections.under_review,
        ...investmentSections.awaiting_signature,
        ...investmentSections.active,
      ].slice(0, 4),
    [investmentSections]
  );

  const downloadClientReportPdf = async () => {
    if (!user) return;

    try {
      const reportDate = new Date();
      const sumAmounts = (rows: InvestmentRow[]) =>
        roundMoney(
          rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
        );

      const reportNumber = [
        "MCR",
        String(user.id || "CLIENT")
          .replace(/[^\w]+/g, "")
          .toUpperCase()
          .slice(0, 8) || "CLIENT",
        reportDate.toISOString().slice(0, 10).replace(/-/g, ""),
      ].join("-");

      await downloadCorporateClientProfilePdf({
        fileNameBase: pick(displayName, user.id, displayEmail) || "client-profile",
        reportDate,
        reportNumber,
        client: {
          id: fallbackText(user.id),
          name: displayName,
          email: displayEmail,
          phone: userPhone,
          accountStatus: accountBadge.label,
          roleLabel: roleBadge.label,
          vipLabel: vipBadge.label,
          createdAt,
          latestAggregatesUpdate,
          internalNotes: pick(user.internalNotes),
        },
        summary: {
          totalInvested,
          expectedProfitTotal,
          profitToDate: displayProfitToDate,
          investmentCount: investmentRows.length,
          activeInvestmentsCount,
          inProgressCount: requestsInProgressCount,
          completedInvestmentsCount,
          cancelledInvestmentsCount,
          activeProjectsCount,
          completedProjectsCount,
          documentedInvestmentsCount: documentedInvestments.length,
          originalContractCount,
          signedContractCount,
          firstInvestmentDate,
          lastInvestmentDate,
        },
        stages: [
          {
            label: "تحت المراجعة",
            count: investmentSections.under_review.length,
            amount: sumAmounts(investmentSections.under_review),
            color: "#f59e0b",
          },
          {
            label: "بانتظار التوقيع",
            count: investmentSections.awaiting_signature.length,
            amount: sumAmounts(investmentSections.awaiting_signature),
            color: "#2563eb",
          },
          {
            label: "نشط",
            count: investmentSections.active.length,
            amount: sumAmounts(investmentSections.active),
            color: "#059669",
          },
          {
            label: "مكتمل",
            count: investmentSections.completed.length,
            amount: sumAmounts(investmentSections.completed),
            color: "#0f172a",
          },
          {
            label: "ملغي",
            count: investmentSections.cancelled.length,
            amount: sumAmounts(investmentSections.cancelled),
            color: "#e11d48",
          },
        ],
        investments: investmentRows.map(row => ({
          referenceLabel: row.referenceLabel,
          projectTitle: row.projectTitle,
          statusLabel: row.statusLabel,
          summaryLabel: row.summaryLabel,
          contractStatusLabel: row.contractStatusLabel,
          amount: row.amount,
          expectedProfitTotal: row.expectedProfitTotal,
          currentProfit: row.currentProfit,
          totalValue: row.totalValue,
          progressPercent: row.progressPercent,
          requestDate: row.requestDate,
          maturityDate: row.maturityDate,
          hasAnyDocuments: row.hasAnyDocuments,
        })),
      });

      toast.success("تم تنزيل تقرير العميل بصيغة PDF بنجاح");
    } catch (error) {
      console.error(error);
      toast.error("فشل توليد تقرير العميل بصيغة PDF");
    }
  };

  const renderBucketSection = (
    bucketKey: InvestmentBucketKey,
    rows: InvestmentRow[],
    emptyTitle: string,
    emptyDescription: string
  ) => {
    const meta = INVESTMENT_BUCKET_META[bucketKey];
    const Icon = meta.icon;

    return (
      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                meta.className
              )}
            >
              <Icon className="ml-1 h-3.5 w-3.5" />
              {meta.shortTitle}
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-slate-950">
              {meta.title}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
              {meta.description}
            </p>
          </div>

          <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            {formatNumberEN(rows.length)} سجل
          </div>
        </div>

        {rows.length === 0 ? (
          <SectionEmptyState
            bucketKey={bucketKey}
            title={emptyTitle}
            description={emptyDescription}
          />
        ) : (
          <div className="space-y-4">
            {rows.map(row => (
              <InvestmentCardPanel
                key={row.id}
                row={row}
                onOpenDetails={setSelectedInvestmentId}
              />
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Card className="hidden">
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
                    صفحة تفصيلية لعرض هوية العميل، ملخصه المالي، ومتابعة سجل
                    الاستثمارات بطريقة أوضح وأكثر احترافية داخل النظام.
                  </p>
                </div>

                {!loading && user ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span className="font-semibold text-slate-900">
                      {displayName}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>{displayEmail}</span>
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
                  <RefreshCw
                    className={cn(
                      "w-4 h-4 ml-1",
                      loading ? "animate-spin" : ""
                    )}
                  />
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
            <section className="relative overflow-hidden rounded-[36px] border border-slate-200 bg-[radial-gradient(circle_at_top_right,_rgba(15,23,42,0.10),_transparent_28%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_46%,_#eef2ff_100%)] shadow-sm">
              <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.65),transparent_48%,rgba(15,23,42,0.04))]" />
              <div className="relative p-6 sm:p-8 xl:p-10">
                <div className="flex flex-col gap-8 2xl:flex-row 2xl:items-start 2xl:justify-between">
                  <div className="space-y-6 2xl:max-w-4xl">
                    <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-slate-600 shadow-sm">
                      CLIENT PROFILE
                    </div>

                    <div className="space-y-3">
                      <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl xl:text-5xl">
                        ملف العميل
                      </h1>
                      <p className="max-w-3xl text-sm leading-8 text-slate-600 sm:text-base">
                        لوحة عميل استثمارية مصممة لقراءة سريعة وواضحة: من هو العميل، ما الذي طلبه،
                        ما الذي لا يزال تحت المعالجة، ما الذي أصبح نشطاً، وما الذي اكتمل أو ألغي.
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

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          اسم العميل
                        </div>
                        <div className="mt-2 text-lg font-semibold text-slate-950">
                          {displayName}
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          البريد الإلكتروني
                        </div>
                        <div className="mt-2 break-all text-sm font-semibold text-slate-950">
                          {displayEmail}
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          رقم الجوال
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-950">
                          {userPhone}
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          تاريخ التسجيل
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-950">
                          {formatDate(createdAt)}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-[24px] border border-slate-900 bg-slate-900 p-4 text-white shadow-sm">
                        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-300">
                          إجمالي الاستثمارات
                        </div>
                        <div className="mt-2 text-2xl font-bold tracking-tight">
                          {money(totalInvested)}
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-sky-200 bg-white/90 p-4 shadow-sm">
                        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          العائد المتوقع
                        </div>
                        <div className="mt-2 text-2xl font-bold tracking-tight text-sky-700">
                          {money(expectedProfitTotal)}
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-emerald-200 bg-white/90 p-4 shadow-sm">
                        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          الاستثمارات النشطة
                        </div>
                        <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-700">
                          {formatNumberEN(activeInvestmentsCount)}
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-amber-200 bg-white/90 p-4 shadow-sm">
                        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          الطلبات تحت المعالجة
                        </div>
                        <div className="mt-2 text-2xl font-bold tracking-tight text-amber-700">
                          {formatNumberEN(requestsInProgressCount)}
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          الاستثمارات المكتملة
                        </div>
                        <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                          {formatNumberEN(completedInvestmentsCount)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full max-w-xl space-y-4">
                    <div className="flex flex-wrap gap-2 2xl:justify-end">
                      <Button
                        variant="outline"
                        className="h-11 w-full rounded-full sm:w-auto"
                        onClick={() => window.history.back()}
                      >
                        <ArrowRight className="ml-2 h-4 w-4" />
                        رجوع
                      </Button>

                      <Button
                        variant="outline"
                        className="h-11 w-full rounded-full sm:w-auto"
                        onClick={load}
                        disabled={loading}
                      >
                        <RefreshCw
                          className={cn("ml-2 h-4 w-4", loading ? "animate-spin" : "")}
                        />
                        تحديث البيانات
                      </Button>

                      <Button
                        className="h-11 w-full rounded-full sm:w-auto"
                        onClick={downloadClientReportPdf}
                        disabled={!user || loading}
                      >
                        <FileDown className="ml-2 h-4 w-4" />
                        تحميل PDF
                      </Button>
                    </div>

                    <div className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">
                            ACCOUNT SNAPSHOT
                          </div>
                          <div className="mt-2 text-xl font-semibold text-slate-950">
                            حالة الحساب والمتابعة
                          </div>
                          <p className="mt-2 text-sm leading-7 text-slate-500">
                            ملخص سريع يساعد فريق الاستثمار على معرفة مستوى النشاط، توافر
                            المستندات، وآخر تحديثات هذا العميل.
                          </p>
                        </div>
                        <div className="rounded-full border border-slate-200 bg-slate-50 p-3 text-slate-700">
                          <Building2 className="h-5 w-5" />
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <DetailCell label="معرف العميل" value={fallbackText(user.id)} />
                        <DetailCell
                          label="آخر تحديث للتجميعات"
                          value={formatDateTime(latestAggregatesUpdate)}
                        />
                        <DetailCell
                          label="أول دخول استثماري"
                          value={formatDate(firstInvestmentDate)}
                        />
                        <DetailCell
                          label="آخر حركة استثمارية"
                          value={formatDate(lastInvestmentDate)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricTile
                label="الربح حتى اليوم"
                value={hasAnyDynamicProfit ? liveMoney(displayProfitToDate) : money(displayProfitToDate)}
                helper={profitToDateHelper}
                icon={TrendingUp}
                className="border-emerald-100 bg-emerald-50/70"
                valueClassName="text-emerald-700"
              />
              <MetricTile
                label="عدد الاستثمارات"
                value={formatNumberEN(investmentRows.length)}
                helper="إجمالي السجلات الاستثمارية المرتبطة بهذا العميل."
                icon={BriefcaseBusiness}
              />
              <MetricTile
                label="المشاريع النشطة"
                value={formatNumberEN(activeProjectsCount)}
                helper={`${formatNumberEN(activeInvestmentsCount)} استثماراً ضمن القسم النشط`}
                icon={FolderKanban}
              />
              <MetricTile
                label="المشاريع المكتملة"
                value={formatNumberEN(completedProjectsCount)}
                helper={`${formatNumberEN(completedInvestmentsCount)} استثماراً مكتملًا`}
                icon={History}
                className="border-slate-200 bg-slate-50/90"
              />
              <MetricTile
                label="المستندات والعقود"
                value={formatNumberEN(documentedInvestments.length)}
                helper={`${formatNumberEN(originalContractCount)} أصلية • ${formatNumberEN(signedContractCount)} موقعة`}
                icon={FileText}
              />
            </section>

            <Tabs
              value={activeTab}
              onValueChange={value => setActiveTab(value as ProfileTabKey)}
              className="gap-6"
            >
              <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-950">
                      تقسيم استثمارات العميل
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-slate-500">
                      تم توحيد التصنيف والعدادات والقوائم بحيث يرى فريق العمل نفس الصورة في
                      الأعلى وفي كل تبويب بدون تضارب بين الأرقام والحالات.
                    </p>
                  </div>

                  <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-2xl bg-slate-100/80 p-1.5 lg:w-auto">
                    <TabsTrigger value="overview" className="shrink-0 rounded-xl px-4 py-2">
                      <LayoutGrid className="h-4 w-4" />
                      نظرة عامة
                    </TabsTrigger>
                    <TabsTrigger value="requests" className="shrink-0 rounded-xl px-4 py-2">
                      <BriefcaseBusiness className="h-4 w-4" />
                      طلباتي الاستثمارية
                    </TabsTrigger>
                    <TabsTrigger value="active" className="shrink-0 rounded-xl px-4 py-2">
                      <TrendingUp className="h-4 w-4" />
                      استثماراتي النشطة
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="shrink-0 rounded-xl px-4 py-2">
                      <History className="h-4 w-4" />
                      الاستثمارات المكتملة
                    </TabsTrigger>
                    <TabsTrigger value="documents" className="shrink-0 rounded-xl px-4 py-2">
                      <FileText className="h-4 w-4" />
                      المستندات والعقود
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>

              <TabsContent value="overview" className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <OverviewCategoryCard
                    bucketKey="under_review"
                    count={investmentSections.under_review.length}
                    onOpenTab={tab => setActiveTab(tab)}
                  />
                  <OverviewCategoryCard
                    bucketKey="awaiting_signature"
                    count={investmentSections.awaiting_signature.length}
                    onOpenTab={tab => setActiveTab(tab)}
                  />
                  <OverviewCategoryCard
                    bucketKey="active"
                    count={investmentSections.active.length}
                    onOpenTab={tab => setActiveTab(tab)}
                  />
                  <OverviewCategoryCard
                    bucketKey="completed"
                    count={investmentSections.completed.length}
                    onOpenTab={tab => setActiveTab(tab)}
                  />
                  <OverviewCategoryCard
                    bucketKey="cancelled"
                    count={investmentSections.cancelled.length}
                    onOpenTab={tab => setActiveTab(tab)}
                  />
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                  <Card className="border-slate-200/80 shadow-sm">
                    <CardHeader className="border-b border-slate-200/70 pb-5">
                      <CardTitle>أهم السجلات التي تحتاج انتباهاً الآن</CardTitle>
                      <p className="text-sm leading-7 text-muted-foreground">
                        هذا القسم يجمع أحدث الطلبات الجارية والنشطة حتى يفهم الفريق من أول
                        نظرة أين توجد الحركة الحالية.
                      </p>
                    </CardHeader>
                    <CardContent className="pt-6">
                      {overviewHighlights.length === 0 ? (
                        <SectionEmptyState
                          bucketKey="under_review"
                          title="لا توجد حركة استثمارية حالية"
                          description="لم يتم العثور على طلبات أو استثمارات جارية لهذا العميل في الوقت الحالي."
                        />
                      ) : (
                        <div className="space-y-4">
                          {overviewHighlights.map(row => (
                            <InvestmentCardPanel
                              key={row.id}
                              row={row}
                              onOpenDetails={setSelectedInvestmentId}
                            />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="space-y-6">
                    <Card className="border-slate-200/80 shadow-sm">
                      <CardHeader className="border-b border-slate-200/70 pb-5">
                        <CardTitle>هوية العميل</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <div className="grid gap-3">
                          <InfoTile label="الاسم" value={displayName} icon={UserRound} />
                          <InfoTile
                            label="البريد الإلكتروني"
                            value={displayEmail}
                            icon={Mail}
                            breakAll
                          />
                          <InfoTile label="رقم الجوال" value={userPhone} icon={Phone} />
                          <InfoTile
                            label="تاريخ التسجيل"
                            value={formatDate(createdAt)}
                            icon={CalendarDays}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200/80 shadow-sm">
                      <CardHeader className="border-b border-slate-200/70 pb-5">
                        <CardTitle>ملاحظات داخلية</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm leading-8 text-slate-700 whitespace-pre-wrap break-words">
                          {fallbackText(user.internalNotes)}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200/80 shadow-sm">
                      <CardHeader className="border-b border-slate-200/70 pb-5">
                        <CardTitle>ملخص الحالة الحالية</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-6">
                        <DetailCell
                          label="طلبات تحت المعالجة"
                          value={formatNumberEN(requestsInProgressCount)}
                          emphasized
                        />
                        <DetailCell
                          label="استثمارات ملغية أو مرفوضة"
                          value={formatNumberEN(cancelledInvestmentsCount)}
                        />
                        <DetailCell
                          label="توفر المستندات"
                          value={`${formatNumberEN(documentedInvestments.length)} استثمار يحتوي على عقود أو ملفات`}
                        />
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="requests" className="space-y-8">
                {renderBucketSection(
                  "under_review",
                  investmentSections.under_review,
                  "لا توجد طلبات تحت المراجعة حالياً",
                  "كل الطلبات إما انتقلت لمرحلة العقود أو أصبحت نشطة أو اكتملت."
                )}
                {renderBucketSection(
                  "awaiting_signature",
                  investmentSections.awaiting_signature,
                  "لا توجد استثمارات بانتظار التوقيع أو تجهيز العقد",
                  "لا يوجد حالياً أي استثمار في مرحلة تجهيز العقد أو انتظار توقيع العميل."
                )}
                {renderBucketSection(
                  "cancelled",
                  investmentSections.cancelled,
                  "لا توجد طلبات ملغية أو مرفوضة",
                  "جميع الطلبات الحالية لهذا العميل ما زالت فعالة أو اكتملت ولم يتم إلغاء أي منها."
                )}
              </TabsContent>

              <TabsContent value="active" className="space-y-8">
                {renderBucketSection(
                  "active",
                  investmentSections.active,
                  "لا توجد استثمارات نشطة حالياً",
                  "بمجرد تفعيل استثمار أو دخوله مرحلة المتابعة التشغيلية سيظهر هنا بشكل مستقل."
                )}
              </TabsContent>

              <TabsContent value="completed" className="space-y-8">
                {renderBucketSection(
                  "completed",
                  investmentSections.completed,
                  "لا توجد استثمارات مكتملة أو منتهية",
                  "عند اكتمال الاستثمار أو إغلاقه سيظهر في هذا القسم مع كافة تفاصيله."
                )}
              </TabsContent>

              <TabsContent value="documents" className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <MetricTile
                    label="الاستثمارات التي تحتوي على ملفات"
                    value={formatNumberEN(documentedInvestments.length)}
                    helper="عدد السجلات التي تحتوي على عقد أصلي أو عقد موقّع أو كليهما."
                    icon={FileText}
                  />
                  <MetricTile
                    label="العقود الأصلية المتاحة"
                    value={formatNumberEN(originalContractCount)}
                    helper="تشمل الملفات الأصلية الجاهزة للعرض أو التنزيل."
                    icon={FileDown}
                  />
                  <MetricTile
                    label="العقود الموقعة المتاحة"
                    value={formatNumberEN(signedContractCount)}
                    helper="تشمل النسخ الموقعة المرفوعة من العميل أو المعتمدة."
                    icon={ShieldCheck}
                  />
                </div>

                {documentedInvestments.length === 0 ? (
                  <SectionEmptyState
                    bucketKey="awaiting_signature"
                    title="لا توجد مستندات أو عقود لهذا العميل حالياً"
                    description="عند توفر العقد الأصلي أو العقد الموقّع سيظهر هنا مع أزرار العرض والتنزيل."
                  />
                ) : (
                  <div className="space-y-4">
                    {documentedInvestments.map(row => (
                      <DocumentRecordCard
                        key={row.id}
                        row={row}
                        onOpenDetails={setSelectedInvestmentId}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <Dialog
              open={Boolean(selectedInvestment)}
              onOpenChange={open => {
                if (!open) setSelectedInvestmentId(null);
              }}
            >
              <DialogContent className="sm:max-w-5xl">
                {selectedInvestment ? (
                  <>
                    <DialogHeader className="text-right">
                      <DialogTitle className="text-2xl font-semibold text-slate-950">
                        تفاصيل الاستثمار
                      </DialogTitle>
                      <DialogDescription className="leading-7">
                        {selectedInvestment.projectTitle} • {selectedInvestment.referenceLabel}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={selectedInvestment.statusClassName}>
                          {selectedInvestment.statusLabel}
                        </Badge>
                        {selectedInvestment.contractStatus ? (
                          <Badge
                            variant="outline"
                            className={selectedInvestment.contractStatusClassName}
                          >
                            {selectedInvestment.contractStatusLabel}
                          </Badge>
                        ) : null}
                        <Badge
                          variant="outline"
                          className={INVESTMENT_BUCKET_META[selectedInvestment.bucketKey].className}
                        >
                          {INVESTMENT_BUCKET_META[selectedInvestment.bucketKey].shortTitle}
                        </Badge>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <DialogDetailItem
                          label="مرجع الاستثمار"
                          value={selectedInvestment.referenceLabel}
                        />
                        <DialogDetailItem label="اسم المشروع" value={selectedInvestment.projectTitle} />
                        <DialogDetailItem
                          label="تاريخ الطلب"
                          value={formatDate(selectedInvestment.requestDate)}
                        />
                        <DialogDetailItem
                          label="آخر تحديث"
                          value={formatDateTime(selectedInvestment.lastUpdatedAt)}
                        />
                        <DialogDetailItem
                          label="تاريخ البداية"
                          value={formatDate(selectedInvestment.startDate)}
                        />
                        <DialogDetailItem
                          label="تاريخ النهاية"
                          value={formatDate(
                            selectedInvestment.actualEndDate || selectedInvestment.maturityDate
                          )}
                        />
                        <DialogDetailItem
                          label="المبلغ"
                          value={money(selectedInvestment.amount)}
                        />
                        <DialogDetailItem
                          label="الحالة"
                          value={selectedInvestment.statusLabel}
                        />
                        <DialogDetailItem
                          label="العائد المتوقع"
                          value={
                            selectedInvestment.expectedProfitTotal != null
                              ? money(selectedInvestment.expectedProfitTotal)
                              : EMPTY_VALUE
                          }
                        />
                        <DialogDetailItem
                          label="الربح الحالي"
                          value={
                            selectedInvestment.currentProfit != null
                              ? liveMoney(selectedInvestment.currentProfit)
                              : EMPTY_VALUE
                          }
                        />
                        <DialogDetailItem
                          label="إجمالي القيمة المتوقعة"
                          value={
                            selectedInvestment.totalValue != null
                              ? money(selectedInvestment.totalValue)
                              : EMPTY_VALUE
                          }
                        />
                        <DialogDetailItem
                          label="المدة / النسبة"
                          value={`${durationLabel(selectedInvestment.durationMonths)} • ${formatPercent(selectedInvestment.percent)}`}
                        />
                      </div>

                      <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="text-lg font-semibold text-slate-950">
                              المستندات والعقود
                            </div>
                            <p className="mt-1 text-sm leading-7 text-slate-500">
                              الملفات المتاحة المرتبطة بهذا الاستثمار مع روابط العرض والتنزيل.
                            </p>
                          </div>
                          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                            {formatNumberEN(selectedInvestment.documents.length)} ملف
                          </div>
                        </div>

                        {selectedInvestment.documents.length === 0 ? (
                          <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center text-sm text-slate-500">
                            لا توجد عقود أو ملفات جاهزة لهذا الاستثمار حالياً.
                          </div>
                        ) : (
                          <div className="mt-5 grid gap-3 md:grid-cols-2">
                            {selectedInvestment.documents.map(document => (
                              <div
                                key={document.id}
                                className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-900">
                                      {document.label}
                                    </div>
                                    <div className="mt-1 break-all text-sm text-slate-500">
                                      {document.fileName}
                                    </div>
                                    <div className="mt-2 text-xs text-slate-400">
                                      {document.uploadedAt
                                        ? `آخر رفع: ${formatDateTime(document.uploadedAt)}`
                                        : "تاريخ الرفع غير متوفر"}
                                    </div>
                                  </div>
                                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                                    PDF
                                  </div>
                                </div>

                                <div className="mt-4">
                                  <DocumentActionButtons document={document} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
              </DialogContent>
            </Dialog>

            {false ? (
              <div className="hidden">
              <Card className="border-slate-200/80 shadow-sm">
                <CardHeader className="gap-4 border-b border-slate-200/70 pb-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle>معلومات العميل الأساسية</CardTitle>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        الهوية الأساسية للعميل مع الحالة والدور ونوع الحساب
                        والبيانات التعريفية المتاحة.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={accountBadge.className}
                      >
                        <AccountIcon className="ml-1 h-3.5 w-3.5" />
                        {accountBadge.label}
                      </Badge>

                      <Badge variant="outline" className={roleBadge.className}>
                        {roleBadge.label}
                      </Badge>

                      <Badge variant="outline" className={vipBadge.className}>
                        {vipBadge.featured ? (
                          <Crown className="ml-1 h-3.5 w-3.5" />
                        ) : null}
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
                        {displayName}
                      </h2>
                      <p className="text-sm text-slate-500 break-all">
                        {displayEmail}
                      </p>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <InfoTile
                        label="الاسم"
                        value={displayName}
                        icon={UserRound}
                      />
                      <InfoTile
                        label="البريد الإلكتروني"
                        value={displayEmail}
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
                        className={
                          vipBadge.featured
                            ? "border-amber-200 bg-amber-50/70"
                            : undefined
                        }
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
                      مساحة مرجعية لعرض الملاحظات المرتبطة بهذا العميل إن كانت
                      متوفرة.
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
            ) : null}

            {false ? (
            <section className="hidden">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  الملخص المالي
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  بطاقات سريعة لقراءة حجم المحفظة الاستثمارية وحالة المشاريع
                  المرتبطة بالعميل.
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
                  value={
                    hasAnyDynamicProfit
                      ? liveMoney(displayProfitToDate)
                      : money(displayProfitToDate)
                  }
                  helper={profitToDateHelper}
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
                  value={formatNumberEN(investmentRows.length)}
                  helper="عدد السجلات الاستثمارية المرتبطة بهذا العميل."
                  icon={BriefcaseBusiness}
                />
                <MetricTile
                  label="المشاريع النشطة"
                  value={formatNumberEN(activeProjectsCount)}
                  helper={`${formatNumberEN(activeInvestmentsCount)} استثمارًا مستمرًا`}
                  icon={FolderKanban}
                />
                <MetricTile
                  label="المشاريع المكتملة"
                  value={formatNumberEN(completedProjectsCount)}
                  helper={`${formatNumberEN(completedInvestmentsCount)} استثمارًا منتهيًا`}
                  icon={History}
                  className="border-slate-200 bg-slate-50/90"
                />
              </div>
            </section>
            ) : null}

            {false ? (
            <Card className="hidden">
              <CardHeader className="gap-4 border-b border-slate-200/70 pb-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle>هيستوري الاستثمارات</CardTitle>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      سجل منظم لكل استثمار مع اسم المشروع، الحالة، الأرقام
                      المالية، وتواريخ الدخول والاستحقاق.
                    </p>
                  </div>

                  <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
                    {formatNumberEN(investmentRows.length)} سجل استثماري
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
                                    استثمار #{formatNumberEN(index + 1)}
                                  </div>

                                  <h3 className="mt-3 text-lg font-semibold text-slate-950 break-words">
                                    {row.projectTitle}
                                  </h3>

                                  <p className="mt-1 text-sm text-slate-500">
                                    يوم الدخول: {formatDate(row.startDate)}
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={row.statusClassName}
                                  >
                                    {row.statusLabel}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={row.summaryClassName}
                                  >
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
                                      {row.currentProfit != null
                                        ? liveMoney(row.currentProfit)
                                        : EMPTY_VALUE}
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
                                    <span className="text-slate-600">
                                      تقدم الاستثمار
                                    </span>
                                    <span className="font-semibold text-slate-900">
                                      {row.progressPercent != null
                                        ? formatLiveProgress(
                                            row.progressPercent
                                          )
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
                                  value={
                                    row.expectedProfitTotal != null
                                      ? money(row.expectedProfitTotal)
                                      : EMPTY_VALUE
                                  }
                                  icon={TrendingUp}
                                  className="border-emerald-100 bg-emerald-50/70"
                                  valueClassName="text-base text-emerald-700"
                                />
                                <InfoTile
                                  label="الإجمالي المتوقع"
                                  value={
                                    row.totalValue != null
                                      ? money(row.totalValue)
                                      : EMPTY_VALUE
                                  }
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
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
