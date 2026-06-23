import type { ReactNode } from "react";
import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type SelectBottomSheetOption = {
  value: string;
  label: string;
  helper?: ReactNode;
  disabled?: boolean;
};

type SelectBottomSheetProps = {
  open: boolean;
  title: string;
  options: SelectBottomSheetOption[];
  value?: string | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
  className?: string;
};

export default function SelectBottomSheet({
  open,
  title,
  options,
  value,
  onOpenChange,
  onSelect,
  className,
}: SelectBottomSheetProps) {
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
        aria-label={title}
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[82vh] overflow-hidden rounded-t-[28px] bg-white shadow-[0_-24px_70px_-28px_rgba(15,23,42,0.55)]",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
            aria-label="إغلاق"
          >
            <X className="h-7 w-7" />
          </button>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <span className="h-11 w-11" aria-hidden="true" />
        </div>

        <div className="max-h-[calc(82vh-80px)] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          {options.map(option => {
            const selected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onSelect(option.value);
                  onOpenChange(false);
                }}
                className={cn(
                  "flex min-h-[72px] w-full items-center justify-between gap-4 border-b border-slate-100 px-6 py-4 text-start transition last:border-b-0",
                  option.disabled
                    ? "cursor-not-allowed bg-slate-50 text-slate-300"
                    : "bg-white text-slate-950 hover:bg-slate-50"
                )}
              >
                <span className="min-w-0">
                  <span className="block text-base font-medium">
                    {option.label}
                  </span>
                  {option.helper ? (
                    <span className="mt-1 block text-sm leading-6 text-slate-500">
                      {option.helper}
                    </span>
                  ) : null}
                </span>

                {selected ? (
                  <Check className="h-5 w-5 shrink-0 text-slate-950" />
                ) : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

