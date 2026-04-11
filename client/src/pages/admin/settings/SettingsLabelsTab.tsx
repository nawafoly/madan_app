import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import { formatNumberEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  FolderOpen,
  Globe,
  Plus,
  Sparkles,
  Tags,
  Trash2,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

type LabelRecord = Record<string, { ar: string; en?: string }>;

type LabelsSettings = {
  projectTypes: LabelRecord;
  projectStatuses: LabelRecord;
  investmentStatuses: LabelRecord;
  uiRoles: LabelRecord;
};

type LabelsFieldKey = keyof LabelsSettings;

type SettingsLabelsTabProps = {
  labels: LabelsSettings;
  totalLabelEntries: number;
  onLabelsFieldChange: (key: LabelsFieldKey, value: LabelRecord) => void;
};

export default function SettingsLabelsTab({
  labels,
  totalLabelEntries,
  onLabelsFieldChange,
}: SettingsLabelsTabProps) {
  return (
    <TabsContent value="labels" className="space-y-6">
      <SettingsTabHero
        eyebrow="إدارة المسميات"
        title="المسميات"
        description="إدارة نصوص العرض المركزية للأنواع والحالات والأدوار من داخل لوحة موحدة، بحيث تبقى الهوية اللغوية للنظام متماسكة وسهلة الصيانة."
        stats={[
          {
            icon: Tags,
            label: "Entries",
            value: formatNumberEN(totalLabelEntries),
            helper: "إجمالي المسميات المحفوظة",
          },
          {
            icon: FolderOpen,
            label: "Categories",
            value: "4",
            helper: "أنواع، حالات، أدوار، استثمارات",
          },
          {
            icon: Globe,
            label: "Languages",
            value: "عربي / إنجليزي",
            helper: "حقول العرض المتاحة",
          },
        ]}
        panel={
          <SettingsHeroPanel
            status="Centralized"
            title="قاموس العرض"
            description="التحكم في نصوص الواجهة من مكان واحد يساعد على الحفاظ على التناسق بين صفحات الإدارة والعملاء."
            metrics={[
              {
                label: "أنواع المشاريع",
                value: formatNumberEN(
                  Object.keys(labels.projectTypes || {}).length
                ),
                helper: "أنواع المشاريع",
              },
              {
                label: "حالات المشاريع",
                value: formatNumberEN(
                  Object.keys(labels.projectStatuses || {}).length
                ),
                helper: "حالات المشاريع",
              },
              {
                label: "حالات الاستثمار",
                value: formatNumberEN(
                  Object.keys(labels.investmentStatuses || {}).length
                ),
                helper: "حالات الاستثمار ومسميات الأدوار",
              },
            ]}
          />
        }
      />

      <div className="space-y-6">
        <div className="space-y-6">
          <SettingsSectionCard
            icon={Tags}
            eyebrow="الوحدة 01"
            title="أنواع المشاريع"
            description="مسميات أنواع المشاريع التي تظهر في صفحات الإدارة والعرض."
          >
            <LabelsEditor
              title="مسميات أنواع المشاريع"
              data={labels.projectTypes}
              onChange={next => onLabelsFieldChange("projectTypes", next)}
            />
          </SettingsSectionCard>

          <SettingsSectionCard
            icon={FolderOpen}
            eyebrow="الوحدة 02"
            title="حالات المشاريع"
            description="حالات المشاريع المعروضة في النظام للمستخدمين والإدارة."
          >
            <LabelsEditor
              title="مسميات حالات المشاريع"
              data={labels.projectStatuses}
              onChange={next => onLabelsFieldChange("projectStatuses", next)}
            />
          </SettingsSectionCard>

          <SettingsSectionCard
            icon={TrendingUp}
            eyebrow="الوحدة 03"
            title="حالات الاستثمار"
            description="النصوص المستخدمة لوصف مراحل وحالات الاستثمار داخل النظام."
          >
            <LabelsEditor
              title="مسميات حالات الاستثمارات"
              data={labels.investmentStatuses}
              onChange={next =>
                onLabelsFieldChange("investmentStatuses", next)
              }
            />
          </SettingsSectionCard>

          <SettingsSectionCard
            icon={Users}
            eyebrow="الوحدة 04"
            title="مسميات الأدوار في الواجهة"
            description="مسميات العرض للأدوار المختلفة كما تظهر في واجهات النظام."
          >
            <LabelsEditor
              title="مسميات الأدوار للعرض"
              data={labels.uiRoles}
              onChange={next => onLabelsFieldChange("uiRoles", next)}
            />
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

function LabelsEditor({
  title,
  data,
  onChange,
}: {
  title: string;
  data: LabelRecord;
  onChange: (next: LabelRecord) => void;
}) {
  const rows = Object.entries(data || {});

  const addRow = () => {
    const key = `new_${Date.now()}`;
    onChange({
      ...data,
      [key]: { ar: "جديد", en: "New" },
    });
  };

  const removeRow = (key: string) => {
    const next = { ...data };
    delete next[key];
    onChange(next);
  };

  const updateRow = (key: string, field: "ar" | "en", value: string) => {
    onChange({
      ...data,
      [key]: {
        ...data[key],
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold tracking-tight text-slate-950">
          {title}
        </h3>
        <Button variant="outline" onClick={addRow}>
          <Plus className="w-4 h-4 ml-2" /> إضافة
        </Button>
      </div>

      <div className="grid gap-3">
        {rows.map(([key, value]) => (
          <div
            key={key}
            className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4 shadow-[0_16px_32px_-30px_rgba(15,23,42,0.2)]"
          >
            <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-end">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  المفتاح
                </Label>
                <Input
                  value={key}
                  readOnly
                  className="h-11 rounded-xl border-slate-200 bg-white text-slate-600 shadow-none"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold text-slate-900">
                    عربي
                  </Label>
                  <Input
                    value={value.ar || ""}
                    onChange={event =>
                      updateRow(key, "ar", event.target.value)
                    }
                    className="h-11 rounded-xl border-slate-200 bg-white shadow-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold text-slate-900">
                    إنجليزي
                  </Label>
                  <Input
                    value={value.en || ""}
                    onChange={event =>
                      updateRow(key, "en", event.target.value)
                    }
                    dir="ltr"
                    className="h-11 rounded-xl border-slate-200 bg-white text-left shadow-none"
                  />
                </div>
              </div>

              <Button
                variant="destructive"
                onClick={() => removeRow(key)}
                className="lg:self-end"
              >
                <Trash2 className="w-4 h-4 ml-2" /> حذف
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
