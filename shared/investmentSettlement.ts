import { addMonths } from "./investmentActivation";
import { roundMoney, toDateSafe, type TimestampLike } from "./investmentProfit";

const AVG_DAYS_PER_MONTH = 30.4375;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const INVESTMENT_SETTLEMENT_FILE_CATEGORY = "investment_settlement";
export const EARLY_STOP_POLICY_CODE = "prorated_actual_days_v1" as const;
export const EARLY_STOP_POLICY_LABEL = "احتساب نسبي حسب الأيام الفعلية";
export const EARLY_STOP_STATUS_LABEL = "تم إيقافه بطلب العميل";

type SettlementSourceLike = {
  status?: string | null;
  settlement?: Record<string, any> | null;
  legalTermsSnapshot?: Record<string, any> | null;
  approvedAmount?: number | null;
  amount?: number | null;
  annualReturnAtSign?: number | null;
  customRate?: number | null;
  durationMonthsAtSign?: number | null;
  durationMonths?: number | null;
  startAt?: TimestampLike;
  signedAt?: TimestampLike;
  createdAt?: TimestampLike;
  plannedEndAt?: TimestampLike;
  actualEndAt?: TimestampLike;
  withdrawnAt?: TimestampLike;
  stoppedAt?: TimestampLike;
  stopReason?: string | null;
  earnedProfit?: number | null;
  actualDurationMonths?: number | null;
  settlementPrincipal?: number | null;
  settlementAnnualReturnPercent?: number | null;
  settlementTotal?: number | null;
  settlementFormula?: string | null;
  settlementLockedAt?: TimestampLike;
  exitType?: string | null;
};

type ProjectSettlementFallback = {
  annualReturn?: number | null;
  durationMonths?: number | null;
  plannedEndAt?: TimestampLike;
} | null;

export type ResolvedInvestmentSettlement = {
  kind: "early_stop" | "maturity";
  status: "draft" | "finalized";
  policyCode: typeof EARLY_STOP_POLICY_CODE;
  policyLabel: string;
  principalAmount: number;
  annualProfitRate: number;
  investmentStartDate: Date | null;
  plannedEndDate: Date | null;
  investmentStopDate: Date | null;
  originalDurationMonths: number | null;
  actualDurationMonths: number | null;
  investedDays: number | null;
  calculatedProfit: number;
  totalPayout: number;
  formula: string;
  stopReason: string | null;
  finalizedAt: Date | null;
  finalizedByUid: string | null;
  finalizedByEmail: string | null;
  documentCategory: string | null;
};

export type EarlyStopSettlementPreview = {
  kind: "early_stop";
  status: "finalized";
  policyCode: typeof EARLY_STOP_POLICY_CODE;
  policyLabel: string;
  principalAmount: number;
  annualProfitRate: number;
  investmentStartDate: Date;
  plannedEndDate: Date | null;
  investmentStopDate: Date;
  originalDurationMonths: number | null;
  actualDurationMonths: number;
  investedDays: number;
  calculatedProfit: number;
  totalPayout: number;
  formula: string;
  stopReason: string | null;
  documentCategory: typeof INVESTMENT_SETTLEMENT_FILE_CATEGORY;
};

