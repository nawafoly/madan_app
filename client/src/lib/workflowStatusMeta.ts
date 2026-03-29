import {
  getClientContractStatusLabel,
  getClientInvestmentStatusLabel,
  normalizeWorkflowStatus,
} from "@shared/investmentLifecycle";

export type WorkflowStatusMeta = {
  label: string;
  cls: string;
};

const INVESTMENT_STATUS_CLASS_MAP: Record<string, string> = {
  reviewing: "bg-blue-600",
  pending: "bg-blue-600",
  pending_review: "bg-blue-600",
  new: "bg-orange-500",
  in_progress: "bg-blue-600",
  needs_account: "bg-yellow-600",
  pending_contract: "bg-purple-600",
  signing: "bg-indigo-600",
  signed: "bg-amber-600",
  approved: "bg-green-700",
  active: "bg-emerald-700",
  rejected: "bg-red-600",
  completed: "bg-gray-600",
  closed: "bg-gray-600",
  resolved: "bg-green-600",
};

const CONTRACT_STATUS_CLASS_MAP: Record<string, string> = {
  draft: "bg-purple-600",
  generated: "bg-purple-600",
  contract_ready: "bg-purple-600",
  sent: "bg-blue-600",
  issued: "bg-blue-600",
  awaiting_signature: "bg-indigo-600",
  pending_signature: "bg-indigo-600",
  signed: "bg-amber-600",
  signed_uploaded: "bg-amber-600",
  under_review: "bg-amber-600",
  pending_approval: "bg-amber-600",
  submitted_for_review: "bg-amber-600",
  uploaded: "bg-amber-600",
  approved: "bg-green-700",
};

export function getClientInvestmentStatusMeta(status: unknown): WorkflowStatusMeta {
  const normalizedStatus = normalizeWorkflowStatus(status);
  return {
    label: getClientInvestmentStatusLabel(status),
    cls: INVESTMENT_STATUS_CLASS_MAP[normalizedStatus] || "bg-blue-600",
  };
}

export function getClientContractStatusMeta(status: unknown): WorkflowStatusMeta {
  const normalizedStatus = normalizeWorkflowStatus(status);
  return {
    label: getClientContractStatusLabel(status),
    cls: CONTRACT_STATUS_CLASS_MAP[normalizedStatus] || "bg-slate-600",
  };
}
