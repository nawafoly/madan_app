import { type ComponentProps, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatNumberEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Building2,
  Landmark,
  Mail,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

type AppSettings = {
  name: string;
  email: string;
  phone: string;
  address: string;
  minInvestment: string;
  maxInvestment: string;
  defaultReturn: string;
  defaultHorizonYears: string;
};

type AppFieldKey = keyof AppSettings;

type AppValidation = {
  errors: Partial<Record<AppFieldKey, string>>;
  isValid: boolean;
  completedFields: number;
  minInvestmentValue: number | null;
  maxInvestmentValue: number | null;
  defaultReturnValue: number | null;
  defaultHorizonValue: number | null;
};

type SettingsGeneralTabProps = {
  app: AppSettings;
  appDirty: boolean;
  appValidation: AppValidation;
  appIssuesCount: number;
  appSettingsFieldsCount: number;
  changedAppFieldsCount: number;
  investmentRangePreview: string;
  returnProfilePreview: string;
  shouldShowAppFieldFeedback: (key: AppFieldKey) => boolean;
  onAppFieldChange: (key: AppFieldKey, value: string) => void;
};

export default function SettingsGeneralTab({
  app,
  appDirty,
  appValidation,
  appIssuesCount,
  appSettingsFieldsCount,
  changedAppFieldsCount,
  investmentRangePreview,
  returnProfilePreview,
  shouldShowAppFieldFeedback,
  onAppFieldChange,
}: SettingsGeneralTabProps) {
  return (
    <TabsContent value="general" className="space-y-6">
      <Card className="overflow-hidden border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(242,183,5,0.14),transparent_25%),linear-gradient(135deg,#ffffff_0%,#f8fafc_48%,#eef4ff_100%)] shadow-[0_28px_75px_-44px_rgba(15,23,42,0.35)]">
        <CardContent className="px-6 py-6 sm:px-8 sm:py-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)] xl:items-end">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border border-[#F2B705]/30 bg-[#F2B705]/12 px-3 py-1 text-xs font-semibold text-[#8d6700] shadow-none">
                  <Sparkles className="h-3.5 w-3.5" />
                  تجربة الإعدادات
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold shadow-none",
                    appDirty
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  )}
                >
                  {appDirty
                    ? `${formatNumberEN(changedAppFieldsCount)} تغييرات قيد المراجعة`
                    : "جميع القيم متزامنة"}
                </Badge>
              </div>

              <div className="space-y-3">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                  إعدادات المنصة الأساسية
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-slate-600">
                  لوحة تحكم مقسمة إلى وحدات واضحة للهوية، التواصل، سياسات
                  الاستثمار، والإعدادات المالية الافتراضية.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <SettingsOverviewStat
                  icon={Building2}
                  label="المنصة"
                  value={app.name || "غير محدد"}
                  helper="هوية المنصة في النظام"
                />
                <SettingsOverviewStat
                  icon={Landmark}
                  label="نطاق الاستثمار"
                  value={investmentRangePreview}
                  helper="النطاق المرجعي للاستثمار"
                />
                <SettingsOverviewStat
                  icon={TrendingUp}
                  label="ملف العائد"
                  value={returnProfilePreview}
                  helper="العائد والمدة الافتراضية"
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-[#1e3358] bg-[linear-gradient(180deg,rgba(8,18,47,0.98),rgba(2,6,23,0.96))] p-6 text-white shadow-[0_28px_60px_-42px_rgba(2,6,23,0.85)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                    ملخص الحالة
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight">
                    جاهزية الإعدادات
                  </h3>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-semibold shadow-none",
                    appValidation.isValid
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                      : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                  )}
                >
                  {appValidation.isValid ? "مستقر" : "يحتاج مراجعة"}
                </Badge>
              </div>

              <div className="mt-6 grid gap-3">
                <SettingsSidebarMetric
                  label="الحقول المكتملة"
                  value={`${formatNumberEN(appValidation.completedFields)}/${formatNumberEN(appSettingsFieldsCount)}`}
                  helper="مستوى اكتمال الإعدادات الأساسية"
                />
                <SettingsSidebarMetric
                  label="التواصل الرسمي"
                  value={app.email || "غير محدد"}
                  helper={app.phone || "أضف رقم خدمة عملاء رسمي"}
                />
                <SettingsSidebarMetric
                  label="المراجعات المطلوبة"
                  value={
                    appIssuesCount === 0
                      ? "لا توجد ملاحظات حرجة"
                      : `${formatNumberEN(appIssuesCount)} ملاحظات`
                  }
                  helper="سيتم حفظ هذه الإعدادات ضمن إعدادات المنصة."
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="space-y-6">
          <SettingsSectionCard
            icon={Building2}
            eyebrow="الوحدة 01"
            title="معلومات المنصة"
            description="الهوية الأساسية للمنصة كما تظهر داخليًا وفي الواجهات الرسمية."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <SettingsField
                label="اسم المنصة"
                description="الاسم الرسمي المستخدم في التقارير والواجهات."
                placeholder="مثال: منصة معدن البناء"
                value={app.name}
                onChange={value => onAppFieldChange("name", value)}
                error={
                  shouldShowAppFieldFeedback("name")
                    ? appValidation.errors.name
                    : undefined
                }
              />
              <SettingsField
                label="العنوان"
                description="عنوان مختصر للمقر أو الجهة التشغيلية."
                placeholder="الرياض، المملكة العربية السعودية"
                value={app.address}
                onChange={value => onAppFieldChange("address", value)}
                textarea
                rows={4}
                containerClassName="md:col-span-2"
                className="min-h-[124px]"
                error={
                  shouldShowAppFieldFeedback("address")
                    ? appValidation.errors.address
                    : undefined
                }
              />
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            icon={Mail}
            eyebrow="الوحدة 02"
            title="بيانات التواصل"
            description="بيانات التواصل الرسمية التي يعتمد عليها المستخدمون والإدارة."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <SettingsField
                label="البريد الإلكتروني"
                description="البريد المعتمد للدعم والتواصل الرسمي."
                placeholder="support@maedin.sa"
                value={app.email}
                onChange={value => onAppFieldChange("email", value)}
                type="email"
                dir="ltr"
                inputClassName="text-left"
                error={
                  shouldShowAppFieldFeedback("email")
                    ? appValidation.errors.email
                    : undefined
                }
              />
              <SettingsField
                label="رقم الهاتف"
                description="رقم خدمة العملاء أو خط الدعم الأساسي."
                placeholder="+966 5X XXX XXXX"
                value={app.phone}
                onChange={value => onAppFieldChange("phone", value)}
                dir="ltr"
                inputClassName="text-left"
                error={
                  shouldShowAppFieldFeedback("phone")
                    ? appValidation.errors.phone
                    : undefined
                }
              />
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            icon={Landmark}
            eyebrow="الوحدة 03"
            title="ضوابط الاستثمار"
            description="الحدود التشغيلية الافتراضية لطلبات الاستثمار الجديدة."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <SettingsField
                label="الحد الأدنى للاستثمار"
                description="أقل قيمة مسموحة لبدء طلب استثماري."
                placeholder="50000"
                value={app.minInvestment}
                onChange={value => onAppFieldChange("minInvestment", value)}
                suffix="ر.س"
                inputMode="decimal"
                dir="ltr"
                inputClassName="text-right font-semibold tabular-nums"
                helper={
                  appValidation.minInvestmentValue !== null
                    ? `القيمة الحالية: ${formatNumberEN(appValidation.minInvestmentValue)} ر.س`
                    : "اكتب الرقم بدون نصوص إضافية."
                }
                error={
                  shouldShowAppFieldFeedback("minInvestment")
                    ? appValidation.errors.minInvestment
                    : undefined
                }
              />
              <SettingsField
                label="الحد الأعلى للاستثمار"
                description="السقف الافتراضي لكل استثمار داخل المنصة."
                placeholder="500000"
                value={app.maxInvestment}
                onChange={value => onAppFieldChange("maxInvestment", value)}
                suffix="ر.س"
                inputMode="decimal"
                dir="ltr"
                inputClassName="text-right font-semibold tabular-nums"
                helper={
                  appValidation.maxInvestmentValue !== null
                    ? `القيمة الحالية: ${formatNumberEN(appValidation.maxInvestmentValue)} ر.س`
                    : "اكتب الرقم بدون نصوص إضافية."
                }
                error={
                  shouldShowAppFieldFeedback("maxInvestment")
                    ? appValidation.errors.maxInvestment
                    : undefined
                }
              />
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard
            icon={TrendingUp}
            eyebrow="الوحدة 04"
            title="الإعدادات المالية الافتراضية"
            description="العائد والمدة المرجعية للمشاريع والاستثمارات الجديدة."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <SettingsField
                label="العائد الافتراضي"
                description="نسبة عائد مرجعية قبل تخصيص كل مشروع."
                placeholder="12"
                value={app.defaultReturn}
                onChange={value => onAppFieldChange("defaultReturn", value)}
                suffix="%"
                inputMode="decimal"
                dir="ltr"
                inputClassName="text-right font-semibold tabular-nums"
                helper={
                  appValidation.defaultReturnValue !== null
                    ? `المعدل الحالي: ${formatNumberEN(appValidation.defaultReturnValue)}%`
                    : "أدخل نسبة مرجعية للمشاريع الجديدة."
                }
                error={
                  shouldShowAppFieldFeedback("defaultReturn")
                    ? appValidation.errors.defaultReturn
                    : undefined
                }
              />
              <SettingsField
                label="الأفق الافتراضي"
                description="المدة الأساسية للاستثمار قبل التخصيص."
                placeholder="3"
                value={app.defaultHorizonYears}
                onChange={value =>
                  onAppFieldChange("defaultHorizonYears", value)
                }
                suffix="سنة"
                inputMode="decimal"
                dir="ltr"
                inputClassName="text-right font-semibold tabular-nums"
                helper={
                  appValidation.defaultHorizonValue !== null
                    ? `المدة الحالية: ${formatNumberEN(appValidation.defaultHorizonValue)} سنة`
                    : "استخدم رقمًا يمثل عدد السنوات."
                }
                error={
                  shouldShowAppFieldFeedback("defaultHorizonYears")
                    ? appValidation.errors.defaultHorizonYears
                    : undefined
                }
              />
            </div>
          </SettingsSectionCard>
        </div>
      </div>
    </TabsContent>
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

function SettingsField({
  label,
  description,
  value,
  onChange,
  placeholder,
  helper,
  error,
  suffix,
  type = "text",
  textarea = false,
  rows = 3,
  dir,
  inputMode,
  className,
  containerClassName,
  inputClassName,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  suffix?: string;
  type?: string;
  textarea?: boolean;
  rows?: number;
  dir?: "ltr" | "rtl";
  inputMode?: ComponentProps<"input">["inputMode"];
  className?: string;
  containerClassName?: string;
  inputClassName?: string;
}) {
  const hasValue = String(value || "").trim().length > 0;
  const statusTone = error
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : hasValue
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-50 text-slate-500";

  const sharedControlClassName = cn(
    "rounded-xl border-slate-200 bg-white/90 px-4 text-sm shadow-none transition hover:border-slate-300 focus-visible:ring-slate-300/60",
    error && "border-rose-300 bg-rose-50/60 focus-visible:ring-rose-200",
    hasValue && !error && "border-emerald-300/80 bg-emerald-50/30",
    inputClassName,
    className
  );

  return (
    <div className={cn("space-y-3", containerClassName)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label className="text-[13px] font-semibold text-slate-900">
            {label}
          </Label>
          <p className="text-xs leading-6 text-slate-500">{description}</p>
        </div>
        <div
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            statusTone
          )}
        >
          {error ? "يحتاج مراجعة" : hasValue ? "مكتمل" : "بانتظار الإدخال"}
        </div>
      </div>

      {textarea ? (
        <Textarea
          rows={rows}
          dir={dir}
          value={value}
          aria-invalid={!!error}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className={cn("min-h-[108px] py-3 leading-7", sharedControlClassName)}
        />
      ) : suffix ? (
        <InputGroup className="h-12 rounded-xl border-slate-200 bg-white/90 shadow-none">
          <InputGroupInput
            type={type}
            dir={dir}
            value={value}
            inputMode={inputMode}
            aria-invalid={!!error}
            placeholder={placeholder}
            onChange={e => onChange(e.target.value)}
            className={cn("h-full px-4", sharedControlClassName)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText className="text-xs font-semibold text-slate-500">
              {suffix}
            </InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Input
          type={type}
          dir={dir}
          value={value}
          inputMode={inputMode}
          aria-invalid={!!error}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className={cn("h-12", sharedControlClassName)}
        />
      )}

      <p
        className={cn(
          "text-xs leading-6",
          error ? "text-rose-600" : "text-slate-500"
        )}
      >
        {error || helper || " "}
      </p>
    </div>
  );
}
