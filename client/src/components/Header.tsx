import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X, Search, Globe } from "lucide-react";

import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [language, setLanguage] = useState<"ar" | "en">("ar");

  // ✅ useAuth حسب النسخة اللي عدلناها: يرجع user + loading + error ...
  const { user } = useAuth();

  const isAuthenticated = !!user;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
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
    user && (user as any).role && ["owner", "accountant", "staff"].includes((user as any).role)
      ? "/dashboard"
      : "/client/dashboard";

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-background/95 backdrop-blur-md shadow-lg border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="container">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-foreground">M</span>
              </div>
              <span className="text-2xl font-bold text-foreground">MAEDIN</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <span className="text-foreground hover:text-primary transition-colors cursor-pointer font-medium">
                  {link.label}
                </span>
              </Link>
            ))}
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-4">
            {/* Search Icon */}
            <Button variant="ghost" size="icon" className="hidden md:flex">
              <Search className="w-5 h-5" />
            </Button>

            {/* Language Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLanguage}
              className="hidden md:flex"
            >
              <Globe className="w-5 h-5" />
            </Button>

            {/* Notification Bell - Shows when user is logged in */}
            {isAuthenticated && <NotificationBell />}

            {/* ✅ Login Button - Shows when user is NOT logged in */}
            {!isAuthenticated && (
              <Link href="/login">
                <Button className="hidden md:flex bg-[#F2B705] hover:bg-[#d9a304] text-black font-semibold">
                  {language === "ar" ? "تسجيل الدخول" : "Login"}
                </Button>
              </Link>
            )}

            {/* Dashboard Button - Shows when user is logged in */}
            {isAuthenticated && (
              <Link href={dashboardHref}>
                <Button className="hidden md:flex bg-[#F2B705] hover:bg-[#d9a304] text-black font-semibold">
                  {language === "ar" ? "لوحة التحكم" : "Dashboard"}
                </Button>
              </Link>
            )}

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden py-6 border-t border-border animate-slide-up">
            <nav className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <span
                    className="block py-2 text-foreground hover:text-primary transition-colors cursor-pointer font-medium"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.label}
                  </span>
                </Link>
              ))}

              <div className="pt-4 border-t border-border flex flex-col gap-3">
                {/* ✅ Mobile Login */}
                {!isAuthenticated && (
                  <Link href="/login">
                    <Button
                      className="w-full bg-[#F2B705] hover:bg-[#d9a304] text-black font-semibold"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {language === "ar" ? "تسجيل الدخول" : "Login"}
                    </Button>
                  </Link>
                )}

                {/* ✅ Mobile Dashboard */}
                {isAuthenticated && (
                  <Link href={dashboardHref}>
                    <Button
                      className="w-full bg-[#F2B705] hover:bg-[#d9a304] text-black font-semibold"
                      onClick={() => setIsMobileMenuOpen(false)}
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
