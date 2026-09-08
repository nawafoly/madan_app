import { useEffect, useMemo, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function detectIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function detectSafari() {
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
}

export default function HabatInstallPage() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [copied, setCopied] = useState(false);

  const ios = useMemo(() => detectIos(), []);
  const safari = useMemo(() => detectSafari(), []);

  useEffect(() => {
    document.title = "تثبيت حبات الورق";
    setInstalled(isStandaloneMode());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    const onInstalled = () => {
      setInstallPrompt(null);
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (installed) {
      window.location.assign("/");
      return;
    }

    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
      return;
    }

    setShowIosGuide(true);
  };

  const copyCurrentLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main dir="rtl" className="min-h-[100dvh] bg-[#f5f5f3] text-[#111111]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 py-8 sm:py-12">
        <section className="flex flex-1 flex-col justify-center">
          <div className="mb-7 flex justify-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-white shadow-[0_14px_44px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
              <img src="/habat-alwaraq-logo.svg?v=20260906" alt="حبات الورق" className="h-16 w-16 object-contain" />
            </div>
          </div>

          <div className="text-center">
            <p className="mb-2 text-sm font-bold text-black/45">حبات الورق</p>
            <h1 className="text-3xl font-extrabold tracking-tight">ثبّت النظام على جهازك</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-7 text-black/55">
              اضغط الزر بالأسفل. إذا كان جهازك يدعم التثبيت المباشر سنكمل العملية تلقائيًا، وإذا كان iPhone سنعرض لك الخطوات المطلوبة فقط.
            </p>
          </div>

          <button type="button" onClick={handleInstall} className="mt-8 h-14 w-full rounded-2xl bg-black px-5 text-base font-extrabold text-white shadow-lg transition active:scale-[0.99]">
            {installed ? "فتح حبات الورق" : installPrompt ? "تثبيت حبات الورق" : "ابدأ التثبيت"}
          </button>

          {!installed && ios && !safari ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
              أنت تستخدم متصفحًا آخر على iPhone. افتح هذا الرابط في Safari ثم اضغط «ابدأ التثبيت».
              <button type="button" onClick={copyCurrentLink} className="mt-3 block w-full rounded-xl border border-amber-300 bg-white px-4 py-3 font-extrabold">
                {copied ? "تم نسخ الرابط" : "نسخ الرابط"}
              </button>
            </div>
          ) : null}

          {showIosGuide && !installed ? (
            <div className="mt-5 rounded-[24px] bg-white p-5 shadow-[0_12px_36px_rgba(0,0,0,0.06)] ring-1 ring-black/5">
              {ios && safari ? (
                <>
                  <h2 className="text-lg font-extrabold">باقي 3 خطوات على iPhone</h2>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-3 rounded-2xl bg-[#f7f7f5] p-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-sm font-extrabold text-white">1</span>
                      <p className="text-sm font-bold leading-6">اضغط زر الثلاث نقاط <span dir="ltr">•••</span> أسفل أو أعلى الشاشة.</p>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl bg-[#f7f7f5] p-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-sm font-extrabold text-white">2</span>
                      <p className="text-sm font-bold leading-6">من القائمة اضغط «مشاركة» <span dir="ltr">↑</span>.</p>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl bg-[#f7f7f5] p-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-sm font-extrabold text-white">3</span>
                      <p className="text-sm font-bold leading-6">اختر «إضافة إلى الشاشة الرئيسية» أو «إضافة إلى الصفحة الرئيسية»، ثم اضغط «إضافة».</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs font-semibold leading-5 text-black/45">بعد الإضافة افتح حبات الورق من الأيقونة الجديدة على الشاشة الرئيسية.</p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-extrabold">التثبيت من المتصفح</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-black/55">افتح قائمة المتصفح وابحث عن «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p>
                </>
              )}
            </div>
          ) : null}

          {installed ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-extrabold text-emerald-950">حبات الورق يعمل الآن كتطبيق مستقل على هذا الجهاز.</div>
          ) : null}
        </section>

        <p className="pt-7 text-center text-[11px] font-semibold leading-5 text-black/35">لا يحتاج التثبيت إلى App Store، وبيانات تسجيل الدخول تبقى داخل نظام حبات الورق.</p>
      </div>
    </main>
  );
}
