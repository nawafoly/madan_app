import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Mail, Phone, MapPin, Clock } from "lucide-react";
import type { FormEvent } from "react";

// ًں”¥ Firestore
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";

export default function Contact() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.message) {
      toast.error("ط§ظ„ط±ط¬ط§ط، ظ…ظ„ط، ط¬ظ…ظٹط¹ ط§ظ„ط­ظ‚ظˆظ„ ط§ظ„ظ…ط·ظ„ظˆط¨ط©");
      return;
    }

    try {
      setLoading(true);

      await addDoc(collection(db, "contact_messages"), {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        subject: formData.subject || null,
        message: formData.message,
        status: "new",
        createdAt: serverTimestamp(),
      });

      toast.success("طھظ… ط¥ط±ط³ط§ظ„ ط±ط³ط§ظ„طھظƒ ط¨ظ†ط¬ط§ط­! ط³ظ†طھظˆط§طµظ„ ظ…ط¹ظƒ ظ‚ط±ظٹط¨ط§ظ‹");

      setFormData({
        name: "",
        email: "",
        phone: "",
        subject: "",
        message: "",
      });
    } catch (err) {
      console.error(err);
      toast.error("ظپط´ظ„ ط¥ط±ط³ط§ظ„ ط§ظ„ط±ط³ط§ظ„ط©طŒ ط­ط§ظˆظ„ ظ…ط±ط© ط£ط®ط±ظ‰");
    } finally {
      setLoading(false);
    }
  };

  const contactInfo = [
    {
      icon: Mail,
      title: "ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ",
      value: "info@maedin.sa",
      link: "mailto:info@maedin.sa",
    },
    {
      icon: Phone,
      title: "ط§ظ„ظ‡ط§طھظپ",
      value: "+966 11 234 5678",
      link: "tel:+966112345678",
    },
    {
      icon: MapPin,
      title: "ط§ظ„ط¹ظ†ظˆط§ظ†",
      value: "ط§ظ„ط±ظٹط§ط¶طŒ ط§ظ„ظ…ظ…ظ„ظƒط© ط§ظ„ط¹ط±ط¨ظٹط© ط§ظ„ط³ط¹ظˆط¯ظٹط©",
      link: null,
    },
    {
      icon: Clock,
      title: "ط³ط§ط¹ط§طھ ط§ظ„ط¹ظ…ظ„",
      value: "ط§ظ„ط£ط­ط¯ - ط§ظ„ط®ظ…ظٹط³: 9 طµط¨ط§ط­ط§ظ‹ - 5 ظ…ط³ط§ط،ظ‹",
      link: null,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 pt-20">
        {/* Hero */}
        <section className="bg-gradient-to-b from-[#030640] to-background py-20">
          <div className="container text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
              طھظˆط§طµظ„ ظ…ط¹ظ†ط§
            </h1>
            <p className="text-xl text-gray-300">
              ظ†ط­ظ† ظ‡ظ†ط§ ظ„ظ„ط¥ط¬ط§ط¨ط© ط¹ظ„ظ‰ ط¬ظ…ظٹط¹ ط§ط³طھظپط³ط§ط±ط§طھظƒ
            </p>
          </div>
        </section>

        {/* Info */}
        <section className="py-16">
          <div className="container">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
              {contactInfo.map((info, index) => {
                const Icon = info.icon;
                const card = (
                  <div className="bg-card border border-border rounded-xl p-6 text-center hover:shadow-lg transition-shadow h-full">
                    <Icon className="w-10 h-10 mx-auto mb-4 text-[#F2B705]" />
                    <h3 className="font-semibold mb-2">{info.title}</h3>
                    <p className="text-sm text-muted-foreground">{info.value}</p>
                  </div>
                );
                return info.link ? (
                  <a key={index} href={info.link}>
                    {card}
                  </a>
                ) : (
                  <div key={index}>{card}</div>
                );
              })}
            </div>

            {/* Form */}
            <div className="max-w-3xl mx-auto">
              <div className="bg-card border border-border rounded-2xl p-8 md:p-12">
                <h2 className="text-3xl font-bold mb-6 text-center">
                  ط£ط±ط³ظ„ ظ„ظ†ط§ ط±ط³ط§ظ„ط©
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <Input
                      placeholder="ط§ظ„ط§ط³ظ… ط§ظ„ظƒط§ظ…ظ„ *"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      required
                    />
                    <Input
                      type="email"
                      placeholder="ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ *"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <Input
                      placeholder="ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ"
                      dir="ltr"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                    />
                    <Input
                      placeholder="ط§ظ„ظ…ظˆط¶ظˆط¹"
                      value={formData.subject}
                      onChange={(e) =>
                        setFormData({ ...formData, subject: e.target.value })
                      }
                    />
                  </div>

                  <Textarea
                    rows={6}
                    placeholder="ط§ظƒطھط¨ ط±ط³ط§ظ„طھظƒ ظ‡ظ†ط§... *"
                    value={formData.message}
                    onChange={(e) =>
                      setFormData({ ...formData, message: e.target.value })
                    }
                    required
                  />

                  <Button
                    type="submit"
                    size="lg"
                    disabled={loading}
                    className="w-full bg-[#F2B705] hover:bg-[#d9a304] text-black text-lg"
                  >
                    {loading ? "ط¬ط§ط±ظٹ ط§ظ„ط¥ط±ط³ط§ظ„..." : "ط¥ط±ط³ط§ظ„ ط§ظ„ط±ط³ط§ظ„ط©"}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
