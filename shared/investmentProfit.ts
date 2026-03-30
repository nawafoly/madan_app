import { isInvestmentActivatedStatus } from "./investmentLifecycle";

export type TimestampLike =
  | Date
  | { toDate?: () => Date }
  | { seconds?: number; nanoseconds?: number }
  | number
  | string
  | null
  | undefined;

export type LegalTermsSnapshotLike = {
  principalAmount?: number | null;
  annualReturnPercent?: number | null;
  durationMonths?: number | null;
  startAt?: TimestampLike;
  endAt?: TimestampLike;
  expectedProfit?: number | null;
};

export type InvestmentProfitLike = {
  amount?: number | null;
  approvedAmount?: number | null;
  expectedProfit?: number | null;
  estimatedReturn?: number | null;
  earnedProfit?: number | null;
  annualReturnAtSign?: number | null;
  customRate?: number | null;
  durationMonthsAtSign?: number | null;
  durationMonths?: number | null;
  startAt?: TimestampLike;
  signedAt?: TimestampLike;
  createdAt?: TimestampLike;
  plannedEndAt?: TimestampLike;
  actualEndAt?: TimestampLike;
  status?: string | null;
  legalTermsSnapshot?: LegalTermsSnapshotLike | null;
};

export type ProjectProfitFallback = {
  annualReturn?: number | null;
  durationMonths?: number | null;
  plannedEndAt?: TimestampLike;
};

export type InvestmentProfitSnapshot = {
  principalAmount: number;
  expectedProfit: number;
  currentProfit: number;
  finalProfit: number;
  returnPercent: number | null;
  annualReturnPercent: number | null;
  durationMonths: number | null;
  startAt: Date | null;
  plannedEndAt: Date | null;
  actualEndAt: Date | null;
  displayEndAt: Date | null;
  elapsedMs: number;
  remainingMs: number;
  totalMs: number;
  progressRatio: number;
  profitPerSecond: number;
  isLive: boolean;
  isFrozen: boolean;
  hasPerformanceTerms: boolean;
  status: string;
  freezeReason:
    | "completed"
    | "timeline_ended"
    | "cancelled"
    | "rejected"
    | "not_started"
    | "missing_terms";
};

const AVG_DAYS_PER_MONTH = 30.4375;
const MS_PER_SECOND = 1000;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const TERMINAL_ZERO_STATUSES = new Set(["rejected", "cancelled"]);
const TERMINAL_FINAL_STATUSES = new Set(["completed", "closed"]);

export function toDateSafe(value: TimestampLike): Date | null {
  try {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value : null;
    }
    if (typeof value === "object") {
      const objectValue = value as {
        toDate?: () => Date;
        seconds?: number;
        nanoseconds?: number;
      };

      if (typeof objectValue.toDate === "function") {
        const date = objectValue.toDate();
        return Number.isFinite(date?.getTime?.()) ? date : null;
      }

      if (typeof objectValue.seconds === "number") {
        const millis =
          objectValue.seconds * MS_PER_SECOND +
          Math.round(Number(objectValue.nanoseconds || 0) / 1_000_000);
        const date = new Date(millis);
        return Number.isFinite(date.getTime()) ? date : null;
      }
    }
    const date = new Date(value as string | number);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function hasReadableInvestmentProfit(
  snapshot: InvestmentProfitSnapshot | null | undefined
) {
  if (!snapshot) return false;

  return (
    snapshot.hasPerformanceTerms ||
    snapshot.currentProfit > 0 ||
    snapshot.finalProfit > 0 ||
    snapshot.freezeReason === "completed" ||
    snapshot.freezeReason === "timeline_ended"
  );
}

function toNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const normalized = toNumber(value);
    if (normalized != null) return normalized;
  }
  return null;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const wholeMonths = Math.trunc(months);
  const fractionalMonths = months - wholeMonths;
  result.setMonth(result.getMonth() + wholeMonths);
  if (fractionalMonths !== 0) {
    result.setDate(
      result.getDate() + Math.round(fractionalMonths * AVG_DAYS_PER_MONTH)
    );
  }
  return result;
}

function durationMonthsFromDates(startAt: Date | null, endAt: Date | null) {
  if (!startAt || !endAt) return null;
  const diffMs = endAt.getTime() - startAt.getTime();
  if (diffMs <= 0) return null;
  return diffMs / (MS_PER_DAY * AVG_DAYS_PER_MONTH);
}

function normalizeStatus(status: unknown) {
  return String(status || "").trim().toLowerCase();
}

