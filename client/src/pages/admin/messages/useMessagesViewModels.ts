import { createElement, useMemo, type ReactNode } from "react";
import { getProjectDisplayTitleById } from "@/lib/projectDisplay";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { type DetailSecondaryTabKey } from "./MessagesDetailView";

type ListViewKey = "all" | "new" | "archived" | "open" | "completed" | "rejected";
type RequestKindViewKey = "all" | "investment" | "interest";
type WorkflowStepKey =
  | "review_start"
  | "investment_creation"
  | "contract_upload"
  | "request_completion";

type DetailAction = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
  className: string;
};

const DETAIL_BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50";
const DETAIL_SOLID_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 text-white shadow-[0_18px_38px_-24px_rgba(15,23,42,0.3)]`;
const DETAIL_DANGER_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 bg-rose-600 text-white shadow-[0_18px_38px_-24px_rgba(225,29,72,0.38)] hover:bg-rose-500`;

type MessagesListViewModelHelpers = {
  resolveRequestClient: (source: any, userIdentityIndex: any) => any;
  pick: (...vals: any[]) => any;
  toNum: (value: any) => number;
  getRequestStatusMeta: (status: any) => any;
  getRequestStageMeta: (stageRole: any) => any;
  getRequestKindMeta: (input: {
    type?: any;
    source?: any;
    projectStatus?: any;
    amount?: number;
  }) => any;
  getRequestTrackingMeta: (request: any, requestKindKey?: string) => any;
  getRequestTrackingSlaMeta: (request: any, requestKindKey?: string) => any;
  getRequestTrackingPriority: (request: any, requestKindKey?: string) => number;
  getInterestTrackingMeta: (request: any) => any;
  toDateSafe: (value: any) => Date | null;
  getLastUpdatedAtValue: (message: any) => Date | null;
  requestNumber: (message: any) => string;
  formatDateTimeAR: (value: any) => string;
  formatRequestTimeLabel: (value: any) => string;
  lastTouchedBy: (message: any) => string;
  resolveLastActorMeta: (source: any, userIdentityIndex: any, client: any) => any;
  getRequestCardStatusClass: (status: any) => string;
  getRequestSummary: (message: any) => string;
  getClientEmail: (message: any) => string;
  getClientPhone: (message: any) => string;
  normalizeSearchValue: (...values: any[]) => string;
  isNewRequestRecord: (request: any) => boolean;
  isArchivedRequestRecord: (request: any) => boolean;
  normalizeRequestStatus: (status: any) => string;
  buildRequestTimelineEvents: (input: {
    request: any;
    userIdentityIndex: any;
    client: any;
    requestKind: any;
  }) => any[];
};

type UseMessagesViewModelsInput = {
  normalized: any[];
  selectedMessage: any;
  userIdentityIndex: any;
  projectsMap: Record<string, any>;
  deferredSearchQuery: string;
  requestKindView: RequestKindViewKey;
  view: ListViewKey;
  helpers: MessagesListViewModelHelpers;
};

