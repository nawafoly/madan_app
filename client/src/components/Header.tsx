import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Search, Globe } from "lucide-react";

import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [language, setLanguage] = useState<"ar" | "en">("ar");

  const { user } = useAuth();
  const isAuthenticated = !!user;

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

  // ✅ route حسب الدور
  const dashboardHref =
    user &&
    (user as any).role &&
    ["owner", "accountant", "staff"].includes((user as any).role)
      ? "/dashboard"
      : "/client/dashboard";

  const closeMobile = () => setIsMobileMenuOpen(false);

  return (
    <header
      className={`rsg-nav ${isScrolled ? "is-scrolled" : ""}`}
      dir="rtl"
      lang="ar"
    >
      <div className="container">
        <div className="rsg-nav__inner">
          {/* Left (Actions) */}
          <div className="rsg-nav__slot rsg-nav__slot--left">
            {/* Burger (mobile) */}
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

            {/* Search */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </Button>

            {/* Language */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLanguage}
              className="hidden md:inline-flex"
              aria-label="Toggle language"
            >
              <Globe className="w-5 h-5" />
            </Button>

            {/* Notification */}
            {isAuthenticated && <NotificationBell />}
          </div>

          {/* Center (Links) */}
          <nav className="rsg-nav__links rsg-nav__slot rsg-nav__slot--center">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <span className="rsg-nav__link">{link.label}</span>
              </Link>
            ))}
          </nav>

          {/* Right (Logo + CTA) */}
          <div className="rsg-nav__slot rsg-nav__slot--right">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-[18px] font-bold tracking-wide">
                  MAEDIN
                </span>
                <span
                  className="inline-flex items-center justify-center rounded-full"
                  style={{
                    width: 34,
                    height: 34,
                    background:
                      "color-mix(in oklab, var(--gold) 92%, white 8%)",
                    color: "rgba(11,15,25,0.95)",
                    fontWeight: 800,
                  }}
                >
                  M
                </span>
              </div>
            </Link>

            {!isAuthenticated ? (
              <Link href="/login">
                <Button className="hidden md:inline-flex rsg-cta">
                  {language === "ar" ? "تسجيل الدخول" : "Login"}
                </Button>
              </Link>
            ) : (
              <Link href={dashboardHref}>
                <Button className="hidden md:inline-flex rsg-cta rsg-cta--gold">
                  {language === "ar" ? "لوحة التحكم" : "Dashboard"}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Mobile dropdown */}
        {isMobileMenuOpen && (
          <div className="mt-3 rsg-card rsg-card--tight p-4 lg:hidden animate-slide-up">
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <span
                    className="rsg-nav__link block"
                    onClick={closeMobile}
                    role="button"
                  >
                    {link.label}
                  </span>
                </Link>
              ))}

              <div className="mt-3 pt-3 border-t border-border flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      toggleLanguage();
                      closeMobile();
                    }}
                  >
                    {language === "ar" ? "English" : "العربية"}
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={closeMobile}
                    aria-label="Close"
                  >
                    ✕
                  </Button>
                </div>

                {!isAuthenticated ? (
                  <Link href="/login">
                    <Button
                      className="w-full rsg-cta rsg-cta--gold"
                      onClick={closeMobile}
                    >
                      {language === "ar" ? "تسجيل الدخول" : "Login"}
                    </Button>
                  </Link>
                ) : (
                  <Link href={dashboardHref}>
                    <Button
                      className="w-full rsg-cta rsg-cta--gold"
                      onClick={closeMobile}
                    >
                      {language === "ar" ? "لوحة التحكم" : "Dashboard"}
                    </Button>
                  </Link>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
