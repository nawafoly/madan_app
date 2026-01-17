import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export default function ClientLayout({ children, className }: Props) {
  return (
    <div className="min-h-screen flex flex-col" dir="rtl" lang="ar">
      <Header />

      <main className={`flex-1 mt-20 ${className ?? ""}`}>
        <div className="container">{children}</div>
      </main>

      <Footer />
    </div>
  );
}
