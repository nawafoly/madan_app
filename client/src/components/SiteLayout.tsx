import type { ReactNode } from "react";
import Header from "@/components/Header";
import ContactCTA from "@/components/ContactCTA";
import Footer from "@/components/Footer";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1">{children}</div>

      <ContactCTA />
      <Footer />
    </div>
  );
}
