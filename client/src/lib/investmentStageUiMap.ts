import type {
  InvestmentStage,
  InvestmentTimelineStepKey,
} from "@/lib/investmentStage";

export type InvestmentStageBadge = {
  label: string;
  className: string;
};

export type InvestmentStageUi = {
  title: string;
  description: string;
  badge: InvestmentStageBadge;
  investmentStatus: InvestmentStageBadge;
  contractStatus: InvestmentStageBadge;
  timelineStepKey: InvestmentTimelineStepKey | null;
  emphasis?: boolean;
};

const blueBadge =
  "border border-blue-200 bg-blue-50 text-blue-700";
const cyanBadge =
  "border border-cyan-200 bg-cyan-50 text-cyan-700";
const violetBadge =
  "border border-violet-200 bg-violet-50 text-violet-700";
const indigoBadge =
  "border border-indigo-200 bg-indigo-50 text-indigo-700";
const amberBadge =
  "border border-amber-200 bg-amber-50 text-amber-700";
const emeraldBadge =
  "border border-emerald-200 bg-emerald-50 text-emerald-700";
const slateBadge =
  "border border-slate-200 bg-slate-100 text-slate-700";
const redBadge =
  "border border-red-200 bg-red-50 text-red-700";

export const investmentStageUiMap: Record<InvestmentStage, InvestmentStageUi> =
  {
    request_created: {
      title: "تم استلام طلب الاستثمار",
      description:
        "استلمنا طلبك وبدأت المراجعة الأولية للبيانات قبل إنشاء سجل الاستثمار.",
      badge: {
        label: "طلب جديد",
        className: blueBadge,
      },
      investmentStatus: {
        label: "تم استلام الطلب",
        className: blueBadge,
      },
      contractStatus: {
        label: "لا يوجد عقد بعد",
        className: slateBadge,
      },
      timelineStepKey: "request_created",
    },
    investment_created: {
      title: "تم إنشاء سجل الاستثمار",
      description:
        "أصبح طلبك مرتبطًا بسجل استثماري مستقل، وننتقل الآن إلى تجهيز مرحلة التعاقد.",
      badge: {
        label: "سجل الاستثمار جاهز",
        className: cyanBadge,
      },
      investmentStatus: {
        label: "تم إنشاء سجل الاستثمار",
        className: cyanBadge,
      },
      contractStatus: {
        label: "لم يبدأ تجهيز العقد بعد",
        className: slateBadge,
      },
      timelineStepKey: "investment_created",
    },
    contract_preparing: {
      title: "جاري تجهيز العقد الاستثماري",
      description:
        "نعمل الآن على إعداد نسخة العقد النهائية ومراجعتها قبل إرسالها لك للتوقيع.",
      badge: {
        label: "تجهيز العقد",
        className: violetBadge,
      },
      investmentStatus: {
        label: "جاري تجهيز العقد",
        className: violetBadge,
      },
      contractStatus: {
        label: "العقد قيد الإعداد",
        className: violetBadge,
      },
      timelineStepKey: "contract_preparing",
    },
    awaiting_signature: {
      title: "العقد جاهز لتوقيعك",
      description:
        "تم إرسال العقد الاستثماري لك، والخطوة الحالية هي مراجعته ورفع النسخة الموقعة.",
      badge: {
        label: "بانتظار توقيعك",
        className: indigoBadge,
      },
      investmentStatus: {
        label: "بانتظار توقيعك على العقد",
        className: indigoBadge,
      },
      contractStatus: {
        label: "تم إرسال العقد",
        className: blueBadge,
      },
      timelineStepKey: "awaiting_signature",
      emphasis: true,
    },
    contract_under_review: {
      title: "العقد الموقّع تحت المراجعة",
      description:
        "استلمنا النسخة الموقعة ونجري الآن المراجعة النهائية قبل اعتماد الاستثمار.",
      badge: {
        label: "قيد الاعتماد النهائي",
        className: amberBadge,
      },
      investmentStatus: {
        label: "بانتظار الاعتماد النهائي",
        className: amberBadge,
      },
      contractStatus: {
        label: "بانتظار المراجعة والاعتماد النهائي",
        className: amberBadge,
      },
      timelineStepKey: "contract_under_review",
    },
    contract_verified: {
      title: "تم اعتماد العقد",
      description:
        "اكتملت مراجعة العقد بنجاح، والاستثمار الآن جاهز لبدء التفعيل الرسمي.",
      badge: {
        label: "العقد معتمد",
        className: emeraldBadge,
      },
      investmentStatus: {
        label: "جاهز لبدء الاستثمار",
        className: emeraldBadge,
      },
      contractStatus: {
        label: "تم اعتماد العقد",
        className: emeraldBadge,
      },
      timelineStepKey: "contract_verified",
    },
    active: {
      title: "بدأ الاستثمار",
      description:
        "تم التفعيل الرسمي وبدأت مدة الاستثمار واحتساب الربح وفق الشروط المعتمدة.",
      badge: {
        label: "استثمار نشط",
        className: emeraldBadge,
      },
      investmentStatus: {
        label: "بدأ الاستثمار",
        className: emeraldBadge,
      },
      contractStatus: {
        label: "العقد المعتمد ساري",
        className: emeraldBadge,
      },
      timelineStepKey: null,
    },
    stopped: {
      title: "تم إيقاف الاستثمار بطلب العميل",
      description:
        "أوقف الاستثمار قبل نهايته الطبيعية بناءً على طلب العميل، واعتمدت التسوية النهائية وفق المدة الفعلية والبيانات المثبتة في السجل.",
      badge: {
        label: "إيقاف مبكر",
        className: amberBadge,
      },
      investmentStatus: {
        label: "تم إيقاف الاستثمار بطلب العميل",
        className: amberBadge,
      },
      contractStatus: {
        label: "العقد معتمد والاستثمار موقوف",
        className: slateBadge,
      },
      timelineStepKey: null,
      emphasis: true,
    },
    completed: {
      title: "مكتمل",
      description:
        "انتهت مدة الاستثمار وأغلق العائد النهائي وفق الحالة النهائية المسجلة.",
      badge: {
        label: "مكتمل",
        className: slateBadge,
      },
      investmentStatus: {
        label: "مكتمل",
        className: slateBadge,
      },
      contractStatus: {
        label: "العقد مكتمل الإجراء",
        className: slateBadge,
      },
      timelineStepKey: null,
    },
    rejected: {
      title: "تم رفض الاستثمار",
      description:
        "توقف الطلب عند مرحلة الرفض. يمكنك التواصل معنا لمعرفة السبب أو مناقشة الخطوة التالية.",
      badge: {
        label: "مرفوض",
        className: redBadge,
      },
      investmentStatus: {
        label: "تم رفض الاستثمار",
        className: redBadge,
      },
      contractStatus: {
        label: "تم إيقاف التعاقد",
        className: redBadge,
      },
      timelineStepKey: null,
      emphasis: true,
    },
    cancelled: {
      title: "تم إلغاء الاستثمار",
      description:
        "تم إلغاء مسار الاستثمار الحالي قبل التفعيل، ويمكن إعادة البدء بطلب جديد عند الحاجة.",
      badge: {
        label: "ملغي",
        className: slateBadge,
      },
      investmentStatus: {
        label: "تم إلغاء الاستثمار",
        className: slateBadge,
      },
      contractStatus: {
        label: "تم إلغاء التعاقد",
        className: slateBadge,
      },
      timelineStepKey: null,
      emphasis: true,
    },
  };

export function getInvestmentStageUi(stage: InvestmentStage) {
  return investmentStageUiMap[stage];
}
