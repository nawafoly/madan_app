// client/src/pages/admin/Financial.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  Timestamp,
  runTransaction,
} from "firebase/firestore";

import { db } from "@/_core/firebase";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, DollarSign, TrendingUp, Clock } from "lucide-react";
import { toast } from "sonner";

import { PDFDocument } from "pdf-lib";

/* =========================
   helpers
========================= */
const toDate = (v: any) => (v instanceof Timestamp ? v.toDate() : new Date(v));

const toNumber = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const addMonths = (d: Date, months: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
};

const diffDays = (a: Date, b: Date) => {
  const ms = a.getTime() - b.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
};

// ✅ PDF Download helpers
const downloadBytes = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const fmtMoney = (n: any) => {
  const x = Number(n || 0);
  return x.toLocaleString("en-US");
};

const safeFile = (s: string) => String(s || "file").replace(/[^\w\-]+/g, "_");

// ✅ يرسم النص (عربي/إنجليزي) في Canvas ثم يرجعه PNG bytes
const textToPngBytes = async (text: string, width = 515) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_not_supported");

  const fontSize = 18;
  ctx.font = `${fontSize}px Tahoma, Arial`;
  ctx.direction = "rtl";
  ctx.textAlign = "right";

  const lines = String(text || "").split("\n");
  const lineHeight = 28;

  canvas.width = width;
  canvas.height = Math.max(120, lines.length * lineHeight + 60);

  // خلفية بيضاء
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // نص أسود
  ctx.fillStyle = "#111111";

  let y = 40;
  for (const l of lines) {
    ctx.fillText(l, canvas.width - 20, y);
    y += lineHeight;
  }

  const dataUrl = canvas.toDataURL("image/png");
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
};

