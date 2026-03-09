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
  return String(raw || "").trim().toLowerCase();
}

export function isInvestmentActivatedStatus(raw: unknown) {
  return ACTIVATED_STATUS_SET.has(normalizeWorkflowStatus(raw));
}

export function isInvestmentPreActivationStatus(raw: unknown) {
  return PRE_ACTIVATION_STATUS_SET.has(normalizeWorkflowStatus(raw));
}

export function getInvestorActivationMessage(
  investmentStatusRaw: unknown,
  contractStatusRaw?: unknown
) {
  const investmentStatus = normalizeWorkflowStatus(investmentStatusRaw);
  const contractStatus = normalizeWorkflowStatus(contractStatusRaw);

  if (isInvestmentActivatedStatus(investmentStatus)) {
    return {
      title: "بدأ الاستثمار وهو الآن نشط",
      description:
        "تم التفعيل النهائي، وبدأت مدة الاستثمار واحتساب الربح من هذه المرحلة.",
    };
  }

  if (contractStatus === "approved") {
    return {
      title: "تم اعتماد العقد",
      description:
        "تم اعتماد العقد، والاستثمار بانتظار التفعيل النهائي قبل البدء إن لم يكن قد بدأ بعد.",
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
      title: "تم استلام العقد الموقّع",
      description:
        "تم توقيع العقد من المستثمر، والاستثمار بانتظار المراجعة والاعتماد النهائي قبل التفعيل.",
    };
  }

  if (
    ["sent", "awaiting_signature", "pending_signature"].includes(
      contractStatus
    )
  ) {
    return {
      title: "العقد لم يُوقّع بعد",
      description:
        "تم إرسال العقد، وما زال بانتظار توقيع المستثمر قبل المراجعة والاعتماد النهائي.",
    };
  }

  if (["draft", "generated", "contract_ready"].includes(contractStatus)) {
    return {
      title: "العقد قيد الإعداد",
      description:
        "يجري تجهيز العقد ومراجعته داخليًا قبل إرساله للتوقيع. الاستثمار لم يبدأ بعد.",
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
