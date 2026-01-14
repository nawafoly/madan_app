// client/src/pages/admin/EditProject.tsx
import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/_core/firebase";

import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight, Save } from "lucide-react";

type ProjectType = "sukuk" | "land_development" | "vip_exclusive";
type ProjectStatus = "draft" | "published" | "closed" | "completed";

export default function EditProject() {
  const [, params] = useRoute("/admin/projects/:id/edit");
  const [, setLocation] = useLocation();
  const projectId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectExists, setProjectExists] = useState(true);

  const [formData, setFormData] = useState({
    title: "",
    titleAr: "",
    description: "",
    descriptionAr: "",
    projectType: "sukuk" as ProjectType,
    location: "",
    locationAr: "",
    targetAmount: "",
    minInvestment: "",
    annualReturn: "",
    investmentReturn: "",
    duration: "",
    status: "draft" as ProjectStatus,
  });

  /* =========================
     Load project from Firestore
  ========================= */
  useEffect(() => {
    if (!projectId) return;

    const load = async () => {
      try {
        const ref = doc(db, "projects", projectId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setProjectExists(false);
          return;
        }

        const p = snap.data();

        setFormData({
          title: p.title ?? "",
          titleAr: p.titleAr ?? "",
          description: p.description ?? "",
          descriptionAr: p.descriptionAr ?? "",
          projectType: p.projectType ?? "sukuk",
          location: p.location ?? "",
          locationAr: p.locationAr ?? "",
          targetAmount: p.targetAmount ?? "",
          minInvestment: p.minInvestment ?? "",
          annualReturn: p.annualReturn ?? "",
          investmentReturn: p.investmentReturn ?? "",
          duration: String(p.duration ?? ""),
          status: p.status ?? "draft",
        });
      } catch (err) {
        console.error(err);
        toast.error("فشل تحميل المشروع");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [projectId]);

  /* =========================
     Submit update
  ========================= */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    try {
      setSaving(true);

      await updateDoc(doc(db, "projects", projectId), {
        title: formData.title,
        titleAr: formData.titleAr,
        description: formData.description,
        descriptionAr: formData.descriptionAr,
        projectType: formData.projectType,
        location: formData.location,
        locationAr: formData.locationAr,
        targetAmount: formData.targetAmount,
        minInvestment: formData.minInvestment,
        annualReturn: formData.annualReturn,
        investmentReturn: formData.investmentReturn,
        duration: Number(formData.duration),
        status: formData.status,
        updatedAt: new Date(),
      });

      toast.success("تم تحديث المشروع بنجاح");
      setLocation("/admin/projects");
    } catch (err) {
      console.error(err);
      toast.error("فشل حفظ التعديلات");
    } finally {
      setSaving(false);
    }
  };

  /* =========================
     States
  ========================= */
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          جاري التحميل...
        </div>
      </DashboardLayout>
    );
  }

  if (!projectExists) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-lg">المشروع غير موجود</p>
          <Button onClick={() => setLocation("/admin/projects")}>
            <ArrowRight className="w-4 h-4 ml-2" />
            العودة
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  /* =========================
     UI
  ========================= */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">تعديل المشروع</h1>
            <p className="text-muted-foreground">تحديث بيانات المشروع</p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/admin/projects")}>
            <ArrowRight className="w-4 h-4 ml-2" />
            رجوع
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic */}
          <Card>
            <CardHeader>
              <CardTitle>المعلومات الأساسية</CardTitle>
              <CardDescription>العناوين والوصف</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>العنوان (عربي)</Label>
                  <Input
                    value={formData.titleAr}
                    onChange={(e) =>
                      setFormData({ ...formData, titleAr: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>العنوان (إنجليزي)</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                  />
                </div>
              </div>

              <Label>الوصف (عربي)</Label>
              <Textarea
                rows={4}
                value={formData.descriptionAr}
                onChange={(e) =>
                  setFormData({ ...formData, descriptionAr: e.target.value })
                }
              />

              <Label>الوصف (إنجليزي)</Label>
              <Textarea
                rows={4}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setLocation("/admin/projects")}>
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#F2B705] hover:bg-[#d9a504]"
            >
              <Save className="w-4 h-4 ml-2" />
              {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
