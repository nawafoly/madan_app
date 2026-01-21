import { useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { toast } from "sonner";
import { Mail, Phone, MapPin, Clock } from "lucide-react";

// Firestore
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";

type ContactForm = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
};

export default function Contact() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ContactForm>({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.name.trim() ||
      !formData.email.trim() ||
      !formData.message.trim()
    ) {
      toast.error("الرجاء تعبئة الحقول المطلوبة");
      return;
    }

    try {
      setLoading(true);

      await addDoc(collection(db, "contact_messages"), {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        subject: formData.subject.trim() || null,
        message: formData.message.trim(),
        status: "new",
        createdAt: serverTimestamp(),
      });

      toast.success("تم إرسال رسالتك بنجاح! سنتواصل معك قريباً.");

      setFormData({
        name: "",
        email: "",
        phone: "",
        subject: "",
        message: "",
      });
    } catch (err) {
      console.error(err);
      toast.error("فشل إرسال الرسالة، حاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border/60 bg-background">
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

            {/* Contact Form */}
            <div className="mt-10 md:mt-14">
              <Card className="max-w-3xl mx-auto rounded-3xl border-border/70 bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60">
                <CardHeader className="pb-0">
                  <CardTitle className="text-center text-2xl md:text-3xl">
                    أرسل لنا رسالة
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-6 md:p-10">
                  <Separator className="mb-8" />

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-4 md:gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          الاسم الكامل
                        </label>
                        <Input
                          placeholder="مثال: أحمد محمد"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              name: e.target.value,
                            })
                          }
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          البريد الإلكتروني
                        </label>
                        <Input
                          type="email"
                          placeholder="name@example.com"
                          value={formData.email}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              email: e.target.value,
                            })
                          }
                          required
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 md:gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          رقم الهاتف
                        </label>
                        <Input
                          placeholder="0549010366"
                          value={formData.phone}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              phone: e.target.value,
                            })
                          }
                          dir="ltr"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">الموضوع</label>
                        <Input
                          placeholder="مثال: استفسار عن الاستثمار"
                          value={formData.subject}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              subject: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">الرسالة</label>
                      <Textarea
                        rows={7}
                        placeholder="اكتب رسالتك هنا..."
                        value={formData.message}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            message: e.target.value,
                          })
                        }
                        required
                      />
                    </div>

                    <Button
                      type="submit"
                      size="lg"
                      disabled={loading}
                      className="w-full rounded-2xl"
                    >
                      {loading ? "جاري الإرسال..." : "إرسال الرسالة"}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground">
                      بالإرسال أنت توافق على استخدام بياناتك للتواصل معك فقط.
                    </p>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