export function useMessagesViewModels({
  normalized,
  selectedMessage,
  userIdentityIndex,
  projectsMap,
  deferredSearchQuery,
  requestKindView,
  view,
  helpers,
}: UseMessagesViewModelsInput) {
  const getProjectTitle = (projectId: any) =>
    getProjectDisplayTitleById(projectsMap, projectId, "\u2014") || "\u2014";

  const getProjectRemaining = (projectId: any) => {
    const pid = String(projectId || "");
    if (!pid) return null;
    const p = projectsMap[pid];
    if (!p) return null;

    const target = helpers.toNum(p?.targetAmount);
    const current = helpers.toNum(p?.currentAmount);
    if (!target) return null;
    return Math.max(0, target - current);
  };

  const requestRows = useMemo(() => {
    const rows = normalized.map(message => {
      const client = helpers.resolveRequestClient(message, userIdentityIndex);
      const projectId = helpers.pick(
        message?.projectId,
        message?.project_id,
        message?.project?.id
      );
      const projectStatus = helpers.pick(
        message?.projectStatus,
        message?.projectSnapshot?.status,
        message?.project?.status,
        projectsMap[String(projectId || "")]?.status
      );
      const amount =
        helpers.toNum(message?.approvedAmount) ||
        helpers.toNum(message?.amount) ||
        helpers.toNum(message?.requestedAmount) ||
        helpers.toNum(message?.estimatedAmount) ||
        0;
      const remaining = getProjectRemaining(projectId);
      const statusMeta = helpers.getRequestStatusMeta(message.status);
      const stageMeta = helpers.getRequestStageMeta(message.stageRole);
      const requestKind = helpers.getRequestKindMeta({
        type: helpers.pick(message?.type, message?.requestType),
        source: message?.source,
        projectStatus,
        amount,
      });
      const trackingMeta = helpers.getRequestTrackingMeta(message, requestKind.key);
      const trackingSlaMeta = helpers.getRequestTrackingSlaMeta(
        message,
        requestKind.key
      );
      const trackingPriority = helpers.getRequestTrackingPriority(
        message,
        requestKind.key
      );
      const interestReviewMeta =
        requestKind.key === "interest"
          ? helpers.getInterestTrackingMeta(message)
          : null;
      const requestDateValue = helpers.toDateSafe(
        message.createdAt ||
          message.created_at ||
          message.submittedAt ||
          message.timestamp
      );
      const updatedAtValue = helpers.getLastUpdatedAtValue(message);
      const projectTitle = getProjectTitle(projectId);

      return {
        ...message,
        client,
        projectId,
        projectTitle,
        amount,
        remaining,
        exceeded: remaining != null ? amount > remaining : false,
        requestIdLabel: helpers.requestNumber(message),
        requestDateValue,
        requestDateLabel: helpers.formatDateTimeAR(requestDateValue),
        requestTimeLabel: helpers.formatRequestTimeLabel(requestDateValue),
        updatedAtValue,
        updatedAtLabel: helpers.formatDateTimeAR(updatedAtValue),
        updatedTimeLabel: helpers.formatRequestTimeLabel(
          updatedAtValue || requestDateValue
        ),
        touchedBy: helpers.lastTouchedBy(message),
        lastActor: helpers.resolveLastActorMeta(
          message,
          userIdentityIndex,
          client
        ),
        cardStatusClass: helpers.getRequestCardStatusClass(message.status),
        trackingMeta,
        trackingSlaMeta,
        trackingPriority,
        statusMeta,
        stageMeta,
        requestKind,
        interestReviewMeta,
        summary: helpers.getRequestSummary(message),
        searchIndex: helpers.normalizeSearchValue(
          client.clientName,
          client.clientEmail,
          client.clientPhone,
          projectTitle,
          helpers.requestNumber(message),
          statusMeta.label,
          trackingMeta.label,
          trackingSlaMeta?.label,
          stageMeta.label,
          client.sourceLabel,
          requestKind.label,
          requestKind.shortLabel,
          interestReviewMeta?.label
        ),
      };
    });

    return rows.sort((a, b) => {
      const rankDiff = (a.trackingPriority || 0) - (b.trackingPriority || 0);
      if (rankDiff !== 0) return rankDiff;

      const aTime =
        a.updatedAtValue instanceof Date ? a.updatedAtValue.getTime() : 0;
      const bTime =
        b.updatedAtValue instanceof Date ? b.updatedAtValue.getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;

      const aCreated =
        a.requestDateValue instanceof Date ? a.requestDateValue.getTime() : 0;
      const bCreated =
        b.requestDateValue instanceof Date ? b.requestDateValue.getTime() : 0;
      return bCreated - aCreated;
    });
  }, [normalized, userIdentityIndex, projectsMap, helpers]);

  const filtered = useMemo(() => {
    const matchesView = (message: any) => {
      if (view === "all") return true;
      if (view === "new" || view === "open") {
        return helpers.isNewRequestRecord(message);
      }
      if (view === "archived" || view === "completed") {
        return helpers.isArchivedRequestRecord(message);
      }
      if (view === "rejected") {
        return helpers.normalizeRequestStatus(message.status) === "rejected";
      }
      return true;
    };

    return requestRows.filter(message => {
      if (!matchesView(message)) return false;
      if (
        requestKindView !== "all" &&
        message.requestKind?.key !== requestKindView
      ) {
        return false;
      }
      if (!deferredSearchQuery) return true;
      return message.searchIndex.includes(deferredSearchQuery);
    });
  }, [deferredSearchQuery, helpers, requestKindView, requestRows, view]);

  const newRequests = useMemo(
    () => filtered.filter(message => helpers.isNewRequestRecord(message)),
    [filtered, helpers]
  );

  const archivedRequests = useMemo(
    () => filtered.filter(message => helpers.isArchivedRequestRecord(message)),
    [filtered, helpers]
  );

  const stats = useMemo(() => {
    const all = requestRows;
    const nextNew = all.filter(message => helpers.isNewRequestRecord(message));
    const archived = all.filter(message =>
      helpers.isArchivedRequestRecord(message)
    );
    const rejected = all.filter(
      message => helpers.normalizeRequestStatus(message.status) === "rejected"
    );

    return {
      all: all.length,
      new: nextNew.length,
      archived: archived.length,
      open: nextNew.length,
      completed: archived.length,
      rejected: rejected.length,
      newInvestment: nextNew.filter(
        message => message.requestKind?.key === "investment"
      ).length,
      newInterest: nextNew.filter(
        message => message.requestKind?.key === "interest"
      ).length,
    };
  }, [helpers, requestRows]);

  const statusCounters = useMemo(
    () => ({
      pending: requestRows.filter(message => message.status === "pending")
        .length,
      reviewing: requestRows.filter(message => message.status === "reviewing")
        .length,
      approved: requestRows.filter(message => message.status === "approved")
        .length,
      completed: requestRows.filter(message =>
        ["completed", "closed"].includes(String(message.status || ""))
      ).length,
    }),
    [requestRows]
  );

  const clientSourceCounters = useMemo(
    () => ({
      live: requestRows.filter(
        message => message.client.sourceKey === "live_user"
      ).length,
      requestSnapshot: requestRows.filter(
        message => message.client.sourceKey === "request_snapshot"
      ).length,
      unknown: requestRows.filter(
        message => message.client.sourceKey === "unknown"
      ).length,
    }),
    [requestRows]
  );

  const requestKindCounters = useMemo(
    () => ({
      investment: requestRows.filter(
        message => message.requestKind?.key === "investment"
      ).length,
      interest: requestRows.filter(
        message => message.requestKind?.key === "interest"
      ).length,
    }),
    [requestRows]
  );

  const selectedClient = useMemo(
    () =>
      selectedMessage
        ? helpers.resolveRequestClient(selectedMessage, userIdentityIndex)
        : null,
    [helpers, selectedMessage, userIdentityIndex]
  );

  const selectedRequestKind = useMemo(() => {
    if (!selectedMessage) return null;

    const selectedProjectStatus = helpers.pick(
      selectedMessage?.projectStatus,
      selectedMessage?.projectSnapshot?.status,
      selectedMessage?.project?.status,
      projectsMap[
        String(
          helpers.pick(
            selectedMessage?.projectId,
            selectedMessage?.project_id,
            selectedMessage?.project?.id
          ) || ""
        )
      ]?.status
    );
    const selectedAmount =
      helpers.toNum(selectedMessage?.approvedAmount) ||
      helpers.toNum(selectedMessage?.amount) ||
      helpers.toNum(selectedMessage?.requestedAmount) ||
      helpers.toNum(selectedMessage?.estimatedAmount) ||
      0;

    return helpers.getRequestKindMeta({
      type: helpers.pick(selectedMessage?.type, selectedMessage?.requestType),
      source: selectedMessage?.source,
      projectStatus: selectedProjectStatus,
      amount: selectedAmount,
    });
  }, [helpers, projectsMap, selectedMessage]);

  const selectedInterestReviewMeta = useMemo(
    () =>
      selectedRequestKind?.key === "interest" && selectedMessage
        ? helpers.getInterestTrackingMeta(selectedMessage)
        : null,
    [helpers, selectedMessage, selectedRequestKind]
  );

  const isSelectedInvestmentRequest = selectedRequestKind?.key === "investment";
  const isSelectedInterestRequest = selectedRequestKind?.key === "interest";

  const selectedProjectId = helpers.pick(
    selectedMessage?.projectId,
    selectedMessage?.project_id,
    selectedMessage?.project?.id
  );
  const selectedProjectTitle =
    getProjectDisplayTitleById(projectsMap, selectedProjectId, "\u2014") ||
    "\u2014";
  const selectedAmount =
    helpers.toNum(selectedMessage?.approvedAmount) ||
    helpers.toNum(selectedMessage?.amount) ||
    helpers.toNum(selectedMessage?.requestedAmount) ||
    helpers.toNum(selectedMessage?.estimatedAmount) ||
    0;
  const selectedRemaining = getProjectRemaining(selectedProjectId);
  const selectedAmountExceeded =
    selectedRemaining != null ? selectedAmount > selectedRemaining : false;
  const selectedRequestSummary = helpers.getRequestSummary(selectedMessage);
  const selectedContactEmail =
    selectedClient?.clientEmail || helpers.getClientEmail(selectedMessage);
  const selectedContactPhone =
    selectedClient?.clientPhone || helpers.getClientPhone(selectedMessage);
  const selectedCreatedAtValue = helpers.toDateSafe(
    selectedMessage?.createdAt ||
      selectedMessage?.created_at ||
      selectedMessage?.submittedAt ||
      selectedMessage?.timestamp
  );
  const selectedUpdatedAtValue = helpers.getLastUpdatedAtValue(selectedMessage);
  const selectedTrackingMeta = useMemo(
    () =>
      selectedMessage
        ? helpers.getRequestTrackingMeta(selectedMessage, selectedRequestKind?.key)
        : null,
    [helpers, selectedMessage, selectedRequestKind?.key]
  );

  const selectedStatusMeta = useMemo(() => {
    if (!selectedMessage) return null;
    if (selectedRequestKind?.key === "interest") {
      const selectedInterestReviewMeta = helpers.getInterestTrackingMeta(
        selectedMessage
      );
      return {
        label: selectedInterestReviewMeta?.label || "جديimage.pngد",
        tone:
          selectedInterestReviewMeta?.tone ||
          "border-amber-200 bg-amber-50 text-amber-800",
        accent: selectedInterestReviewMeta?.accent || "bg-amber-500",
      };
    }
    return helpers.getRequestStatusMeta(selectedMessage.status);
  }, [helpers, selectedMessage, selectedRequestKind]);

  const selectedStageMeta = useMemo(
    () =>
      selectedMessage
        ? helpers.getRequestStageMeta(selectedMessage.stageRole)
        : null,
    [helpers, selectedMessage]
  );

  const selectedTrackingSlaMeta = useMemo(
    () =>
      selectedMessage
        ? helpers.getRequestTrackingSlaMeta(
            selectedMessage,
            selectedRequestKind?.key
          )
        : null,
    [helpers, selectedMessage, selectedRequestKind?.key]
  );

  const selectedLastActor = useMemo(
    () =>
      selectedMessage && selectedClient
        ? helpers.resolveLastActorMeta(
            selectedMessage,
            userIdentityIndex,
            selectedClient
          )
        : null,
    [helpers, selectedClient, selectedMessage, userIdentityIndex]
  );

  const selectedTimelineEvents = useMemo(
    () =>
      selectedMessage && selectedClient && selectedRequestKind
        ? helpers.buildRequestTimelineEvents({
            request: selectedMessage,
            userIdentityIndex,
            client: selectedClient,
            requestKind: selectedRequestKind.key,
          })
        : [],
    [helpers, selectedClient, selectedMessage, selectedRequestKind, userIdentityIndex]
  );

  return {
    requestRows,
    filtered,
    newRequests,
    archivedRequests,
    stats,
    statusCounters,
    clientSourceCounters,
    requestKindCounters,
    selectedClient,
    selectedRequestKind,
    selectedProjectId,
    selectedProjectTitle,
    selectedAmount,
    selectedRemaining,
    selectedAmountExceeded,
    selectedRequestSummary,
    selectedContactEmail,
    selectedContactPhone,
    selectedCreatedAtValue,
    selectedUpdatedAtValue,
    selectedTrackingMeta,
    selectedTrackingSlaMeta,
    selectedStatusMeta,
    selectedStageMeta,
    selectedLastActor,
    selectedTimelineEvents,
    selectedInterestReviewMeta,
    isSelectedInvestmentRequest,
    isSelectedInterestRequest,
  };
}

