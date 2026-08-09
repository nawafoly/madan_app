// client/src/components/Footer.tsx
import { Link } from "wouter";
import {
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Twitter,
} from "lucide-react";

import { useSiteContent } from "@/contexts/SiteContentContext";
import { getSiteLogoAlt, getSiteLogoUrl } from "@/lib/siteContent";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, safeEnglishText, tr } from "@/lib/i18n";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { language } = useLanguage();
  const { content } = useSiteContent();
  const footerLogoUrl = getSiteLogoUrl(content, "footer", "/logo.png");
  const rawFooterLogoAlt = getSiteLogoAlt(content, "footer", "MAEDIN");
  const footerLogoAlt =
    language === "ar"
      ? rawFooterLogoAlt
      : safeEnglishText(rawFooterLogoAlt, "MAEDIN logo");
  const footerAbout =
    language === "ar"
      ? content.footerAboutAr ||
        "منصة الاستثمار العقاري الرائدة التي تربط المستثمرين بفرص التطوير العقاري المتميزة."
      : safeEnglishText(
          content.footerAboutEn,
          "A real estate investment platform connecting investors with curated development opportunities."
        );
  const contactEmail = content.contactEmail || "info@maedin.sa";
  const contactPhone = content.contactPhone || "+966 50 123 4567";
  const quickLinks = [
    { href: "/", label: tr(language, "الرئيسية", "Home") },
    { href: "/projects", label: tr(language, "المشاريع", "Projects") },
    { href: "/about", label: tr(language, "عن معدن", "About MAEDIN") },
  ];
  const investmentLinks = [
    {
      href: "/projects?type=sukuk",
      label: tr(language, "استثمار بالصكوك", "Sukuk Investments"),
    },
    {
      href: "/projects?type=land_development",
      label: tr(language, "تطوير الأراضي", "Land Development"),
    },
    { href: "/vip", label: tr(language, "برنامج VIP", "VIP Program") },
  ];

  return (
    <footer className="rsg-footer" dir={languageDir(language)}>
      <div className="container relative z-10 pb-12 pt-32 md:pt-40">
        <div className="border-t border-white/10 pt-12">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div
                  data-theme-preserve-light="true"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md"
                >
                  <img
                    src={footerLogoUrl}
                    alt={footerLogoAlt}
                    className="h-7 w-7"
                    onError={event => {
                      const image = event.currentTarget;
                      if (image.src.endsWith("/logo.png")) return;
                      image.src = "/logo.png";
                    }}
                  />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">
                    {tr(language, "معدن", "MAEDIN")}
                  </div>
                  <div className="text-xs text-white/60">
                    {tr(
                      language,
                      "منصة الاستثمار العقاري",
                      "Real Estate Investment Platform"
                    )}
                  </div>
                </div>
              </div>

              <p className="mb-4 leading-relaxed text-white/70">
                {footerAbout}
              </p>

              <div className="flex gap-3">
                {[Facebook, Twitter, Instagram, Linkedin].map((Icon, i) => (
                  <span
                    key={i}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 opacity-70"
                  >
                    <Icon className="h-4 w-4 text-white/80" />
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-4 text-lg font-bold text-white">
                {tr(language, "روابط سريعة", "Quick Links")}
              </h3>
              <ul className="space-y-2">
                {quickLinks.map(item => (
                  <li key={item.href}>
                    <Link href={item.href}>
                      <span className="cursor-pointer text-white/70 hover:text-white">
                        {item.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-4 text-lg font-bold text-white">
                {tr(language, "أنواع الاستثمار", "Investment Types")}
              </h3>
              <ul className="space-y-2">
                {investmentLinks.map(item => (
                  <li key={item.href}>
                    <Link href={item.href}>
                      <span className="cursor-pointer text-white/70 hover:text-white">
                        {item.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-4 text-lg font-bold text-white">
                {tr(language, "بيانات التواصل", "Contact Details")}
              </h3>
              <ul className="space-y-3">
                <li className="flex gap-3">
                  <MapPin className="mt-1 h-5 w-5 text-white/80" />
                  <span className="text-white/70">
                    {tr(
                      language,
                      "الرياض، المملكة العربية السعودية",
                      "Riyadh, Saudi Arabia"
                    )}
                  </span>
                </li>
                <li className="flex gap-3">
                  <Phone className="h-5 w-5 text-white/80" />
                  <span className="text-white/70" dir="ltr">
                    {contactPhone}
                  </span>
                </li>
                <li className="flex gap-3">
                  <Mail className="h-5 w-5 text-white/80" />
                  <span className="text-white/70">{contactEmail}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/15 pt-8 md:flex-row">
            <p className="text-sm text-white/60">
              {tr(
                language,
                `© ${currentYear} معدن. جميع الحقوق محفوظة.`,
                `© ${currentYear} MAEDIN. All rights reserved.`
              )}
            </p>

            <div className="flex gap-6 text-sm">
              <Link href="/privacy">
                <span className="cursor-pointer text-white/60 hover:text-white">
                  {tr(language, "سياسة الخصوصية", "Privacy Policy")}
                </span>
              </Link>
              <Link href="/terms">
                <span className="cursor-pointer text-white/60 hover:text-white">
                  {tr(language, "الشروط والأحكام", "Terms and Conditions")}
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
