import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumberEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Save, type LucideIcon } from "lucide-react";

type HeaderBadgeTone = "success" | "warning" | "neutral" | "info";

type SettingsTabItem = {
  value: string;
  label: string;
  helper: string;
  icon: LucideIcon;
};

type SettingsBottomBarAction = {
  tabLabel: string;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
};

type SettingsLayoutProps = {
  activeTab: string;
  onActiveTabChange: (value: string) => void;
  settingsTabs: readonly SettingsTabItem[];
  activeTabMeta: SettingsTabItem;
  activeTabDescription: string;
  activeTabHeaderBadges: Array<{
    label: string;
    tone: HeaderBadgeTone;
  }>;
  error?: string | null;
  activeBottomBarAction: SettingsBottomBarAction | null;
  dirtyTabsCount: number;
  prioritizedActionKey: string | null;
  children: ReactNode;
};

const headerBadgeToneClassName: Record<HeaderBadgeTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  neutral: "border-slate-200 bg-white text-slate-600",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

export default function SettingsLayout({
  activeTab,
  onActiveTabChange,
  settingsTabs,
  activeTabMeta,
  activeTabDescription,
  activeTabHeaderBadges,
  error,
  activeBottomBarAction,
  dirtyTabsCount,
  prioritizedActionKey,
  children,
}: SettingsLayoutProps) {
  return (
    <div dir="rtl" className="space-y-6 text-right">
      <Tabs
        dir="rtl"
        value={activeTab}
        onValueChange={onActiveTabChange}
        className="space-y-0"
      >
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <aside className="w-full xl:sticky xl:top-0 xl:h-screen xl:w-[320px] xl:shrink-0">
            <div className="flex h-full flex-col overflow-hidden rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(8,18,47,0.98),rgba(2,6,23,0.97))] text-white shadow-[0_30px_80px_-46px_rgba(2,6,23,0.82)]">
              <div className="border-b border-white/10 px-5 py-6">
                <Badge className="w-fit rounded-full border border-[#F2B705]/25 bg-[#F2B705]/10 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-[#F2B705] shadow-none">
                  التنقل الداخلي
                </Badge>
                <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-[1.9rem]">
                  الإعدادات
                </h1>
              </div>

              <TabsList className="h-auto w-full flex-1 flex-col items-stretch justify-start gap-2 overflow-y-auto bg-transparent p-3">
                {settingsTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.value;

                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={cn(
                        "h-auto w-full flex-none items-start justify-between rounded-[24px] border border-transparent px-4 py-4 text-right transition-all",
                        isActive
                          ? "border-[#F2B705]/30 bg-white text-slate-950 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)]"
                          : "bg-white/[0.03] text-white/90 hover:bg-white/[0.06] hover:text-white"
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={cn(
                            "rounded-2xl border p-2",
                            isActive
                              ? "border-[#F2B705]/30 bg-[#F2B705]/12 text-[#8d6700]"
                              : "border-white/10 bg-white/[0.05] text-white/75"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="text-sm font-semibold">
                            {tab.label}
                          </div>
                          <div
                            className={cn(
                              "text-xs leading-6",
                              isActive ? "text-slate-600" : "text-white/60"
                            )}
                          >
                            {tab.helper}
                          </div>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                          isActive ? "bg-[#F2B705]" : "bg-white/15"
                        )}
                      />
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-8 pb-28 xl:pb-32">
            <div className="space-y-5 pt-1 xl:pt-4">
              <div className="space-y-3">
                <Badge className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-slate-600 shadow-none">
                  {activeTabMeta.label}
                </Badge>
                <div className="space-y-2">
                  <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    {activeTabMeta.label}
                  </h2>
                  <p className="max-w-3xl text-sm leading-7 text-slate-600">
                    {activeTabDescription}
                  </p>
                </div>
                {error ? (
                  <p className="text-sm font-medium text-red-600">{error}</p>
                ) : null}
              </div>

              {activeTabHeaderBadges.length ? (
                <div className="flex flex-wrap gap-2">
                  {activeTabHeaderBadges.map(badge => (
                    <Badge
                      key={badge.label}
                      variant="outline"
                      className={cn(
                        "rounded-full px-3 py-1 text-sm font-medium",
                        headerBadgeToneClassName[badge.tone]
                      )}
                    >
                      {badge.label}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            {children}

            {activeBottomBarAction ? (
              <SettingsBottomSaveBar
                badgeLabel={activeBottomBarAction.tabLabel}
                title={
                  dirtyTabsCount > 1
                    ? `لديك تغييرات غير محفوظة في ${formatNumberEN(dirtyTabsCount)} تبويبات`
                    : "لديك تغييرات غير محفوظة"
                }
                description={
                  prioritizedActionKey === activeTab
                    ? "احفظ التعديلات الحالية أو تجاهلها من الشريط السفلي الموحد."
                    : `التبويب الأقرب للحفظ الآن: ${activeBottomBarAction.tabLabel}.`
                }
                primaryLabel={
                  prioritizedActionKey === activeTab && dirtyTabsCount === 1
                    ? "حفظ التغييرات"
                    : `حفظ ${activeBottomBarAction.tabLabel}`
                }
                primaryBusyLabel="جارٍ حفظ التغييرات..."
                onPrimary={activeBottomBarAction.onSave}
                isPrimaryBusy={activeBottomBarAction.saving}
                secondaryLabel={
                  prioritizedActionKey === activeTab
                    ? "إلغاء التعديلات"
                    : `الانتقال إلى ${activeBottomBarAction.tabLabel}`
                }
                onSecondary={
                  prioritizedActionKey === activeTab
                    ? activeBottomBarAction.onReset
                    : () => {
                        if (prioritizedActionKey) {
                          onActiveTabChange(prioritizedActionKey);
                        }
                      }
                }
              />
            ) : null}
          </div>
        </div>
      </Tabs>
    </div>
  );
}

function SettingsBottomSaveBar({
  badgeLabel,
  title,
  description,
  primaryLabel,
  primaryBusyLabel,
  onPrimary,
  isPrimaryBusy = false,
  secondaryLabel,
  onSecondary,
}: {
  badgeLabel: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryBusyLabel: string;
  onPrimary: () => void;
  isPrimaryBusy?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-4 z-40 sm:inset-x-4 sm:bottom-5 xl:left-8 xl:right-[calc(320px+2rem)]">
      <div className="pointer-events-auto mx-auto w-full max-w-5xl rounded-[24px] border border-slate-200/90 bg-white/96 px-4 py-3.5 shadow-[0_22px_42px_-24px_rgba(15,23,42,0.3)] backdrop-blur sm:px-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-2">
            <Badge
              variant="outline"
              className="w-fit rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 shadow-none"
            >
              {badgeLabel}
            </Badge>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-950">{title}</p>
              <p className="text-sm leading-6 text-slate-500">{description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {secondaryLabel && onSecondary ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-2xl border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-50"
                onClick={onSecondary}
                disabled={isPrimaryBusy}
              >
                {secondaryLabel}
              </Button>
            ) : null}

            <Button
              type="button"
              className="h-10 rounded-2xl bg-[#0f172a] px-5 text-white hover:bg-[#111f38]"
              onClick={onPrimary}
              disabled={isPrimaryBusy}
            >
              {isPrimaryBusy ? (
                <>
                  <Spinner className="h-4 w-4" />
                  {primaryBusyLabel}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {primaryLabel}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
