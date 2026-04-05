import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";

import { db } from "@/_core/firebase";
import { formatCurrencyEN, formatDateEN, formatDateTimeEN } from "@/lib/formatters";
import {
  buildR2DownloadUrl,
  listDocumentMetadata,
  pickLatestFileByCategory,
  type CloudflareFileRecord,
} from "@/lib/documentUploadService";
import { buildProjectsMap, getProjectDisplayTitle } from "@/lib/projectDisplay";
import {
  getContractBusinessId,
  getInvestmentBusinessId,
} from "@/lib/businessIds";
import { buildUserIdentityIndex, resolveLinkedUser } from "@/lib/userDisplay";
import { getClientContractStatusMeta, getClientInvestmentStatusMeta } from "@/lib/workflowStatusMeta";
import { getProjectProfitFallback } from "@/lib/projectProfitFallback";
import { findInterestRequestForInvestor, normalizeLinkId } from "@/lib/requestInvestmentLink";
import {
  getInvestmentSettlementSnapshot,
  INVESTMENT_SETTLEMENT_FILE_CATEGORY,
  isInvestmentStoppedEarly,
} from "@shared/investmentSettlement";
import { getInvestmentProfitSnapshot, roundMoney } from "@shared/investmentProfit";

export type InvestmentReportField = {
  label: string;
  value: string;
  span?: 1 | 2;
  tone?: "default" | "accent" | "muted";
  valueSize?: "small" | "default" | "large";
};

export type InvestmentReportSection = {
  title: string;
  items: InvestmentReportField[];
  layout?: "half" | "full";
};

export type InvestmentReportData = {
  platformName: string;
  title: string;
  projectName: string;
  reportDate: string;
  reportNumber: string;
  amount: string;
  status: string;
  sections: InvestmentReportSection[];
  footer: string;
};

type ReportBuildInput = {
  investment: Record<string, any>;
  users?: Array<Record<string, any> & { id: string }>;
  projects?: Array<Record<string, any> & { id: string }>;
};

type TimelineEvent = {
  id: string;
  type: string;
  title: string;
  note: string | null;
  at: Date | null;
  source: "request" | "investment" | "contract" | "message" | "system";
};

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function toNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toDateSafe(value: unknown): Date | null {
  try {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof (value as Timestamp)?.toDate === "function") {
      const date = (value as Timestamp).toDate();
      return Number.isFinite(date.getTime()) ? date : null;
    }
    if (typeof (value as { seconds?: unknown })?.seconds === "number") {
      const date = new Date(Number((value as { seconds: number }).seconds) * 1000);
      return Number.isFinite(date.getTime()) ? date : null;
    }
    const date = new Date(String(value));
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + Number(months || 0));
  return next;
}

function differenceInDays(startAt: Date | null, endAt: Date | null) {
  if (!startAt || !endAt) return null;
  const diffMs = endAt.getTime() - startAt.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function formatDateValue(value: unknown) {
  return formatDateEN(toDateSafe(value));
}

function formatDateTimeValue(value: unknown) {
  return formatDateTimeEN(toDateSafe(value));
}

function formatMoney(value: unknown, digits = 2) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "غير متوفر";
  return formatCurrencyEN(amount, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: unknown, digits = 2) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "غير متوفر";
  return `${amount.toFixed(digits).replace(/\.00$/, "")}%`;
}

function formatBool(value: boolean | null | undefined) {
  if (value == null) return "غير متوفر";
  return value ? "نعم" : "لا";
}

function formatDurationLabel(days: number | null, months: number | null) {
  if (days == null && months == null) return "غير متوفرة";
  const lines: string[] = [];
  if (days != null) lines.push(`${days} يوم`);
  if (months != null) lines.push(`${Number(months).toFixed(2)} شهر`);
  return lines.join(" - ");
}

function normalizeStatus(status: unknown) {
  return String(status ?? "").trim().toLowerCase();
}

function safeFileName(value: unknown, fallback: string) {
  const text = pickText(value);
  return text || fallback;
}

function describeAccountType(userRecord: Record<string, any> | null) {
  if (!userRecord) return "غير متوفر في نموذج البيانات الحالي";
  const role = pickText(userRecord.role, userRecord.profile?.role, "client");
  const vipStatus = pickText(userRecord.vipStatus, userRecord.profile?.vipStatus);
  return vipStatus ? `${role} - ${vipStatus}` : role;
}

