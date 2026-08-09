import { useState } from "react";

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
  compact = false,
}: HrBrandMarkProps) {
  const logoSources = [hrLogoInlineUrl, "/logo.png", hrLogoUrl];
  const [sourceIndex, setSourceIndex] = useState(0);
  const logoSrc = logoSources[sourceIndex];
  const failed = !logoSrc;

  return (
    <span
      aria-label={alt}
      data-theme-preserve-light="true"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#F2B705]/30 bg-white text-slate-950 shadow-sm",
        className
      )}
    >
      {failed ? (
        <span className="px-1 text-center text-[10px] font-bold leading-none tracking-tight">
          {compact ? "M" : "MAEDIN"}
        </span>
      ) : (
        <img
          src={logoSrc}
          alt=""
          className={cn("h-[82%] w-[82%] object-contain", imageClassName)}
          onError={() => setSourceIndex(index => index + 1)}
        />
      )}
    </span>
  );
}
