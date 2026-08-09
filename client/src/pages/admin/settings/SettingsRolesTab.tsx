import type { ReactNode } from "react";
import {
  CheckCircle2,
  KeyRound,
  Pencil,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type RoleItem = {
  key: string;
  nameAr: string;
  nameEn?: string;
  description?: string;
  permissions: string[];
  isActive: boolean;
};

type PermissionDefinition = {
  key: string;
  label: string;
};

type SettingsRolesTabProps = {
  activeRolesCount: number;
  formatNumberEN: (value: number) => string;
  getRoleDisplayLabel: (roleKey: string) => string;
  onCreateRole: () => void;
  onDeleteRole: (roleKey: string) => void;
  onEditRole: (role: RoleItem) => void;
  onToggleRoleActive: (roleKey: string) => void;
  permissionDefinitions: readonly PermissionDefinition[];
  roles: readonly RoleItem[];
  systemRoleKeys: readonly string[];
  systemRolesCount: number;
};

export default function SettingsRolesTab({
  activeRolesCount,
  formatNumberEN,
  getRoleDisplayLabel,
  onCreateRole,
  onDeleteRole,
  onEditRole,
  onToggleRoleActive,
  permissionDefinitions,
  roles,
  systemRoleKeys,
  systemRolesCount,
}: SettingsRolesTabProps) {
  return (
    <TabsContent value="roles" className="space-y-6">
      <SettingsTabHero
        eyebrow="الأدوار والصلاحيات"
        title="الأدوار والصلاحيات"
        description="إدارة الأدوار وصلاحياتها من خلال لوحة أكثر تنظيمًا، مع إبراز الأدوار الأساسية، الأدوار النشطة، وحجم كتالوج الصلاحيات المتاح."
        stats={[
          {
            icon: KeyRound,
            label: "الأدوار",
            value: formatNumberEN(roles.length),
            helper: "إجمالي الأدوار المحفوظة",
          },
          {
            icon: CheckCircle2,
            label: "النشطة",
            value: formatNumberEN(activeRolesCount),
            helper: "عدد الأدوار النشطة حاليًا",
          },
          {
            icon: Shield,
            label: "الصلاحيات",
            value: formatNumberEN(permissionDefinitions.length),
            helper: "كتالوج الصلاحيات المتاح",
          },
        ]}
        panel={
          <SettingsHeroPanel
            status="Governed"
            title="حوكمة الوصول"
            description="كل الأدوار هنا تعتمد على نفس البنية الحالية في Firestore، لكن الواجهة الآن أوضح في عرض الحالة والصلاحيات والإجراءات."
            metrics={[
              {
                label: "الأدوار الأساسية",
                value: formatNumberEN(systemRolesCount),
                helper: "System roles",
              },
              {
                label: "الأدوار المخصصة",
                value: formatNumberEN(roles.length - systemRolesCount),
                helper: "Custom roles",
              },
              {
                label: "الحالة العامة",
                value: activeRolesCount > 0 ? "نشطة" : "فارغة",
                helper: "بحسب عدد الأدوار المفعلة",
              },
            ]}
          />
        }
      />

      <SettingsSectionCard
        icon={KeyRound}
        eyebrow="الوحدة 01"
        title="دليل الأدوار"
        description="أنشئ أدوارًا جديدة أو راجع الأدوار الحالية وصلاحياتها من بطاقة موحدة لكل دور."
        action={
          <Button
            onClick={onCreateRole}
            className="bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
          >
            <Plus className="ml-2 h-4 w-4" /> دور جديد
          </Button>
        }
      >
        {roles.length ? (
          <div className="grid gap-4 xl:grid-cols-2 min-w-0">
            {roles
              .slice()
              .sort((a, b) => a.key.localeCompare(b.key))
              .map(role => {
                const isSystemRole = systemRoleKeys.includes(role.key);

                return (
                  <div
                    key={role.key}
                    className="rounded-[24px] border border-slate-200/80 bg-slate-50/60 p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)] min-w-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 min-w-0">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <Badge variant="outline" className="rounded-full min-w-0">
                            {getRoleDisplayLabel(role.key) || role.key}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full",
                              role.isActive
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-white text-slate-500"
                            )}
                          >
                            {role.isActive ? "نشط" : "موقوف"}
                          </Badge>
                          {isSystemRole ? (
                            <Badge className="rounded-full min-w-0">أساسي</Badge>
                          ) : null}
                        </div>

                        <div>
                          <div className="text-lg font-semibold tracking-tight text-slate-950 break-words">
                            {role.nameAr}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500 break-words">
                            {role.nameEn || role.key}
                          </div>
                        </div>

                        <p className="min-h-[48px] text-sm leading-7 text-slate-600 break-words">
                          {role.description ||
                            "لا يوجد وصف مخصص لهذا الدور بعد."}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          الصلاحيات
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 break-words leading-tight">
                          {formatNumberEN(role.permissions?.length || 0)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 min-w-0">
                      {role.permissions?.length ? (
                        role.permissions.slice(0, 8).map(permission => (
                          <Badge
                            key={permission}
                            variant="secondary"
                            className="rounded-full min-w-0"
                          >
                            {permission}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500 break-words">
                          لا توجد صلاحيات مرتبطة بهذا الدور.
                        </span>
                      )}
                      {(role.permissions?.length || 0) > 8 ? (
                        <Badge variant="outline" className="rounded-full min-w-0">
                          +{(role.permissions?.length || 0) - 8}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 min-w-0">
                      <Button variant="outline" onClick={() => onEditRole(role)}>
                        <Pencil className="ml-2 h-4 w-4" /> تعديل
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => onToggleRoleActive(role.key)}
                      >
                        {role.isActive ? "إيقاف" : "تفعيل"}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => onDeleteRole(role.key)}
                        disabled={isSystemRole}
                      >
                        <Trash2 className="ml-2 h-4 w-4" /> حذف
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 min-w-0 break-words">
            لا توجد أدوار محفوظة بعد. ابدأ بإنشاء دور جديد لإكمال الهيكل.
          </div>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard
        icon={Shield}
        eyebrow="الوحدة 02"
        title="دليل الصلاحيات"
        description="مرجع سريع للصلاحيات المتاحة داخل النظام كما يتم استخدامها حاليًا."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-w-0">
          {permissionDefinitions.map(permission => (
            <div
              key={permission.key}
              className="rounded-[20px] border border-slate-200 bg-white p-4 min-w-0"
            >
              <div className="text-sm font-semibold text-slate-950 break-words">
                {permission.label}
              </div>
              <div className="mt-2 text-xs leading-6 text-slate-500 break-words">
                {permission.key}
              </div>
            </div>
          ))}
        </div>
      </SettingsSectionCard>
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
