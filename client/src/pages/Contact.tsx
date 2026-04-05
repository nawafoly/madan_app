import { useMemo } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Mail, Phone, MapPin, Clock } from "lucide-react";

export default function Contact() {
  const contactInfo = useMemo(
    () => [
      {
        icon: Mail,
        title: "البريد الإلكتروني",
        value: "info@maedin.sa",
        link: "mailto:info@maedin.sa",
      },
      {
        icon: Phone,
        title: "الهاتف",
        value: "0549010366",
        link: "tel:+966112345678",
      },
      {
        icon: MapPin,
        title: "العنوان",
        value: "الرياض، المملكة العربية السعودية",
        link: null as string | null,
      },
      {
        icon: Clock,
        title: "ساعات العمل",
        value: "الأحد - الخميس: 9 صباحاً - 5 مساءً",
        link: null as string | null,
      },
    ],
    []
  );

  return (
    <div className="w-full bg-transparent">
      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border/60 bg-transparent">
          <div className="container py-12 md:py-16">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                تواصل معنا
              </h1>

              <p className="mt-4 text-base md:text-lg text-muted-foreground">
                نحن هنا للإجابة على جميع استفساراتك. اكتب رسالتك وسنعود لك في أقرب
                وقت ممكن.
              </p>

              <div className="mx-auto mt-8 h-px w-24 bg-border" />
            </div>
          </div>
        </section>

        <section className="py-10 md:py-14">
          <div className="container">
            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {contactInfo.map((info, index) => {
                const Icon = info.icon;

                const CardInner = (
                  <Card className="h-full rounded-2xl border-border/70 bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50 transition hover:shadow-md">
                    <CardContent className="p-6 text-center">
                      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-border/70 bg-background">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold">{info.title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {info.value}
                      </p>
                    </CardContent>
                  </Card>
                );

                return info.link ? (
                  <a
                    key={index}
                    href={info.link}
                    className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {CardInner}
                  </a>
                ) : (
                  <div key={index}>{CardInner}</div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
