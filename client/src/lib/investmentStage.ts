export type InvestmentStage =
  | "request_created"
  | "investment_created"
  | "contract_preparing"
  | "awaiting_signature"
  | "contract_under_review"
  | "contract_verified"
  | "active"
  | "stopped"
  | "completed"
  | "rejected"
  | "cancelled";

export type InvestmentTimelineStepKey = Exclude<
  InvestmentStage,
  "active" | "stopped" | "completed" | "rejected" | "cancelled"
>;

export type DeriveInvestmentStageInput = {
  investmentStatus?: string | null;
  contractStatus?: string | null;
  hasInvestment?: boolean;
  hasOriginalContract?: boolean;
  hasSignedContract?: boolean;
  hasVerifiedContract?: boolean;
};

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function deriveInvestmentStage(
  rawData: DeriveInvestmentStageInput
): InvestmentStage {
  const investmentStatus = normalizeStatus(rawData.investmentStatus);
  const contractStatus = normalizeStatus(rawData.contractStatus);
  const hasInvestment = Boolean(rawData.hasInvestment);
  const hasOriginalContract = Boolean(rawData.hasOriginalContract);
  const hasSignedContract = Boolean(rawData.hasSignedContract);
  const hasVerifiedContract = Boolean(rawData.hasVerifiedContract);

  if (investmentStatus === "rejected") {
    return "rejected";
  }

  if (investmentStatus === "cancelled") {
    return "cancelled";
  }

  if (investmentStatus === "active") {
    return "active";
  }

  if (investmentStatus === "stopped") {
    return "stopped";
  }

  if (investmentStatus === "completed" || investmentStatus === "closed") {
    return "completed";
  }

  if (
    hasVerifiedContract ||
    contractStatus === "approved" ||
    contractStatus === "verified" ||
    investmentStatus === "approved"
  ) {
    return "contract_verified";
  }

  if (
    hasSignedContract ||
    [
      "signed",
      "signed_uploaded",
      "under_review",
      "pending_approval",
      "submitted_for_review",
      "uploaded",
    ].includes(contractStatus) ||
    investmentStatus === "signed"
  ) {
    return "contract_under_review";
  }

  if (
    [
      "sent",
      "issued",
      "awaiting_signature",
      "pending_signature",
    ].includes(contractStatus) ||
    investmentStatus === "signing" ||
    hasOriginalContract
  ) {
    return "awaiting_signature";
  }

  if (
    ["draft", "generated", "contract_ready"].includes(contractStatus) ||
    investmentStatus === "pending_contract"
  ) {
    return "contract_preparing";
  }

  if (hasInvestment) {
    return "investment_created";
  }

  return "request_created";
}
