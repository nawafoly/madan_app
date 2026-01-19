import { useRef } from "react";

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  const state = useRef({
    isDown: false,
    startX: 0,
    startLeft: 0,
    pointerId: -1,
  });

  const onPointerDown = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el) return;

    state.current.isDown = true;
    state.current.pointerId = e.pointerId;
    state.current.startX = e.clientX;
    state.current.startLeft = el.scrollLeft;

    el.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el || !state.current.isDown) return;

    const dx = e.clientX - state.current.startX;
    el.scrollLeft = state.current.startLeft - dx;
  };

  const end = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el) return;

    state.current.isDown = false;
    try {
      el.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  return {
    ref,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onPointerLeave: end,
    } as const,
  };
}
