import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Globe, LogOut, Search } from "lucide-react";

import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import {
  getHomePathForUser,
  isOpsRole,
  useAuth,
} from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { language, toggleLanguage } = useLanguage();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  const currentPath = (location || "/").split("?")[0];
  const isAuthenticated = !!user;
  const isLoginRoute = currentPath === "/login";

  const isHeroRoute = useMemo(() => {
    return (
      currentPath === "/" ||
      currentPath === "/about" ||
      currentPath === "/projects" ||
      currentPath === "/careers" ||
      currentPath.startsWith("/projects/")
    );
  }, [currentPath]);

  const shouldReserveSpace = !isHeroRoute;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks =
    language === "ar"
      ? [
          { label: "الرئيسية", href: "/" },
          { label: "المشاريع", href: "/projects" },
          { label: "عن معدن", href: "/about" },
          { label: "التوظيف", href: "/careers" },
          { label: "تواصل معنا", href: "/contact" },
        ]
      : [
          { label: "Home", href: "/" },
          { label: "Projects", href: "/projects" },
          { label: "About", href: "/about" },
          { label: "Careers", href: "/careers" },
          { label: "Contact", href: "/contact" },
        ];

  const [linksLeft, linksRight] = useMemo(() => {
    const mid = Math.ceil(navLinks.length / 2);
    return [navLinks.slice(0, mid), navLinks.slice(mid)];
  }, [navLinks]);

  const homeHref = getHomePathForUser(user);
  const isOpsUser = isOpsRole(user?.role);
  const isStaffUser = user?.role === "staff";
  const accountCtaLabel = isOpsUser
    ? language === "ar"
      ? "لوحة التحكم"
      : "Dashboard"
    : isStaffUser
      ? language === "ar"
        ? "بروفايل الموظف"
        : "Employee Profile"
      : language === "ar"
        ? "حسابي"
        : "My Account";

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

  const activeHref = useMemo(() => {
    const isActive = (href: string) => {
      if (href === "/") return currentPath === "/";
      return currentPath === href || currentPath.startsWith(href + "/");
    };

    const found = navLinks.find(link => isActive(link.href));
    return found?.href ?? "";
  }, [currentPath, navLinks]);

  const innerRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const update = () => {
      const el = activeHref ? linkRefs.current[activeHref] : null;

      if (!el) {
        inner.dataset.hasActive = "false";
        inner.style.setProperty("--active-x", "50%");
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
      <header className={`rsg-nav ${isScrolled ? "is-scrolled" : ""}`}>
        <div className="container">
          <div ref={innerRef} className="rsg-nav__inner rsg-nav__inner--bulge">
            <div className="rsg-nav__slot rsg-nav__slot--left flex items-center gap-1">
              <button
                type="button"
                className="rsg-burger lg:hidden"
                aria-label="Open menu"
                aria-expanded={isMobileMenuOpen}
                onClick={() => setIsMobileMenuOpen(value => !value)}
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
                <Search className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={toggleLanguage}
                className="hidden md:inline-flex"
                aria-label="Toggle language"
                title={language === "ar" ? "English" : "العربية"}
              >
                <Globe className="h-5 w-5" />
              </Button>

              {isAuthenticated ? <NotificationBell /> : null}
            </div>

            <nav className="rsg-nav__links rsg-nav__slot rsg-nav__slot--center">
              <div className="flex items-center justify-center gap-5">
                {linksLeft.map(link => {
                  const isActive = activeHref === link.href;

                  return (
                    <Link key={link.href} href={link.href}>
                      <span
                        ref={el => {
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

                {linksRight.map(link => {
                  const isActive = activeHref === link.href;

                  return (
                    <Link key={link.href} href={link.href}>
                      <span
                        ref={el => {
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

            <div className="rsg-nav__slot rsg-nav__slot--right flex items-center gap-2">
              {!isAuthenticated ? (
                !isLoginRoute ? (
                  <Link href="/login">
                    <Button className={`hidden md:inline-flex rsg-cta ${navBtnClass}`}>
                      {language === "ar" ? "تسجيل الدخول" : "Login"}
                    </Button>
                  </Link>
                ) : null
              ) : (
                <div className="hidden items-center gap-2 md:flex">
                  <Link href={homeHref}>
                    <Button className={`rsg-cta ${navBtnClass}`}>
                      {accountCtaLabel}
                    </Button>
                  </Link>

                  <Button
                    variant="outline"
                    onClick={handleLogout}
                    className={navBtnClass}
                  >
                    <LogOut className="ml-2 h-4 w-4" />
                    {language === "ar" ? "خروج" : "Logout"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {isMobileMenuOpen ? (
            <div className="mt-3 animate-slide-up p-4 lg:hidden rsg-card rsg-card--tight">
              <nav className="flex flex-col gap-2">
                {navLinks.map(link => {
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

                <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
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
                    !isLoginRoute ? (
                      <Link href="/login">
                        <Button
                          className={`w-full rsg-cta ${navBtnClass}`}
                          onClick={closeMobile}
                        >
                          {language === "ar" ? "تسجيل الدخول" : "Login"}
                        </Button>
                      </Link>
                    ) : null
                  ) : (
                    <>
                      <Link href={homeHref}>
                        <Button
                          className={`w-full rsg-cta ${navBtnClass}`}
                          onClick={closeMobile}
                        >
                          {accountCtaLabel}
                        </Button>
                      </Link>

                      <Button
                        variant="destructive"
                        className={`w-full ${navBtnClass}`}
                        onClick={handleLogout}
                      >
                        <LogOut className="ml-2 h-4 w-4" />
                        {language === "ar" ? "تسجيل الخروج" : "Logout"}
                      </Button>
                    </>
                  )}
                </div>
              </nav>
            </div>
          ) : null}
        </div>
      </header>

      {shouldReserveSpace ? (
        <div aria-hidden className="h-[var(--site-header-offset)]" />
      ) : null}
    </>
  );
}
