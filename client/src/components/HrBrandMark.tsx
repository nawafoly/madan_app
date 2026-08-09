import { useState } from "react";

import hrLogoUrl from "@/assets/maedin-logo.png";
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
  compact = false,
}: HrBrandMarkProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <span
      aria-label={alt}
      data-theme-preserve-light="true"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#F2B705]/30 bg-white text-slate-950 shadow-none",
        className
      )}
    >
      {!imageFailed ? (
        <img
          src={hrLogoUrl}
          alt=""
          className={cn("h-[82%] w-[82%] object-contain", imageClassName)}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "flex h-full w-full items-center justify-center px-1 text-center font-black leading-none text-slate-900",
            compact ? "text-[8px]" : "text-[10px]"
          )}
        >
          MAEDIN
        </span>
      )}
    </span>
  );
}
