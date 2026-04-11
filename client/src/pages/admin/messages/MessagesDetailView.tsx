import { type ReactNode } from "react";
import ContractFilePicker from "@/components/ContractFilePicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DetailBinaryBadge,
  DetailContractStatusBadges,
  DetailContractUploadPanel,
  DetailContextTab,
  DetailDocumentFileCard,
  DetailDocumentsMetricCard,
  DetailDocumentsTab,
  DetailInternalNotesTab,
  DetailSection,
  DetailSummaryMetric,
  DetailTimelineTab,
} from "./Messages.parts";

const DETAIL_DIALOG_PANEL_CLASS =
  "overflow-x-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,0.985)_14%,rgba(248,250,252,0.98)_100%)] text-slate-950 shadow-[0_32px_90px_-34px_rgba(15,23,42,0.42)]";
const DETAIL_SECTION_CARD_CLASS =
  "overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.94)_100%)] shadow-[0_24px_60px_-42px_rgba(15,23,42,0.28)]";
const DETAIL_SECTION_HEADER_CLASS = "border-b border-slate-200/80 px-6 pb-4 pt-5";
const DETAIL_SECTION_TITLE_CLASS =
  "text-[1.02rem] font-semibold tracking-tight text-slate-950";
const DETAIL_SECTION_CONTENT_CLASS = "space-y-5 px-6 pb-6 pt-5 text-slate-700";
const DETAIL_INLINE_LABEL_CLASS =
  "mb-3 text-[11px] font-semibold tracking-[0.14em] text-slate-400";
const DETAIL_PILL_BASE_CLASS =
  "inline-flex h-8 items-center justify-center rounded-full border px-3.5 text-xs font-semibold leading-none tracking-[0.01em]";
const DETAIL_COMPACT_PILL_BASE_CLASS =
  "inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-[11px] font-semibold leading-none tracking-[0.01em]";
const DETAIL_STAGE_PILL_CLASS =
  "inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-3.5 text-xs font-semibold leading-none tracking-[0.01em] text-slate-700";
const DETAIL_BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl px-4 text-[13px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50";
const DETAIL_OUTLINE_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 border border-slate-200 bg-white text-slate-700 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.35)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950`;
const DETAIL_SOLID_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 text-white shadow-[0_18px_38px_-24px_rgba(15,23,42,0.3)]`;
const DETAIL_DANGER_BUTTON_CLASS = `${DETAIL_BUTTON_BASE_CLASS} h-11 bg-rose-600 text-white shadow-[0_18px_38px_-24px_rgba(225,29,72,0.38)] hover:bg-rose-500`;

export type DetailSecondaryTabKey =
  | "context"
  | "timeline"
  | "documents"
  | "internal_notes";

type DetailAction = {
  label: string;
  className: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => any;
};

type DetailMetric = {
  key: string;
  label: string;
  value: ReactNode;
  helper?: string;
  icon?: ReactNode;
  mono?: boolean;
  strong?: boolean;
};

type WorkflowStep = {
  key: string;
  label: string;
  helper: string;
  icon: ReactNode;
  targetTab: DetailSecondaryTabKey;
};

type TimelineEvent = {
  id: string;
  title: string;
  note: string | null;
  actor: {
    name: string;
    roleLabel: string;
  };
  timeLabel: string;
  atLabel: string;
};

