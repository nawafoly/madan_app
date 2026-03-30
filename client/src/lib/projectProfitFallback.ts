import type { ProjectProfitFallback } from "@shared/investmentProfit";

function toFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

export function getProjectProfitFallback(project: Record<string, any> | null | undefined): ProjectProfitFallback | null {
  if (!project) return null;

  const annualReturn = toFiniteNumber(
    project?.annualReturn,
    project?.profitPercent,
    project?.profitRate,
    project?.roiPercent,
    project?.returnPercent
  );

  const durationMonths = toFiniteNumber(
    project?.durationMonths,
    project?.investmentDurationMonths,
    project?.duration,
    project?.durationInMonths
  );

  const plannedEndAt =
    project?.plannedEndAt ??
    project?.endAt ??
    project?.maturityAt ??
    project?.closingDate ??
    null;

  return {
    annualReturn,
    durationMonths,
    plannedEndAt,
  };
}
