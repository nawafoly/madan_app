import type { ComponentProps, ReactNode } from "react";
import {
  Archive,
  CheckCircle2,
  CircleAlert,
  FileDown,
  FileUp,
  Files,
  RefreshCw,
  Sparkles,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TabsContent } from "@/components/ui/tabs";
import type { BusinessExcelExportSummary } from "@/lib/businessExcelExport";
import {
  getContractBusinessId,
  getInvestmentBusinessId,
} from "@/lib/businessIds";
import type {
  ContractExportCandidate,
  ContractExportSummary,
} from "@/lib/contractExport";
import { cn } from "@/lib/utils";

type BackupHeroStat = {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
};

type BackupHeroMetric = {
  label: string;
  value: string;
  helper: string;
};

type SettingsBackupTabProps = {
  allFilteredSelected: boolean;
  contractExcelExportError: string;
  contractExcelExportSummary: BusinessExcelExportSummary | null;
  contractExcelExporting: boolean;
  contractExportError: string;
  contractExportLoading: boolean;
  contractExportSummary: ContractExportSummary | null;
  contractExporting: boolean;
  contractSearch: string;
  contractStatusFilter: string;
  contractStatusOptions: string[];
  fileInputRef: ComponentProps<"input">["ref"];
  filteredContractExportItems: ContractExportCandidate[];
  formatDatabaseTimestamp: (value: string | null) => string;
  heroDescription: string;
  heroEyebrow: string;
  heroPanelDescription: string;
  heroPanelMetrics: BackupHeroMetric[];
  heroPanelStatus: string;
  heroPanelTitle: string;
  heroStats: BackupHeroStat[];
  heroTitle: string;
  importing: boolean;
  onBusinessExcelExport: () => void;
  onClearSelectedContracts: () => void;
  onContractExport: () => void;
  onContractSearchChange: (value: string) => void;
  onContractStatusFilterChange: (value: string) => void;
  onExport: () => void;
  onImportFileChange: ComponentProps<"input">["onChange"];
  onPickImportFile: () => void;
  onRefreshContractExportItems: () => void;
  onToggleContractSelection: (contractId: string, checked: boolean) => void;
  onToggleSelectAllFilteredContracts: (checked: boolean) => void;
  selectedContractCountLabel: string;
  selectedContractIds: string[];
  selectedContractIdSet: ReadonlySet<string>;
};

