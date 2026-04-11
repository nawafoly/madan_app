import { BriefcaseBusiness, Search, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  EMPLOYEE_EMPTY_VALUE,
  type EmployeeProfileViewModel,
} from "@/lib/employeeProfile";
import { formatDateEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export type EmployeesListPaneCard = {
  employee: {
    id: string;
  };
  profile: EmployeeProfileViewModel;
};

type EmployeesListPaneProps = {
  cards: EmployeesListPaneCard[];
  error?: string | null;
  loading: boolean;
  onSearchQueryChange: (value: string) => void;
  onSelectEmployee: (employeeId: string) => void;
  searchQuery: string;
  selectedEmployeeId: string;
};

export default function EmployeesListPane({
  cards,
  error,
  loading,
  onSearchQueryChange,
  onSelectEmployee,
  searchQuery,
  selectedEmployeeId,
}: EmployeesListPaneProps) {
  return (
    <Card className="self-start gap-0 border-slate-200/80 py-0">
      <CardHeader className="border-b border-slate-100 bg-white/90 px-5 pb-5 pt-5">
        <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
          <BriefcaseBusiness className="h-5 w-5 text-[#030640]" />
          قائمة الموظفين
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-500">
          اختر موظفًا لعرض ملفه الوظيفي وإدارة بياناته من نفس الصفحة.
        </CardDescription>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={event => onSearchQueryChange(event.target.value)}
            placeholder="ابحث بالاسم أو البريد أو القسم"
            className="h-11 pr-9"
          />
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 pt-4">
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              جاري تحميل الموظفين...
            </div>
          ) : error ? (
            <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm text-rose-700">
              {error}
            </div>
          ) : cards.length ? (
            cards.map(card => {
              const isActive = card.employee.id === selectedEmployeeId;
              const startDateLabel = card.profile.employment.startDate
                ? formatDateEN(card.profile.employment.startDate)
                : EMPLOYEE_EMPTY_VALUE;

              return (
                <button
                  key={card.employee.id}
                  type="button"
                  onClick={() => onSelectEmployee(card.employee.id)}
                  className={cn(
                    "w-full rounded-[24px] border px-4 py-4 text-right transition-all",
                    isActive
                      ? "border-[#F2B705]/50 bg-[#F2B705]/10 shadow-[0_20px_44px_-34px_rgba(242,183,5,0.55)]"
                      : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-base font-semibold text-slate-950">
                          {card.profile.personal.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {card.profile.personal.email}
                        </div>
                      </div>

                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full",
                          card.profile.employment.statusTone === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : card.profile.employment.statusTone === "warning"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-slate-200 bg-slate-100 text-slate-700"
                        )}
                      >
                        {card.profile.employment.statusLabel}
                      </Badge>
                    </div>

                    <div className="grid gap-2 text-sm text-slate-600">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">المسمى</span>
                        <span className="font-medium text-slate-900">
                          {card.profile.employment.title}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">القسم</span>
                        <span className="font-medium text-slate-900">
                          {card.profile.employment.department}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">رقم البصمة</span>
                        <span dir="ltr" className="font-medium text-slate-900">
                          {card.profile.employment.fingerprintNumber}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">بداية العمل</span>
                        <span className="font-medium text-slate-900">
                          {startDateLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <Empty className="min-h-[360px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="bg-[#F2B705]/12 text-[#030640]"
                >
                  <UserRound className="size-5" />
                </EmptyMedia>
                <EmptyTitle>لا توجد نتائج مطابقة</EmptyTitle>
                <EmptyDescription>
                  جرّب تغيير عبارة البحث أو أزل الفلتر لعرض الموظفين الحاليين.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