export default function Financial() {
  const [loading, setLoading] = useState(true);

  const [investments, setInvestments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  const [selectedInvestment, setSelectedInvestment] = useState<any>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [closeDate, setCloseDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  });

  const [rejectionReason, setRejectionReason] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customDuration, setCustomDuration] = useState("");

  /* =========================
     Load data
  ========================= */
  const loadAll = async () => {
    try {
      setLoading(true);

      const [invSnap, userSnap, projSnap] = await Promise.all([
        getDocs(collection(db, "investments")),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "projects")),
      ]);

      setInvestments(invSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setUsers(userSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setProjects(projSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل البيانات المالية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  /* =========================
     Derived
  ========================= */
  const pendingInvestments = useMemo(
    () => investments.filter((i) => i.status === "pending"),
    [investments]
  );

  const approvedInvestments = useMemo(
    () => investments.filter((i) => i.status === "approved" || i.status === "active"),
    [investments]
  );

  const totalPendingAmount = pendingInvestments.reduce(
    (s, i) => s + Number(i.amount || 0),
    0
  );

  const totalApprovedAmount = approvedInvestments.reduce(
    (s, i) => s + Number(i.amount || 0),
    0
  );

  const getUserName = (uid: string) =>
    users.find((u) => u.id === uid)?.name || "غير معروف";

  const getProjectName = (pid: string) =>
    projects.find((p) => p.id === pid)?.titleAr || "غير معروف";

  const getStatusBadge = (status: string) => {
    const map: any = {
      pending: { label: "معلق", cls: "bg-orange-500" },
      approved: { label: "معتمد", cls: "bg-green-500" },
      rejected: { label: "مرفوض", cls: "bg-red-500" },
      active: { label: "نشط", cls: "bg-blue-500" },
      completed: { label: "مكتمل", cls: "bg-gray-500" },
    };
    const c = map[status] || map.pending;
    return <Badge className={c.cls}>{c.label}</Badge>;
  };

  /* =========================
     Actions
  ========================= */
  const approveInvestmentTx = async () => {
    if (!selectedInvestment) return;

    try {
      const inv = selectedInvestment;

      await runTransaction(db, async (tx) => {
        const invRef = doc(db, "investments", inv.id);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error("investment_not_found");

        const invData: any = invSnap.data();

        // امنع الاعتماد مرتين
        const curStatus = String(invData.status || "");
        if (curStatus !== "pending") throw new Error("not_pending");

        const projectId = String(invData.projectId || inv.projectId || "");
        if (!projectId) throw new Error("missing_projectId");

        const projRef = doc(db, "projects", projectId);
        const projSnap = await tx.get(projRef);
        if (!projSnap.exists()) throw new Error("project_not_found");

        const proj: any = projSnap.data();

        const amount = toNumber(invData.amount, 0);
        const targetAmount = toNumber(proj.targetAmount, 0);
        const currentAmount = toNumber(proj.currentAmount, 0);
        const pendingAmount = toNumber(proj.pendingAmount, 0);

        const durationMonths =
          toNumber(invData.customDuration, 0) ||
          toNumber(invData.durationMonths, 0) ||
          toNumber(proj.durationMonths, 0) ||
          toNumber(proj.duration, 0) ||
          0;

        const annualReturn =
          toNumber(invData.customRate, 0) || toNumber(proj.annualReturn, 0);

        const startAt = Timestamp.now();

        const plannedEndAt =
          (proj.plannedEndAt instanceof Timestamp ? proj.plannedEndAt : null) ||
          Timestamp.fromDate(addMonths(startAt.toDate(), durationMonths));

        const expectedProfit =
          amount * (annualReturn / 100) * ((durationMonths || 0) / 12);

        const newCurrent = currentAmount + amount;

        tx.update(invRef, {
          status: "approved",
          signedAt: startAt,
          startAt,
          plannedEndAt,
          annualReturnAtSign: annualReturn,
          durationMonthsAtSign: durationMonths,
          expectedProfit,
          earnedProfit: null,
          withdrawnAt: null,
          actualEndAt: null,
          exitType: null,
          updatedAt: new Date(),
        });

        const projUpdate: any = {
          currentAmount: newCurrent,
          investorsCount: toNumber(proj.investorsCount, 0) + 1,
          pendingAmount: Math.max(0, pendingAmount - amount),
          updatedAt: new Date(),
        };

        if (targetAmount > 0 && newCurrent >= targetAmount) {
          projUpdate.status = "closed";
        }

        tx.update(projRef, projUpdate);
      });

      toast.success("تم اعتماد الاستثمار وتحديث المشروع");
      setIsApproveDialogOpen(false);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error("فشل اعتماد الاستثمار");
    }
  };

  const closeInvestmentEarlyTx = async () => {
    if (!selectedInvestment) return;

    try {
      await runTransaction(db, async (tx) => {
        const invRef = doc(db, "investments", selectedInvestment.id);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error("investment_not_found");

        const inv: any = invSnap.data();

        const st = String(inv.status || "");
        if (st !== "approved" && st !== "active") {
          throw new Error("invalid_status_for_close");
        }

        const projectId = String(inv.projectId || "");
        if (!projectId) throw new Error("missing_projectId");

        const projRef = doc(db, "projects", projectId);
        const projSnap = await tx.get(projRef);
        if (!projSnap.exists()) throw new Error("project_not_found");

        const proj: any = projSnap.data();

        const amount = toNumber(inv.amount, 0);

        const currentAmount = toNumber(proj.currentAmount, 0);
        const investorsCount = toNumber(proj.investorsCount, 0);

        tx.update(invRef, {
          status: "completed",
          actualEndAt: new Date(),
          exitType: "early_closure",
          earnedProfit: inv.expectedProfit, // For simplicity, assuming expected profit is earned
          updatedAt: new Date(),
        });

        tx.update(projRef, {
          currentAmount: Math.max(0, currentAmount - amount),
          investorsCount: Math.max(0, investorsCount - 1),
          updatedAt: new Date(),
        });
      });

      toast.success("تم إنهاء الاستثمار بنجاح");
      setIsCloseDialogOpen(false);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error("فشل إنهاء الاستثمار");
    }
  };

  const updateFinancials = async () => {
    if (!selectedInvestment) return;

    try {
      const invRef = doc(db, "investments", selectedInvestment.id);
      await updateDoc(invRef, {
        customRate: toNumber(customRate) || null,
        customDuration: toNumber(customDuration) || null,
        updatedAt: new Date(),
      });
      toast.success("تم تحديث البيانات المالية");
      setIsEditDialogOpen(false);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث البيانات المالية");
    }
  };

  const updateStatus = async (status: string, data: any = {}) => {
    if (!selectedInvestment) return;

    try {
      const invRef = doc(db, "investments", selectedInvestment.id);
      await updateDoc(invRef, {
        status,
        ...data,
        updatedAt: new Date(),
      });
      toast.success("تم تحديث حالة الاستثمار");
      setIsRejectDialogOpen(false);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث حالة الاستثمار");
    }
  };

  // ✅ Improved PDF export for a single investor
  const exportInvestorPDF = async (inv: any) => {
    try {
      const pdf = await PDFDocument.create();
      const u = users.find((user) => user.id === inv.userId);
      const p = projects.find((project) => project.id === inv.projectId);

      const startAt = inv.startAt instanceof Timestamp ? inv.startAt.toDate() : null;
      const plannedEndAt = inv.plannedEndAt instanceof Timestamp ? inv.plannedEndAt.toDate() : null;
      const reportDate = new Date().toLocaleDateString("ar-SA");

      const reportContent = `
منصة معدن الاستثمارية
تقرير استثمار تفصيلي

تاريخ التقرير: ${reportDate}
رقم التقرير: MAADEN-INV-${inv.id.substring(0, 8).toUpperCase()}

بيانات المستثمر:
-------------------
اسم المستثمر: ${u?.name || "غير معروف"}
رقم الجوال: ${u?.phone || "-"}
البريد الإلكتروني: ${u?.email || "-"}

بيانات المشروع:
-------------------
اسم المشروع: ${p?.titleAr || p?.title || "غير معروف"}
وصف المشروع: ${p?.description || "-"}
القطاع: ${p?.sector || "-"}

تفاصيل الاستثمار:
-------------------
المبلغ المستثمر: ${fmtMoney(inv.amount)} ر.س
حالة الاستثمار: ${getStatusBadge(inv.status).props.children}
تاريخ بدء الاستثمار: ${startAt ? startAt.toLocaleDateString("ar-SA") : "-"}
تاريخ الانتهاء المخطط: ${plannedEndAt ? plannedEndAt.toLocaleDateString("ar-SA") : "-"}
الربح المتوقع: ${inv.expectedProfit == null ? "-" : fmtMoney(inv.expectedProfit)} ر.س
الربح الفعلي: ${inv.earnedProfit == null ? "-" : fmtMoney(inv.earnedProfit)} ر.س

-------------------
ملاحظات هامة:
* هذا التقرير صادر عن منصة معدن الاستثمارية بناءً على البيانات المتاحة حتى تاريخ إصداره.
* الأرباح المتوقعة هي تقديرية وقد تختلف عن الأرباح الفعلية بناءً على أداء المشروع.
* لأي استفسارات أو معلومات إضافية، يرجى التواصل مع فريق خدمة العملاء في منصة معدن.

منصة معدن الاستثمارية
الموقع الإلكتروني: www.maaden.sa
البريد الإلكتروني: info@maaden.sa
العنوان: الرياض، المملكة العربية السعودية
جميع الحقوق محفوظة لمنصة معدن الاستثمارية ${new Date().getFullYear()}
      `.trim();

      const page = pdf.addPage([595.28, 841.89]);
      const pngBytes = await textToPngBytes(reportContent, 515);
      const png = await pdf.embedPng(pngBytes);

      const imgW = 515;
      const scale = imgW / png.width;
      const imgH = png.height * scale;

      page.drawImage(png, {
        x: 40,
        y: 800 - imgH,
        width: imgW,
        height: imgH,
      });

      const bytes = await pdf.save();
      downloadBytes(bytes, `Maaden_Report_${safeFile(u?.name || inv.id)}.pdf`);
      toast.success("تم تصدير التقرير الرسمي بنجاح");
    } catch (e) {
      console.error(e);
      toast.error("فشل توليد التقرير الرسمي");
    }
  };

  // ✅ Improved PDF export for all investors (single PDF with multiple pages)
  const exportAllInvestorsPDF = async () => {
    try {
      const pdf = await PDFDocument.create();
      const reportDate = new Date().toLocaleDateString("ar-SA");

      for (const inv of investments) {
        const u = users.find((user) => user.id === inv.userId);
        const p = projects.find((project) => project.id === inv.projectId);

        const startAt = inv.startAt instanceof Timestamp ? inv.startAt.toDate() : null;
        const plannedEndAt = inv.plannedEndAt instanceof Timestamp ? inv.plannedEndAt.toDate() : null;

        const reportContent = `
منصة معدن الاستثمارية
تقرير استثمار تفصيلي

تاريخ التقرير: ${reportDate}
رقم التقرير: MAADEN-INV-${inv.id.substring(0, 8).toUpperCase()}

بيانات المستثمر:
-------------------
اسم المستثمر: ${u?.name || "غير معروف"}
رقم الجوال: ${u?.phone || "-"}
البريد الإلكتروني: ${u?.email || "-"}

بيانات المشروع:
-------------------
اسم المشروع: ${p?.titleAr || p?.title || "غير معروف"}
وصف المشروع: ${p?.description || "-"}
القطاع: ${p?.sector || "-"}

تفاصيل الاستثمار:
-------------------
المبلغ المستثمر: ${fmtMoney(inv.amount)} ر.س
حالة الاستثمار: ${getStatusBadge(inv.status).props.children}
تاريخ بدء الاستثمار: ${startAt ? startAt.toLocaleDateString("ar-SA") : "-"}
تاريخ الانتهاء المخطط: ${plannedEndAt ? plannedEndAt.toLocaleDateString("ar-SA") : "-"}
الربح المتوقع: ${inv.expectedProfit == null ? "-" : fmtMoney(inv.expectedProfit)} ر.س
الربح الفعلي: ${inv.earnedProfit == null ? "-" : fmtMoney(inv.earnedProfit)} ر.س

-------------------
ملاحظات هامة:
* هذا التقرير صادر عن منصة معدن الاستثمارية بناءً على البيانات المتاحة حتى تاريخ إصداره.
* الأرباح المتوقعة هي تقديرية وقد تختلف عن الأرباح الفعلية بناءً على أداء المشروع.
* لأي استفسارات أو معلومات إضافية، يرجى التواصل مع فريق خدمة العملاء في منصة معدن.

منصة معدن الاستثمارية
الموقع الإلكتروني: www.maaden.sa
البريد الإلكتروني: info@maaden.sa
العنوان: الرياض، المملكة العربية السعودية
جميع الحقوق محفوظة لمنصة معدن الاستثمارية ${new Date().getFullYear()}
        `.trim();

        const page = pdf.addPage([595.28, 841.89]);
        const pngBytes = await textToPngBytes(reportContent, 515);
        const png = await pdf.embedPng(pngBytes);

        const imgW = 515;
        const scale = imgW / png.width;
        const imgH = png.height * scale;

        page.drawImage(png, {
          x: 40,
          y: 800 - imgH,
          width: imgW,
          height: imgH,
        });
      }

      const bytes = await pdf.save();
      downloadBytes(bytes, `Maaden_All_Investors_Report_${reportDate}.pdf`);
      toast.success("تم تصدير تقرير جميع المستثمرين الرسمي بنجاح");
    } catch (e) {
      console.error(e);
      toast.error("فشل توليد تقرير جميع المستثمرين الرسمي");
    }
  };

  // ✅ Improved PDF export for all investors (separate PDFs)
  const exportAllInvestorsSeparatePDFs = async () => {
    try {
      const reportDate = new Date().toLocaleDateString("ar-SA");

      for (const inv of investments) {
        const pdf = await PDFDocument.create();
        const u = users.find((user) => user.id === inv.userId);
        const p = projects.find((project) => project.id === inv.projectId);

        const startAt = inv.startAt instanceof Timestamp ? inv.startAt.toDate() : null;
        const plannedEndAt = inv.plannedEndAt instanceof Timestamp ? inv.plannedEndAt.toDate() : null;

        const reportContent = `
منصة معدن الاستثمارية
تقرير استثمار تفصيلي

تاريخ التقرير: ${reportDate}
رقم التقرير: MAADEN-INV-${inv.id.substring(0, 8).toUpperCase()}

بيانات المستثمر:
-------------------
اسم المستثمر: ${u?.name || "غير معروف"}
رقم الجوال: ${u?.phone || "-"}
البريد الإلكتروني: ${u?.email || "-"}

بيانات المشروع:
-------------------
اسم المشروع: ${p?.titleAr || p?.title || "غير معروف"}
وصف المشروع: ${p?.description || "-"}
القطاع: ${p?.sector || "-"}

تفاصيل الاستثمار:
-------------------
المبلغ المستثمر: ${fmtMoney(inv.amount)} ر.س
حالة الاستثمار: ${getStatusBadge(inv.status).props.children}
تاريخ بدء الاستثمار: ${startAt ? startAt.toLocaleDateString("ar-SA") : "-"}
تاريخ الانتهاء المخطط: ${plannedEndAt ? plannedEndAt.toLocaleDateString("ar-SA") : "-"}
الربح المتوقع: ${inv.expectedProfit == null ? "-" : fmtMoney(inv.expectedProfit)} ر.س
الربح الفعلي: ${inv.earnedProfit == null ? "-" : fmtMoney(inv.earnedProfit)} ر.س

-------------------
ملاحظات هامة:
* هذا التقرير صادر عن منصة معدن الاستثمارية بناءً على البيانات المتاحة حتى تاريخ إصداره.
* الأرباح المتوقعة هي تقديرية وقد تختلف عن الأرباح الفعلية بناءً على أداء المشروع.
* لأي استفسارات أو معلومات إضافية، يرجى التواصل مع فريق خدمة العملاء في منصة معدن.

منصة معدن الاستثمارية
الموقع الإلكتروني: www.maaden.sa
البريد الإلكتروني: info@maaden.sa
العنوان: الرياض، المملكة العربية السعودية
جميع الحقوق محفوظة لمنصة معدن الاستثمارية ${new Date().getFullYear()}
        `.trim();

        const page = pdf.addPage([595.28, 841.89]);
        const pngBytes = await textToPngBytes(reportContent, 515);
        const png = await pdf.embedPng(pngBytes);

        const imgW = 515;
        const scale = imgW / png.width;
        const imgH = png.height * scale;

        page.drawImage(png, {
          x: 40,
          y: 800 - imgH,
          width: imgW,
          height: imgH,
        });

        const bytes = await pdf.save();
        downloadBytes(bytes, `Maaden_Report_${safeFile(u?.name || inv.id)}.pdf`);
      }
      toast.success("تم تصدير تقارير المستثمرين الفردية الرسمية بنجاح");
    } catch (e) {
      console.error(e);
      toast.error("فشل توليد تقارير المستثمرين الفردية الرسمية");
    }
  };

  /* =========================
     UI
  ========================= */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">الشؤون المالية</h1>
          <p className="text-muted-foreground text-lg">إدارة الاستثمارات والموافقات</p>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={exportAllInvestorsPDF}>
              تحميل PDF لجميع المستثمرين (ملف واحد)
            </Button>
            <Button variant="outline" onClick={exportAllInvestorsSeparatePDFs}>
              تحميل PDF لكل مستثمر (ملفات منفصلة)
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" /> معلقة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{pendingInvestments.length}</div>
              <p className="text-sm mt-1">{totalPendingAmount.toLocaleString()} ر.س</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> معتمدة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{approvedInvestments.length}</div>
              <p className="text-sm mt-1">{totalApprovedAmount.toLocaleString()} ر.س</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> الإجمالي
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{investments.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Pending table */}
        <Card>
          <CardHeader>
            <CardTitle>الاستثمارات المعلقة</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center">جاري التحميل...</div>
            ) : pendingInvestments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستثمر</TableHead>
                    <TableHead>المشروع</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvestments.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{getUserName(inv.userId)}</TableCell>
                      <TableCell>{getProjectName(inv.projectId)}</TableCell>
                      <TableCell className="font-bold">
                        {Number(inv.amount).toLocaleString()} ر.س
                      </TableCell>
                      <TableCell>{toDate(inv.createdAt).toLocaleDateString("ar-SA")}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedInvestment(inv);
                              setIsApproveDialogOpen(true);
                            }}
                          >
                            اعتماد
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setSelectedInvestment(inv);
                              setIsRejectDialogOpen(true);
                            }}
                          >
                            رفض
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedInvestment(inv);
                              setCustomRate(inv.customRate || "");
                              setCustomDuration(inv.customDuration?.toString() || "");
                              setIsEditDialogOpen(true);
                            }}
                          >
                            تعديل
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center">لا توجد استثمارات معلقة</div>
            )}
          </CardContent>
        </Card>

        {/* All */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> جميع الاستثمارات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {investments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستثمر</TableHead>
                    <TableHead>المشروع</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>إجراء</TableHead>
                    <TableHead>PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{getUserName(inv.userId)}</TableCell>
                      <TableCell>{getProjectName(inv.projectId)}</TableCell>
                      <TableCell className="font-bold">
                        {Number(inv.amount).toLocaleString()} ر.س
                      </TableCell>
                      <TableCell>{getStatusBadge(inv.status)}</TableCell>

                      <TableCell>
                        {inv.status === "approved" || inv.status === "active" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setSelectedInvestment(inv);
                              setIsCloseDialogOpen(true);
                            }}
                          >
                            إنهاء
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => exportInvestorPDF(inv)}>
                          PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center">لا توجد استثمارات</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approve */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اعتماد الاستثمار</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={approveInvestmentTx}>اعتماد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض الاستثمار</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="سبب الرفض"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason}
              onClick={() => updateStatus("rejected", { rejectionReason })}
            >
              رفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل البيانات المالية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>نسبة مخصصة (%)</Label>
              <Input value={customRate} onChange={(e) => setCustomRate(e.target.value)} />
            </div>
            <div>
              <Label>مدة مخصصة (شهر)</Label>
              <Input
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={updateFinancials}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Investment */}
      <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إنهاء الاستثمار</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              سيتم احتساب الربح النسبي حسب المدة من تاريخ الاعتماد إلى تاريخ الإنهاء.
            </div>

            <div className="space-y-2">
              <Label>تاريخ الإنهاء</Label>
              <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={closeInvestmentEarlyTx}>
              إنهاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