export default function SettingsBackupTab({
  allFilteredSelected,
  contractExcelExportError,
  contractExcelExportSummary,
  contractExcelExporting,
  contractExportError,
  contractExportLoading,
  contractExportSummary,
  contractExporting,
  contractSearch,
  contractStatusFilter,
  contractStatusOptions,
  fileInputRef,
  filteredContractExportItems,
  formatDatabaseTimestamp,
  heroDescription,
  heroEyebrow,
  heroPanelDescription,
  heroPanelMetrics,
  heroPanelStatus,
  heroPanelTitle,
  heroStats,
  heroTitle,
  importing,
  onBusinessExcelExport,
  onClearSelectedContracts,
  onContractExport,
  onContractSearchChange,
  onContractStatusFilterChange,
  onExport,
  onImportFileChange,
  onPickImportFile,
  onRefreshContractExportItems,
  onToggleContractSelection,
  onToggleSelectAllFilteredContracts,
  selectedContractCountLabel,
  selectedContractIds,
  selectedContractIdSet,
}: SettingsBackupTabProps) {
  return (
    <TabsContent value="backup" className="space-y-6">
      <SettingsTabHero
        eyebrow={heroEyebrow}
        title={heroTitle}
        description={heroDescription}
        stats={heroStats}
        panel={
          <SettingsHeroPanel
            status={heroPanelStatus}
            title={heroPanelTitle}
            description={heroPanelDescription}
            metrics={heroPanelMetrics}
          />
        }
      />

      <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
        <CardHeader className="border-b border-slate-100/80 pb-6">
          <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
            النسخ والاستعادة
          </CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
            تصدير واستيراد إعدادات المنصة بسرعة من خلال ملف JSON محفوظ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={onExport}>
              <FileDown className="ml-2 h-4 w-4" /> تصدير JSON
            </Button>

            <Button
              variant="outline"
              onClick={onPickImportFile}
              disabled={importing}
            >
              <FileUp className="ml-2 h-4 w-4" />
              {importing ? "جاري الاستيراد..." : "استيراد JSON"}
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={onImportFileChange}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_24px_54px_-40px_rgba(15,23,42,0.28)]">
        <CardHeader className="gap-4 border-b border-slate-100/80 pb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-[1.1rem] font-semibold tracking-tight text-slate-950">
                تصدير العقود
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600">
                Generate either the system package or the human-readable Excel
                bundle from the current live sources: Firestore business data,
                D1 file metadata, and R2 file references.
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{selectedContractCountLabel} محدد</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={onRefreshContractExportItems}
                disabled={
                  contractExportLoading ||
                  contractExporting ||
                  contractExcelExporting
                }
              >
                <RefreshCw
                  className={cn(
                    "mr-2 h-4 w-4",
                    contractExportLoading && "animate-spin"
                  )}
                />
                تحديث العقود
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {contractExportError ? (
            <Alert className="border-red-500/40 bg-red-500/5 text-red-700">
              <CircleAlert className="h-4 w-4" />
              <AlertTitle>خطأ في تصدير العقود</AlertTitle>
              <AlertDescription>{contractExportError}</AlertDescription>
            </Alert>
          ) : null}

          {contractExcelExportError ? (
            <Alert className="border-red-500/40 bg-red-500/5 text-red-700">
              <CircleAlert className="h-4 w-4" />
              <AlertTitle>خطأ في تصدير Excel</AlertTitle>
              <AlertDescription>{contractExcelExportError}</AlertDescription>
            </Alert>
          ) : null}

          {contractExportSummary ? (
            <Alert className="border-emerald-500/30 bg-emerald-500/5 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>آخر تصدير لحزمة النظام</AlertTitle>
              <AlertDescription className="space-y-1">
                <p>
                  تم إنشاء الملف {contractExportSummary.fileName} في{" "}
                  {formatDatabaseTimestamp(contractExportSummary.generatedAt)}.
                </p>
                <p>
                  العقود: {contractExportSummary.rowCounts.contracts} |
                  الاستثمارات: {contractExportSummary.rowCounts.investments} |
                  المرفقات: {contractExportSummary.attachmentCount} | التحذيرات:{" "}
                  {contractExportSummary.warningCount}
                </p>
              </AlertDescription>
            </Alert>
          ) : null}

          {contractExcelExportSummary ? (
            <Alert className="border-sky-500/30 bg-sky-500/5 text-sky-700">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>آخر تصدير Excel</AlertTitle>
              <AlertDescription className="space-y-1">
                <p>
                  تم إنشاء الملف {contractExcelExportSummary.fileName} في{" "}
                  {formatDatabaseTimestamp(
                    contractExcelExportSummary.generatedAt
                  )}
                  .
                </p>
                <p>
                  المصنفات: {contractExcelExportSummary.workbookCount} | العقود:{" "}
                  {contractExcelExportSummary.rowCounts.contracts} | الملفات:{" "}
                  {contractExcelExportSummary.rowCounts.files} | التحذيرات:{" "}
                  {contractExcelExportSummary.warningCount}
                </p>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <Label htmlFor="contract-export-search">البحث في العقود</Label>
              <Input
                id="contract-export-search"
                value={contractSearch}
                onChange={event => onContractSearchChange(event.target.value)}
                placeholder="Search by contract, project, investor, or investment ID"
                disabled={contractExporting || contractExcelExporting}
                className="h-12 rounded-xl border-slate-200 bg-white shadow-none"
              />
            </div>

            <div className="space-y-2">
              <Label>تصفية الحالة</Label>
              <Select
                value={contractStatusFilter}
                onValueChange={onContractStatusFilterChange}
              >
                <SelectTrigger
                  className="h-12 rounded-xl border-slate-200 bg-white px-4 shadow-none"
                  disabled={contractExporting || contractExcelExporting}
                >
                  <SelectValue placeholder="جميع الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  {contractStatusOptions.map(status => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                onToggleSelectAllFilteredContracts(!allFilteredSelected)
              }
              disabled={
                !filteredContractExportItems.length ||
                contractExportLoading ||
                contractExporting ||
                contractExcelExporting
              }
            >
              {allFilteredSelected ? "إلغاء تحديد المفلتر" : "تحديد المفلتر"}
            </Button>

            <Button
              variant="outline"
              onClick={onClearSelectedContracts}
              disabled={
                !selectedContractIds.length ||
                contractExporting ||
                contractExcelExporting
              }
            >
              إلغاء التحديد
            </Button>

            <Button
              className="bg-[#F2B705] text-black hover:bg-[#d7a404]"
              onClick={onContractExport}
              disabled={
                !selectedContractIds.length ||
                contractExportLoading ||
                contractExporting ||
                contractExcelExporting
              }
            >
              <Archive className="mr-2 h-4 w-4" />
              {contractExporting
                ? "جارٍ إنشاء حزمة النظام..."
                : "تصدير العقود (حزمة النظام)"}
            </Button>

            <Button
              variant="outline"
              className="border-[#F2B705] text-[#7a5b00] hover:bg-[#fff7d1] hover:text-[#5e4600]"
              onClick={onBusinessExcelExport}
              disabled={
                !selectedContractIds.length ||
                contractExportLoading ||
                contractExporting ||
                contractExcelExporting
              }
            >
              <Files className="mr-2 h-4 w-4" />
              {contractExcelExporting
                ? "جارٍ إنشاء حزمة Excel..."
                : "تصدير العقود (Excel)"}
            </Button>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50/40">
            {contractExportLoading ? (
              <div className="p-6 text-sm text-muted-foreground">
                جاري تحميل العقود للتصدير...
              </div>
            ) : filteredContractExportItems.length ? (
              <div className="max-h-[420px] divide-y overflow-y-auto">
                {filteredContractExportItems.map(item => {
                  const checked = selectedContractIdSet.has(item.id);

                  return (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-start gap-3 p-4 transition hover:bg-white"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={value =>
                          onToggleContractSelection(item.id, value === true)
                        }
                        className="mt-1"
                        disabled={contractExporting || contractExcelExporting}
                      />

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {getContractBusinessId(item) || item.id}
                          </p>
                          <Badge variant="outline" className="rounded-full">
                            {item.status}
                          </Badge>
                          {item.projectTitle ? (
                            <Badge
                              variant="secondary"
                              className="max-w-full truncate rounded-full"
                            >
                              {item.projectTitle}
                            </Badge>
                          ) : null}
                        </div>

                        <p className="text-sm text-muted-foreground">
                          المستثمر: {item.investorName || "غير معروف"}{" "}
                          {item.investorEmail ? `(${item.investorEmail})` : ""}
                        </p>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            Investment:{" "}
                            {getInvestmentBusinessId(item) ||
                              item.investmentId ||
                              "-"}
                          </span>
                          <span>المشروع: {item.projectId || "-"}</span>
                          <span>
                            Updated:{" "}
                            {formatDatabaseTimestamp(
                              item.updatedAt || item.signedAt || item.createdAt
                            )}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                No contracts match the current filters.
              </div>
            )}
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            محتويات الحزمة: `investors.csv` و`projects.csv` و`investments.csv` و
            `contracts.csv` و`interest_requests.csv` و`files.csv` ومجلد
            `attachments/` وملف `manifest.json` و`README.md`.
          </p>
        </CardContent>
      </Card>
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
  stats: BackupHeroStat[];
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
  metrics: BackupHeroMetric[];
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
