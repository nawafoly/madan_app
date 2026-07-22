import { useEffect, useRef } from "react";
import { App as CapacitorApp, type BackButtonListenerEvent } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { toast } from "sonner";
import { useLocation } from "wouter";

import { normalizePathname } from "@/lib/appSurface";

const EXIT_CONFIRM_WINDOW_MS = 2000;
const MAX_ROUTE_STACK_SIZE = 40;

const ROOT_LIKE_PATHS = new Set([
  "/",
  "/login",
  "/dashboard",
  "/hr",
  "/employee",
  "/employee/profile",
  "/staff",
  "/staff/profile",
  "/client",
  "/client/dashboard",
]);

function isAndroidCapacitorApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function pathnameFromRoute(route: string) {
  return normalizePathname(String(route || "/").split(/[?#]/)[0] || "/");
}

function normalizeRoute(route: string) {
  const trimmed = String(route || "/").trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isRootLikeRoute(route: string) {
  return ROOT_LIKE_PATHS.has(pathnameFromRoute(route));
}

function isVisibleElement(element: Element) {
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    element.getClientRects().length > 0
  );
}

function isEditableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;

  if (element instanceof HTMLSelectElement) return !element.disabled;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  return false;
}

function getTopOpenLayer() {
  const selectors = [
    "[data-slot='dialog-content'][data-state='open']",
    "[data-slot='sheet-content'][data-state='open']",
    "[data-slot='drawer-content'][data-state='open']",
    "[role='dialog'][aria-modal='true']",
    "[role='alertdialog']",
    "[data-radix-popper-content-wrapper]",
    "[data-slot='dropdown-menu-content']",
    "[data-slot='popover-content']",
    "[data-slot='select-content']",
  ];
  const layers = Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")))
    .filter(isVisibleElement);

  return layers.at(-1) || null;
}

function findCloseControl(layer: HTMLElement) {
  const controls = Array.from(
    layer.querySelectorAll<HTMLElement>(
      "button,[role='button'],[data-slot='dialog-close'],[data-slot='sheet-close'],[data-slot='drawer-close']",
    ),
  ).filter(isVisibleElement);

  return controls.find((control) => {
    const slot = String(control.dataset.slot || "").toLowerCase();
    const label = String(control.getAttribute("aria-label") || "").toLowerCase();
    const text = String(control.textContent || "").toLowerCase();

    return (
      slot.includes("close") ||
      label.includes("close") ||
      label.includes("إغلاق") ||
      text.includes("close") ||
      text.includes("إغلاق")
    );
  });
}

function sendEscapeKey() {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
}

function closeOpenOverlayOrKeyboard() {
  const activeElement = document.activeElement;
  if (isEditableElement(activeElement)) {
    activeElement.blur();
    return true;
  }

  const layer = getTopOpenLayer();
  if (!layer) return false;

  const closeControl = findCloseControl(layer);
  if (closeControl) {
    closeControl.click();
    return true;
  }

  sendEscapeKey();
  return true;
}

function readPreviousRoute(stack: string[], currentRoute: string) {
  while (stack.length > 1 && stack.at(-1) === currentRoute) {
    stack.pop();
  }

  if (stack.length <= 1) return "";
  stack.pop();
  return stack.at(-1) || "";
}

export function useAndroidBackButton() {
  const [location, setLocation] = useLocation();
  const currentRouteRef = useRef(normalizeRoute(location));
  const lastExitAttemptRef = useRef(0);
  const routeStackRef = useRef<string[]>([normalizeRoute(location)]);
  const pendingBackTargetRef = useRef("");

  useEffect(() => {
    const route = normalizeRoute(location);
    const stack = routeStackRef.current;

    currentRouteRef.current = route;

    if (pendingBackTargetRef.current === route) {
      pendingBackTargetRef.current = "";
      return;
    }

    if (stack.at(-1) === route) return;

    const existingIndex = stack.lastIndexOf(route);
    if (existingIndex >= 0) {
      stack.splice(existingIndex + 1);
    } else {
      stack.push(route);
      if (stack.length > MAX_ROUTE_STACK_SIZE) {
        stack.splice(0, stack.length - MAX_ROUTE_STACK_SIZE);
      }
    }
  }, [location]);

  useEffect(() => {
    if (!isAndroidCapacitorApp()) return;

    let listener: PluginListenerHandle | null = null;
    let mounted = true;

    const handleBackButton = (event: BackButtonListenerEvent) => {
      if (closeOpenOverlayOrKeyboard()) return;

      const currentRoute = currentRouteRef.current;
      const isRootRoute = isRootLikeRoute(currentRoute);
      const previousRoute = isRootRoute
        ? ""
        : readPreviousRoute(routeStackRef.current, currentRoute);

      if (previousRoute) {
        pendingBackTargetRef.current = previousRoute;
        setLocation(previousRoute, { replace: true });
        lastExitAttemptRef.current = 0;
        return;
      }

      if (!isRootRoute && event.canGoBack && window.history.length > 1) {
        window.history.back();
        lastExitAttemptRef.current = 0;
        return;
      }

      const now = Date.now();
      if (now - lastExitAttemptRef.current <= EXIT_CONFIRM_WINDOW_MS) {
        void CapacitorApp.exitApp();
        return;
      }

      lastExitAttemptRef.current = now;
      toast.message("اضغط زر الرجوع مرة أخرى للخروج");
    };

    void CapacitorApp.addListener("backButton", handleBackButton)
      .then((handle) => {
        if (!mounted) {
          void handle.remove();
          return;
        }
        listener = handle;
      })
      .catch((error) => {
        console.error("android_back_button_listener_failed", error);
      });

    return () => {
      mounted = false;
      if (listener) void listener.remove();
    };
  }, [setLocation]);
}
