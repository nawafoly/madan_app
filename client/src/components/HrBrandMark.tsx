import { useState } from "react";

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
  const [failed, setFailed] = useState(false);

  return (
    <span
      aria-label={alt}
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
          src="/logo.png"
          alt=""
          className={cn("h-[82%] w-[82%] object-contain", imageClassName)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
