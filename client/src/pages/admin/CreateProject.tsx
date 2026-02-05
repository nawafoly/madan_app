import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Upload, X } from "lucide-react";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";

export default function CreateProject() {
  const [, setLocation] = useLocation();

  const [formData, setFormData] = useState({
    title: "",
    titleEn: "",
    description: "",
    descriptionEn: "",
    location: "",
    locationEn: "",
    type: "sukuk" as "sukuk" | "land_development" | "vip",
    status: "draft" as "draft" | "published" | "closed" | "completed",
    targetAmount: "",
    currentAmount: "0",
    returnRate: "",
    duration: "",
    minInvestment: "",
    imageUrl: "",
    images: [] as string[],
  });

  const [imageInput, setImageInput] = useState("");
  const [saving, setSaving] = useState(false);

  const toNumberSafe = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const isLikelyUrl = (s: string) => {
    try {
      // يقبل http/https فقط (خفيف وبسيط)
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;

    const titleAr = formData.title.trim();
    const titleEn = formData.titleEn.trim();
    const descAr = formData.description.trim();
    const descEn = formData.descriptionEn.trim();
    const locAr = formData.location.trim();
    const locEn = formData.locationEn.trim();
    const cover = formData.imageUrl.trim();

    if (!titleAr) return toast.error("عنوان المشروع (عربي) مطلوب");
    if (!descAr) return toast.error("الوصف (عربي) مطلوب");
    if (!locAr) return toast.error("الموقع (عربي) مطلوب");
    if (!cover) return toast.error("الصورة الرئيسية مطلوبة");
    if (!isLikelyUrl(cover)) return toast.error("رابط الصورة الرئيسية غير صالح");

    setSaving(true);

    try {
      // ✅ توحيد نوع VIP في الداتا
      const projectType = formData.type === "vip" ? "vip_exclusive" : formData.type;

      await addDoc(collection(db, "projects"), {
        issueNumber: `MAE-${Date.now().toString().slice(-6)}`,

        // ✅ EN fallback → AR
        title: titleEn || titleAr,
        titleAr,

        description: descEn || descAr,
        descriptionAr: descAr,

        projectType,

        location: locEn || locAr,
        locationAr: locAr,

        status: formData.status,

        targetAmount: toNumberSafe(formData.targetAmount),
        currentAmount: toNumberSafe(formData.currentAmount),
        minInvestment: toNumberSafe(formData.minInvestment),

        annualReturn: toNumberSafe(formData.returnRate),
        investmentReturn: toNumberSafe(formData.returnRate),

        duration: toNumberSafe(formData.duration),

        coverImage: cover,
        images: formData.images,

        vipOnly: formData.type === "vip",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success("تم إنشاء المشروع بنجاح");
      setLocation("/admin/projects");
    } catch (err) {
      console.error(err);
      toast.error("فشل إنشاء المشروع");
    } finally {
      setSaving(false);
    }
  };

  const handleAddImage = () => {
    const url = imageInput.trim();
    if (!url) return;

    if (!isLikelyUrl(url)) {
      toast.error("رابط الصورة الإضافية غير صالح");
      return;
    }

    setFormData((p) => {
      const exists = p.images.some((x) => x.trim() === url);
      if (exists) {
        toast.message("هذه الصورة مضافة مسبقًا");
        return p;
      }
      return { ...p, images: [...p.images, url] };
    });

    setImageInput("");
  };

  const handleRemoveImage = (index: number) => {
    setFormData((p) => ({
      ...p,
      images: p.images.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="container py-8">
        <Button
          variant="ghost"
          onClick={() => setLocation("/admin/projects")}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 ml-2" />
          العودة إلى المشاريع
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">إنشاء مشروع جديد</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Titles */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label>عنوان المشروع (عربي)</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, title: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label>عنوان المشروع (إنجليزي)</Label>
                  <Input
                    value={formData.titleEn}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, titleEn: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Descriptions */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label>الوصف (عربي)</Label>
                  <Textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, description: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label>الوصف (إنجليزي)</Label>
                  <Textarea
                    rows={4}
                    value={formData.descriptionEn}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        descriptionEn: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Location */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label>الموقع (عربي)</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, location: e.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label>الموقع (إنجليزي)</Label>
                  <Input
                    value={formData.locationEn}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        locationEn: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Type & Status */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label>نوع المشروع</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v: any) =>
                      setFormData((p) => ({ ...p, type: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sukuk">صكوك</SelectItem>
                      <SelectItem value="land_development">تطوير أراضي</SelectItem>
                      <SelectItem value="vip">VIP حصري</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>الحالة</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(v: any) =>
                      setFormData((p) => ({ ...p, status: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">قريبا</SelectItem>
                      <SelectItem value="published">منشور</SelectItem>
                      <SelectItem value="closed">مغلق</SelectItem>
                      <SelectItem value="completed">مكتمل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Financial */}
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <Label>المبلغ المستهدف</Label>
                  <Input
                    type="number"
                    value={formData.targetAmount}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        targetAmount: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label>نسبة العائد %</Label>
                  <Input
                    type="number"
                    value={formData.returnRate}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        returnRate: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label>المدة (شهر)</Label>
                  <Input
                    type="number"
                    value={formData.duration}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        duration: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div>
                <Label>الحد الأدنى للاستثمار</Label>
                <Input
                  type="number"
                  value={formData.minInvestment}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      minInvestment: e.target.value,
                    }))
                  }
                  required
                />
              </div>

              {/* Images */}
              <div className="space-y-4">
                <div>
                  <Label>الصورة الرئيسية</Label>
                  <Input
                    value={formData.imageUrl}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        imageUrl: e.target.value,
                      }))
                    }
                    required
                  />
                </div>

                <div>
                  <Label>صور إضافية</Label>
                  <div className="flex gap-2">
                    <Input
                      value={imageInput}
                      onChange={(e) => setImageInput(e.target.value)}
                    />
                    <Button
                      type="button"
                      onClick={handleAddImage}
                      variant="outline"
                    >
                      <Upload className="w-4 h-4 ml-1" /> إضافة
                    </Button>
                  </div>

                  {formData.images.map((img, i) => (
                    <div key={img + i} className="flex gap-2 items-center mt-2">
                      <img
                        src={img}
                        alt={`img-${i}`}
                        className="w-14 h-14 rounded object-cover"
                      />
                      <span className="flex-1 truncate text-sm">{img}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        type="button"
                        onClick={() => handleRemoveImage(i)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-4 pt-6">
                <Button type="submit" disabled={saving}>
                  {saving ? "جاري الإنشاء..." : "إنشاء المشروع"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/admin/projects")}
                >
                  إلغاء
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