function describeIdentityNumber(userRecord: Record<string, any> | null) {
  return (
    pickText(
      userRecord?.nationalId,
      userRecord?.identityNumber,
      userRecord?.idNumber,
      userRecord?.profile?.nationalId,
      userRecord?.profile?.identityNumber,
      userRecord?.contact?.identityNumber
    ) || "غير متوفر في نموذج البيانات الحالي"
  );
}

function buildTimelineTypeLabel(type: string, fallbackTitle: string) {
  const map: Record<string, string> = {
    interest_request_created: "استلام الطلب",
    request_created: "استلام الطلب",
    request_submitted: "استلام الطلب",
    request_reviewed: "مراجعة الطلب",
    investment_created: "إنشاء سجل الاستثمار",
    contract_prepared: "تجهيز العقد",
    contract_uploaded: "إرسال العقد",
    original_contract_uploaded: "إرسال العقد",
    contract_sent: "إرسال العقد",
    contract_signed: "استلام العقد الموقّع",
    signed_uploaded: "استلام العقد الموقّع",
    contract_verified: "الاعتماد النهائي",
    investment_activated: "بدء الاستثمار",
    activated: "بدء الاستثمار",
    stop_requested: "طلب الإيقاف",
    investment_stopped: "تنفيذ الإيقاف",
    settlement_document_uploaded: "إرفاق مستند التسوية",
    completed: "الإغلاق النهائي",
  };

  return map[type] || fallbackTitle || type || "تحديث";
}

function pushTimelineEvent(target: TimelineEvent[], entry: Omit<TimelineEvent, "id">) {
  const id = `${entry.type}:${entry.source}:${entry.at?.getTime?.() || 0}:${entry.title}`;
  if (target.some((item) => item.id === id)) return;
  target.push({ id, ...entry });
}

function appendEventsFromDoc(
  target: TimelineEvent[],
  source: TimelineEvent["source"],
  docRecord: Record<string, any> | null
) {
  const events = Array.isArray(docRecord?.events) ? docRecord.events : [];
  events.forEach((event) => {
    const type = normalizeStatus(event?.type);
    pushTimelineEvent(target, {
      type: type || "update",
      title: buildTimelineTypeLabel(type, pickText(event?.title, "تحديث")),
      note: pickText(event?.note, event?.meta?.note) || null,
      at: toDateSafe(event?.at),
      source,
    });
  });
}

function resolveDocumentFile(
  records: CloudflareFileRecord[],
  category: string,
  fallback: {
    path?: string;
    url?: string;
    fileName?: string;
  } = {}
) {
  const latest = pickLatestFileByCategory(records, category);
  if (latest) return latest;

  const path = pickText(fallback.path);
  const url = pickText(fallback.url, path ? buildR2DownloadUrl(path, false) : "");
  if (!path && !url) return null;

  return {
    id: `fallback:${category}`,
    kind: "attachment",
    category,
    entityType: "investment",
    entityId: "",
    fileName: safeFileName(fallback.fileName, category),
    filePath: path,
    fileUrl: url,
    contentType: "application/pdf",
    fileSize: 0,
    uploadedAt: "",
    status: "fallback",
  } as CloudflareFileRecord;
}