type MessagesDetailViewProps = {
  selectedMessage: any;
  loading: boolean;
  selectedStatusMeta: any;
  isSelectedInterestRequest: boolean;
  isSelectedInvestmentRequest: boolean;
  detailHeaderMetrics: DetailMetric[];
  navigateToMessagesList: () => void;
  copySelectedRequestNumber: () => void;
  workflowSteps: WorkflowStep[];
  workflowCurrentStepIndex: number;
  workflowCurrentStepMeta: any;
  workflowNextStepMeta: any;
  selectedRequestStatus: string;
  isArchiveMode: boolean;
  detailSecondaryTab: DetailSecondaryTabKey;
  setDetailSecondaryTab: (value: DetailSecondaryTabKey) => void;
  resolveDetailTab: (preferred: DetailSecondaryTabKey) => DetailSecondaryTabKey;
  openDetailTab: (preferred: DetailSecondaryTabKey) => void;
  detailFlowSummary: any;
  isActiveMode: boolean;
  selectedTrackingMeta: any;
  selectedTrackingSlaMeta: any;
  selectedStageMeta: any;
  detailVisiblePrimaryAction: DetailAction | null;
  detailSecondaryAction: DetailAction | null;
  selectedInterestReviewMeta: any;
  selectedAmount: any;
  selectedLastActor: any;
  archiveResultMeta: any;
  selectedUpdatedAtValue: any;
  formatDateTimeAR: (value: any) => string;
  formatRequestTimeLabel: (value: any) => string;
  moneySAR: (value: any) => string;
  selectedClient: any;
  primaryContactLabel: string;
  primaryContactValue: ReactNode;
  openSelectedClientProfile: () => void;
  selectedProjectTitle: any;
  selectedRemaining: any;
  selectedAmountExceeded: boolean;
  openSelectedProject: () => void;
  contractStatusValue: any;
  contractFollowupChipLabel: string;
  hasOriginalContract: boolean;
  hasCurrentSignedContract: boolean;
  originalContractFileName: string;
  originalContractViewUrl?: string | null;
  originalContractDownloadUrl?: string | null;
  needsFreshSignedContract: boolean;
  signedContractFileName: string;
  signedContractViewUrl?: string | null;
  signedContractDownloadUrl?: string | null;
  draftFile: File | null;
  setDraftFile: (file: File | null) => void;
  contractBusy: boolean;
  canAdmin: boolean;
  createContractForInvestment: () => any;
  showDocumentsTab: boolean;
  showInternalNotesTab: boolean;
  canEditInternalNotes: boolean;
  internalNotes: string;
  setInternalNotes: (value: string) => void;
  handleSaveNotesOnly: () => any;
  hasStoredInternalNotes: boolean;
  selectedRequestSummary: string;
  selectedRequestKind: { helperText?: string } | null;
  selectedTimelineEvents: TimelineEvent[];
  showAdvancedActions: boolean;
  showReopenAdvancedAction: boolean;
  reopenBusy: boolean;
  myRole: string;
  canManageMessages: boolean;
  reopenMessage: () => any;
  showArchiveContractUpload: boolean;
  showStopInvestmentAdvancedAction: boolean;
  isSelectedInvestmentStoppedEarly: boolean;
  canEditFinancial: boolean;
  investmentDoc: any;
  openStopInvestmentDialog: () => void;
};

