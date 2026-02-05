import { useMemo } from "react";
import { Link } from "wouter";
import { Mail, Phone, MapPin, Clock } from "lucide-react";

export default function ContactCTA() {
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
        link: "tel:+966549010366",
      },
      {
        icon: MapPin,
        title: "العنوان",
        value: "المدينة المنورة , المملكة العربية السعودية",
        link: null,
      },
      {
        icon: Clock,
        title: "ساعات العمل",
        value: "الأحد - الخميس: 9 صباحاً - 5 مساءً\nالسبت: 12 ظهراً - 5 مساءً",
        link: null,
      },
    ],
    []
  );

  return (
    <section dir="rtl" className="bg-transparent">
      {/* الشريط الأبيض */}
      <div className="container pt-16 md:pt-20 pb-24 md:pb-28 text-center">
        <h2 className="text-5xl md:text-6xl font-bold text-primary">
          تواصل معنا
        </h2>
        <p className="mt-4 text-muted-foreground">
          للاستفسارات، الفرص الاستثمارية، أو أي معلومات إضافية… يسعدنا تواصلك
        </p>
      </div>

      {/* الكرت العايم */}
      <div className="container relative">
        <div className="relative z-20 -mb-24 md:-mb-28">
          <div className="bg-white rounded-[28px] border border-black/5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-3">
              {/* ✅ بيانات التواصل (يمين) */}
              <div className="p-8 md:p-10 lg:border-l lg:border-black/10">
                <h3 className="text-2xl font-bold text-foreground">
                  يسعدنا تواصلك
                </h3>


                <div className="mt-6 space-y-4">
                  {contactInfo.map((item, i) => {
                    const Icon = item.icon;
                    const content = (
                      <div className="flex items-start gap-3">
                        <Icon className="w-5 h-5 text-primary mt-0.5" />
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {item.title}
                          </div>
                          <div className="text-sm text-muted-foreground whitespace-pre-line">
                          {item.value}
                          </div>
                        </div>
                      </div>
                    );

                    return item.link ? (
                      <a
                        key={i}
                        href={item.link}
                        className="block hover:opacity-80 transition"
                      >
                        {content}
                      </a>
                    ) : (
                      <div key={i}>{content}</div>
                    );
                  })}
                </div>
              </div>

              {/* ✅ النموذج (يسار) */}
              <div className="lg:col-span-2 p-8 md:p-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    className="h-12 rounded-full bg-white border border-black/10 px-5 outline-none focus:border-black/20"
                    placeholder="الاسم الأول"
                  />
                  <input
                    className="h-12 rounded-full bg-white border border-black/10 px-5 outline-none focus:border-black/20"
                    placeholder="اسم العائلة"
                  />
                </div>

                <div className="mt-4">
                  <input
                    className="h-12 w-full rounded-full bg-white border border-black/10 px-5 outline-none focus:border-black/20"
                    placeholder="البريد الإلكتروني"
                    dir="ltr"
                  />
                </div>

                <div className="mt-4">
                  <textarea
                    className="w-full rounded-[22px] bg-white border border-black/10 px-5 py-4 outline-none focus:border-black/20"
                    rows={4}
                    placeholder="رسالتك..."
                  />
                </div>

                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    className="h-11 px-14 rounded-full bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
                  >
                    إرسال الرسالة
                  </button>
                </div>

                <p className="mt-4 text-xs text-muted-foreground text-center">
                  بإرسالك الرسالة، فأنت توافق على{" "}
                  <Link href="/terms">
                    <span className="underline cursor-pointer">
                      الشروط والأحكام
                    </span>
                  </Link>{" "}
                  و{" "}
                  <Link href="/privacy">
                    <span className="underline cursor-pointer">
                      سياسة الخصوصية
                    </span>
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
