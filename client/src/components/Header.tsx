// client/src/components/Header.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Search, Globe, LogOut } from "lucide-react";

import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [language, setLanguage] = useState<"ar" | "en">("ar");

  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  const isAuthenticated = !!user;

  // ✅ صفحات Hero (النافبار يكون Overlay وما نحتاج Spacer)
  const isHeroRoute = useMemo(() => {
    const path = (location || "/").split("?")[0];
    return (
      path === "/" ||
      path === "/about" ||
      path === "/projects" ||
      path.startsWith("/projects/")
    );
  }, [location]);

  // ✅ Spacer only for non-hero pages
  const shouldReserveSpace = !isHeroRoute;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "ar" ? "en" : "ar"));
  };

  const navLinks =
    language === "ar"
      ? [
          { label: "الرئيسية", href: "/" },
          { label: "المشاريع", href: "/projects" },
          { label: "عن معدن", href: "/about" },
          { label: "تواصل معنا", href: "/contact" },
        ]
      : [
          { label: "Home", href: "/" },
          { label: "Projects", href: "/projects" },
          { label: "About", href: "/about" },
          { label: "Contact", href: "/contact" },
        ];

  const [linksLeft, linksRight] = useMemo(() => {
    const mid = Math.ceil(navLinks.length / 2);
    return [navLinks.slice(0, mid), navLinks.slice(mid)];
  }, [navLinks]);

  const role = (user as any)?.role;
  const dashboardHref =
    role && ["owner", "admin", "accountant", "staff"].includes(role)
      ? "/dashboard"
      : "/client/dashboard";

  const closeMobile = () => setIsMobileMenuOpen(false);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      closeMobile();
      setLocation("/");
    }
  };

  const navBtnClass = "h-10 px-4 rounded-full text-[14px] font-semibold";

  // ✅ Active detector
  const activeHref = useMemo(() => {
    const path = (location || "/").split("?")[0];

    const isActive = (href: string) => {
      if (href === "/") return path === "/";
      return path === href || path.startsWith(href + "/");
    };

    const found = navLinks.find((l) => isActive(l.href));
    return found?.href ?? "";
  }, [location, navLinks]);

  // ✅ refs for "bulge position"
  const innerRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLSpanElement | null>>({});

