import type { ReactNode } from "react";
import {
  CircleAlert,
  Database,
  Globe,
  HardDrive,
  ServerCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import type { EmployeeDirectorySyncResult } from "@/lib/employeeDirectoryWorker";
import { cn } from "@/lib/utils";

type DatabaseUiStatus = "success" | "failed" | "not_ready" | "checking";

type DatabaseOverviewCard = {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  valueDir?: "ltr" | "rtl";
  status: DatabaseUiStatus;
  statusLabel: string;
  statusDetail?: string | null;
};

type DatabaseMetricCard = {
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  valueDir?: "ltr" | "rtl";
};

type DatabaseActionCard = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

type DatabaseDetailRow = {
  label: string;
  value: string;
  valueDir?: "ltr" | "rtl";
};

type SettingsDatabaseTabProps = {
  actionCards: DatabaseActionCard[];
  d1Status: DatabaseUiStatus;
  d1StatusLabel: string;
  databaseNotes: string[];
  databaseRefreshing: boolean;
  employeeDirectorySyncSummary: EmployeeDirectorySyncResult | null;
  employeeDirectorySyncing: boolean;
  formatDatabaseTimestamp: (value: string | null) => string;
  formatNumberEN: (value: number | null | undefined) => string;
  getDatabaseStatusTone: (status: DatabaseUiStatus) => string;
  hero: ReactNode;
  metricCards: DatabaseMetricCard[];
  onRefresh: () => void;
  onSyncEmployeeDirectory: () => void;
  overviewCards: DatabaseOverviewCard[];
  r2Status: DatabaseUiStatus;
  r2StatusLabel: string;
  technicalDetails: DatabaseDetailRow[];
  workerStatus: DatabaseUiStatus;
  workerStatusLabel: string;
  workerUrl: string;
};

export default function SettingsDatabaseTab({
  actionCards,
  d1Status,
  d1StatusLabel,
  databaseNotes,
  databaseRefreshing,
  employeeDirectorySyncSummary,
  employeeDirectorySyncing,
  formatDatabaseTimestamp,
  formatNumberEN,
  getDatabaseStatusTone,
  hero,
  metricCards,
  onRefresh,
  onSyncEmployeeDirectory,
  overviewCards,
  r2Status,
  r2StatusLabel,
  technicalDetails,
  workerStatus,
  workerStatusLabel,
  workerUrl,
}: SettingsDatabaseTabProps) {
  return (
    <TabsContent value="database" className="space-y-6">
      {hero}

      <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
        <CardHeader className="gap-4 border-b border-slate-100/80 pb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Database className="h-4 w-4" />
                <span>قاعدة البيانات / التخزين</span>
              </div>
              <CardTitle className="text-2xl font-semibold tracking-tight text-slate-950">
                قاعدة البيانات والتخزين
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                إدارة بنية الملفات الحالية عبر Cloudflare D1 وR2 وWorkers
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Cloudflare</Badge>
              <Badge variant="secondary">بيئة الإنتاج</Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewCards.map(card => {
              const Icon = card.icon;

              return (
                <div
                  key={card.title}
                  className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.22)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {card.title}
                      </p>
                      <p
                        className="text-lg font-semibold tracking-tight"
                        dir={card.valueDir}
                      >
                        {card.value}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "mt-2",
                          getDatabaseStatusTone(card.status)
                        )}
                      >
                        {card.statusLabel}
                      </Badge>
                    </div>

                    <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>

                  <p
                    className="mt-4 text-sm text-muted-foreground"
                    dir={card.valueDir}
                  >
                    {card.subtitle}
                  </p>

                  {card.statusDetail ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {card.statusDetail}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
        <CardHeader className="border-b border-slate-100/80 pb-6">
          <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
            المعمارية الحالية
          </CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
            تدفق الملفات والبيانات من واجهة المنصة إلى طبقة الرفع ثم إلى
            Cloudflare D1 وR2.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4">
            <div
              className="flex flex-col gap-3 lg:flex-row lg:items-center"
              dir="ltr"
            >
              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 text-right">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border bg-muted/30 p-2 text-muted-foreground">
                    <Globe className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">الموقع</div>
                    <div className="font-semibold">واجهة المنصة</div>
                  </div>
                </div>
              </div>

              <div className="shrink-0 px-2 text-center text-lg text-muted-foreground">
                →
              </div>

              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 text-right">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border bg-muted/30 p-2 text-muted-foreground">
                    <ServerCog className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      Cloudflare Worker
                    </div>
                    <div className="font-semibold" dir="ltr">
                      {workerUrl || "upload.maedin.workers.dev"}
                    </div>
                    <div className="pt-2">
                      <Badge
                        variant="outline"
                        className={cn(getDatabaseStatusTone(workerStatus))}
                      >
                        العامل: {workerStatusLabel}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="shrink-0 px-2 text-center text-lg text-muted-foreground">
                →
              </div>

              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 text-right">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border bg-muted/30 p-2 text-muted-foreground">
                    <Database className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      طبقة التخزين
                    </div>
                    <div className="font-semibold" dir="ltr">
                      D1 + R2
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2" dir="ltr">
                  <Badge variant="outline">maedin-documents</Badge>
                  <Badge variant="outline">maedin-storage</Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className={cn(getDatabaseStatusTone(d1Status))}
                  >
                    D1: {d1StatusLabel}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(getDatabaseStatusTone(r2Status))}
                  >
                    R2: {r2StatusLabel}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                  <Database className="h-4 w-4" />
                </div>
                <div className="font-medium">بيانات الملفات</div>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                يتم حفظ بيانات الملفات وسجلاتها المرجعية داخل Cloudflare D1.
              </p>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                  <HardDrive className="h-4 w-4" />
                </div>
                <div className="font-medium">الملفات الفعلية</div>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                يتم حفظ الملفات الفعلية والأصول المرفوعة داخل Cloudflare R2.
              </p>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                  <ServerCog className="h-4 w-4" />
                </div>
                <div className="font-medium">عمليات الرفع والتحقق</div>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                تتم عمليات الرفع والتحقق والربط بين D1 وR2 عبر Cloudflare
                Workers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
        <CardHeader className="border-b border-slate-100/80 pb-6">
          <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
            إحصاءات تشغيلية
          </CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
            يتم تحديثها من بيانات التخزين الحالية عبر Cloudflare Worker.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metricCards.map(metric => {
              const Icon = metric.icon;

              return (
                <div
                  key={metric.title}
                  className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {metric.title}
                      </p>
                      <p
                        className="text-3xl font-semibold tracking-tight"
                        dir={metric.valueDir}
                      >
                        {metric.value}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary">{metric.helper}</Badge>
                      <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
        <CardHeader className="border-b border-slate-100/80 pb-6">
          <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
            عمليات إدارية
          </CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
            المتاح حاليًا هو إعادة فحص الخدمات وتحديث القيم المعروضة فقط.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {actionCards.map(action => {
              const Icon = action.icon;
              const isRefreshAction = action.key === "refreshStatus";
              const isBusy = isRefreshAction && databaseRefreshing;
              const status: DatabaseUiStatus = isRefreshAction
                ? databaseRefreshing
                  ? "checking"
                  : "success"
                : "not_ready";

              return (
                <div
                  key={action.title}
                  className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                      <Icon className={cn("h-4 w-4", isBusy && "animate-spin")} />
                    </div>
                    <Badge
                      variant={isRefreshAction ? "outline" : "secondary"}
                      className={
                        isRefreshAction ? cn(getDatabaseStatusTone(status)) : undefined
                      }
                    >
                      {isRefreshAction
                        ? databaseRefreshing
                          ? "جارٍ الفحص"
                          : "مفعل"
                        : "قريبًا"}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="font-medium">{action.title}</div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {action.description}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    disabled={!isRefreshAction || databaseRefreshing}
                    className="mt-4 w-full"
                    onClick={isRefreshAction ? onRefresh : undefined}
                  >
                    {isRefreshAction
                      ? databaseRefreshing
                        ? "جارٍ التحديث..."
                        : "تحديث الآن"
                      : "غير متاح حاليًا"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
        <CardHeader className="border-b border-slate-100/80 pb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                مزامنة دليل الموظفين
              </CardTitle>
            </div>

            <Badge
              variant="outline"
              className={cn(
                getDatabaseStatusTone(
                  employeeDirectorySyncing
                    ? "checking"
                    : employeeDirectorySyncSummary?.syncedAt
                      ? "success"
                      : "not_ready"
                )
              )}
            >
              {employeeDirectorySyncing
                ? "جارٍ التنفيذ"
                : employeeDirectorySyncSummary?.syncedAt
                  ? "تمت آخر مزامنة"
                  : "مزامنة يدوية"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl border bg-background p-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                </div>
                <div className="space-y-2">
                  <div className="font-medium">
                    تحديث قائمة الموظفين النشطين المعروضة للـ coworkers
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    هذا الإجراء يقرأ سجلات `users` المسموح بها، يعيد توليد صفوف
                    `employee_directory`، ثم يحدّث D1 ليبقى مصدر العرض من الـ
                    Worker مباشرة.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4">
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  {employeeDirectorySyncSummary?.syncedAt
                    ? `آخر مزامنة: ${formatDatabaseTimestamp(
                        employeeDirectorySyncSummary.syncedAt
                      )}`
                    : "لم تُنفذ المزامنة من داخل النظام بعد."}
                </div>

                {employeeDirectorySyncSummary ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {formatNumberEN(
                        employeeDirectorySyncSummary.employeesSynced
                      )}{" "}
                      سجل
                    </Badge>
                    <Badge variant="outline">
                      حذف{" "}
                      {formatNumberEN(
                        employeeDirectorySyncSummary.employeesDeleted
                      )}
                    </Badge>
                    <Badge variant="outline">
                      المصدر{" "}
                      {formatNumberEN(employeeDirectorySyncSummary.sourceCount)}
                    </Badge>
                  </div>
                ) : null}

                <Button
                  className="w-full"
                  disabled={employeeDirectorySyncing || !workerUrl}
                  onClick={onSyncEmployeeDirectory}
                >
                  {employeeDirectorySyncing
                    ? "جارٍ مزامنة دليل الموظفين..."
                    : "مزامنة دليل الموظفين"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
          <CardHeader className="border-b border-slate-100/80 pb-6">
            <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
              تفاصيل تقنية
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
              معلومات read-only عن البنية الحالية المعتمدة لهذا القسم.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {technicalDetails.map(item => (
                <div
                  key={item.label}
                  className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {item.label}
                  </div>
                  <div
                    className="mt-3 font-mono text-sm font-medium text-foreground"
                    dir={item.valueDir}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
          <CardHeader className="border-b border-slate-100/80 pb-6">
            <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
              ملاحظات
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
              توضيحات تشغيلية مهمة مرتبطة ببنية التخزين الحالية.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-6">
            <Alert className="border-dashed border-slate-200 bg-slate-50/60">
              <CircleAlert className="h-4 w-4" />
              <AlertTitle>بيئة Cloudflare فقط</AlertTitle>
              <AlertDescription>
                {databaseNotes.map(note => (
                  <p key={note}>{note}</p>
                ))}
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">بدون Firebase</Badge>
              <Badge variant="outline">D1 + R2 + Workers</Badge>
              <Badge variant="secondary">النسخ الاحتياطي المتقدم قريبًا</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
