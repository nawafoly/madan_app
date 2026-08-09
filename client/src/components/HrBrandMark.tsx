import hrLogoUrl from "@/assets/maedin-logo.png";
import hrLogoInlineUrl from "@/assets/maedin-logo.png?inline";
import { cn } from "@/lib/utils";

type HrBrandMarkProps = {
  alt: string;
  className?: string;
  imageClassName?: string;
  compact?: boolean;
};

export function HrBrandMark({
  alt,
  className,
  imageClassName,
}: HrBrandMarkProps) {
  return (
    <span
      aria-label={alt}
      data-theme-preserve-light="true"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#F2B705]/30 bg-white text-slate-950 shadow-sm",
        className
      )}
    >
      <img
        src={hrLogoInlineUrl}
        alt=""
        className={cn("h-[82%] w-[82%] object-contain", imageClassName)}
        data-fallback-applied="false"
        onError={event => {
          if (event.currentTarget.dataset.fallbackApplied === "true") return;
          event.currentTarget.dataset.fallbackApplied = "true";
          event.currentTarget.src = hrLogoUrl;
        }}
      />
    </span>
  );
}