function toNumber(value: unknown) {
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

function normalizeText(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function toUtcDay(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function differenceInWholeCalendarDays(startAt: Date, endAt: Date) {
  return Math.max(0, Math.floor((toUtcDay(endAt) - toUtcDay(startAt)) / MS_PER_DAY));
}

function resolveStartAt(investment: SettlementSourceLike) {
  return (
    toDateSafe(investment?.legalTermsSnapshot?.startAt) ||
    toDateSafe(investment?.startAt) ||
    toDateSafe(investment?.signedAt) ||
    toDateSafe(investment?.createdAt)
  );
}

function resolvePlannedEndAt(
  investment: SettlementSourceLike,
  projectFallback?: ProjectSettlementFallback
) {
  const legalTerms = investment?.legalTermsSnapshot ?? null;
  const startAt = resolveStartAt(investment);
  const explicit =
    toDateSafe(legalTerms?.endAt) ||
    toDateSafe(investment?.plannedEndAt) ||
    toDateSafe(projectFallback?.plannedEndAt);
  if (explicit) return explicit;

  const durationMonths = firstNumber(
    legalTerms?.durationMonths,
    investment?.durationMonthsAtSign,
    investment?.durationMonths,
    projectFallback?.durationMonths
  );
  if (!startAt || durationMonths == null || durationMonths <= 0) return null;
  return addMonths(startAt, durationMonths);
}

function resolveOriginalDurationMonths(
  investment: SettlementSourceLike,
  projectFallback?: ProjectSettlementFallback
) {
  const legalTerms = investment?.legalTermsSnapshot ?? null;
  const explicit = firstNumber(
    investment?.settlement?.originalDurationMonths,
    legalTerms?.durationMonths,
    investment?.durationMonthsAtSign,
    investment?.durationMonths,
    projectFallback?.durationMonths
  );
  if (explicit != null && explicit > 0) return explicit;

  const startAt = resolveStartAt(investment);
  const plannedEndDate = resolvePlannedEndAt(investment, projectFallback);
  if (!startAt || !plannedEndDate) return null;

  const investedDays = differenceInWholeCalendarDays(startAt, plannedEndDate);
  return investedDays > 0 ? investedDays / AVG_DAYS_PER_MONTH : null;
}

function resolveAnnualProfitRate(
  investment: SettlementSourceLike,
  projectFallback?: ProjectSettlementFallback
) {
  const legalTerms = investment?.legalTermsSnapshot ?? null;
  return (
    firstNumber(
      investment?.settlement?.annualProfitRate,
      legalTerms?.annualReturnPercent,
      investment?.settlementAnnualReturnPercent,
      investment?.annualReturnAtSign,
      investment?.customRate,
      projectFallback?.annualReturn
    ) ?? 0
  );
}

function resolvePrincipalAmount(investment: SettlementSourceLike) {
  const legalTerms = investment?.legalTermsSnapshot ?? null;
  return (
    firstNumber(
      investment?.settlement?.principalAmount,
      legalTerms?.principalAmount,
      investment?.settlementPrincipal,
      investment?.approvedAmount,
      investment?.amount
    ) ?? 0
  );
}

export function isStopDateBeforePlannedEnd(stopAt: Date, plannedEndAt: Date | null) {
  if (!plannedEndAt) return true;
  return toUtcDay(stopAt) < toUtcDay(plannedEndAt);
}

export function buildEarlyStopSettlementPreview(input: {
  investment: SettlementSourceLike | null | undefined;
  projectFallback?: ProjectSettlementFallback;
  stopAt: TimestampLike;
  stopReason?: string | null;
}): EarlyStopSettlementPreview {
  const investment = input.investment ?? null;
  const investmentStartDate = resolveStartAt(investment || ({} as SettlementSourceLike));
  if (!investmentStartDate) throw new Error("missing_start_date");

  const investmentStopDate = toDateSafe(input.stopAt);
  if (!investmentStopDate) throw new Error("invalid_stop_date");
  if (toUtcDay(investmentStopDate) < toUtcDay(investmentStartDate)) {
    throw new Error("stop_before_start");
  }

  const principalAmount = resolvePrincipalAmount(investment || ({} as SettlementSourceLike));
  if (principalAmount <= 0) throw new Error("missing_principal_amount");

  const annualProfitRate = resolveAnnualProfitRate(
    investment || ({} as SettlementSourceLike),
    input.projectFallback
  );
  if (annualProfitRate <= 0) throw new Error("missing_profit_rate");

  const plannedEndDate = resolvePlannedEndAt(
    investment || ({} as SettlementSourceLike),
    input.projectFallback
  );
  const originalDurationMonths = resolveOriginalDurationMonths(
    investment || ({} as SettlementSourceLike),
    input.projectFallback
  );

  const investedDays = differenceInWholeCalendarDays(
    investmentStartDate,
    investmentStopDate
  );

  const actualDurationMonths = investedDays / AVG_DAYS_PER_MONTH;

  const calculatedProfit = roundMoney(
    principalAmount * (annualProfitRate / 100) * (investedDays / 365)
  );

  const totalPayout = roundMoney(principalAmount + calculatedProfit);

  return {
    kind: "early_stop",
    status: "finalized",
    policyCode: EARLY_STOP_POLICY_CODE,
    policyLabel: EARLY_STOP_POLICY_LABEL,
    principalAmount,
    annualProfitRate,
    investmentStartDate,
    plannedEndDate,
    investmentStopDate,
    originalDurationMonths,
    actualDurationMonths,
    investedDays,
    calculatedProfit,
    totalPayout,
    formula: "principalAmount * (annualProfitRate / 100) * (investedDays / 365)",
    stopReason: normalizeText(input.stopReason),
    documentCategory: INVESTMENT_SETTLEMENT_FILE_CATEGORY,
  };
}

export function getInvestmentSettlementSnapshot(
  investment: SettlementSourceLike | null | undefined
): ResolvedInvestmentSettlement | null {
  const source = investment ?? null;
  const settlement = source?.settlement;

  if (settlement && String(settlement.kind || "").trim().toLowerCase() === "early_stop") {
    const principalAmount = firstNumber(settlement.principalAmount, source?.settlementPrincipal, 0) ?? 0;
    const calculatedProfit = firstNumber(settlement.calculatedProfit, source?.earnedProfit, 0) ?? 0;

    const totalPayout =
      firstNumber(settlement.totalPayout, source?.settlementTotal, principalAmount + calculatedProfit) ??
      0;

    return {
      kind: "early_stop",
      status:
        String(settlement.status || "").trim().toLowerCase() === "draft"
          ? "draft"
          : "finalized",
      policyCode: EARLY_STOP_POLICY_CODE,
      policyLabel: normalizeText(settlement.policyLabel) || EARLY_STOP_POLICY_LABEL,
      principalAmount,
      annualProfitRate:
        firstNumber(settlement.annualProfitRate, source?.settlementAnnualReturnPercent, 0) ?? 0,
      investmentStartDate:
        toDateSafe(settlement.investmentStartDate) ||
        resolveStartAt(source || ({} as SettlementSourceLike)),
      plannedEndDate:
        toDateSafe(settlement.plannedEndDate) || toDateSafe(source?.plannedEndAt),
      investmentStopDate:
        toDateSafe(settlement.investmentStopDate) ||
        toDateSafe(source?.stoppedAt) ||
        toDateSafe(source?.withdrawnAt) ||
        toDateSafe(source?.actualEndAt),
      originalDurationMonths:
        firstNumber(settlement.originalDurationMonths, source?.durationMonthsAtSign, source?.durationMonths) ??
        null,
      actualDurationMonths:
        firstNumber(settlement.actualDurationMonths, source?.actualDurationMonths) ?? null,
      investedDays:
        firstNumber(settlement.investedDays) ??
        (() => {
          const startAt =
            toDateSafe(settlement.investmentStartDate) ||
            resolveStartAt(source || ({} as SettlementSourceLike));
          const stopAt =
            toDateSafe(settlement.investmentStopDate) ||
            toDateSafe(source?.stoppedAt) ||
            toDateSafe(source?.withdrawnAt) ||
            toDateSafe(source?.actualEndAt);
          return startAt && stopAt
            ? differenceInWholeCalendarDays(startAt, stopAt)
            : null;
        })(),
      calculatedProfit,
      totalPayout,
      formula:
        normalizeText(settlement.formula) ||
        normalizeText(source?.settlementFormula) ||
        "principalAmount * (annualProfitRate / 100) * (investedDays / 365)",
      stopReason: normalizeText(settlement.stopReason) || normalizeText(source?.stopReason),
      finalizedAt:
        toDateSafe(settlement.finalizedAt) || toDateSafe(source?.settlementLockedAt),
      finalizedByUid: normalizeText(settlement.finalizedByUid),
      finalizedByEmail: normalizeText(settlement.finalizedByEmail),
      documentCategory:
        normalizeText(settlement.documentCategory) || INVESTMENT_SETTLEMENT_FILE_CATEGORY,
    };
  }

  const hasLegacyEarlyStop =
    ["early_withdrawal", "client_requested_stop"].includes(
      String(source?.exitType || "").trim().toLowerCase()
    ) ||
    String(source?.status || "").trim().toLowerCase() === "stopped" ||
    Boolean(source?.stoppedAt) ||
    Boolean(source?.withdrawnAt);

  if (!hasLegacyEarlyStop) return null;

  const investmentStartDate = resolveStartAt(
    source || ({} as SettlementSourceLike)
  );

  const investmentStopDate =
    toDateSafe(source?.stoppedAt) ||
    toDateSafe(source?.withdrawnAt) ||
    toDateSafe(source?.actualEndAt);

  const principalAmount = firstNumber(
    source?.settlementPrincipal,
    source?.legalTermsSnapshot?.principalAmount,
    source?.approvedAmount,
    source?.amount,
    0
  ) ?? 0;

  const calculatedProfit = firstNumber(source?.earnedProfit, 0) ?? 0;

  const investedDays =
    investmentStartDate && investmentStopDate
      ? differenceInWholeCalendarDays(investmentStartDate, investmentStopDate)
      : null;

  return {
    kind: "early_stop",
    status: "finalized",
    policyCode: EARLY_STOP_POLICY_CODE,
    policyLabel: EARLY_STOP_POLICY_LABEL,
    principalAmount,
    annualProfitRate:
      firstNumber(
        source?.settlementAnnualReturnPercent,
        source?.annualReturnAtSign,
        source?.customRate,
        0
      ) ?? 0,
    investmentStartDate,
    plannedEndDate:
      toDateSafe(source?.legalTermsSnapshot?.endAt) ||
      toDateSafe(source?.plannedEndAt),
    investmentStopDate,
    originalDurationMonths:
      firstNumber(
        source?.legalTermsSnapshot?.durationMonths,
        source?.durationMonthsAtSign,
        source?.durationMonths
      ) ?? null,
    actualDurationMonths:
      firstNumber(
        source?.actualDurationMonths,
        investedDays != null ? investedDays / AVG_DAYS_PER_MONTH : null
      ) ?? null,
    investedDays,
    calculatedProfit,
    totalPayout:
      firstNumber(source?.settlementTotal, principalAmount + calculatedProfit) ??
      0,
    formula:
      normalizeText(source?.settlementFormula) ||
      "principalAmount * (annualProfitRate / 100) * (investedDays / 365)",
    stopReason: normalizeText(source?.stopReason),
    finalizedAt: toDateSafe(source?.settlementLockedAt),
    finalizedByUid: null,
    finalizedByEmail: null,
    documentCategory: INVESTMENT_SETTLEMENT_FILE_CATEGORY,
  };
}

export function isInvestmentStoppedEarly(
  investment: SettlementSourceLike | null | undefined
) {
  return getInvestmentSettlementSnapshot(investment)?.kind === "early_stop";
}

export function getInvestmentSettlementStatusLabel(
  investment: SettlementSourceLike | null | undefined
) {
  return isInvestmentStoppedEarly(investment)
    ? "تم إيقافه بطلب العميل"
    : null;
}