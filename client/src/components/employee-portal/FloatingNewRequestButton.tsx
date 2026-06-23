import { PlusCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type FloatingNewRequestButtonProps = {
  onClick: () => void;
  label?: string;
  className?: string;
};

export default function FloatingNewRequestButton({
  onClick,
  label = "طلب جديد",
  className,
}: FloatingNewRequestButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "fixed bottom-[calc(5.8rem+env(safe-area-inset-bottom))] left-4 z-50 inline-flex h-14 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-[0_18px_36px_-18px_rgba(15,23,42,0.75)] transition hover:bg-slate-900 active:scale-[0.98]",
        "sm:left-6",
        className
      )}
    >
      <PlusCircle className="h-5 w-5" />
      {label}
    </button>
  );
}

