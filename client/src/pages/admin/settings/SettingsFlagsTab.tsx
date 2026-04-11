import { type ReactNode } from "react";
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
  Globe,
  SlidersHorizontal,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

type FlagsSettings = {
  disableInvestments: boolean;
  disableMessages: boolean;
  vipOnlyMode: boolean;
  hideVipProjects: boolean;
  maintenanceMode: boolean;
};

type FlagKey = keyof FlagsSettings;

type SettingsFlagsTabProps = {
  flags: FlagsSettings;
  enabledFlagsCount: number;
  onFlagChange: (key: FlagKey, value: boolean) => void;
};

export default function SettingsFlagsTab({
  flags,
  enabledFlagsCount,
  onFlagChange,
}: SettingsFlagsTabProps) {
  return (
    <TabsContent value="flags" className="space-y-6">
      <SettingsTabHero
        eyebrow="مركز الميزات التجريبية"
        title="الميزات التجريبية"
        description="إدارة مفاتيح التحكم التشغيلي بشكل أوضح، مع فصل الإعدادات المتعلقة بالإتاحة العامة عن الإعدادات الخاصة بجمهور VIP."
        stats={[
          {
            icon: SlidersHorizontal,
            label: "المفاتيح",
            value: formatNumberEN(Object.keys(flags).length),
            helper: "إجمالي مفاتيح التحكم",
          },
          {
            icon: CheckCircle2,
            label: "المفعّل",
            value: formatNumberEN(enabledFlagsCount),
            helper: "عدد المفاتيح المفعلة",
          },
          {
            icon: Globe,
            label: "الجمهور",
            value: flags.vipOnlyMode ? "VIP" : "عام",
            helper: "وضع إتاحة المحتوى الحالي",
          },
        ]}
        panel={
          <SettingsHeroPanel
            status={enabledFlagsCount > 0 ? "منظّم" : "افتراضي"}
            title="مفاتيح التحكم"
            description="استخدم هذا التبويب لتفعيل أو تعطيل سلوكيات واجهة محددة من دون أي تغيير في منطق الأعمال."
            metrics={[
              {
                label: "وضع الصيانة",
                value: flags.maintenanceMode ? "مفعل" : "مغلق",
                helper: "وضع الصيانة",
              },
              {
                label: "الاستثمارات",
                value: flags.disableInvestments ? "معطلة" : "متاحة",
                helper: "إنشاء استثمار جديد",
              },
              {
                label: "قناة VIP",
                value: flags.vipOnlyMode ? "حصرية" : "عامة",
                helper: "VIP فقط / إخفاء مشاريع VIP",
              },
            ]}
          />
        }
      />

      <div className="space-y-6">
        <div className="space-y-6">
          <SettingsSectionCard
            icon={SlidersHorizontal}
            eyebrow="الوحدة 01"
            title="إتاحة المنصة"
            description="مفاتيح تؤثر على إتاحة أجزاء النظام للعامة أو للإدارة."
          >
            <div className="grid gap-4">
              <Toggle
                label="وضع الصيانة"
                description="إيقاف واجهة الموقع مؤقتًا أو إظهار وضع الصيانة."
                value={flags.maintenanceMode}
                onChange={(value: boolean) =>
                  onFlagChange("maintenanceMode", value)
                }
              />
              <Toggle
                label="تعطيل الاستثمارات"
                description="منع إنشاء استثمار جديد من الواجهة الحالية."
                value={flags.disableInvestments}
                onChange={(value: boolean) =>
                  onFlagChange("disableInvestments", value)
                }
              />
              <Toggle
                label="تعطيل الرسائل"
                description="إخفاء أو إيقاف نموذج وصفحة الرسائل للمستخدمين."
                value={flags.disableMessages}
                onChange={(value: boolean) =>
                  onFlagChange("disableMessages", value)
                }
              />
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            icon={Users}
            eyebrow="الوحدة 02"
            title="ضوابط الجمهور"
            description="مفاتيح التحكم في ظهور المحتوى الخاص بالمستخدمين العامين أو جمهور VIP."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Toggle
                label="وضع VIP فقط"
                description="عرض محتوى VIP فقط داخل الواجهة العامة."
                value={flags.vipOnlyMode}
                onChange={(value: boolean) =>
                  onFlagChange("vipOnlyMode", value)
                }
              />
              <Toggle
                label="إخفاء مشاريع VIP من العامة"
                description="إخفاء مشاريع VIP من الواجهات العامة غير المخصصة."
                value={flags.hideVipProjects}
                onChange={(value: boolean) =>
                  onFlagChange("hideVipProjects", value)
                }
              />
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
    <Card className="overflow-hidden border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(242,183,5,0.14),transparent_25%),linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef4ff_100%)] shadow-[0_28px_75px_-44px_rgba(15,23,42,0.35)]">
      <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)] xl:items-end">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border border-[#F2B705]/30 bg-[#F2B705]/12 px-3 py-1 text-xs font-semibold text-[#8d6700] shadow-none">
                <Sparkles className="h-3.5 w-3.5" />
                {eyebrow}
              </Badge>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                {title}
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-600">
                {description}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
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
    <div className="rounded-[28px] border border-[#1e3358] bg-[linear-gradient(180deg,rgba(8,18,47,0.98),rgba(2,6,23,0.96))] p-6 text-white shadow-[0_28px_60px_-42px_rgba(2,6,23,0.85)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
            الجاهزية
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight">{title}</h3>
        </div>
        <Badge
          variant="outline"
          className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/80 shadow-none"
        >
          {status}
        </Badge>
      </div>

      <p className="mt-4 text-sm leading-7 text-white/60">{description}</p>

      <div className="mt-6 grid gap-3">
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
    <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.3)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 text-slate-700">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 text-base font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      <div className="mt-2 text-xs leading-6 text-slate-500">{helper}</div>
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
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs text-white/55">{label}</div>
      <div className="mt-2 text-sm font-semibold text-white/92">{value}</div>
      <div className="mt-1 text-xs text-white/50">{helper}</div>
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
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-3 text-slate-700">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {eyebrow}
              </div>
              <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                {title}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
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
        <div className="flex flex-wrap items-center justify-start gap-2">
          <span className="font-semibold text-slate-900">{label}</span>
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
          <p className="text-sm leading-6 text-slate-600">{description}</p>
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
