import type { ReactNode } from "react";
import { useLocation } from "wouter";

import ContactCTA from "@/components/ContactCTA";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

export default function SiteLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const currentPath = (location || "/").split("?")[0];
  const shouldShowContactCTA = currentPath !== "/login";

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <div className="flex-1">{children}</div>

      {shouldShowContactCTA ? <ContactCTA /> : null}
      <Footer />
    </div>
  );
}
