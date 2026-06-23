import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Clock3,
  Fingerprint,
  FilePenLine,
  LogOut,
  Plane,
  ReceiptText,
  ScrollText,
  Send,
  WalletCards,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type EmployeeRequestType =
  | "overtime"
  | "permission"
  | "attendance_correction"
  | "leave"
  | "exit_reentry"
  | "resignation"
  | "letters"
  | "financial";

type RequestItem = {
  key: EmployeeRequestType;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  helper?: ReactNode;
};

type RequestSection = {
  title: string;
  items: RequestItem[];
  emptyLabel?: string;
};

type RequestBottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: EmployeeRequestType) => void;
  className?: string;
};

const requestSections: RequestSection[] = [
  {
    title: "الحضور",
    items: [
      { key: "attendance_correction", label: "طلب التصحيح", icon: Fingerprint },
      { key: "permission", label: "طلب استئذان", icon: AlertTriangle },
      { key: "overtime", label: "طلب أوفرتايم", icon: Clock3 },
    ],
  },
  {
    title: "المالية",
    // TODO: اربط الطلبات المالية عند توفر منطقها في النظام الحالي.
    emptyLabel: "لا يوجد طلبات",
    items: [
      {
        key: "financial",
        label: "صرف معجل للراتب",
        icon: WalletCards,
        disabled: true,
      },
    ],
  },
  {
    title: "أخرى",
    items: [
      { key: "resignation", label: "طلب استقالة", icon: ReceiptText },
      { key: "exit_reentry", label: "طلب خروج وعودة", icon: LogOut },
      { key: "leave", label: "طلب إجازة", icon: Plane },
      { key: "letters", label: "الخطابات", icon: FilePenLine },
    ],
  },
];

export default function RequestBottomSheet({
  open,
  onOpenChange,
  onSelect,
  className,
}: RequestBottomSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90]" dir="rtl" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60"
        aria-label="إغلاق"
        onClick={() => onOpenChange(false)}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="طلب جديد"
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-[28px] bg-white shadow-[0_-24px_70px_-28px_rgba(15,23,42,0.55)]",
          className
        )}
      >
        <div className="flex items-start justify-between px-5 pb-3 pt-5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-1 flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
            aria-label="إغلاق"
          >
            <X className="h-7 w-7" />
          </button>

          <div className="flex items-start gap-3 text-right">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-100">
              <Send className="h-7 w-7" />
            </span>
            <span>
              <h2 className="text-xl font-semibold text-slate-950">طلب جديد</h2>
              <p className="mt-2 text-sm text-slate-500">اختر نوع الطلب</p>
            </span>
          </div>
        </div>

        <div className="max-h-[calc(88vh-92px)] overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          {requestSections.map(section => (
            <div key={section.title} className="py-4">
              <h3 className="mb-4 text-base font-semibold text-slate-400">
                {section.title}
              </h3>

              {section.emptyLabel ? (
                <div className="mb-5 flex min-h-36 flex-col items-center justify-center gap-3 rounded-[24px] bg-white text-center text-slate-500">
                  <span className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                    <ScrollText className="h-10 w-10" />
                  </span>
                  <span className="text-base font-medium">
                    {section.emptyLabel}
                  </span>
                </div>
              ) : null}

              {section.items.length ? (
                <div className="grid grid-cols-3 gap-3">
                  {section.items.map(item => {
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={item.disabled}
                        onClick={() => {
                          if (item.disabled) return;
                          onSelect(item.key);
                          onOpenChange(false);
                        }}
                        className={cn(
                          "flex min-h-[112px] flex-col items-center justify-center gap-3 rounded-[18px] border border-slate-50 bg-slate-50/70 px-2 py-4 text-center transition",
                          item.disabled
                            ? "cursor-not-allowed opacity-45"
                            : "hover:border-slate-200 hover:bg-white hover:shadow-[0_16px_30px_-24px_rgba(15,23,42,0.45)]"
                        )}
                        title={
                          typeof item.helper === "string" ? item.helper : undefined
                        }
                      >
                        <Icon className="h-8 w-8 text-slate-500" />
                        <span className="text-sm font-semibold leading-6 text-slate-950">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
