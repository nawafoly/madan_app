import { type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { formatNumberEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Shield,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type SecuritySettings = {
  twoFactor: boolean;
};

type SettingsSecurityTabProps = {
  security: SecuritySettings;
  securityEnabledCount: number;
  onTwoFactorChange: (value: boolean) => void;
};

export default function SettingsSecurityTab({
  security,
  securityEnabledCount,
  onTwoFactorChange,
}: SettingsSecurityTabProps) {
  return (
    <TabsContent value="security" className="space-y-6">
      <SettingsTabHero
        eyebrow="ضوابط الأمان"
        title="إعدادات الأمان"
        description="لوحة موحدة للتحكم في إعدادات الأمان العامة للمنصة مع إبراز الحالة الحالية والجاهزية التشغيلية."
        stats={[
          {
            icon: Shield,
            label: "السياسات",
            value: formatNumberEN(Object.keys(security).length),
            helper: "سياسات أمنية مرتبطة بالإعدادات",
          },
          {
            icon: CheckCircle2,
            label: "المفعّل",
            value: formatNumberEN(securityEnabledCount),
            helper: "عدد السياسات المفعلة حاليًا",
          },
          {
            icon: KeyRound,
            label: "التحقق الثنائي",
            value: security.twoFactor ? "مفعّل" : "متوقف",
            helper: "المصادقة الثنائية للإدارة",
          },
        ]}
        panel={
          <SettingsHeroPanel
            status={security.twoFactor ? "محمي" : "أساسي"}
            title="حالة الأمان"
            description="هذا التبويب يحافظ على نفس المنطق الحالي مع تحسين واضح في العرض والقراءة واتخاذ القرار."
            metrics={[
              {
                label: "المصادقة الثنائية",
                value: security.twoFactor ? "مفعلة" : "غير مفعلة",
                helper: "للتحقق الإضافي أثناء تسجيل الدخول",
              },
              {
                label: "جاهزية المراجعة",
                value: "فورية",
                helper: "التغيير ينعكس فقط على واجهة الإعدادات الحالية",
              },
            ]}
          />
        }
      />

      <div className="space-y-6">
        <div className="space-y-6">
          <SettingsSectionCard
            icon={Shield}
            eyebrow="الوحدة 01"
            title="سياسة المصادقة"
            description="التحكم في إعداد التحقق الإضافي للإدارة من داخل لوحة إعدادات موحدة وأكثر وضوحًا."
          >
            <div className="grid gap-4 min-w-0">
              <Toggle
                label="المصادقة الثنائية"
                description="إضافة طبقة تحقق إضافية لحسابات الإدارة عند تسجيل الدخول."
                value={security.twoFactor}
                onChange={onTwoFactorChange}
              />
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            icon={CircleAlert}
            eyebrow="الوحدة 02"
            title="إرشادات الأمان"
            description="توصيات تشغيلية سريعة للحفاظ على مستوى موثوق من الأمان داخل لوحة الإدارة."
          >
            <div className="grid gap-4 md:grid-cols-2 min-w-0">
              <Alert className="border-slate-200 bg-slate-50 min-w-0">
                <Shield className="h-4 w-4" />
                <AlertTitle>وضع الحماية</AlertTitle>
                <AlertDescription className="leading-7">
                  عند تفعيل المصادقة الثنائية، تصبح حسابات الإدارة أكثر مقاومة
                  للوصول غير المصرح به.
                </AlertDescription>
              </Alert>
              <Alert className="border-slate-200 bg-slate-50 min-w-0">
                <KeyRound className="h-4 w-4" />
                <AlertTitle>بدون تغيير في المنطق</AlertTitle>
                <AlertDescription className="leading-7">
                  التعديل هنا بصري فقط، مع الحفاظ على نفس بنية المستند الحالية
                  ونفس سلوك الحفظ.
                </AlertDescription>
              </Alert>
            </div>
          </SettingsSectionCard>
        </div>
      </div>
    </TabsContent>
  );
}

function SettingsTabHero({
  eyebrow,
  title,
  description,
  stats,
  panel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  stats: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    helper: string;
  }>;
  panel: ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(242,183,5,0.14),transparent_25%),linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef4ff_100%)] shadow-[0_28px_75px_-44px_rgba(15,23,42,0.35)] min-w-0">
      <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)] xl:items-end min-w-0">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Badge className="rounded-full border border-[#F2B705]/30 bg-[#F2B705]/12 px-3 py-1 text-xs font-semibold text-[#8d6700] shadow-none min-w-0 break-words">
                <Sparkles className="h-3.5 w-3.5" />
                {eyebrow}
              </Badge>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem] break-words leading-tight">
                {title}
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 break-words">
                {description}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 min-w-0">
              {stats.map(stat => (
                <SettingsOverviewStat
                  key={stat.label}
                  icon={stat.icon}
                  label={stat.label}
                  value={stat.value}
                  helper={stat.helper}
                />
              ))}
            </div>
          </div>

          {panel}
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsHeroPanel({
  status,
  title,
  description,
  metrics,
}: {
  status: string;
  title: string;
  description: string;
  metrics: Array<{
    label: string;
    value: string;
    helper: string;
  }>;
}) {
  return (
    <div className="rounded-[28px] border border-[#1e3358] bg-[linear-gradient(180deg,rgba(8,18,47,0.98),rgba(2,6,23,0.96))] p-6 text-white shadow-[0_28px_60px_-42px_rgba(2,6,23,0.85)] min-w-0">
      <div className="flex items-start justify-between gap-4 min-w-0">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45 break-words">
            الجاهزية
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight break-words">{title}</h3>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/80 shadow-none min-w-0 break-words"
        >
          {status}
        </Badge>
      </div>

      <p className="mt-4 text-sm leading-7 text-white/60 break-words">{description}</p>

      <div className="mt-6 grid gap-3 min-w-0">
        {metrics.map(metric => (
          <SettingsSidebarMetric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            helper={metric.helper}
          />
        ))}
      </div>
    </div>
  );
}

