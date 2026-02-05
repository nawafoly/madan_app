// client/src/components/Footer.tsx
import { Link } from "wouter";
import {
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="rsg-footer">
      <div className="container pt-32 md:pt-40 pb-12 relative z-10">
        {/* ✅ خلي الحد هنا عشان ما ينكسر ولا يتغطى */}
        <div className="border-t border-white/10 pt-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Company */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md">
                  <img src="/logo.png" alt="معدن" className="w-7 h-7" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">معدن</div>
                  <div className="text-xs text-white/60">
                    منصة الاستثمار العقاري
                  </div>
                </div>
              </div>

              <p className="text-white/70 mb-4 leading-relaxed">
                منصة الاستثمار العقاري الرائدة التي تربط المستثمرين بفرص التطوير
                العقاري المتميزة.
              </p>

              <div className="flex gap-3">
                {[Facebook, Twitter, Instagram, Linkedin].map((Icon, i) => (
                  <span
                    key={i}
                    className="w-9 h-9 rounded-full border border-white/10 bg-white/5 flex items-center justify-center opacity-70"
                  >
                    <Icon className="w-4 h-4 text-white/80" />
                  </span>
                ))}
              </div>
            </div>

            {/* Links */}
            <div>
              <h3 className="text-lg font-bold mb-4 text-white">روابط سريعة</h3>
              <ul className="space-y-2">
                {[
                  { href: "/", label: "الرئيسية" },
                  { href: "/projects", label: "المشاريع" },
                  { href: "/about", label: "عن معدن" },
                ].map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>
                      <span className="text-white/70 hover:text-white cursor-pointer">
                        {item.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Types */}
            <div>
              <h3 className="text-lg font-bold mb-4 text-white">
                أنواع الاستثمار
              </h3>
              <ul className="space-y-2">
                {[
                  { href: "/projects?type=sukuk", label: "استثمار بالصكوك" },
                  {
                    href: "/projects?type=land_development",
                    label: "تطوير الأراضي",
                  },
                  { href: "/vip", label: "برنامج VIP" },
                ].map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>
                      <span className="text-white/70 hover:text-white cursor-pointer">
                        {item.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h3 className="text-lg font-bold mb-4 text-white">
                بيانات التواصل
              </h3>
              <ul className="space-y-3">
                <li className="flex gap-3">
                  <MapPin className="w-5 h-5 text-white/80 mt-1" />
                  <span className="text-white/70">
                    الرياض، المملكة العربية السعودية
                  </span>
                </li>
                <li className="flex gap-3">
                  <Phone className="w-5 h-5 text-white/80" />
                  <span className="text-white/70" dir="ltr">
                    +966 50 123 4567
                  </span>
                </li>
                <li className="flex gap-3">
                  <Mail className="w-5 h-5 text-white/80" />
                  <span className="text-white/70">info@maedin.sa</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom */}
          <div className="mt-10 pt-8 border-t border-white/15 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-white/60 text-sm">
              © {currentYear} معدن. جميع الحقوق محفوظة.
            </p>

            <div className="flex gap-6 text-sm">
              <Link href="/privacy">
                <span className="text-white/60 hover:text-white cursor-pointer">
                  سياسة الخصوصية
                </span>
              </Link>
              <Link href="/terms">
                <span className="text-white/60 hover:text-white cursor-pointer">
                  الشروط والأحكام
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
