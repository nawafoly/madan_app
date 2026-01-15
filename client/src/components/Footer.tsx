import { Link } from "wouter";
import { Facebook, Twitter, Instagram, Linkedin, Mail, Phone, MapPin } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
<footer className="bg-[#0b1a38] text-white">
  <div className="container py-12">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
      
      {/* Company Info */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
            <span className="text-2xl font-bold text-white">M</span>
          </div>
          <span className="text-2xl font-bold">MAEDIN</span>
        </div>

        <p className="text-white/75 mb-4">
          منصة الاستثمار العقاري الرائدة التي تربط المستثمرين بفرص التطوير العقاري المتميزة
        </p>

        <div className="flex gap-3">
          <a
            href="#"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
          >
            <Facebook className="w-4 h-4" />
          </a>
          <a
            href="#"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
          >
            <Twitter className="w-4 h-4" />
          </a>
          <a
            href="#"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
          >
            <Instagram className="w-4 h-4" />
          </a>
          <a
            href="#"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
          >
            <Linkedin className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Quick Links */}
      <div>
        <h3 className="text-lg font-bold mb-4">روابط سريعة</h3>
        <ul className="space-y-2">
          <li>
            <Link href="/">
              <span className="text-white/75 hover:text-white transition-colors cursor-pointer">
                الرئيسية
              </span>
            </Link>
          </li>
          <li>
            <Link href="/projects">
              <span className="text-white/75 hover:text-white transition-colors cursor-pointer">
                المشاريع
              </span>
            </Link>
          </li>
          <li>
            <Link href="/about">
              <span className="text-white/75 hover:text-white transition-colors cursor-pointer">
                عن معدن
              </span>
            </Link>
          </li>
          <li>
            <Link href="/contact">
              <span className="text-white/75 hover:text-white transition-colors cursor-pointer">
                تواصل معنا
              </span>
            </Link>
          </li>
        </ul>
      </div>

      {/* Investment Types */}
      <div>
        <h3 className="text-lg font-bold mb-4">أنواع الاستثمار</h3>
        <ul className="space-y-2">
          <li>
            <Link href="/projects?type=sukuk">
              <span className="text-white/75 hover:text-white transition-colors cursor-pointer">
                استثمار بالصكوك
              </span>
            </Link>
          </li>
          <li>
            <Link href="/projects?type=land_development">
              <span className="text-white/75 hover:text-white transition-colors cursor-pointer">
                تطوير الأراضي
              </span>
            </Link>
          </li>
          <li>
            <Link href="/vip">
              <span className="text-white/75 hover:text-white transition-colors cursor-pointer">
                برنامج VIP
              </span>
            </Link>
          </li>
        </ul>
      </div>

      {/* Contact Info */}
      <div>
        <h3 className="text-lg font-bold mb-4">تواصل معنا</h3>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-white/90 mt-1 flex-shrink-0" />
            <span className="text-white/75">
              الرياض، المملكة العربية السعودية
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-white/90 flex-shrink-0" />
            <span className="text-white/75" dir="ltr">
              +966 50 123 4567
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-white/90 flex-shrink-0" />
            <span className="text-white/75">info@maedin.sa</span>
          </li>
        </ul>
      </div>

      

    </div>
    {/* Bottom Bar */}
<div className="border-t border-white/10 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
  <p className="text-white/60 text-sm">
    © {currentYear} MAEDIN. جميع الحقوق محفوظة.
  </p>

  <div className="flex gap-6 text-sm">
    <Link href="/privacy">
      <span className="text-white/60 hover:text-white transition-colors cursor-pointer">
        سياسة الخصوصية
      </span>
    </Link>

    <Link href="/terms">
      <span className="text-white/60 hover:text-white transition-colors cursor-pointer">
        الشروط والأحكام
      </span>
    </Link>
  </div>
</div>

  </div>
</footer>

  );
}