export default function MessagesDetailView({
  selectedMessage,
  loading,
  selectedStatusMeta,
  isSelectedInterestRequest,
  isSelectedInvestmentRequest,
  detailHeaderMetrics,
  navigateToMessagesList,
  copySelectedRequestNumber,
  workflowSteps,
  workflowCurrentStepIndex,
  workflowCurrentStepMeta,
  workflowNextStepMeta,
  selectedRequestStatus,
  isArchiveMode,
  detailSecondaryTab,
  setDetailSecondaryTab,
  resolveDetailTab,
  openDetailTab,
  detailFlowSummary,
  isActiveMode,
  selectedTrackingMeta,
  selectedTrackingSlaMeta,
  selectedStageMeta,
  detailVisiblePrimaryAction,
  detailSecondaryAction,
  selectedInterestReviewMeta,
  selectedAmount,
  selectedLastActor,
  archiveResultMeta,
  selectedUpdatedAtValue,
  formatDateTimeAR,
  formatRequestTimeLabel,
  moneySAR,
  selectedClient,
  primaryContactLabel,
  primaryContactValue,
  openSelectedClientProfile,
  selectedProjectTitle,
  selectedRemaining,
  selectedAmountExceeded,
  openSelectedProject,
  contractStatusValue,
  contractFollowupChipLabel,
  hasOriginalContract,
  hasCurrentSignedContract,
  originalContractFileName,
  originalContractViewUrl,
  originalContractDownloadUrl,
  needsFreshSignedContract,
  signedContractFileName,
  signedContractViewUrl,
  signedContractDownloadUrl,
  draftFile,
  setDraftFile,
  contractBusy,
  canAdmin,
  createContractForInvestment,
  showDocumentsTab,
  showInternalNotesTab,
  canEditInternalNotes,
  internalNotes,
  setInternalNotes,
  handleSaveNotesOnly,
  hasStoredInternalNotes,
  selectedRequestSummary,
  selectedRequestKind,
  selectedTimelineEvents,
  showAdvancedActions,
  showReopenAdvancedAction,
  reopenBusy,
  myRole,
  canManageMessages,
  reopenMessage,
  showArchiveContractUpload,
  showStopInvestmentAdvancedAction,
  isSelectedInvestmentStoppedEarly,
  canEditFinancial,
  investmentDoc,
  openStopInvestmentDialog,
}: MessagesDetailViewProps) {
  const renderDetailContextRow = () => (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className={cn("rsg-card", DETAIL_SECTION_CARD_CLASS)}>
        <CardHeader className={DETAIL_SECTION_HEADER_CLASS}>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className={DETAIL_SECTION_TITLE_CLASS}>العميل</CardTitle>
              <p className="text-sm leading-7 text-slate-500">
                جهة التواصل الأساسية المرتبطة بهذا الطلب.
              </p>
            </div>
            <Badge
              className={cn(
                DETAIL_PILL_BASE_CLASS,
                selectedClient?.sourceTone
              )}
            >
              {selectedClient?.sourceLabel || "بيانات الطلب"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className={`${DETAIL_SECTION_CONTENT_CLASS} space-y-4`}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-lg font-semibold text-slate-950">
                {selectedClient?.clientName || "مستخدم غير معروف"}
              </div>
              <Badge
                className={cn(
                  DETAIL_COMPACT_PILL_BASE_CLASS,
                  "border-slate-200 bg-slate-100 text-slate-700"
                )}
              >
                {selectedClient?.clientRoleLabel || "عميل"}
              </Badge>
            </div>
            <div className="text-sm leading-7 text-slate-600">
              <span className="text-slate-500">{primaryContactLabel}: </span>
              {primaryContactValue}
            </div>
            {selectedClient?.sourceHelper ? (
              <p className="text-sm leading-7 text-slate-500">
                {selectedClient.sourceHelper}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className={DETAIL_OUTLINE_BUTTON_CLASS}
              onClick={openSelectedClientProfile}
            >
              <FileText className="h-4 w-4" />
              فتح ملف العميل
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className={cn("rsg-card", DETAIL_SECTION_CARD_CLASS)}>
        <CardHeader className={DETAIL_SECTION_HEADER_CLASS}>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className={DETAIL_SECTION_TITLE_CLASS}>المشروع</CardTitle>
              <p className="text-sm leading-7 text-slate-500">
                مرجع المشروع المرتبط بهذا السجل الآن.
              </p>
            </div>
            {isSelectedInterestRequest ? (
              <Badge className="border-amber-200 bg-amber-50 text-amber-800">
                اهتمام
              </Badge>
            ) : (
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
                استثمار
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className={`${DETAIL_SECTION_CONTENT_CLASS} space-y-4`}>
          <div className="space-y-2">
            <div className="text-lg font-semibold text-slate-950">
              {selectedProjectTitle}
            </div>
            <p className="text-sm leading-7 text-slate-600">
              {isSelectedInvestmentRequest
                ? `المبلغ الحالي المرتبط بالطلب: ${moneySAR(selectedAmount)}`
                : "هذا السجل مرتبط بمتابعة اهتمام أولية للمشروع المحدد."}
            </p>
            {selectedRemaining != null && isSelectedInvestmentRequest ? (
              <p className="text-sm leading-7 text-slate-500">
                المتبقي بالمشروع:{" "}
                {selectedAmountExceeded
                  ? `${moneySAR(selectedRemaining)} (تجاوز)`
                  : moneySAR(selectedRemaining)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className={DETAIL_OUTLINE_BUTTON_CLASS}
              onClick={openSelectedProject}
            >
              <ExternalLink className="h-4 w-4" />
              فتح المشروع
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderDetailWorkflowStepper = () =>
    workflowSteps.length ? (
      <DetailSection
        title="مسار المعالجة"
        description={
          isArchiveMode
            ? "عرض بصري مختصر يوضح أين انتهت دورة الطلب وما الذي اكتمل منها."
            : "مسار واضح يحدد المرحلة الحالية ويوجهك مباشرة إلى الخطوة التالية."
        }
        badge={
          selectedRequestStatus === "rejected" ? (
            <Badge className="border-rose-200 bg-rose-50 text-rose-700">
              متوقف
            </Badge>
          ) : isArchiveMode ? (
            <Badge className="border-slate-200 bg-slate-100 text-slate-700">
              مؤرشف
            </Badge>
          ) : (
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
              Guided Workflow
            </Badge>
          )
        }
      >
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
          {workflowSteps.map((step, index) => {
            const state =
              workflowCurrentStepIndex === -1
                ? "pending"
                : selectedRequestStatus === "rejected"
                  ? index < workflowCurrentStepIndex
                    ? "completed"
                    : index === workflowCurrentStepIndex
                      ? "halted"
                      : "pending"
                  : index < workflowCurrentStepIndex
                    ? "completed"
                    : index === workflowCurrentStepIndex
                      ? "active"
                      : "pending";
            const isTabFocused =
              detailSecondaryTab === resolveDetailTab(step.targetTab);

            return (
              <button
                key={step.key}
                type="button"
                onClick={() => openDetailTab(step.targetTab)}
                className={cn(
                  "rounded-[24px] border px-4 py-4 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
                  state === "completed" &&
                  "border-emerald-200 bg-emerald-50/80 text-emerald-950",
                  state === "active" &&
                  "border-slate-900 bg-slate-950 text-white shadow-[0_18px_40px_-30px_rgba(15,23,42,0.42)]",
                  state === "pending" &&
                  "border-slate-200/80 bg-white text-slate-700 hover:border-slate-300",
                  state === "halted" &&
                  "border-rose-200 bg-rose-50/90 text-rose-900",
                  isTabFocused && "ring-1 ring-offset-0 ring-slate-300"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-2xl border text-sm font-semibold",
                      state === "completed" &&
                      "border-emerald-300 bg-emerald-100 text-emerald-700",
                      state === "active" &&
                      "border-white/15 bg-white/10 text-white",
                      state === "pending" &&
                      "border-slate-200 bg-slate-100 text-slate-600",
                      state === "halted" &&
                      "border-rose-300 bg-rose-100 text-rose-700"
                    )}
                  >
                    {state === "completed" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      step.icon
                    )}
                  </div>

                  <Badge
                    className={cn(
                      DETAIL_COMPACT_PILL_BASE_CLASS,
                      state === "completed" &&
                      "border-emerald-200 bg-white/80 text-emerald-700",
                      state === "active" &&
                      "border-white/15 bg-white/10 text-white",
                      state === "pending" &&
                      "border-slate-200 bg-slate-100 text-slate-600",
                      state === "halted" &&
                      "border-rose-200 bg-white/70 text-rose-700"
                    )}
                  >
                    {state === "completed"
                      ? "مكتملة"
                      : state === "active"
                        ? "الحالية"
                        : state === "halted"
                          ? "توقفت هنا"
                          : "قادمة"}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="text-base font-semibold">{step.label}</div>
                  <p
                    className={cn(
                      "text-sm leading-7",
                      state === "active" ? "text-white/80" : "text-current/80"
                    )}
                  >
                    {step.helper}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {workflowCurrentStepMeta ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-4">
              <div className={DETAIL_INLINE_LABEL_CLASS}>أنت الآن هنا</div>
              <div className="text-base font-semibold text-slate-950">
                {workflowCurrentStepMeta.label}
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {workflowCurrentStepMeta.helper}
              </p>
            </div>
            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-4">
              <div className={DETAIL_INLINE_LABEL_CLASS}>الانتقال المقترح</div>
              <div className="text-base font-semibold text-slate-950">
                {workflowNextStepMeta?.label ||
                  (isArchiveMode ? "اكتملت الدورة الحالية" : "المراجعة النهائية")}
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                {workflowNextStepMeta?.helper ||
                  (isArchiveMode
                    ? "يمكن الرجوع الآن إلى السجل أو المستندات فقط عند الحاجة."
                    : detailFlowSummary.helper)}
              </p>
            </div>
          </div>
        ) : null}
      </DetailSection>
    ) : null;

  const renderDetailPrimaryPanel = () =>
    isActiveMode ? (
      <DetailSection
        title="التشغيل الحالي"
        description="الحالة الحالية والخطوة التالية فقط، مع CTA سياقي واحد يوجه المسار."
        badge={
          selectedTrackingMeta ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn(DETAIL_PILL_BASE_CLASS, selectedTrackingMeta.tone)}
              >
                {selectedTrackingMeta.label}
              </Badge>
              {selectedTrackingSlaMeta ? (
                <Badge
                  className={cn(
                    DETAIL_COMPACT_PILL_BASE_CLASS,
                    selectedTrackingSlaMeta.className
                  )}
                >
                  {selectedTrackingSlaMeta.label}
                </Badge>
              ) : null}
            </div>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)]">
          <div
            className={cn(
              "rounded-[24px] border px-5 py-5 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.22)]",
              isSelectedInterestRequest
                ? "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(255,255,255,0.98)_100%)] text-amber-950"
                : "border-slate-900/10 bg-[linear-gradient(135deg,rgba(11,23,38,0.98)_0%,rgba(16,32,58,0.96)_70%,rgba(255,255,255,0.06)_135%)] text-white"
            )}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              {selectedTrackingMeta ? (
                <Badge
                  className={cn(
                    DETAIL_PILL_BASE_CLASS,
                    selectedTrackingMeta?.tone
                  )}
                >
                  {selectedTrackingMeta?.label}
                </Badge>
              ) : null}
              {selectedTrackingSlaMeta ? (
                <Badge
                  className={cn(
                    DETAIL_COMPACT_PILL_BASE_CLASS,
                    selectedTrackingSlaMeta.className
                  )}
                >
                  {selectedTrackingSlaMeta.label}
                </Badge>
              ) : null}
              {!isSelectedInterestRequest && selectedStatusMeta ? (
                <Badge
                  className={cn(
                    DETAIL_PILL_BASE_CLASS,
                    selectedStatusMeta?.tone
                  )}
                >
                  {selectedStatusMeta?.label}
                </Badge>
              ) : null}
              {isSelectedInterestRequest ? null : (
                <Badge className={DETAIL_STAGE_PILL_CLASS}>
                  {selectedStageMeta?.label || "—"}
                </Badge>
              )}
            </div>

            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-[20px] border border-white/12 bg-white/5 px-4 py-4">
                  <div className="text-[11px] font-semibold tracking-[0.14em] text-current/70">
                    المرحلة الحالية
                  </div>
                  <div className="mt-2 text-lg font-semibold leading-8 text-current">
                    {workflowCurrentStepMeta?.label ||
                      selectedStageMeta?.label ||
                      selectedStatusMeta?.label ||
                      "—"}
                  </div>
                  <p className="mt-2 text-sm leading-7 text-current/80">
                    {workflowCurrentStepMeta?.helper ||
                      "هذه هي المرحلة التي يعتمد عليها التوجيه الحالي داخل الصفحة."}
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/12 bg-white/5 px-4 py-4">
                  <div className="text-[11px] font-semibold tracking-[0.14em] text-current/70">
                    الخطوة التالية
                  </div>
                  <div className="mt-2 text-lg font-semibold leading-8 text-current">
                    {workflowNextStepMeta?.label || detailFlowSummary.label}
                  </div>
                  <p className="mt-2 text-sm leading-7 text-current/80">
                    {workflowNextStepMeta?.helper || detailFlowSummary.helper}
                  </p>
                </div>
              </div>

              {detailVisiblePrimaryAction || detailSecondaryAction ? (
                <div className="flex flex-wrap gap-3 pt-2">
                  {detailVisiblePrimaryAction ? (
                    <Button
                      className={detailVisiblePrimaryAction.className}
                      onClick={detailVisiblePrimaryAction.onClick}
                      disabled={detailVisiblePrimaryAction.disabled}
                    >
                      {detailVisiblePrimaryAction.icon}
                      {detailVisiblePrimaryAction.label}
                    </Button>
                  ) : null}
                  {detailSecondaryAction ? (
                    <Button
                      className={detailSecondaryAction.className}
                      onClick={detailSecondaryAction.onClick}
                      disabled={detailSecondaryAction.disabled}
                    >
                      {detailSecondaryAction.icon}
                      {detailSecondaryAction.label}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <DetailSummaryMetric
              label={
                isSelectedInterestRequest ? "وضع المتابعة" : "المبلغ الحالي"
              }
              value={
                isSelectedInterestRequest
                  ? selectedInterestReviewMeta?.label || "جديد"
                  : moneySAR(selectedAmount)
              }
              helper={
                isSelectedInterestRequest
                  ? selectedInterestReviewMeta?.helperText
                  : selectedMessage?.investmentId
                    ? `سجل الاستثمار ${selectedMessage.investmentId}`
                    : "لم يتم إنشاء سجل الاستثمار بعد"
              }
              icon={<Wallet className="h-3.5 w-3.5" />}
              strong
            />
            <DetailSummaryMetric
              label="آخر من عدّل"
              value={selectedLastActor?.name || "—"}
              helper={selectedLastActor?.roleLabel || undefined}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      </DetailSection>
    ) : (
      <DetailSection
        title="النتيجة النهائية"
        description="عرض أرشيفي مختصر يركّز على النتيجة النهائية وما يلزم الرجوع إليه فقط."
        badge={
          <Badge className="border-slate-200 bg-slate-100 text-slate-700">
            أرشيف
          </Badge>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.42fr)]">
          <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,rgba(248,250,252,0.96)_100%)] px-5 py-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.22)]">
            <div className="flex flex-wrap items-center gap-2.5">
              {selectedStatusMeta ? (
                <Badge
                  className={cn(
                    DETAIL_PILL_BASE_CLASS,
                    selectedStatusMeta?.tone
                  )}
                >
                  {selectedStatusMeta?.label}
                </Badge>
              ) : null}
              {isSelectedInterestRequest ? (
                <Badge className="border-slate-200 bg-slate-100 text-slate-700">
                  انتهاء متابعة الاهتمام
                </Badge>
              ) : null}
            </div>

            <div className="mt-5">
              <div className="text-2xl font-semibold leading-9 text-slate-950">
                {archiveResultMeta.title}
              </div>
              <p className="mt-2 text-sm leading-8 text-slate-600">
                {archiveResultMeta.helper}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <DetailSummaryMetric
              label="الحالة النهائية"
              value={selectedStatusMeta?.label || "—"}
              icon={<Eye className="h-3.5 w-3.5" />}
              strong
            />
            <DetailSummaryMetric
              label="آخر تحديث"
              value={formatDateTimeAR(selectedUpdatedAtValue)}
              helper={formatRequestTimeLabel(selectedUpdatedAtValue)}
              icon={<CalendarDays className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      </DetailSection>
    );

  const renderDocumentsSectionBody = ({ showUpload }: { showUpload: boolean }) => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DetailDocumentsMetricCard
          label="رقم الاستثمار"
          icon={<Building2 className="h-4 w-4" />}
        >
          <div className="break-words text-base font-semibold text-slate-950">
            {String(selectedMessage?.investmentId || "-")}
          </div>
        </DetailDocumentsMetricCard>

        <DetailDocumentsMetricCard
          label="حالة العقد"
          icon={<ShieldCheck className="h-4 w-4" />}
        >
          <DetailContractStatusBadges
            status={contractStatusValue}
            followupLabel={contractFollowupChipLabel || undefined}
          />
        </DetailDocumentsMetricCard>

        <DetailDocumentsMetricCard
          label="العقد الأصلي"
          icon={<FileText className="h-4 w-4" />}
        >
          <DetailBinaryBadge
            active={hasOriginalContract}
            activeLabel="مرفوع"
            inactiveLabel="لا يوجد"
          />
        </DetailDocumentsMetricCard>

        <DetailDocumentsMetricCard
          label="العقد الموقّع"
          icon={<CheckCircle2 className="h-4 w-4" />}
        >
          <DetailBinaryBadge
            active={hasCurrentSignedContract}
            activeLabel="مرفوع"
            inactiveLabel="لا يوجد"
          />
        </DetailDocumentsMetricCard>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <DetailDocumentFileCard
          title="العقد الأصلي"
          available={hasOriginalContract}
          fileName={originalContractFileName}
          viewUrl={originalContractViewUrl}
          downloadUrl={originalContractDownloadUrl}
          emptyTitle="لا يوجد عقد أصلي مرفوع"
          emptyDescription="سيظهر العقد الأصلي هنا بعد رفعه وربطه بهذا الاستثمار."
          alertText={
            needsFreshSignedContract
              ? "تم تحديث العقد الأصلي، وسيحتاج المستثمر إلى توقيع النسخة الجديدة."
              : undefined
          }
        />

        <DetailDocumentFileCard
          title="العقد الموقّع"
          available={hasCurrentSignedContract}
          fileName={signedContractFileName}
          viewUrl={signedContractViewUrl}
          downloadUrl={signedContractDownloadUrl}
          emptyTitle={
            needsFreshSignedContract
              ? "النسخة الموقّعة الحالية غير متوفرة"
              : "لم يتم رفع العقد الموقّع بعد"
          }
          emptyDescription={
            needsFreshSignedContract
              ? "تم تحديث العقد الأصلي، وينتظر النظام رفع النسخة الموقّعة الجديدة من المستثمر."
              : "سيظهر العقد الموقّع هنا بعد أن يرفعه المستثمر ويُربط بهذا الاستثمار."
          }
        />
      </div>

      {showUpload ? (
        <div className="space-y-4 border-t border-slate-200/80 pt-6">
          <div className="space-y-1">
            <div className={DETAIL_INLINE_LABEL_CLASS}>رفع المستندات</div>
            <p className="text-sm leading-7 text-slate-600">
              ارفع العقد الأصلي بصيغة PDF ليظهر ضمن المستندات المرتبطة ويصبح جاهزًا
              للمتابعة.
            </p>
          </div>

          <DetailContractUploadPanel
            file={draftFile}
            onFileChange={setDraftFile}
            disabled={contractBusy || !selectedMessage?.investmentId}
            busy={contractBusy}
            buttonLabel="رفع العقد الأصلي"
            onSubmit={createContractForInvestment}
            submitDisabled={
              contractBusy || !selectedMessage?.investmentId || !draftFile || !canAdmin
            }
          />
        </div>
      ) : null}
    </div>
  );

  const renderDetailSecondaryTabs = () => (
    <Tabs
      value={detailSecondaryTab}
      onValueChange={value =>
        setDetailSecondaryTab(resolveDetailTab(value as DetailSecondaryTabKey))
      }
      className="gap-4"
    >
      <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-2xl bg-slate-100/80 p-1.5">
        <TabsTrigger
          value="context"
          className="shrink-0 rounded-xl px-4 py-2"
        >
          السياق
        </TabsTrigger>
        <TabsTrigger
          value="timeline"
          className="shrink-0 rounded-xl px-4 py-2"
        >
          السجل
        </TabsTrigger>
        {showDocumentsTab ? (
          <TabsTrigger
            value="documents"
            className="shrink-0 rounded-xl px-4 py-2"
          >
            المستندات
          </TabsTrigger>
        ) : null}
        {showInternalNotesTab ? (
          <TabsTrigger
            value="internal_notes"
            className="shrink-0 rounded-xl px-4 py-2"
          >
            الملاحظات الداخلية
          </TabsTrigger>
        ) : null}
      </TabsList>

      <TabsContent value="context" className="mt-0 space-y-6">
        <DetailContextTab
          selectedRequestSummary={selectedRequestSummary}
          isSelectedInterestRequest={isSelectedInterestRequest}
          selectedProjectTitle={selectedProjectTitle}
          selectedInterestReviewMeta={selectedInterestReviewMeta}
          selectedAmountLabel={moneySAR(selectedAmount)}
          selectedInvestmentId={selectedMessage?.investmentId}
          selectedRequestKind={selectedRequestKind}
        />
      </TabsContent>
      <TabsContent value="timeline" className="mt-0 space-y-6">
        <DetailTimelineTab selectedTimelineEvents={selectedTimelineEvents} />
      </TabsContent>
      {showDocumentsTab ? (
        <TabsContent value="documents" className="mt-0 space-y-6">
          <DetailDocumentsTab isArchiveMode={isArchiveMode}>
            {renderDocumentsSectionBody({ showUpload: isActiveMode })}
          </DetailDocumentsTab>
        </TabsContent>
      ) : null}
      {showInternalNotesTab ? (
        <TabsContent value="internal_notes" className="mt-0 space-y-6">
          <DetailInternalNotesTab
            canEditInternalNotes={canEditInternalNotes}
            internalNotes={internalNotes}
            setInternalNotes={setInternalNotes}
            handleSaveNotesOnly={handleSaveNotesOnly}
            hasStoredInternalNotes={hasStoredInternalNotes}
          />
        </TabsContent>
      ) : null}
    </Tabs>
  );

  const renderDetailAdvancedActions = () =>
    showAdvancedActions ? (
      <Accordion
        type="single"
        collapsible
        className="rounded-[28px] border border-slate-200/80 bg-white/95 px-5 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.26)]"
      >
        <AccordionItem value="advanced-actions" className="border-none">
          <AccordionTrigger className="py-5 text-right text-base font-semibold text-slate-950 hover:no-underline">
            إجراءات متقدمة
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <div className="space-y-4">
              {showReopenAdvancedAction ? (
                <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                  <div className="mb-3 text-sm font-semibold text-slate-950">
                    إعادة فتح الطلب
                  </div>
                  <p className="mb-4 text-sm leading-7 text-slate-600">
                    إجراء استثنائي عالي الصلاحية لإرجاع السجل إلى دورة المتابعة
                    مرة أخرى.
                  </p>
                  <Button
                    variant="outline"
                    className={DETAIL_OUTLINE_BUTTON_CLASS}
                    onClick={reopenMessage}
                    disabled={
                      reopenBusy || myRole !== "owner" || !canManageMessages
                    }
                  >
                    {reopenBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Clock3 className="h-4 w-4" />
                    )}
                    إعادة فتح (للمسؤول التقني)
                  </Button>
                </div>
              ) : null}

              {showArchiveContractUpload ? (
                <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                  <div className="mb-3 text-sm font-semibold text-slate-950">
                    رفع عقد بعد الإغلاق
                  </div>
                  <p className="mb-4 text-sm leading-7 text-slate-600">
                    يظل هذا الإجراء متاحًا هنا فقط لأنه خارج التدفق التشغيلي
                    الأساسي للسجل المؤرشف.
                  </p>
                  <div className="space-y-4">
                    <ContractFilePicker
                      buttonLabel="رفع العقد الأصلي (PDF)"
                      file={draftFile}
                      onFileChange={setDraftFile}
                      panelClassName="rounded-[18px] border border-slate-200 bg-white px-4 py-4 sm:px-4"
                      buttonClassName={DETAIL_OUTLINE_BUTTON_CLASS}
                      fileNameClassName="text-sm font-semibold text-slate-950"
                      helperTextClassName="text-xs leading-6 text-slate-500"
                      disabled={contractBusy || !selectedMessage?.investmentId}
                    />
                    <Button
                      className={`w-full sm:w-auto ${DETAIL_SOLID_BUTTON_CLASS} bg-blue-700 hover:bg-blue-800`}
                      onClick={createContractForInvestment}
                      disabled={
                        contractBusy ||
                        !selectedMessage?.investmentId ||
                        !draftFile ||
                        !canAdmin
                      }
                    >
                      {contractBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      رفع العقد الأصلي
                    </Button>
                  </div>
                </div>
              ) : null}

              {showStopInvestmentAdvancedAction ? (
                <div className="rounded-[22px] border border-rose-200/80 bg-rose-50/40 px-4 py-4">
                  <div className="mb-3 text-sm font-semibold text-slate-950">
                    {isSelectedInvestmentStoppedEarly
                      ? "إيقاف الاستثمار بطلب العميل"
                      : "إيقاف الاستثمار"}
                  </div>
                  <p className="mb-4 text-sm leading-7 text-slate-600">
                    بدأ هذا الاستثمار فعليًا، لذلك لم يعد رفع العقد الأصلي إجراءً صحيحًا في
                    هذا القسم. متابعة الإيقاف المبكر والتسوية تتم من المسار المالي الحالي
                    المرتبط بالاستثمار.
                  </p>
                  <Button
                    className={
                      isSelectedInvestmentStoppedEarly
                        ? DETAIL_OUTLINE_BUTTON_CLASS
                        : DETAIL_DANGER_BUTTON_CLASS
                    }
                    onClick={openStopInvestmentDialog}
                    disabled={!canEditFinancial || !investmentDoc?.id}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    {isSelectedInvestmentStoppedEarly
                      ? "مراجعة إيقاف الاستثمار"
                      : "إيقاف الاستثمار بطلب العميل"}
                  </Button>
                </div>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    ) : null;


  return (
          <section dir="rtl" className="space-y-6">
            {selectedMessage ? (
              <div className={DETAIL_DIALOG_PANEL_CLASS}>
                <div className="relative overflow-hidden border-b border-slate-200/80 px-6 py-6 sm:px-8 sm:py-7">
                  <div
                    className={cn(
                      "absolute inset-x-0 top-0 h-1.5",
                      selectedStatusMeta?.accent ||
                      (isSelectedInterestRequest
                        ? "bg-amber-500"
                        : "bg-emerald-500")
                    )}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,174,48,0.16),transparent_32%),radial-gradient(circle_at_top_left,rgba(20,35,58,0.08),transparent_35%)]" />

                  <div className="relative space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Button
                        variant="outline"
                        className={DETAIL_OUTLINE_BUTTON_CLASS}
                        onClick={navigateToMessagesList}
                      >
                        <ArrowRight className="h-4 w-4" />
                        العودة إلى الطلبات
                      </Button>

                      <Button
                        variant="outline"
                        className={DETAIL_OUTLINE_BUTTON_CLASS}
                        onClick={copySelectedRequestNumber}
                      >
                        <Copy className="h-4 w-4" />
                        نسخ رقم الطلب
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                      {detailHeaderMetrics.map(metric => (
                        <DetailSummaryMetric
                          key={metric.key}
                          label={metric.label}
                          value={metric.value}
                          helper={metric.helper}
                          icon={metric.icon}
                          mono={metric.mono}
                          strong={metric.strong}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6 p-6 sm:p-7">
                  {renderDetailWorkflowStepper()}
                  {renderDetailContextRow()}
                  {renderDetailPrimaryPanel()}
                  {renderDetailSecondaryTabs()}
                  {renderDetailAdvancedActions()}

                </div>
              </div>
            ) : (
              <Card className="rsg-card border-slate-200/80 bg-white/95 shadow-[0_22px_70px_-46px_rgba(15,23,42,0.42)]">
                <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center sm:px-10">
                  {loading ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                      <div className="text-base font-semibold text-slate-900">
                        جاري تحميل تفاصيل الطلب...
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-semibold text-slate-900">
                        تعذر العثور على الطلب المطلوب.
                      </div>
                      <p className="max-w-xl text-sm leading-7 text-slate-500">
                        قد يكون الرابط غير صحيح أو أن الطلب لم يعد متاحًا ضمن السجلات الحالية.
                      </p>
                      <Button
                        variant="outline"
                        className={DETAIL_OUTLINE_BUTTON_CLASS}
                        onClick={navigateToMessagesList}
                      >
                        <ArrowRight className="h-4 w-4" />
                        العودة إلى الطلبات
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </section>
  );
}
