import type { ReactNode } from "react";
import Header from "@/components/Header";
import ContactCTA from "@/components/ContactCTA";
import Footer from "@/components/Footer";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />

      <main>{children}</main>

      <ContactCTA />
      <Footer />
    </>
  );
}
