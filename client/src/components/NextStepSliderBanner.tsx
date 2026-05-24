import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { NextStepSliderSettings } from "@/lib/siteContent";
import { normalizePublicAssetPath } from "@/lib/publicAssets";
import { cn } from "@/lib/utils";

type NextStepSliderBannerProps = {
  slider: NextStepSliderSettings;
  children?: ReactNode;
  className?: string;
  overlayClassName?: string;
};

export default function NextStepSliderBanner({
  slider,
  children,
  className,
  overlayClassName,
}: NextStepSliderBannerProps) {
  const slides = useMemo(
    () =>
      (slider.slides || [])
        .map(slide => ({
          ...slide,
          imageUrl: normalizePublicAssetPath(slide.imageUrl || "", ""),
          linkUrl: String(slide.linkUrl || "").trim(),
        }))
        .filter(slide => slide.imageUrl),
    [slider.slides]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const delay = Math.min(
    Math.max(Number(slider.autoplayDelayMs) || 5000, 1500),
    60000
  );

  useEffect(() => {
    if (activeIndex >= slides.length) setActiveIndex(0);
  }, [activeIndex, slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveIndex(current => (current + 1) % slides.length);
    }, delay);

    return () => window.clearInterval(timer);
  }, [delay, slides.length]);

  if (!slides.length) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-[34px] border border-slate-200/80 bg-slate-950 px-6 py-10 shadow-[0_32px_100px_-56px_rgba(11,23,38,0.7)] sm:px-8 lg:px-10",
          className
        )}
      >
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  const activeSlide = slides[activeIndex] || slides[0];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[34px] border border-slate-200/80 px-6 py-10 shadow-[0_32px_100px_-56px_rgba(11,23,38,0.82)] sm:px-8 lg:px-10",
        className
      )}
    >
      <div className="absolute inset-0 bg-slate-950">
        {slides.map((slide, index) => (
          <img
            key={slide.id || `${slide.imageUrl}-${index}`}
            src={slide.imageUrl}
            alt=""
            aria-hidden="true"
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out",
              index === activeIndex ? "opacity-100" : "opacity-0"
            )}
          />
        ))}
      </div>

      {activeSlide.linkUrl ? (
        <a
          href={activeSlide.linkUrl}
          className="absolute inset-0 z-[1]"
          aria-label={activeSlide.alt || "Next step slide"}
        />
      ) : null}

      {children ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(90deg,rgba(2,6,23,0.2)_0%,rgba(2,6,23,0.68)_52%,rgba(2,6,23,0.86)_100%)]",
            overlayClassName
          )}
        />
      ) : null}

      {children ? <div className="relative z-10">{children}</div> : null}

      {slides.length > 1 ? (
        <div className="absolute bottom-5 right-6 z-20 flex items-center gap-2">
          {slides.map((slide, index) => (
            <button
              key={slide.id || `${slide.imageUrl}-dot-${index}`}
              type="button"
              className={cn(
                "h-2.5 rounded-full transition-all",
                index === activeIndex
                  ? "w-8 bg-white"
                  : "w-2.5 bg-white/45 hover:bg-white/70"
              )}
              aria-label={`Show slide ${index + 1}`}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
