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
import type { Language } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";

export type EmployeeRequestType =
  | "overtime"
  | "permission"
  | "attendance_correction"
  | "leave"
  | "exit_reentry"
  | "resignation"
  | "letters"
  | "salary_advance";

type RequestItem = {
  key: EmployeeRequestType;
  label: {
    ar: string;
    en: string;
  };
  icon: LucideIcon;
  disabled?: boolean;
  helper?: ReactNode;
};

type RequestSection = {
  title: {
    ar: string;
    en: string;
  };
  items: RequestItem[];
  emptyLabel?: {
    ar: string;
    en: string;
  };
};

type RequestBottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: EmployeeRequestType) => void;
  className?: string;
  language?: Language;
};

const requestSections: RequestSection[] = [
  {
    title: { ar: "الحضور", en: "Attendance" },
    items: [
      {
        key: "attendance_correction",
        label: { ar: "طلب التصحيح", en: "Correction Request" },
        icon: Fingerprint,
      },
      {
        key: "permission",
        label: { ar: "طلب استئذان", en: "Permission Request" },
        icon: AlertTriangle,
      },
      {
        key: "overtime",
        label: { ar: "طلب أوفرتايم", en: "Overtime Request" },
        icon: Clock3,
      },
    ],
  },
  {
    title: { ar: "المالية", en: "Finance" },
    items: [
      {
        key: "salary_advance",
        label: { ar: "صرف معجل للراتب", en: "Salary Advance" },
        icon: WalletCards,
      },
    ],
  },
  {
    title: { ar: "أخرى", en: "Other" },
    items: [
      {
        key: "resignation",
        label: { ar: "طلب استقالة", en: "Resignation Request" },
        icon: ReceiptText,
      },
      {
        key: "exit_reentry",
        label: { ar: "طلب خروج وعودة", en: "Exit/Re-entry Request" },
        icon: LogOut,
      },
      {
        key: "leave",
        label: { ar: "طلب إجازة", en: "Leave Request" },
        icon: Plane,
      },
      {
        key: "letters",
        label: { ar: "الخطابات", en: "Letters" },
        icon: FilePenLine,
      },
    ],
  },
];

export default function RequestBottomSheet({
  open,
  onOpenChange,
  onSelect,
  className,
  language = "ar",
}: RequestBottomSheetProps) {
  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" dir={languageDir(language)} role="presentation">
      <div
        data-theme-overlay="true"
        className="pointer-events-none absolute inset-0 bg-slate-950/60"
        aria-hidden="true"
      />

      <section
        role="dialog"
        aria-modal="false"
        aria-label={tr(language, "طلب جديد", "New Request")}
        className={cn(
          "pointer-events-auto absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-[28px] bg-white shadow-[0_-24px_70px_-28px_rgba(15,23,42,0.55)]",
          className
        )}
      >
        <div className="flex items-start justify-between px-5 pb-3 pt-5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-1 flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
            aria-label={tr(language, "إغلاق", "Close")}
          >
            <X className="h-7 w-7" />
          </button>

          <div className="flex items-start gap-3 text-start">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-100">
              <Send className="h-7 w-7" />
            </span>
            <span>
              <h2 className="text-xl font-semibold text-slate-950">
                {tr(language, "طلب جديد", "New Request")}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {tr(language, "اختر نوع الطلب", "Choose request type")}
              </p>
            </span>
          </div>
        </div>

        <div className="max-h-[calc(88vh-92px)] overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          {requestSections.map(section => (
            <div key={section.title.en} className="py-4">
              <h3 className="mb-4 text-base font-semibold text-slate-400">
                {tr(language, section.title.ar, section.title.en)}
              </h3>

              {section.emptyLabel ? (
                <div className="mb-5 flex min-h-36 flex-col items-center justify-center gap-3 rounded-[24px] bg-white text-center text-slate-500">
                  <span className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                    <ScrollText className="h-10 w-10" />
                  </span>
                  <span className="text-base font-medium">
                    {tr(language, section.emptyLabel.ar, section.emptyLabel.en)}
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
                          {tr(language, item.label.ar, item.label.en)}
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
