import { formatDateTimeEN } from "@/lib/formatters";
import {
  deriveInvestmentStage,
  type DeriveInvestmentStageInput,
  type InvestmentTimelineStepKey,
} from "@/lib/investmentStage";
import { getInvestmentStageUi } from "@/lib/investmentStageUiMap";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Clock3,
  FileText,
  FilePenLine,
  ShieldCheck,
  Building2,
} from "lucide-react";

export type InvestmentRequestStageKey = InvestmentTimelineStepKey;

export type InvestmentRequestTimelineEventLike = {
  type?: string | null;
  at?: unknown;
};

type InvestmentRequestStepState = "done" | "current" | "pending";

type ResolveInvestmentRequestStepOptions = DeriveInvestmentStageInput & {
  status?: string | null;
  hasContractUploaded?: boolean;
  hasContractSigned?: boolean;
  hasContractVerified?: boolean;
};

type InvestmentRequestStepperProps = {
  currentStep: InvestmentRequestStageKey;
  dates?: Partial<Record<InvestmentRequestStageKey, unknown>>;
  className?: string;
  currentStepAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
    target?: string;
    rel?: string;
  } | null;
};

type StepMeta = {
  title: string;
  descriptions: Record<InvestmentRequestStepState, string>;
  icon: LucideIcon;
};

const STAGE_ORDER: InvestmentRequestStageKey[] = [
  "request_created",
  "investment_created",
  "contract_preparing",
  "awaiting_signature",
  "contract_under_review",
  "contract_verified",
];

const STEP_META: Record<InvestmentRequestStageKey, StepMeta> = {
  request_created: {
    title: "استلام الطلب",
    descriptions: {
      done: "تم استلام طلبك وإدخاله في مسار المراجعة الأولي.",
      current: "تم استلام طلبك، ويجري الآن التحقق من بياناته تمهيدًا لاستكمال الإجراءات.",
      pending: "سيتم استلام طلبك وتسجيله تمهيدًا لبدء إجراءات المراجعة.",
    },
    icon: FileText,
  },
  investment_created: {
    title: "إنشاء سجل الاستثمار",
    descriptions: {
      done: "تم إنشاء سجل الاستثمار وربط الطلب بالمشروع المناسب.",
      current: "تم إنشاء سجل الاستثمار، ويجري الآن تجهيز خطوات التعاقد الخاصة بطلبك.",
      pending: "بعد مراجعة الطلب، سيتم إنشاء سجل الاستثمار وربطه بالمشروع المناسب.",
    },
    icon: Building2,
  },
  contract_preparing: {
    title: "تجهيز العقد الاستثماري",
    descriptions: {
      done: "تم الانتهاء من إعداد العقد، والمرحلة التالية هي إرساله لك للتوقيع.",
      current: "يجري الآن إعداد العقد الاستثماري ومراجعته قبل إرساله لك.",
      pending: "سيتم إعداد العقد الاستثماري بعد استكمال ربط الطلب بسجل الاستثمار.",
    },
    icon: FilePenLine,
  },
  awaiting_signature: {
    title: "بانتظار توقيع العقد",
    descriptions: {
      done: "تم إرسال العقد لك، وبعد توقيعك له انتقل الملف إلى المراجعة النهائية.",
      current: "العقد متاح لك الآن، وبانتظار مراجعتك ورفع النسخة الموقعة.",
      pending: "سيتم إرسال العقد لك فور اكتمال تجهيزه واعتماده الداخلي.",
    },
    icon: Clock3,
  },
  contract_under_review: {
    title: "مراجعة العقد الموقّع",
    descriptions: {
      done: "تمت مراجعة العقد الموقّع والانتقال إلى اعتماد العقد رسميًا.",
      current: "العقد الموقّع لدينا الآن، ونجري عليه المراجعة والاعتماد النهائي.",
      pending: "بعد استلام العقد الموقّع سنباشر مراجعته واعتماده.",
    },
    icon: CheckCircle2,
  },
  contract_verified: {
    title: "اعتماد العقد",
    descriptions: {
      done: "تم اعتماد العقد، وأصبح الطلب جاهزًا لبدء الاستثمار.",
      current: "تم اعتماد العقد، ويجري الآن استكمال بدء الاستثمار بشكل رسمي.",
      pending: "بعد اعتماد العقد، سيتم بدء الاستثمار بشكل رسمي.",
    },
    icon: ShieldCheck,
  },
};

const STEP_STATE_META: Record<
  InvestmentRequestStepState,
  {
    label: string;
    iconClassName: string;
    markerClassName: string;
    panelClassName: string;
    pillClassName: string;
  }
