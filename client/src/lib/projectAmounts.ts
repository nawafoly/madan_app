type ProjectAmountLike = {
  targetAmount?: number | string | null;
  minInvestment?: number | string | null;
  minInvestmentAmount?: number | string | null;
  currentAmount?: number | string | null;
  coverageRate?: number | string | null;
  baseCoveredAmount?: number | string | null;
  investmentsAmount?: number | string | null;
  remainingInvestorsCount?: number | string | null;
};

export function toProjectNumber(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function getProjectComputedAmounts(project: ProjectAmountLike | null | undefined) {
  const targetAmount = toProjectNumber(project?.targetAmount);
  const minInvestment = toProjectNumber(
    project?.minInvestment ?? project?.minInvestmentAmount
  );
  const coverageRate = toProjectNumber(project?.coverageRate);
  const baseCoveredAmount =
    project?.baseCoveredAmount != null && project?.baseCoveredAmount !== ""
      ? toProjectNumber(project.baseCoveredAmount)
      : (targetAmount * coverageRate) / 100;
  const investmentsAmount =
    project?.investmentsAmount != null && project?.investmentsAmount !== ""
      ? toProjectNumber(project.investmentsAmount)
      : project?.baseCoveredAmount != null
        ? Math.max(toProjectNumber(project.currentAmount) - baseCoveredAmount, 0)
        : toProjectNumber(project.currentAmount);
  const currentAmount = baseCoveredAmount + investmentsAmount;
  const progressPercent = targetAmount
    ? Math.max(0, Math.min(100, (currentAmount / targetAmount) * 100))
    : 0;
  const remainingAmount = Math.max(targetAmount - currentAmount, 0);
  const remainingInvestorsCount =
    minInvestment > 0 && remainingAmount > 0
      ? Math.ceil(remainingAmount / minInvestment)
      : 0;

  return {
    targetAmount,
    minInvestment,
    coverageRate,
    baseCoveredAmount,
    investmentsAmount,
    currentAmount,
    remainingAmount,
    remainingInvestorsCount,
    progressPercent,
  };
}