export function getInvestmentProfitSnapshot(
  investment: InvestmentProfitLike | null | undefined,
  options?: {
    now?: Date;
    projectFallback?: ProjectProfitFallback | null;
  }
): InvestmentProfitSnapshot {
  const now = options?.now ?? new Date();
  const projectFallback = options?.projectFallback ?? null;
  const legalTerms = investment?.legalTermsSnapshot ?? null;
  const status = normalizeStatus(investment?.status);
  const isActivated = isInvestmentActivatedStatus(status);

  const principalAmount = Math.max(
    0,
    firstNumber(
      legalTerms?.principalAmount,
      investment?.approvedAmount,
      investment?.amount,
      0
    ) ?? 0
  );

  const startAt =
    toDateSafe(legalTerms?.startAt) ||
    toDateSafe(investment?.startAt) ||
    toDateSafe(investment?.signedAt) ||
    toDateSafe(investment?.createdAt);

  const actualEndAt = toDateSafe(investment?.actualEndAt);

  const frozenDurationMonths = firstNumber(
    legalTerms?.durationMonths,
    investment?.durationMonthsAtSign,
    investment?.durationMonths,
    projectFallback?.durationMonths
  );

  const plannedEndAt =
    toDateSafe(legalTerms?.endAt) ||
    toDateSafe(investment?.plannedEndAt) ||
    (startAt && frozenDurationMonths != null && frozenDurationMonths > 0
      ? addMonths(
          startAt,
          Math.max(0, frozenDurationMonths)
        )
      : null) ||
    toDateSafe(projectFallback?.plannedEndAt);

  const durationMonths =
    firstNumber(
      legalTerms?.durationMonths,
      investment?.durationMonthsAtSign,
      investment?.durationMonths,
      projectFallback?.durationMonths
    ) ?? durationMonthsFromDates(startAt, plannedEndAt);

  const annualReturnPercent = firstNumber(
    legalTerms?.annualReturnPercent,
    investment?.annualReturnAtSign,
    investment?.customRate,
    projectFallback?.annualReturn
  );

  const computedExpectedProfit =
    principalAmount > 0 &&
    annualReturnPercent != null &&
    durationMonths != null &&
    durationMonths > 0
      ? roundMoney(
          principalAmount * (annualReturnPercent / 100) * (durationMonths / 12)
        )
      : 0;

  const expectedProfit = Math.max(
    0,
    firstNumber(
      legalTerms?.expectedProfit,
      investment?.expectedProfit,
      investment?.estimatedReturn,
      computedExpectedProfit
    ) ?? 0
  );

  const finalProfit = Math.max(
    0,
    firstNumber(investment?.earnedProfit, expectedProfit, 0) ?? 0
  );

  const displayEndAt =
    TERMINAL_FINAL_STATUSES.has(status) && toDateSafe(investment?.actualEndAt)
      ? toDateSafe(investment?.actualEndAt)
      : plannedEndAt;

  const totalMs =
    startAt && plannedEndAt
      ? Math.max(0, plannedEndAt.getTime() - startAt.getTime())
      : 0;
  const elapsedMs =
    startAt && totalMs > 0
      ? Math.min(Math.max(0, now.getTime() - startAt.getTime()), totalMs)
      : 0;
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const progressRatio = totalMs > 0 ? Math.min(1, elapsedMs / totalMs) : 0;
  const profitPerSecond =
    totalMs > 0 ? expectedProfit / (totalMs / MS_PER_SECOND) : 0;

  const hasPerformanceTerms =
    principalAmount > 0 && expectedProfit > 0 && !!startAt && !!plannedEndAt;

  if (TERMINAL_ZERO_STATUSES.has(status)) {
    return {
      principalAmount,
      expectedProfit,
      currentProfit: 0,
      finalProfit: 0,
      returnPercent:
        principalAmount > 0 ? roundMoney((expectedProfit / principalAmount) * 100) : null,
      annualReturnPercent,
      durationMonths,
      startAt,
      plannedEndAt,
      actualEndAt,
      displayEndAt,
      elapsedMs,
      remainingMs,
      totalMs,
      progressRatio,
      profitPerSecond,
      isLive: false,
      isFrozen: true,
      hasPerformanceTerms,
      status,
      freezeReason: status === "rejected" ? "rejected" : "cancelled",
    };
  }

  if (!hasPerformanceTerms) {
    if (TERMINAL_FINAL_STATUSES.has(status)) {
      return {
        principalAmount,
        expectedProfit,
        currentProfit: finalProfit,
        finalProfit,
        returnPercent:
          principalAmount > 0 ? roundMoney((expectedProfit / principalAmount) * 100) : null,
        annualReturnPercent,
        durationMonths,
        startAt,
        plannedEndAt,
        actualEndAt,
        displayEndAt: actualEndAt || displayEndAt,
        elapsedMs: totalMs,
        remainingMs: 0,
        totalMs,
        progressRatio: 1,
        profitPerSecond,
        isLive: false,
        isFrozen: true,
        hasPerformanceTerms,
        status,
        freezeReason: "completed",
      };
    }

    return {
      principalAmount,
      expectedProfit,
      currentProfit: 0,
      finalProfit,
      returnPercent:
        principalAmount > 0 && expectedProfit > 0
          ? roundMoney((expectedProfit / principalAmount) * 100)
          : null,
      annualReturnPercent,
      durationMonths,
      startAt,
      plannedEndAt,
      actualEndAt,
      displayEndAt,
      elapsedMs,
      remainingMs,
      totalMs,
      progressRatio,
      profitPerSecond,
      isLive: false,
      isFrozen: false,
      hasPerformanceTerms,
      status,
      freezeReason: startAt ? "missing_terms" : "not_started",
    };
  }

  if (!isActivated) {
    return {
      principalAmount,
      expectedProfit,
      currentProfit: 0,
      finalProfit,
      returnPercent:
        principalAmount > 0 ? roundMoney((expectedProfit / principalAmount) * 100) : null,
      annualReturnPercent,
      durationMonths,
      startAt,
      plannedEndAt,
      actualEndAt,
      displayEndAt,
      elapsedMs: 0,
      remainingMs: totalMs,
      totalMs,
      progressRatio: 0,
      profitPerSecond,
      isLive: false,
      isFrozen: false,
      hasPerformanceTerms,
      status,
      freezeReason: "not_started",
    };
  }

  const endedAt = toDateSafe(investment?.actualEndAt);
  if (
    TERMINAL_FINAL_STATUSES.has(status) ||
    (endedAt && endedAt.getTime() <= now.getTime())
  ) {
    return {
      principalAmount,
      expectedProfit,
      currentProfit: finalProfit,
      finalProfit,
      returnPercent:
        principalAmount > 0 ? roundMoney((expectedProfit / principalAmount) * 100) : null,
      annualReturnPercent,
      durationMonths,
      startAt,
      plannedEndAt,
      actualEndAt,
      displayEndAt: endedAt || displayEndAt,
      elapsedMs: totalMs,
      remainingMs: 0,
      totalMs,
      progressRatio: 1,
      profitPerSecond,
      isLive: false,
      isFrozen: true,
      hasPerformanceTerms,
      status,
      freezeReason: "completed",
    };
  }

  if (now.getTime() >= plannedEndAt.getTime()) {
    return {
      principalAmount,
      expectedProfit,
      currentProfit: expectedProfit,
      finalProfit: expectedProfit,
      returnPercent:
        principalAmount > 0 ? roundMoney((expectedProfit / principalAmount) * 100) : null,
      annualReturnPercent,
      durationMonths,
      startAt,
      plannedEndAt,
      actualEndAt,
      displayEndAt,
      elapsedMs: totalMs,
      remainingMs: 0,
      totalMs,
      progressRatio: 1,
      profitPerSecond,
      isLive: false,
      isFrozen: true,
      hasPerformanceTerms,
      status,
      freezeReason: "timeline_ended",
    };
  }

  if (now.getTime() <= startAt.getTime()) {
    return {
      principalAmount,
      expectedProfit,
      currentProfit: 0,
      finalProfit: expectedProfit,
      returnPercent:
        principalAmount > 0 ? roundMoney((expectedProfit / principalAmount) * 100) : null,
      annualReturnPercent,
      durationMonths,
      startAt,
      plannedEndAt,
      actualEndAt,
      displayEndAt,
      elapsedMs: 0,
      remainingMs: totalMs,
      totalMs,
      progressRatio: 0,
      profitPerSecond,
      isLive: false,
      isFrozen: false,
      hasPerformanceTerms,
      status,
      freezeReason: "not_started",
    };
  }

  return {
    principalAmount,
    expectedProfit,
    currentProfit: expectedProfit * progressRatio,
    finalProfit: expectedProfit,
    returnPercent:
      principalAmount > 0 ? roundMoney((expectedProfit / principalAmount) * 100) : null,
    annualReturnPercent,
    durationMonths,
    startAt,
    plannedEndAt,
    actualEndAt,
    displayEndAt,
    elapsedMs,
    remainingMs,
    totalMs,
    progressRatio,
    profitPerSecond,
    isLive: true,
    isFrozen: false,
    hasPerformanceTerms,
    status,
    freezeReason: "missing_terms",
  };
}
