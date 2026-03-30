export const ACTIVATED_INVESTMENT_STATUSES = [
  "active",
  "completed",
  "closed",
] as const;

export const PRE_ACTIVATION_INVESTMENT_STATUSES = [
  "pending",
  "pending_review",
  "pending_contract",
  "signing",
  "signed",
  "approved",
] as const;

const ACTIVATED_STATUS_SET = new Set<string>(ACTIVATED_INVESTMENT_STATUSES);
const PRE_ACTIVATION_STATUS_SET = new Set<string>(
  PRE_ACTIVATION_INVESTMENT_STATUSES
);

export function normalizeWorkflowStatus(raw: unknown) {
  const normalized = String(raw || "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    ended: "completed",
    finished: "completed",
  };

  return aliases[normalized] || normalized;
}

export function isInvestmentActivatedStatus(raw: unknown) {
  return ACTIVATED_STATUS_SET.has(normalizeWorkflowStatus(raw));
}

export function isInvestmentPreActivationStatus(raw: unknown) {
  return PRE_ACTIVATION_STATUS_SET.has(normalizeWorkflowStatus(raw));
}

export const CLIENT_WORKFLOW_COPY = {
  contractPreparing: "جاري تجهيز العقد",
  contractSent: "تم إرسال العقد",
  awaitingContractSignature: "بانتظار توقيعك على العقد",
  awaitingFinalReview: "بانتظار المراجعة والاعتماد النهائي",
  contractApproved: "تم اعتماد العقد",
  investmentStarted: "بدأ الاستثمار",
} as const;

export function getClientInvestmentStatusLabel(raw: unknown) {
  const status = normalizeWorkflowStatus(raw);

  const map: Record<string, string> = {
    reviewing: "قيد المراجعة",
    pending: "قيد المراجعة",
    pending_review: "قيد المراجعة",
    new: "جديد",
    in_progress: "قيد المعالجة",
    needs_account: "يتطلب حساب",
    pending_contract: CLIENT_WORKFLOW_COPY.contractPreparing,
    signing: CLIENT_WORKFLOW_COPY.awaitingContractSignature,
    signed: CLIENT_WORKFLOW_COPY.awaitingFinalReview,
    approved: CLIENT_WORKFLOW_COPY.contractApproved,
    active: CLIENT_WORKFLOW_COPY.investmentStarted,
    completed: "مكتمل",
    closed: "مكتمل",
    ended: "مكتمل",
    finished: "مكتمل",
    resolved: "تمت المعالجة",
    rejected: "مرفوض",
  };

  return map[status] || String(raw || "—");
}

export function getClientContractStatusLabel(raw: unknown) {
  const status = normalizeWorkflowStatus(raw);

  const map: Record<string, string> = {
    draft: CLIENT_WORKFLOW_COPY.contractPreparing,
    generated: CLIENT_WORKFLOW_COPY.contractPreparing,
    contract_ready: CLIENT_WORKFLOW_COPY.contractPreparing,
    sent: CLIENT_WORKFLOW_COPY.contractSent,
    issued: CLIENT_WORKFLOW_COPY.contractSent,
    awaiting_signature: CLIENT_WORKFLOW_COPY.awaitingContractSignature,
    pending_signature: CLIENT_WORKFLOW_COPY.awaitingContractSignature,
    signed: CLIENT_WORKFLOW_COPY.awaitingFinalReview,
    signed_uploaded: CLIENT_WORKFLOW_COPY.awaitingFinalReview,
    under_review: CLIENT_WORKFLOW_COPY.awaitingFinalReview,
    pending_approval: CLIENT_WORKFLOW_COPY.awaitingFinalReview,
    submitted_for_review: CLIENT_WORKFLOW_COPY.awaitingFinalReview,
    uploaded: CLIENT_WORKFLOW_COPY.awaitingFinalReview,
    approved: CLIENT_WORKFLOW_COPY.contractApproved,
  };

  return map[status] || String(raw || "—");
}

export function getInvestorActivationMessage(
  investmentStatusRaw: unknown,
  contractStatusRaw?: unknown
) {
  const investmentStatus = normalizeWorkflowStatus(investmentStatusRaw);
  const contractStatus = normalizeWorkflowStatus(contractStatusRaw);

  if (isInvestmentActivatedStatus(investmentStatus)) {
    return {
      title: CLIENT_WORKFLOW_COPY.investmentStarted,
      description:
        "تم التفعيل النهائي، وبدأت مدة الاستثمار واحتساب الربح من هذه المرحلة.",
    };
  }

  if (contractStatus === "approved") {
    return {
      title: CLIENT_WORKFLOW_COPY.contractApproved,
      description:
        "تم اعتماد العقد، وسيبدأ الاستثمار بعد اكتمال التفعيل النهائي إن لم يكن قد بدأ بعد.",
    };
  }

  if (
    [
      "under_review",
      "pending_approval",
      "signed",
      "signed_uploaded",
      "submitted_for_review",
      "uploaded",
    ].includes(contractStatus)
  ) {
    return {
      title: CLIENT_WORKFLOW_COPY.awaitingFinalReview,
      description:
        "تم استلام العقد الموقّع، وهو الآن بانتظار المراجعة والاعتماد النهائي قبل بدء الاستثمار.",
    };
  }

  if (
    ["sent", "awaiting_signature", "pending_signature"].includes(
      contractStatus
    )
  ) {
    return {
      title: CLIENT_WORKFLOW_COPY.awaitingContractSignature,
      description:
        "تم إرسال العقد الاستثماري، وهو الآن بانتظار توقيعك قبل المراجعة والاعتماد النهائي.",
    };
  }

  if (["draft", "generated", "contract_ready"].includes(contractStatus)) {
    return {
      title: CLIENT_WORKFLOW_COPY.contractPreparing,
      description:
        "يجري تجهيز العقد ومراجعته داخليًا قبل إرساله لك للتوقيع. الاستثمار لم يبدأ بعد.",
    };
  }

  if (isInvestmentPreActivationStatus(investmentStatus)) {
    return {
      title: "لم يبدأ الاستثمار بعد",
      description:
        "الاستثمار ما زال في المراحل السابقة للتفعيل. يظهر الربح والعداد فقط بعد الاعتماد النهائي وتحويل الحالة إلى نشطة.",
    };
  }

  return {
    title: "لم يبدأ الاستثمار بعد",
    description:
      "الاستثمار غير مفعّل بعد. لا يبدأ الربح ولا يظهر العداد إلا بعد اعتماد العقد وتفعيل الاستثمار فعليًا.",
  };
}
