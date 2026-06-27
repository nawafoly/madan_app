// client/src/components/ScrollToTop.tsx
import { useLayoutEffect } from "react";
import { useLocation } from "wouter";

export default function ScrollToTop() {
  const [location] = useLocation();

  useLayoutEffect(() => {
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });

      const scrollingElement = document.scrollingElement;
      const rootScrollElements = new Set<Element>([
        document.documentElement,
        document.body,
      ]);

      if (scrollingElement) rootScrollElements.add(scrollingElement);

      rootScrollElements.forEach(element => {
        element.scrollTop = 0;
        element.scrollLeft = 0;
      });

      document.querySelectorAll<HTMLElement>("*").forEach(element => {
        if (!element.isConnected) return;
        if (rootScrollElements.has(element)) return;
        if (element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth) {
          return;
        }

        const style = window.getComputedStyle(element);
        const canScrollY =
          style.overflowY === "auto" ||
          style.overflowY === "scroll" ||
          style.overflowY === "overlay";
        const canScrollX =
          style.overflowX === "auto" ||
          style.overflowX === "scroll" ||
          style.overflowX === "overlay";

        if (canScrollY) element.scrollTop = 0;
        if (canScrollX) element.scrollLeft = 0;
      });
    };

    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);
    const timeout = window.setTimeout(resetScroll, 0);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [location]);

  return null;
}