type UseMessagesWorkflowDisplayModelInput = {
  selectedMessage: any;
  selectedRequestKind: any;
  selectedInterestReviewMeta: any;
  selectedStatusMeta: any;
  selectedStageMeta: any;
  selectedProjectTitle: any;
  selectedUpdatedAtValue: any;
  selectedRequestStatus: string;
  selectedInvestmentStatus: string;
  contractStatusValue: string;
  hasCurrentSignedContract: boolean;
  hasOriginalContract: boolean;
  hasSignedContract: boolean;
  isLockedFinal: boolean;
  isSelectedInvestmentRequest: boolean;
  isSelectedInterestRequest: boolean;
  canStartRequestReview: boolean;
  canInitialApproveRequest: boolean;
  canCreateInvestmentFromRequest: boolean;
  canVerifySignedContract: boolean;
  canFinalize: boolean;
  canAdmin: boolean;
  canManageInvestments: boolean;
  canManageMessages: boolean;
  myRole: string;
  internalNotes: string;
  hasOperationalInvestmentStarted: boolean;
  approveCreateBusy: boolean;
  finalizeBusy: boolean;
  activateInvestmentAfterApproval: () => void;
  verifySignedContract: () => void;
  approveRequestAndCreateInvestment: () => void;
  initialApproveRequest: () => void;
  startRequestReview: () => void;
  rejectInvestmentRequest: () => void;
  requestNumber: (message: any) => string;
  formatDateTimeAR: (value: any) => string;
  formatRequestTimeLabel: (value: any) => string;
};