function describeFileRecord(label: string, record: CloudflareFileRecord | null) {
  if (!record) return `${label}: غير متوفر`;

  const path = pickText(record.filePath);
  const fileName = safeFileName(record.fileName, "document.pdf");
  const uploadedAt = record.uploadedAt ? formatDateTimeValue(record.uploadedAt) : "غير متوفر";
  return [
    `${label}: ${fileName}`,
    path ? `المسار: ${path}` : "",
    `تاريخ الرفع: ${uploadedAt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function describeFiles(records: CloudflareFileRecord[]) {
  if (!records.length) return "لا توجد مرفقات إضافية مرتبطة بالاستثمار.";
  return records
    .map((record) =>
      [
        `- ${safeFileName(record.fileName, record.category)}`,
        record.filePath ? `(${record.filePath})` : "",
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join("\n");
}

function resolveContractualExpectedProfit(
  investment: Record<string, any>,
  projectRecord: Record<string, any> | null
) {
  const legalTerms = investment.legalTermsSnapshot ?? null;
  const direct = toNumber(
    legalTerms?.expectedProfit,
    investment.expectedProfit,
    investment.estimatedReturn
  );
  if (direct != null) return Math.max(0, direct);

  const principal = Math.max(
    0,
    toNumber(
      legalTerms?.principalAmount,
      investment.approvedAmount,
      investment.amount,
      0
    ) || 0
  );
  const annualReturn = toNumber(
    legalTerms?.annualReturnPercent,
    investment.annualReturnAtSign,
    investment.customRate,
    projectRecord?.annualReturn
  );
  const durationMonths = toNumber(
    legalTerms?.durationMonths,
    investment.durationMonthsAtSign,
    investment.durationMonths,
    projectRecord?.durationMonths,
    projectRecord?.duration
  );
  if (principal <= 0 || annualReturn == null || durationMonths == null || durationMonths <= 0) {
    return 0;
  }

  return roundMoney(principal * (annualReturn / 100) * (durationMonths / 12));
}

async function loadProjectRecord(
  investment: Record<string, any>,
  projects: Array<Record<string, any> & { id: string }>
) {
  const projectId = pickText(investment.projectId);
  if (!projectId) return null;

  const local = projects.find((project) => String(project.id) === projectId) || null;
  if (local) return local;

  try {
    const snapshot = await getDoc(doc(db, "projects", projectId));
    return snapshot.exists() ? ({ id: snapshot.id, ...(snapshot.data() as any) } as Record<string, any>) : null;
  } catch {
    return null;
  }
}

async function loadUserRecord(
  investment: Record<string, any>,
  users: Array<Record<string, any> & { id: string }>
) {
  const userIndex = buildUserIdentityIndex(users);
  const linked = resolveLinkedUser(investment, userIndex);
  if (linked) return linked;

  const investorUid = pickText(investment.investorUid, investment.userId, investment.investorId);
  if (!investorUid) return null;

  try {
    const snapshot = await getDoc(doc(db, "users", investorUid));
    return snapshot.exists() ? ({ id: snapshot.id, ...(snapshot.data() as any) } as Record<string, any>) : null;
  } catch {
    return null;
  }
}

async function loadContractRecord(investment: Record<string, any>) {
  const contractId = pickText(investment.contractId);
  if (contractId) {
    try {
      const snapshot = await getDoc(doc(db, "contracts", contractId));
      if (snapshot.exists()) {
        return { id: snapshot.id, ...(snapshot.data() as any) } as Record<string, any>;
      }
    } catch {
      // ignore and continue with query fallback
    }
  }

  try {
    const investmentId = pickText(investment.id);
    if (!investmentId) return null;
    const snapshot = await getDocs(
      query(collection(db, "contracts"), where("investmentId", "==", investmentId), limit(1))
    );
    if (!snapshot.empty) {
      const row = snapshot.docs[0];
      return { id: row.id, ...(row.data() as any) } as Record<string, any>;
    }
  } catch {
    // ignore lookup errors
  }

  return null;
}

async function loadRequestRecord(investment: Record<string, any>) {
  const investorUid = pickText(investment.investorUid, investment.userId, investment.investorId);
  if (!investorUid) return null;

  const resolved = await findInterestRequestForInvestor({
    investorUid,
    requestIds: [
      investment.requestId,
      investment.sourceRequestId,
      investment.sourceMessageId,
    ],
    investmentIds: [investment.id],
  });

  if (resolved) return resolved as Record<string, any>;

  const requestId = normalizeLinkId(
    investment.requestId || investment.sourceRequestId || investment.sourceMessageId
  );
  if (!requestId) return null;

  try {
    const snapshot = await getDoc(doc(db, "interest_requests", requestId));
    return snapshot.exists() ? ({ id: snapshot.id, ...(snapshot.data() as any) } as Record<string, any>) : null;
  } catch {
    return null;
  }
}

async function loadMessageRecord(investment: Record<string, any>) {
  const messageId = normalizeLinkId(investment.sourceMessageId);
  if (!messageId) return null;

  try {
    const snapshot = await getDoc(doc(db, "messages", messageId));
    return snapshot.exists() ? ({ id: snapshot.id, ...(snapshot.data() as any) } as Record<string, any>) : null;
  } catch {
    return null;
  }
}

async function loadDocumentRecords(investmentId: string) {
  if (!investmentId) return [] as CloudflareFileRecord[];

  try {
    const direct = await listDocumentMetadata({
      investmentId,
      limit: 50,
    });
    if (direct.length > 0) return direct;
  } catch {
    // ignore and fall back
  }

  try {
    return await listDocumentMetadata({
      entityType: "investment",
      entityId: investmentId,
      limit: 50,
    });
  } catch {
    return [];
  }
}

function buildTimelineText(
  investment: Record<string, any>,
  requestRecord: Record<string, any> | null,
  contractRecord: Record<string, any> | null,
  messageRecord: Record<string, any> | null,
  settlementStopDate: Date | null
) {
  const events: TimelineEvent[] = [];

  appendEventsFromDoc(events, "request", requestRecord);
  appendEventsFromDoc(events, "investment", investment);
  appendEventsFromDoc(events, "contract", contractRecord);
  appendEventsFromDoc(events, "message", messageRecord);

  pushTimelineEvent(events, {
    type: "request_created",
    title: "استلام الطلب",
    note: null,
    at: toDateSafe(requestRecord?.createdAt || messageRecord?.createdAt),
    source: "system",
  });
  pushTimelineEvent(events, {
    type: "investment_created",
    title: "إنشاء سجل الاستثمار",
    note: null,
    at: toDateSafe(investment.createdAt),
    source: "system",
  });
  pushTimelineEvent(events, {
    type: "contract_prepared",
    title: "تجهيز العقد",
    note: null,
    at: toDateSafe(contractRecord?.createdAt),
    source: "system",
  });
  pushTimelineEvent(events, {
    type: "contract_uploaded",
    title: "إرسال العقد",
    note: null,
    at: toDateSafe(
      investment.originalContract?.uploadedAt ||
        investment.contractFile?.uploadedAt ||
        contractRecord?.issuedAt ||
        contractRecord?.sentAt
    ),
    source: "system",
  });
  pushTimelineEvent(events, {
    type: "contract_signed",
    title: "استلام العقد الموقّع",
    note: null,
    at: toDateSafe(
      investment.signedAt ||
        investment.signedContract?.uploadedAt ||
        investment.signedContractFile?.uploadedAt ||
        contractRecord?.signedAt
    ),
    source: "system",
  });
  pushTimelineEvent(events, {
    type: "contract_verified",
    title: "الاعتماد النهائي",
    note: null,
    at: toDateSafe(investment.verifiedAt || contractRecord?.approvedAt || investment.approvedAt),
    source: "system",
  });
  pushTimelineEvent(events, {
    type: "investment_activated",
    title: "بدء الاستثمار",
    note: null,
    at: toDateSafe(investment.activatedAt || investment.startAt),
    source: "system",
  });
  if (settlementStopDate) {
    pushTimelineEvent(events, {
      type: "investment_stopped",
      title: "تنفيذ الإيقاف",
      note: pickText(investment.stopReason) || null,
      at: settlementStopDate,
      source: "system",
    });
  }
  pushTimelineEvent(events, {
    type: "completed",
    title: "حالة الإغلاق النهائية",
    note: getClientInvestmentStatusMeta(investment.status).label,
    at: toDateSafe(investment.actualEndAt || investment.updatedAt),
    source: "system",
  });

  const sorted = events
    .filter((event) => event.at)
    .sort((left, right) => (left.at?.getTime() || 0) - (right.at?.getTime() || 0));

  if (!sorted.length) return "لا توجد أحداث زمنية موثقة إضافية في السجل الحالي.";

  return sorted
    .map((event) => {
      const parts = [
        `- ${event.title}`,
        event.at ? formatDateTimeValue(event.at) : "",
        event.note ? `ملاحظة: ${event.note}` : "",
      ].filter(Boolean);
      return parts.join(" | ");
    })
    .join("\n");
}

export async function buildInvestmentReportData({
  investment,
  users = [],
  projects = [],
}: ReportBuildInput): Promise<InvestmentReportData> {
  const localProjects = buildProjectsMap(projects);
  const investmentId = pickText(investment.id);
  const [projectRecord, userRecord, contractRecord, requestRecord, messageRecord, documentRecords] =
    await Promise.all([
      loadProjectRecord(investment, projects),
      loadUserRecord(investment, users),
      loadContractRecord(investment),
      loadRequestRecord(investment),
      loadMessageRecord(investment),
      loadDocumentRecords(investmentId),
    ]);

  const projectName =
    getProjectDisplayTitle(projectRecord, investment.projectTitle, "غير متوفر") || "غير متوفر";
  const investmentBusinessId = getInvestmentBusinessId(investment) || "غير متوفر";
  const contractBusinessId =
    getContractBusinessId(contractRecord) ||
    pickText(investment.contractBusinessId) ||
    "غير متوفر";
  const projectFallback =
    projectRecord || localProjects[pickText(investment.projectId)]
      ? getProjectProfitFallback(projectRecord || localProjects[pickText(investment.projectId)])
      : null;
  const settlement = getInvestmentSettlementSnapshot(investment);
  const stoppedEarly = isInvestmentStoppedEarly(investment);
  const metrics = getInvestmentProfitSnapshot(investment, {
    now: new Date(),
    projectFallback,
  });

  const originalContractRecord = resolveDocumentFile(documentRecords, "contract_original", {
    path: pickText(
      investment.originalContract?.path,
      investment.contractFile?.path,
      investment.originalContractPath
    ),
    url: pickText(
      investment.originalContract?.url,
      investment.contractFile?.url,
      investment.originalContractUrl
    ),
    fileName: pickText(
      investment.originalContract?.fileName,
      investment.contractFile?.fileName,
      "original.pdf"
    ),
  });
  const signedContractRecord = resolveDocumentFile(documentRecords, "contract_signed", {
    path: pickText(
      investment.signedContract?.path,
      investment.signedContractFile?.path,
      investment.signedContractPath
    ),
    url: pickText(
      investment.signedContract?.url,
      investment.signedContractFile?.url,
      investment.signedContractUrl
    ),
    fileName: pickText(
      investment.signedContract?.fileName,
      investment.signedContractFile?.fileName,
      "signed.pdf"
    ),
  });
  const settlementRecord = resolveDocumentFile(
    documentRecords,
    INVESTMENT_SETTLEMENT_FILE_CATEGORY,
    {}
  );
  const extraAttachments = documentRecords.filter(
    (record) =>
      !["contract_original", "contract_signed", INVESTMENT_SETTLEMENT_FILE_CATEGORY].includes(
        String(record.category || "")
      )
  );

  const principalAmount =
    settlement?.principalAmount || metrics.principalAmount || toNumber(investment.amount, 0) || 0;
  const contractualExpectedProfit = resolveContractualExpectedProfit(investment, projectRecord);
  const realizedProfit =
    settlement?.calculatedProfit ??
    toNumber(investment.earnedProfit) ??
    (stoppedEarly ? contractualExpectedProfit : metrics.finalProfit);
  const finalPayout =
    settlement?.totalPayout ??
    roundMoney(Math.max(0, principalAmount) + Math.max(0, realizedProfit || 0));
  const annualReturnPercent =
    settlement?.annualProfitRate ??
    toNumber(
      investment.legalTermsSnapshot?.annualReturnPercent,
      investment.annualReturnAtSign,
      investment.customRate,
      projectRecord?.annualReturn
    ) ??
    0;
  const durationMonths =
    toNumber(
      investment.legalTermsSnapshot?.durationMonths,
      investment.durationMonthsAtSign,
      investment.durationMonths,
      projectRecord?.durationMonths,
      projectRecord?.duration
    ) ?? null;
  const startDate =
    settlement?.investmentStartDate ||
    toDateSafe(
      investment.startAt ||
        investment.activatedAt ||
        investment.signedAt ||
        investment.createdAt
    );
  const stopDate =
    settlement?.investmentStopDate ||
    toDateSafe(investment.stoppedAt || investment.withdrawnAt || investment.actualEndAt);
  const actualDurationDays =
    settlement?.investedDays ?? differenceInDays(startDate, stopDate);
  const actualDurationMonths =
    settlement?.actualDurationMonths ??
    (actualDurationDays != null ? actualDurationDays / 30.4375 : null);
  const statusMeta = getClientInvestmentStatusMeta(investment.status);
  const contractStatusMeta = getClientContractStatusMeta(
    pickText(investment.contractStatus, contractRecord?.status)
  );
  const investorName =
    pickText(
      userRecord?.displayName,
      userRecord?.name,
      userRecord?.fullName,
      investment.investorName
    ) || "غير متوفر";
  const investorEmail =
    pickText(
      userRecord?.email,
      userRecord?.profile?.email,
      userRecord?.contact?.email,
      investment.investorEmail
    ) || "غير متوفر";
  const investorPhone =
    pickText(
      userRecord?.phone,
      userRecord?.mobile,
      userRecord?.phoneNumber,
      userRecord?.profile?.phone,
      userRecord?.contact?.phone,
      investment.investorPhone
    ) || "غير متوفر";
  const stoppedBy =
    pickText(
      investment.stoppedByEmail,
      investment.stoppedByUid,
      settlement?.finalizedByEmail,
      settlement?.finalizedByUid
    ) || "غير متوفر";
  const timelineText = buildTimelineText(
    investment,
    requestRecord,
    contractRecord,
    messageRecord,
    stopDate
  );
  const valuesSource = settlement
    ? "القيم النهائية مأخوذة من تسوية محفوظة ومثبتة في السجل."
    : stoppedEarly
      ? "القيم النهائية مستخلصة من الحقول الحالية بعد الإيقاف، ولا يوجد snapshot تسوية مستقل."
      : "القيم محسوبة من شروط الاستثمار المثبتة الحالية داخل النظام.";
  const finalSummaryLines = [
    `تاريخ الدخول: ${formatDateValue(startDate)}`,
    `تاريخ الخروج: ${formatDateValue(stopDate)}`,
    `المدة الفعلية: ${formatDurationLabel(actualDurationDays, actualDurationMonths)}`,
    `أصل الاستثمار: ${formatMoney(principalAmount)}`,
    `الربح النهائي: ${formatMoney(realizedProfit)}`,
    `الحالة النهائية: ${statusMeta.label}`,
    `هل الإيقاف بطلب العميل: ${formatBool(stoppedEarly)}`,
  ].join("\n");

  return {
    platformName: "منصة معدن الاستثمارية",
    title: stoppedEarly ? "تقرير إيقاف الاستثمار" : "تقرير الاستثمار",
    projectName,
    reportDate: formatDateEN(new Date(), {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }),
    reportNumber: `MAADEN-INV-${investmentId.slice(0, 8).toUpperCase()}`,
    amount: formatMoney(principalAmount, 0),
    status: statusMeta.label,
    sections: [
      {
        title: "بيانات العميل",
        items: [
          { label: "الاسم", value: investorName },
          { label: "البريد الإلكتروني", value: investorEmail, span: 2, valueSize: "small" },
          { label: "رقم الجوال", value: investorPhone },
          { label: "رقم الهوية", value: describeIdentityNumber(userRecord) },
          { label: "نوع الحساب", value: describeAccountType(userRecord) },
          {
            label: "مرجع المستخدم",
            value: pickText(userRecord?.id, investment.investorUid, investment.userId) || "غير متوفر",
          },
        ],
      },
      {
        title: "بيانات الاستثمار الأساسية",
        layout: "full",
        items: [
          { label: "رقم الاستثمار", value: investmentBusinessId },
          { label: "اسم المشروع", value: projectName },
          {
            label: "نوع المشروع",
            value: pickText(projectRecord?.projectType, projectRecord?.type) || "غير متوفر",
          },
          { label: "مبلغ الاستثمار", value: formatMoney(principalAmount), tone: "accent" },
          { label: "نسبة الربح", value: formatPercent(annualReturnPercent, 2) },
          { label: "مدة الاستثمار", value: durationMonths != null ? `${durationMonths} شهر` : "غير متوفرة" },
          { label: "تاريخ إنشاء الطلب", value: formatDateTimeValue(requestRecord?.createdAt || messageRecord?.createdAt) },
          { label: "تاريخ إنشاء سجل الاستثمار", value: formatDateTimeValue(investment.createdAt) },
          { label: "تاريخ بدء الاستثمار الفعلي", value: formatDateTimeValue(investment.startAt || investment.activatedAt) },
          { label: "تاريخ توقيع العقد", value: formatDateTimeValue(investment.signedAt || contractRecord?.signedAt) },
          { label: "تاريخ اعتماد العقد", value: formatDateTimeValue(investment.verifiedAt || contractRecord?.approvedAt || investment.approvedAt) },
          { label: "تاريخ التفعيل", value: formatDateTimeValue(investment.activatedAt || investment.startAt) },
          { label: "تاريخ الإيقاف", value: formatDateTimeValue(stopDate) },
          { label: "سبب الإيقاف", value: pickText(investment.stopReason, settlement?.stopReason) || "غير متوفر" },
          { label: "الحالة الحالية", value: statusMeta.label, span: 2 },
        ],
      },
      {
        title: "التسلسل الزمني الكامل",
        layout: "full",
        items: [
          {
            label: "الأحداث الموثقة",
            value: timelineText,
            span: 2,
            valueSize: "small",
            tone: "muted",
          },
        ],
      },
      {
        title: "القسم المالي",
        items: [
          { label: "أصل المبلغ المستثمر", value: formatMoney(principalAmount), tone: "accent", valueSize: "large" },
          { label: "الربح التعاقدي الكامل", value: formatMoney(contractualExpectedProfit) },
          { label: "الأرباح المستحقة حتى تاريخ الإيقاف", value: formatMoney(realizedProfit), tone: "accent" },
          { label: "طريقة احتساب الربح", value: settlement?.policyLabel || "حساب حسب شروط الاستثمار المثبتة", span: 2, valueSize: "small" },
          { label: "صيغة الاحتساب", value: settlement?.formula || pickText(investment.settlementFormula, investment.legalTermsSnapshot?.formula) || "غير متوفرة", span: 2, valueSize: "small" },
          { label: "عدد الأيام الفعلية", value: actualDurationDays != null ? `${actualDurationDays} يوم` : "غير متوفر" },
          { label: "عدد الأشهر الفعلية", value: actualDurationMonths != null ? `${actualDurationMonths.toFixed(2)} شهر` : "غير متوفر" },
          { label: "تاريخ الدخول", value: formatDateValue(startDate) },
          { label: "تاريخ الخروج", value: formatDateValue(stopDate) },
          { label: "هل الخروج مبكر", value: formatBool(stoppedEarly) },
          {
            label: "هل الربح كامل أو جزئي",
            value:
              stoppedEarly && realizedProfit < contractualExpectedProfit
                ? "جزئي - خروج مبكر قبل نهاية المدة التعاقدية"
                : "كامل أو مطابق للقيمة النهائية المثبتة",
          },
          {
            label: "خصومات / تسويات / ملاحظات مالية",
            value: settlement ? "تمت تسوية المبلغ النهائي ضمن snapshot التسوية المحفوظ." : "لا توجد خصومات أو تسويات إضافية مسجلة.",
            span: 2,
            valueSize: "small",
          },
          { label: "الإجمالي النهائي المستحق للعميل", value: formatMoney(finalPayout), tone: "accent", valueSize: "large" },
          { label: "مصدر القيم", value: valuesSource, span: 2, valueSize: "small", tone: "muted" },
        ],
      },
      {
        title: "بيانات العقد والمرفقات",
        items: [
          { label: "حالة العقد", value: contractStatusMeta.label },
          { label: "رقم العقد", value: contractBusinessId },
          { label: "هل يوجد عقد أصلي", value: formatBool(Boolean(originalContractRecord)) },
          { label: "هل يوجد عقد موقّع", value: formatBool(Boolean(signedContractRecord)) },
          {
            label: "العقد الأصلي",
            value: describeFileRecord("العقد الأصلي", originalContractRecord),
            span: 2,
            valueSize: "small",
          },
          {
            label: "العقد الموقّع",
            value: describeFileRecord("العقد الموقّع", signedContractRecord),
            span: 2,
            valueSize: "small",
          },
          {
            label: "مستند التسوية",
            value: describeFileRecord("مستند التسوية", settlementRecord),
            span: 2,
            valueSize: "small",
          },
          {
            label: "المرفقات الأخرى",
            value: describeFiles(extraAttachments),
            span: 2,
            valueSize: "small",
            tone: "muted",
          },
        ],
      },
      {
        title: "بيانات إدارية",
        items: [
          { label: "من نفذ الإيقاف", value: stoppedBy },
          { label: "تاريخ تنفيذ الإيقاف", value: formatDateTimeValue(stopDate || settlement?.finalizedAt) },
          { label: "آخر تحديث", value: formatDateTimeValue(investment.updatedAt) },
          {
            label: "ملاحظات إدارية",
            value: pickText(investment.stopReason, settlement?.stopReason) || "لا توجد ملاحظات إدارية إضافية محفوظة.",
            span: 2,
            valueSize: "small",
          },
        ],
      },
      {
        title: "ملخص نهائي",
        layout: "full",
        items: [
          {
            label: "الخلاصة التنفيذية",
            value: finalSummaryLines,
            span: 2,
            valueSize: "small",
          },
        ],
      },
    ],
    footer:
      "منصة معدن الاستثمارية | التقرير يعتمد فقط على البيانات المخزنة فعليًا في النظام وقت التصدير.",
  };
}
