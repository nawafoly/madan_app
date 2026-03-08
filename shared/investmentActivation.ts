import { roundMoney, toDateSafe, type TimestampLike } from "./investmentProfit";

type ActivationInput = {
  amount: number;
  investment?: Record<string, any> | null;
  project?: Record<string, any> | null;
  appSettings?: Record<string, any> | null;
  startAt?: Date;
};

const AVG_DAYS_PER_MONTH = 30.4375;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function toNumber(value: unknown, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

export function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const wholeMonths = Math.trunc(months);
  const fractionalMonths = months - wholeMonths;
  result.setMonth(result.getMonth() + wholeMonths);
  if (fractionalMonths !== 0) {
    result.setDate(result.getDate() + Math.round(fractionalMonths * AVG_DAYS_PER_MONTH));
  }
  return result;
}

export function monthsBetween(start: Date, end: Date) {
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  return diffMs / (MS_PER_DAY * AVG_DAYS_PER_MONTH);
}

export function resolveInvestmentActivationTerms({
  amount,
  investment,
  project,
  appSettings,
  startAt = new Date(),
}: ActivationInput) {
  const investorDurationMonths =
    toNumber(investment?.customDuration, 0) || toNumber(investment?.durationMonths, 0);
  const projectDurationMonths =
    toNumber(project?.durationMonths, 0) || toNumber(project?.duration, 0);
  const defaultHorizonYears = toNumber(appSettings?.defaultHorizonYears, 0);
  const settingsDurationMonths = defaultHorizonYears > 0 ? defaultHorizonYears * 12 : 0;

  const investorAnnualReturn = toNumber(investment?.customRate, 0);
  const projectAnnualReturn = toNumber(project?.annualReturn, 0);
  const settingsAnnualReturn = toNumber(appSettings?.defaultReturn, 0);

  const annualReturnSource =
    investorAnnualReturn > 0
      ? "investments.customRate"
      : projectAnnualReturn > 0
        ? "projects.annualReturn"
        : "settings.app.defaultReturn";
  const annualReturn =
    investorAnnualReturn > 0
      ? investorAnnualReturn
      : projectAnnualReturn > 0
        ? projectAnnualReturn
        : settingsAnnualReturn;

  if (annualReturn <= 0) throw new Error("missing_final_annual_return");

  const projectEndAt = toDateSafe(project?.plannedEndAt as TimestampLike);
  const projectDurationFromEndAt =
    projectEndAt && projectEndAt.getTime() > startAt.getTime()
      ? monthsBetween(startAt, projectEndAt)
      : 0;

  const durationSource =
    investorDurationMonths > 0
      ? "investments.customDuration"
      : projectDurationMonths > 0
        ? "projects.duration"
        : projectDurationFromEndAt > 0
          ? "projects.plannedEndAt"
          : "settings.app.defaultHorizonYears";

  const durationMonths =
    investorDurationMonths > 0
      ? investorDurationMonths
      : projectDurationMonths > 0
        ? projectDurationMonths
        : projectDurationFromEndAt > 0
          ? projectDurationFromEndAt
          : settingsDurationMonths;

  if (durationMonths <= 0) throw new Error("missing_final_duration_months");

  const plannedEndAt = addMonths(startAt, durationMonths);
  const expectedProfit = roundMoney(
    amount * (annualReturn / 100) * (durationMonths / 12)
  );

  return {
    annualReturn,
    annualReturnSource,
    durationMonths,
    durationSource,
    plannedEndAt,
    expectedProfit,
    legalTermsSnapshot: {
      version: 1,
      approvedAt: startAt,
      principalAmount: amount,
      annualReturnPercent: annualReturn,
      annualReturnSource,
      durationMonths,
      durationSource,
      startAt,
      endAt: plannedEndAt,
      expectedProfit,
      formula: "principal * annualRate * (durationMonths / 12)",
      isFrozen: true,
    },
  };
}