export function useMessagesWorkflowDisplayModel({
  selectedMessage,
  selectedRequestKind,
  selectedInterestReviewMeta,
  selectedStatusMeta,
  selectedStageMeta,
  selectedProjectTitle,
  selectedUpdatedAtValue,
  selectedRequestStatus,
  selectedInvestmentStatus,
  contractStatusValue,
  hasCurrentSignedContract,
  hasOriginalContract,
  hasSignedContract,
  isLockedFinal,
  isSelectedInvestmentRequest,
  isSelectedInterestRequest,
  canStartRequestReview,
  canInitialApproveRequest,
  canCreateInvestmentFromRequest,
  canVerifySignedContract,
  canFinalize,
  canAdmin,
  canManageInvestments,
  canManageMessages,
  myRole,
  internalNotes,
  hasOperationalInvestmentStarted,
  approveCreateBusy,
  finalizeBusy,
  activateInvestmentAfterApproval,
  verifySignedContract,
  approveRequestAndCreateInvestment,
  initialApproveRequest,
  startRequestReview,
  rejectInvestmentRequest,
  requestNumber,
  formatDateTimeAR,
  formatRequestTimeLabel,
}: UseMessagesWorkflowDisplayModelInput) {
  const selectedNextActionSummary = useMemo(() => {
    if (!selectedMessage || !selectedRequestKind) {
      return {
        label: "لا توجد بيانات متاحة",
        helper: "تعذر تحديد الإجراء التالي لهذا الطلب.",
        needsAction: false,
      };
    }

    if (isLockedFinal) {
      return {
        label: "لا يوجد إجراء مطلوب",
        helper: "الطلب مقفل بعد اكتمال الدورة الحالية.",
        needsAction: false,
      };
    }

    if (selectedRequestStatus === "rejected") {
      return {
        label: "تم رفض الطلب",
        helper: "يمكن مراجعة السجل أو إعادة فتحه من المسؤول التقني عند الحاجة.",
        needsAction: false,
      };
    }

    if (isSelectedInterestRequest) {
      if (!selectedMessage?.adminSeenAt) {
        return {
          label: "يلزم الاطلاع الأول",
          helper:
            "هذا طلب اهتمام تمهيدي، ويكفي الاطلاع عليه وتوثيق ملاحظات أو بدء تواصل مناسب مع العميل.",
          needsAction: true,
        };
      }

      return {
        label: "متابعة اهتمام خفيفة",
        helper:
          "تم تسجيل الاطلاع على الطلب. يمكن الآن فتح ملف العميل أو المشروع ومتابعة التواصل عند الحاجة.",
        needsAction: false,
      };
    }

    if (canFinalize) {
      return {
        label: "جاهز للإقفال النهائي",
        helper:
          "جميع متطلبات الاستثمار المكتملة ظاهرة في السجل، ويمكن تنفيذ الإقفال النهائي من الإجراءات المتاحة.",
        needsAction: true,
      };
    }

    if (canVerifySignedContract) {
      return {
        label: "اعتماد العقد الموقّع",
        helper:
          "العقد الموقّع مرفوع وجاهز للاعتماد قبل الانتقال إلى الإقفال النهائي.",
        needsAction: true,
      };
    }

    if (canCreateInvestmentFromRequest) {
      return {
        label: "إنشاء سجل الاستثمار",
        helper:
          "اكتملت الموافقة الأولية، ويمكن الآن تحويل الطلب إلى سجل استثمار فعلي داخل النظام.",
        needsAction: true,
      };
    }

    if (canInitialApproveRequest) {
      return {
        label: "موافقة أولية مطلوبة",
        helper:
          "الطلب في مرحلة المراجعة ويمكن ترحيله إلى الموافقة الأولية تمهيدًا لإنشاء الاستثمار.",
        needsAction: true,
      };
    }

    if (canStartRequestReview) {
      return {
        label: "بدء المراجعة",
        helper:
          "هذا طلب استثمار جديد وبانتظار بدء المعالجة الداخلية من الفريق المختص.",
        needsAction: true,
      };
    }

    if (selectedMessage?.investmentId) {
      return {
        label: "متابعة دورة الاستثمار",
        helper:
          "تم إنشاء سجل الاستثمار لهذا الطلب، ويمكن متابعة المستندات والحالة من القسم المخصص.",
        needsAction: false,
      };
    }

    return {
      label: "متابعة داخلية",
      helper:
        "لا توجد خطوة تلقائية مباشرة الآن، لكن ما زال الطلب ضمن الدورة النشطة ويتطلب مراجعة الفريق.",
      needsAction: false,
    };
  }, [
    canCreateInvestmentFromRequest,
    canFinalize,
    canInitialApproveRequest,
    canStartRequestReview,
    canVerifySignedContract,
    isLockedFinal,
    isSelectedInterestRequest,
    selectedMessage,
    selectedRequestKind,
    selectedRequestStatus,
  ]);

  const isArchiveMode = useMemo(() => {
    if (!selectedMessage) return false;

    if (["completed", "closed", "rejected"].includes(selectedRequestStatus)) {
      return true;
    }

    return isSelectedInterestRequest && Boolean(selectedMessage?.adminSeenAt);
  }, [
    isSelectedInterestRequest,
    selectedMessage,
    selectedMessage?.adminSeenAt,
    selectedRequestStatus,
  ]);
  const isActiveMode = !!selectedMessage && !isArchiveMode;

  const archiveResultMeta = useMemo(() => {
    if (!selectedMessage) {
      return {
        title: "سجل منتهي",
        helper: "هذا السجل خرج من دائرة المتابعة الحالية.",
      };
    }

    if (selectedRequestStatus === "rejected") {
      return {
        title: "تم رفض الطلب",
        helper: "انتقل هذا السجل إلى الأرشيف، ويمكن الرجوع إلى السجل الزمني أو المستندات عند الحاجة.",
      };
    }

    if (selectedRequestStatus === "closed") {
      return {
        title: "الطلب مغلق",
        helper: "اكتملت الدورة الحالية لهذا السجل وأصبح مرجعًا تاريخيًا فقط.",
      };
    }

    if (isSelectedInterestRequest && selectedMessage?.adminSeenAt) {
      return {
        title: "تمت مراجعة الاهتمام",
        helper:
          selectedInterestReviewMeta?.helperText ||
          "لم يعد هذا الاهتمام ضمن المتابعة الفورية، ويمكن الرجوع إليه من السجل عند الحاجة.",
      };
    }

    return {
      title: "اكتملت دورة الطلب",
      helper: "هذا السجل لم يعد ضمن الواجهة التشغيلية الأساسية، ويظهر هنا كمرجع تاريخي.",
    };
  }, [
    isSelectedInterestRequest,
    selectedInterestReviewMeta?.helperText,
    selectedMessage,
    selectedMessage?.adminSeenAt,
    selectedRequestStatus,
  ]);

  const detailPrimaryAction = useMemo<DetailAction | null>(() => {
    if (!isActiveMode) return null;

    if (canFinalize) {
      return {
        key: "finalize",
        label: "إكمال الطلب",
        onClick: activateInvestmentAfterApproval,
        disabled: isLockedFinal || finalizeBusy,
        icon: finalizeBusy
          ? createElement(Loader2, { className: "h-4 w-4 animate-spin" })
          : createElement(Building2, { className: "h-4 w-4" }),
        className: `${DETAIL_SOLID_BUTTON_CLASS} bg-emerald-700 hover:bg-emerald-800`,
      };
    }

    if (canVerifySignedContract) {
      return {
        key: "verify_contract",
        label: "اعتماد العقد",
        onClick: verifySignedContract,
        disabled: isLockedFinal || finalizeBusy,
        icon: finalizeBusy
          ? createElement(Loader2, { className: "h-4 w-4 animate-spin" })
          : createElement(ShieldCheck, { className: "h-4 w-4" }),
        className: `${DETAIL_SOLID_BUTTON_CLASS} bg-amber-700 hover:bg-amber-800`,
      };
    }

    if (canCreateInvestmentFromRequest) {
      return {
        key: "create_investment",
        label: "إنشاء الاستثمار",
        onClick: approveRequestAndCreateInvestment,
        disabled: approveCreateBusy || isLockedFinal,
        icon: approveCreateBusy
          ? createElement(Loader2, { className: "h-4 w-4 animate-spin" })
          : createElement(CheckCircle2, { className: "h-4 w-4" }),
        className: `${DETAIL_SOLID_BUTTON_CLASS} bg-blue-700 hover:bg-blue-800`,
      };
    }

    if (canInitialApproveRequest) {
      return {
        key: "initial_approve",
        label: "موافقة أولية",
        onClick: initialApproveRequest,
        disabled: isLockedFinal,
        icon: createElement(ShieldCheck, { className: "h-4 w-4" }),
        className: `${DETAIL_SOLID_BUTTON_CLASS} bg-indigo-700 hover:bg-indigo-800`,
      };
    }

    if (canStartRequestReview) {
      return {
        key: "start_review",
        label: "بدء المراجعة",
        onClick: startRequestReview,
        disabled: isLockedFinal,
        icon: createElement(Clock3, { className: "h-4 w-4" }),
        className: `${DETAIL_SOLID_BUTTON_CLASS} bg-yellow-700 hover:bg-yellow-800`,
      };
    }

    return null;
  }, [
    approveCreateBusy,
    canCreateInvestmentFromRequest,
    canFinalize,
    canInitialApproveRequest,
    canStartRequestReview,
    canVerifySignedContract,
    finalizeBusy,
    isActiveMode,
    isLockedFinal,
  ]);

  const detailSecondaryAction = useMemo<DetailAction | null>(() => {
    if (
      !isActiveMode ||
      !isSelectedInvestmentRequest ||
      !canManageMessages ||
      isArchiveMode
    ) {
      return null;
    }

    return {
      key: "reject",
      label: "رفض الطلب",
      onClick: rejectInvestmentRequest,
      disabled: isLockedFinal || !canManageMessages,
      icon: createElement(AlertTriangle, { className: "h-4 w-4" }),
      className: DETAIL_DANGER_BUTTON_CLASS,
    };
  }, [
    canManageMessages,
    isActiveMode,
    isArchiveMode,
    isLockedFinal,
    isSelectedInvestmentRequest,
  ]);

  const showDocumentsTab =
    isSelectedInvestmentRequest ||
    !!selectedMessage?.investmentId ||
    hasOriginalContract ||
    hasSignedContract;
  const canEditInternalNotes =
    canManageMessages && myRole !== "client" && isActiveMode;
  const hasStoredInternalNotes = Boolean(String(internalNotes || "").trim());
  const showInternalNotesTab =
    canManageMessages &&
    myRole !== "client" &&
    (canEditInternalNotes || hasStoredInternalNotes);
  const showArchiveContractUpload =
    isArchiveMode &&
    canAdmin &&
    canManageInvestments &&
    !!selectedMessage?.investmentId &&
    !hasOperationalInvestmentStarted;
  const showStopInvestmentAdvancedAction =
    isArchiveMode &&
    !!selectedMessage?.investmentId &&
    hasOperationalInvestmentStarted;
  const showReopenAdvancedAction =
    isArchiveMode &&
    isSelectedInvestmentRequest &&
    myRole === "owner" &&
    canManageMessages;
  const showAdvancedActions =
    showArchiveContractUpload ||
    showReopenAdvancedAction ||
    showStopInvestmentAdvancedAction;
  const availableDetailTabs = useMemo<DetailSecondaryTabKey[]>(
    () => [
      "context",
      "timeline",
      ...(showDocumentsTab ? (["documents"] as DetailSecondaryTabKey[]) : []),
      ...(showInternalNotesTab
        ? (["internal_notes"] as DetailSecondaryTabKey[])
        : []),
    ],
    [showDocumentsTab, showInternalNotesTab]
  );

  const workflowSteps = useMemo(
    () =>
      !selectedMessage || !isSelectedInvestmentRequest
        ? []
        : [
            {
              key: "review_start" as WorkflowStepKey,
              label: "بدء المراجعة",
              helper: "استلام الطلب وبدء معالجته داخليًا.",
              targetTab: "context" as DetailSecondaryTabKey,
              icon: createElement(Clock3, { className: "h-4 w-4" }),
            },
            {
              key: "investment_creation" as WorkflowStepKey,
              label: "إنشاء الاستثمار",
              helper: "اعتماد الطلب وتجهيز سجل الاستثمار داخل النظام.",
              targetTab: "context" as DetailSecondaryTabKey,
              icon: createElement(CheckCircle2, { className: "h-4 w-4" }),
            },
            {
              key: "contract_upload" as WorkflowStepKey,
              label: "رفع العقد",
              helper: "متابعة المستندات ورفع العقد الأصلي من التبويب المخصص.",
              targetTab: showDocumentsTab
                ? ("documents" as DetailSecondaryTabKey)
                : ("context" as DetailSecondaryTabKey),
              icon: createElement(Upload, { className: "h-4 w-4" }),
            },
            {
              key: "request_completion" as WorkflowStepKey,
              label: "إكمال الطلب",
              helper: "اعتماد العقد ثم إقفال الدورة الحالية لهذا الطلب.",
              targetTab: isArchiveMode
                ? ("timeline" as DetailSecondaryTabKey)
                : showDocumentsTab
                  ? ("documents" as DetailSecondaryTabKey)
                  : ("timeline" as DetailSecondaryTabKey),
              icon: createElement(Building2, { className: "h-4 w-4" }),
            },
          ],
    [isArchiveMode, isSelectedInvestmentRequest, selectedMessage, showDocumentsTab]
  );
  const workflowCurrentStepKey = useMemo<WorkflowStepKey | null>(() => {
    if (!selectedMessage || !isSelectedInvestmentRequest) return null;

    const hasInvestmentRecord = Boolean(selectedMessage?.investmentId);
    const normalizedStageRole = String(selectedMessage?.stageRole || "")
      .trim()
      .toLowerCase();
    const isCompletionStageData =
      ["completed", "closed"].includes(selectedRequestStatus) ||
      selectedInvestmentStatus === "active" ||
      selectedInvestmentStatus === "signed" ||
      contractStatusValue === "approved" ||
      (hasCurrentSignedContract &&
        ["under_review", "signed", "approved"].includes(contractStatusValue));

    if (selectedRequestStatus === "pending") {
      return "review_start";
    }

    if (selectedRequestStatus === "rejected") {
      if (isCompletionStageData) {
        return "request_completion";
      }

      if (hasInvestmentRecord || hasOriginalContract || hasSignedContract) {
        return "contract_upload";
      }

      return ["reviewer", "review", "staff", "accountant", "investment"].includes(
        normalizedStageRole
      )
        ? "investment_creation"
        : "review_start";
    }

    if (!hasInvestmentRecord) {
      return "investment_creation";
    }

    if (isCompletionStageData) {
      return "request_completion";
    }

    return "contract_upload";
  }, [
    contractStatusValue,
    hasCurrentSignedContract,
    hasOriginalContract,
    hasSignedContract,
    isSelectedInvestmentRequest,
    selectedInvestmentStatus,
    selectedMessage,
    selectedRequestStatus,
  ]);
  const workflowCurrentStepIndex = workflowCurrentStepKey
    ? workflowSteps.findIndex(step => step.key === workflowCurrentStepKey)
    : -1;
  const workflowCurrentStepMeta =
    workflowCurrentStepIndex >= 0 ? workflowSteps[workflowCurrentStepIndex] : null;
  const workflowNextStepMeta =
    workflowCurrentStepIndex >= 0 &&
    workflowCurrentStepIndex < workflowSteps.length - 1
      ? workflowSteps[workflowCurrentStepIndex + 1]
      : null;
  const workflowPreferredTab = useMemo<DetailSecondaryTabKey>(() => {
    if (!workflowCurrentStepKey) {
      return isArchiveMode ? "timeline" : "context";
    }

    switch (workflowCurrentStepKey) {
      case "review_start":
      case "investment_creation":
        return "context";
      case "contract_upload":
        return showDocumentsTab ? "documents" : "context";
      case "request_completion":
      default:
        return isArchiveMode
          ? "timeline"
          : showDocumentsTab
            ? "documents"
            : "timeline";
    }
  }, [isArchiveMode, showDocumentsTab, workflowCurrentStepKey]);
  const detailFlowSummary = useMemo(() => {
    if (!isSelectedInvestmentRequest || !workflowCurrentStepKey) {
      return selectedNextActionSummary;
    }

    switch (workflowCurrentStepKey) {
      case "review_start":
        return {
          label: "بدء المراجعة",
          helper: canStartRequestReview
            ? "هذا الطلب جديد وبانتظار بدء المراجعة الداخلية من الفريق."
            : "تم فتح الطلب ويمكن متابعة تفاصيله من السياق والسجل.",
          needsAction: canStartRequestReview,
        };
      case "investment_creation":
        return {
          label: canCreateInvestmentFromRequest
            ? "إنشاء الاستثمار"
            : canInitialApproveRequest
              ? "استكمال المراجعة"
              : "إنشاء الاستثمار",
          helper: canCreateInvestmentFromRequest
            ? "اكتملت المراجعة الأولية ويمكن الآن إنشاء سجل الاستثمار."
            : canInitialApproveRequest
              ? "الطلب في مرحلة المراجعة ويحتاج اعتمادًا تمهيديًا قبل إنشاء الاستثمار."
              : "الطلب ضمن مرحلة التجهيز لإنشاء الاستثمار ويمكن متابعة السجل والسياق من الصفحة.",
          needsAction:
            canCreateInvestmentFromRequest || canInitialApproveRequest,
        };
      case "contract_upload":
        return {
          label:
            canAdmin && canManageInvestments
              ? "رفع العقد"
              : "متابعة المستندات",
          helper:
            canAdmin && canManageInvestments
              ? "تم إنشاء الاستثمار، والمرحلة الحالية هي رفع العقد من تبويب المستندات."
              : "تم إنشاء الاستثمار، ويمكن متابعة حالة العقد من تبويب المستندات.",
          needsAction: canAdmin && canManageInvestments,
        };
      case "request_completion":
        return {
          label: canFinalize
            ? "إكمال الطلب"
            : canVerifySignedContract
              ? "اعتماد العقد"
              : isArchiveMode
                ? "اكتملت الدورة الحالية"
                : "إكمال الطلب",
          helper: isArchiveMode
            ? archiveResultMeta.helper
            : canFinalize
              ? "العقد جاهز والمرحلة الأخيرة هي الإقفال النهائي للطلب."
              : canVerifySignedContract
                ? "العقد الموقّع جاهز للاعتماد قبل الإقفال النهائي."
                : "الطلب وصل إلى المرحلة الأخيرة ويمكن مراجعة المستندات أو انتظار إجراء الإكمال حسب الصلاحيات الحالية.",
          needsAction: canFinalize || canVerifySignedContract,
        };
      default:
        return selectedNextActionSummary;
    }
  }, [
    archiveResultMeta.helper,
    canAdmin,
    canCreateInvestmentFromRequest,
    canFinalize,
    canInitialApproveRequest,
    canManageInvestments,
    canStartRequestReview,
    canVerifySignedContract,
    isArchiveMode,
    isSelectedInvestmentRequest,
    selectedNextActionSummary,
    workflowCurrentStepKey,
  ]);

  const detailHeaderMetrics = [
    {
      key: "request_number",
      label: "رقم الطلب",
      value: requestNumber(selectedMessage),
      icon: createElement(FileText, { className: "h-3.5 w-3.5" }),
      mono: true,
      strong: true,
    },
    {
      key: "request_kind",
      label: "نوع الطلب",
      value: selectedRequestKind?.label || "—",
      icon: createElement(MessageSquare, { className: "h-3.5 w-3.5" }),
      strong: true,
    },
    {
      key: "status",
      label: "الحالة",
      value: selectedStatusMeta?.label || "—",
      icon: createElement(Eye, { className: "h-3.5 w-3.5" }),
      strong: true,
    },
    {
      key: "stage",
      label: "المرحلة",
      value: selectedStageMeta?.label || "—",
      icon: createElement(ShieldCheck, { className: "h-3.5 w-3.5" }),
    },
    {
      key: "project",
      label: "المشروع",
      value: selectedProjectTitle,
      icon: createElement(Building2, { className: "h-3.5 w-3.5" }),
      strong: true,
    },
    {
      key: "updated_at",
      label: "آخر تحديث",
      value: formatDateTimeAR(selectedUpdatedAtValue),
      helper: formatRequestTimeLabel(selectedUpdatedAtValue),
      icon: createElement(RefreshCw, { className: "h-3.5 w-3.5" }),
    },
  ];

  return {
    isArchiveMode,
    isActiveMode,
    archiveResultMeta,
    detailPrimaryAction,
    detailSecondaryAction,
    showDocumentsTab,
    canEditInternalNotes,
    hasStoredInternalNotes,
    showInternalNotesTab,
    showArchiveContractUpload,
    showStopInvestmentAdvancedAction,
    showReopenAdvancedAction,
    showAdvancedActions,
    availableDetailTabs,
    workflowSteps,
    workflowCurrentStepKey,
    workflowCurrentStepIndex,
    workflowCurrentStepMeta,
    workflowNextStepMeta,
    workflowPreferredTab,
    detailFlowSummary,
    detailHeaderMetrics,
  };
}
