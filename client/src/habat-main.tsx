// Dedicated Habat entry: keep unrelated application initialization out of this runtime.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HabatAttendanceApp from "./pages/habat/HabatAttendanceAppV4";
import HabatInstallPage from "./pages/habat/HabatInstallPage";
import { LanguageProvider, initializeDocumentLanguage } from "./contexts/LanguageContext";
import "./index.css";

const queryClient = new QueryClient();
initializeDocumentLanguage("ar");

function HabatRuntime() {
  const [, setClockTick] = useState(0);
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(value => value + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return <LanguageProvider defaultLanguage="ar">
    {pathname === "/install" ? <HabatInstallPage /> : <HabatAttendanceApp />}
  </LanguageProvider>;
}

document.addEventListener("input", event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
  // Passwords are exact secrets; never normalize their characters.
  if (target instanceof HTMLInputElement && (target.type === "password" || target.autocomplete === "new-password")) return;
  const normalized = target.value
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  if (normalized !== target.value) target.value = normalized;
}, true);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/habat-sw.js").catch(error => {
      console.error("[Habat PWA] service worker registration failed", error);
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><HabatRuntime /></QueryClientProvider>
);