// ✅ move the bulge above the active link + mark hasActive
useEffect(() => {
  const inner = innerRef.current;
  if (!inner) return;

  const update = () => {
    const el = activeHref ? linkRefs.current[activeHref] : null;

    if (!el) {
      inner.dataset.hasActive = "false";
      inner.style.setProperty("--active-x", `50%`);
      return;
    }

    const innerRect = inner.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const centerX = elRect.left + elRect.width / 2 - innerRect.left;

    inner.style.setProperty("--active-x", `${centerX}px`);
    inner.dataset.hasActive = "true";
  };

  const raf = requestAnimationFrame(update);
  window.addEventListener("resize", update);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", update);
  };
}, [activeHref, language]);


  return (
    <>
      {/* ✅ Floating Navbar (always fixed via .rsg-nav CSS) */}
      <header
        className={`rsg-nav ${isScrolled ? "is-scrolled" : ""}`}
        dir={language === "ar" ? "rtl" : "ltr"}
        lang={language}
      >
        <div className="container">
          <div ref={innerRef} className="rsg-nav__inner rsg-nav__inner--bulge">
            {/* Left (Icons) */}
            <div className="rsg-nav__slot rsg-nav__slot--left flex items-center gap-1">
              <button
                type="button"
                className="rsg-burger lg:hidden"
                aria-label="Open menu"
                aria-expanded={isMobileMenuOpen}
                onClick={() => setIsMobileMenuOpen((v) => !v)}
              >
                <span />
                <span />
                <span />
              </button>

              <Button
                variant="ghost"
                size="icon"
                className="hidden md:inline-flex"
                aria-label="Search"
              >
                <Search className="w-5 h-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={toggleLanguage}
                className="hidden md:inline-flex"
                aria-label="Toggle language"
                title={language === "ar" ? "English" : "العربية"}
              >
                <Globe className="w-5 h-5" />
              </Button>

              {isAuthenticated && <NotificationBell />}
            </div>

            {/* Center (Links + Logo) */}
            <nav className="rsg-nav__links rsg-nav__slot rsg-nav__slot--center">
              <div className="flex items-center justify-center gap-5">
                {linksLeft.map((link) => {
                  const isActive = activeHref === link.href;
                  return (
                    <Link key={link.href} href={link.href}>
                      <span
                        ref={(el) => {
                          linkRefs.current[link.href] = el;
                        }}
                        className={`rsg-nav__link ${isActive ? "is-active" : ""}`}
                      >
                        {link.label}
                      </span>
                    </Link>
                  );
                })}

                <Link href="/" className="flex items-center justify-center">
                  <img
                    src="/logo.png"
                    alt="MAEDIN logo"
                    className="rsg-nav__logo"
                  />
                </Link>

                {linksRight.map((link) => {
                  const isActive = activeHref === link.href;
                  return (
                    <Link key={link.href} href={link.href}>
                      <span
                        ref={(el) => {
                          linkRefs.current[link.href] = el;
                        }}
                        className={`rsg-nav__link ${isActive ? "is-active" : ""}`}
                      >
                        {link.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            {/* Right (CTA) */}
            <div className="rsg-nav__slot rsg-nav__slot--right flex items-center gap-2">
              {!isAuthenticated ? (
                <Link href="/login">
                  <Button className={`hidden md:inline-flex rsg-cta ${navBtnClass}`}>
                    {language === "ar" ? "تسجيل الدخول" : "Login"}
                  </Button>
                </Link>
              ) : (
                <div className="hidden md:flex items-center gap-2">
                  <Link href={dashboardHref}>
                    <Button className={`rsg-cta ${navBtnClass}`}>
                      {language === "ar" ? "لوحة التحكم" : "Dashboard"}
                    </Button>
                  </Link>

                  <Button
                    variant="outline"
                    onClick={handleLogout}
                    className={navBtnClass}
                  >
                    <LogOut className="w-4 h-4 ml-2" />
                    {language === "ar" ? "خروج" : "Logout"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile dropdown */}
          {isMobileMenuOpen && (
            <div className="mt-3 rsg-card rsg-card--tight p-4 lg:hidden animate-slide-up">
              <nav className="flex flex-col gap-2">
                {navLinks.map((link) => {
                  const isActive = activeHref === link.href;
                  return (
                    <Link key={link.href} href={link.href}>
                      <span
                        className={`rsg-nav__link block ${isActive ? "is-active" : ""}`}
                        onClick={closeMobile}
                        role="button"
                      >
                        {link.label}
                      </span>
                    </Link>
                  );
                })}

                <div className="mt-3 pt-3 border-t border-border flex flex-col gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      toggleLanguage();
                      closeMobile();
                    }}
                  >
                    {language === "ar" ? "English" : "العربية"}
                  </Button>

                  {!isAuthenticated ? (
                    <Link href="/login">
                      <Button
                        className={`w-full rsg-cta ${navBtnClass}`}
                        onClick={closeMobile}
                      >
                        {language === "ar" ? "تسجيل الدخول" : "Login"}
                      </Button>
                    </Link>
                  ) : (
                    <>
                      <Link href={dashboardHref}>
                        <Button
                          className={`w-full rsg-cta ${navBtnClass}`}
                          onClick={closeMobile}
                        >
                          {language === "ar" ? "لوحة التحكم" : "Dashboard"}
                        </Button>
                      </Link>

                      <Button
                        variant="destructive"
                        className={`w-full ${navBtnClass}`}
                        onClick={handleLogout}
                      >
                        <LogOut className="w-4 h-4 ml-2" />
                        {language === "ar" ? "تسجيل الخروج" : "Logout"}
                      </Button>
                    </>
                  )}
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* ✅ Spacer */}
      {shouldReserveSpace && <div aria-hidden className="h-[92px]" />}
    </>
  );
}
