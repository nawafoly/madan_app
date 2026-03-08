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
      title: "استثمارك نشط",
      description:
        "تم الاعتماد النهائي وتفعيل الاستثمار. من هذه النقطة فقط تبدأ مدة الاستثمار وحساب الربح.",
    };
  }

  if (contractStatus === "approved") {
    return {
      title: "تم اعتماد العقد",
      description:
        "اكتمل اعتماد العقد، ولم يبدأ الاستثمار إلا عند تفعيله فعليًا داخل النظام.",
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
      title: "تم توقيع العقد وجارٍ التحقق",
      description:
        "العقد الآن قيد المراجعة والاعتماد. لم يبدأ الاستثمار بعد، ولا يوجد ربح أو عداد قبل التفعيل النهائي.",
    };
  }

  if (
    ["sent", "awaiting_signature", "pending_signature"].includes(
      contractStatus
    )
  ) {
    return {
      title: "العقد بانتظار الإجراء",
      description:
        "تم إرسال العقد للمراجعة أو التوقيع. الاستثمار لم يبدأ بعد، وسيبدأ فقط بعد الاعتماد النهائي.",
    };
  }

  if (["draft", "generated", "contract_ready"].includes(contractStatus)) {
    return {
      title: "تم تجهيز العقد",
      description:
        "العقد في مرحلة التجهيز أو المراجعة الداخلية. لا يوجد استثمار نشط ولا يبدأ الربح في هذه المرحلة.",
    };
  }

  if (isInvestmentPreActivationStatus(investmentStatus)) {
    return {
      title: "لم يبدأ الاستثمار بعد",
      description:
        "الطلب أو العقد ما زال في المراحل السابقة للتفعيل. يظهر الربح والعداد فقط بعد الاعتماد النهائي وتحويل الاستثمار إلى active.",
    };
  }

  return {
    title: "العقد قيد المراجعة",
    description:
      "الاستثمار غير مفعّل بعد. لا يبدأ الربح ولا يظهر العداد إلا بعد اعتماد العقد وتفعيل الاستثمار فعليًا.",
  };
}