> = {
  done: {
    label: "مكتملة",
    iconClassName: "text-emerald-700",
    markerClassName:
      "border-emerald-200 bg-emerald-100/90 text-emerald-700 shadow-[0_12px_28px_-18px_rgba(5,150,105,0.9)]",
    panelClassName: "border-emerald-200/80 bg-emerald-50/70",
    pillClassName: "border-emerald-200 bg-emerald-100 text-emerald-800",
  },
  current: {
    label: "الحالية",
    iconClassName: "text-amber-700",
    markerClassName:
      "border-amber-200 bg-amber-100/95 text-amber-700 shadow-[0_14px_32px_-18px_rgba(217,119,6,0.95)]",
    panelClassName: "border-amber-200/90 bg-amber-50/80",
    pillClassName: "border-amber-200 bg-amber-100 text-amber-800",
  },
  pending: {
    label: "قادمة",
    iconClassName: "text-slate-400",
    markerClassName:
      "border-slate-200 bg-slate-100/90 text-slate-400 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.6)]",
    panelClassName: "border-slate-200/80 bg-slate-50/80",
    pillClassName: "border-slate-200 bg-slate-100 text-slate-600",
  },
};

function normalizeStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function shouldShowInvestmentRequestStepper(status?: string | null) {
  const normalizedStatus = normalizeStatus(status);
  return !["active", "completed", "closed", "rejected", "cancelled"].includes(
    normalizedStatus
  );
}

export function resolveInvestmentRequestStepKey(
  options: ResolveInvestmentRequestStepOptions
): InvestmentRequestStageKey {
  const stage = deriveInvestmentStage({
    investmentStatus: options.investmentStatus ?? options.status,
    contractStatus: options.contractStatus,
    hasInvestment: options.hasInvestment,
    hasOriginalContract: options.hasOriginalContract ?? options.hasContractUploaded,
    hasSignedContract: options.hasSignedContract ?? options.hasContractSigned,
    hasVerifiedContract: options.hasVerifiedContract ?? options.hasContractVerified,
  });

  return getInvestmentStageUi(stage).timelineStepKey || "contract_verified";
}

export function findTimelineDateByTypes(
  events: InvestmentRequestTimelineEventLike[],
  ...types: string[]
) {
  const wantedTypes = new Set(types.map(normalizeStatus).filter(Boolean));
  return events.find((event) => wantedTypes.has(normalizeStatus(event?.type)))?.at;
}

export default function InvestmentRequestStepper({
  currentStep,
  dates = {},
  className,
  currentStepAction = null,
}: InvestmentRequestStepperProps) {
  const currentStepIndex = Math.max(STAGE_ORDER.indexOf(currentStep), 0);

  return (
    <div className={cn("relative space-y-4 sm:space-y-5", className)}>
      <div className="absolute right-5 top-6 bottom-6 w-px bg-gradient-to-b from-emerald-200 via-amber-200 to-slate-200" />

      {STAGE_ORDER.map((stepKey, index) => {
        const state: InvestmentRequestStepState =
          index < currentStepIndex ? "done" : index === currentStepIndex ? "current" : "pending";
        const stepMeta = STEP_META[stepKey];
        const currentStageUi = getInvestmentStageUi(stepKey);
        const stateMeta = STEP_STATE_META[state];
        const Icon = stepMeta.icon;
        const formattedDate = dates[stepKey] ? formatDateTimeEN(dates[stepKey]) : null;
        const title = state === "current" ? currentStageUi.title : stepMeta.title;
        const description =
          state === "current" ? currentStageUi.description : stepMeta.descriptions[state];
        const shouldShowCurrentAction =
          state === "current" &&
          !!currentStepAction &&
          (typeof currentStepAction.onClick === "function" || Boolean(currentStepAction.href));

        return (
          <div key={stepKey} className="relative pr-16 sm:pr-20">
            <div
              className={cn(
                "absolute right-0 top-1 flex h-10 w-10 items-center justify-center rounded-2xl border backdrop-blur-sm sm:h-11 sm:w-11",
                stateMeta.markerClassName
              )}
            >
              <Icon className={cn("h-4 w-4 sm:h-[18px] sm:w-[18px]", stateMeta.iconClassName)} />
            </div>

            <div
              className={cn(
                "rounded-2xl border px-4 py-4 shadow-sm transition-colors sm:px-5 sm:py-5",
                stateMeta.panelClassName
              )}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="text-[11px] font-semibold tracking-[0.2em] text-slate-400">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="text-base font-semibold tracking-tight text-slate-950 sm:text-[17px]">
                    {title}
                  </div>
                  <div className="text-sm leading-6 text-slate-600">
                    {description}
                  </div>
                  {shouldShowCurrentAction && currentStepAction?.href ? (
                    <a
                      href={currentStepAction.href}
                      target={currentStepAction.target || "_blank"}
                      rel={currentStepAction.rel || "noreferrer"}
                    >
                      <Button className="mt-2 h-9 rounded-xl px-4 text-sm font-medium">
                        {currentStepAction.label}
                      </Button>
                    </a>
                  ) : null}
                  {shouldShowCurrentAction && !currentStepAction?.href && currentStepAction?.onClick ? (
                    <Button
                      className="mt-2 h-9 rounded-xl px-4 text-sm font-medium"
                      onClick={currentStepAction.onClick}
                    >
                      {currentStepAction.label}
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 font-medium",
                      stateMeta.pillClassName
                    )}
                  >
                    {stateMeta.label}
                  </span>
                  {formattedDate ? (
                    <span className="inline-flex items-center rounded-full border border-white/70 bg-white/80 px-2.5 py-1 font-medium text-slate-500 shadow-sm">
                      {formattedDate}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
