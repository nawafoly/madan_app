// client/src/hooks/useDragScroll.ts
import { useRef } from "react";
import type * as React from "react";

type DragState = {
  isDown: boolean;
  startX: number;
  startY: number;
  startLeft: number;
  pointerId: number;
  moved: boolean;
  intent: "none" | "horizontal" | "vertical";
};

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  const state = useRef<DragState>({
    isDown: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    pointerId: -1,
    moved: false,
    intent: "none",
  });

  const isInteractiveTarget = (t: EventTarget | null) => {
    const el = t as HTMLElement | null;
    if (!el) return false;
    return Boolean(
      el.closest(
        "a,button,input,textarea,select,option,label,[role='button'],[data-no-drag]"
      )
    );
  };

  const begin = (clientX: number, clientY: number, pointerId: number) => {
    const el = ref.current;
    if (!el) return;

    state.current.isDown = true;
    state.current.moved = false;
    state.current.intent = "none";
    state.current.pointerId = pointerId;
    state.current.startX = clientX;
    state.current.startY = clientY;
    state.current.startLeft = el.scrollLeft;

    // أثناء السحب: لا نستخدم smooth (عشان يصير مباشر وناعم)
    try {
      el.style.scrollBehavior = "auto";
      el.style.userSelect = "none";
      // مهم للجوال: نخلّي المتصفح ما يسوي سحب أفقي افتراضي
      // (ونحددها بالعنصر نفسه، مو بالستايل الخارجي فقط)
    } catch {}
  };

  const move = (clientX: number, clientY: number, prevent?: () => void) => {
    const el = ref.current;
    if (!el || !state.current.isDown) return;

    const dx = clientX - state.current.startX;
    const dy = clientY - state.current.startY;

    // تحديد النية أول مرة
    if (state.current.intent === "none") {
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      // عتبة صغيرة عشان ما نعتبر اللمسة حركة
      if (adx < 6 && ady < 6) return;

      // إذا عمودي أكثر → لا نسحب أفقي، خله سكرول صفحة
      if (ady > adx) {
        state.current.intent = "vertical";
        state.current.isDown = false; // نوقف سحبنا فورًا
        try {
          el.style.userSelect = "";
        } catch {}
        return;
      }

      state.current.intent = "horizontal";
    }

    if (state.current.intent !== "horizontal") return;

    // الآن سحب أفقي فعلي
    if (Math.abs(dx) > 4) state.current.moved = true;

    el.scrollLeft = state.current.startLeft - dx;

    // امنع السحب/السكرول الافتراضي أثناء السحب الأفقي فقط
    prevent?.();
  };

  const end = () => {
    const el = ref.current;
    state.current.isDown = false;
    state.current.intent = "none";
    state.current.pointerId = -1;

    try {
      if (el) el.style.userSelect = "";
    } catch {}
  };

  // ===== Pointer Events (Desktop + Android + أغلب المتصفحات)
  const onPointerDown = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    if (isInteractiveTarget(e.target)) return;

    begin(e.clientX, e.clientY, e.pointerId);

    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {}

    e.preventDefault?.();
  };

  const onPointerMove = (e: React.PointerEvent<T>) => {
    if (!state.current.isDown) return;
    move(e.clientX, e.clientY, () => e.preventDefault?.());
  };

  const onPointerUp = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    try {
      el?.releasePointerCapture?.(e.pointerId);
    } catch {}
    end();
  };

  // ===== Touch Fallback (مهم جدًا لـ iOS)
  const onTouchStart = (e: React.TouchEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    if (isInteractiveTarget(e.target)) return;

    const t = e.touches[0];
    if (!t) return;

    begin(t.clientX, t.clientY, 1);
    // لا تمنع هنا عشان ما نكسر النقر إلا إذا قررنا أفقي في move
  };

  const onTouchMove = (e: React.TouchEvent<T>) => {
    if (!state.current.isDown) return;
    const t = e.touches[0];
    if (!t) return;

    move(t.clientX, t.clientY, () => e.preventDefault?.());
  };

  const onTouchEnd = () => end();
  const onTouchCancel = () => end();

  // إذا صار Drag فعلاً، نمنع click اللي يجي بعده
  const onClickCapture = (e: React.MouseEvent<T>) => {
    if (state.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      state.current.moved = false;
    }
  };

  return {
    ref,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onPointerLeave: onPointerUp,

      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,

      onDragStart: (e: React.DragEvent<T>) => e.preventDefault(),
      onClickCapture,
    } as const,
  };
}