function SettingsOverviewStat({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.3)] min-w-0">
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 break-words">
          {label}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-700 min-w-0">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 text-base font-semibold tracking-tight text-slate-950 break-words">
        {value}
      </div>
      <div className="mt-2 text-xs leading-6 text-slate-500 break-words">{helper}</div>
    </div>
  );
}

function SettingsSidebarMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 min-w-0">
      <div className="text-xs text-white/55 break-words">{label}</div>
      <div className="mt-2 text-sm font-semibold text-white/92 break-words">{value}</div>
      <div className="mt-1 text-xs text-white/50 break-words">{helper}</div>
    </div>
  );
}

function SettingsSectionCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  className,
  headerClassName,
  contentClassName,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]",
        className
      )}
    >
      <CardHeader
        className={cn("border-b border-slate-100/80 pb-6", headerClassName)}
      >
        <div className="flex items-start justify-between gap-4 min-w-0">
          <div className="flex items-start gap-4 min-w-0">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-3 text-slate-700 min-w-0">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 break-words">
                {eyebrow}
              </div>
              <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950 break-words">
                {title}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600 break-words">
                {description}
              </CardDescription>
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className={cn("pt-6", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      dir="rtl"
      className={cn(
        "flex items-start justify-between gap-3 rounded-[20px] border px-4 py-3.5 text-right transition-colors",
        value
          ? "border-emerald-200 bg-emerald-50/70"
          : "border-slate-200 bg-slate-50/70"
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center justify-start gap-2 min-w-0">
          <span className="font-semibold text-slate-900 break-words">{label}</span>
          <Badge
            variant="outline"
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-none",
              value
                ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                : "border-slate-200 bg-white text-slate-500"
            )}
          >
            {value ? "مفعّل" : "معطّل"}
          </Badge>
        </div>
        {description ? (
          <p className="text-sm leading-6 text-slate-600 break-words">{description}</p>
        ) : null}
      </div>

      <div className="shrink-0 pt-0.5">
        <Switch
          checked={value}
          onCheckedChange={onChange}
          aria-label={label}
          className="h-5 w-9 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-300"
        />
      </div>
    </div>
  );
}
