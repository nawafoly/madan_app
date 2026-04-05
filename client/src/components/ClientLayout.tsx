import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export default function ClientLayout({ children, className }: Props) {
  const { language } = useLanguage();
  const layoutDir: "rtl" | "ltr" = language === "ar" ? "rtl" : "ltr";
  const textAlignClass = language === "ar" ? "text-right" : "text-left";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main
        dir={layoutDir}
        className={`flex-1 mt-20 ${textAlignClass} ${className ?? ""}`}
      >
        <div className={`container ${textAlignClass}`}>{children}</div>
      </main>

      <Footer />
    </div>
  );
}
