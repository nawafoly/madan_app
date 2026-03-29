// client/src/pages/admin/Financial.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import AdminPanelStatCard from "@/components/AdminPanelStatCard";
import {
  collection,
  doc,
  getDocs,
  Timestamp,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/_core/firebase";
import {
  AUDIT_ACTIONS,
  auditedUpdateDoc,
  buildAuditSource,
  runAuditedOperation,
} from "@/lib/auditLog";
import { getClientInvestmentStatusMeta } from "@/lib/workflowStatusMeta";

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
import {
  formatCurrencyEN,
  formatDateEN,
  formatNumberEN,
} from "@/lib/formatters";

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
  const wholeMonths = Math.trunc(months);
  const fractionalMonths = months - wholeMonths;
  x.setMonth(x.getMonth() + wholeMonths);
  if (fractionalMonths !== 0) {
    x.setDate(x.getDate() + Math.round(fractionalMonths * 30.4375));
  }
  return x;
};

const diffDays = (a: Date, b: Date) => {
  const ms = a.getTime() - b.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
};

const monthsBetween = (start: Date, end: Date) => {
  const days = Math.max(0, diffDays(end, start));
  // Average month length to support pro-rata without over/under-bias.
  return days / 30.4375;
};

const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
  return formatNumberEN(Number(n || 0));
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
    () =>
      investments.filter((i) =>
        ["active", "completed"].includes(String(i.status || ""))
      ),
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
    const meta = getClientInvestmentStatusMeta(status);
    return <Badge className={meta.cls}>{meta.label}</Badge>;
  };

  /* =========================
     Actions
  ========================= */
  const approveInvestmentTx = async () => {
    if (!selectedInvestment) return;
    const generatedContractRef = doc(collection(db, "contracts"));

    try {
      const inv = selectedInvestment;
      const projectId = String(inv.projectId || "").trim();
      const investmentRef = doc(db, "investments", inv.id);
      const contractRef = doc(db, "contracts", String(inv.contractId || generatedContractRef.id));

      await runAuditedOperation({
        action: AUDIT_ACTIONS.INVESTMENT_APPROVED,
        category: "investment",
        entityType: "investment",
        source: buildAuditSource({
          area: "admin",
          page: "Financial",
          method: "approve",
        }),
        relatedIds: {
          investmentId: inv.id,
          projectId: projectId || undefined,
          contractId: contractRef.id,
          userId: String(inv.investorUid || inv.userId || "") || undefined,
        },
        message: `Approved investment ${inv.id} and prepared contract ${contractRef.id}`,
        meta: {
          amount: toNumber(inv.amount, 0),
          projectName: getProjectName(projectId),
        },
        targets: [
          { ref: investmentRef, entityType: "investment" },
          { ref: contractRef, entityType: "contract", label: "contract" },
        ],
        execute: async () =>
          runTransaction(db, async (tx) => {
        const invRef = doc(db, "investments", inv.id);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error("investment_not_found");

        const invData: any = invSnap.data();

        const curStatus = String(invData.status || "");
        if (curStatus !== "pending") throw new Error("not_pending");

        const projectId = String(invData.projectId || inv.projectId || "");
        if (!projectId) throw new Error("missing_projectId");

        const projRef = doc(db, "projects", projectId);
        const projSnap = await tx.get(projRef);
        if (!projSnap.exists()) throw new Error("project_not_found");

        const proj: any = projSnap.data();
        const amount = toNumber(invData.amount, 0);
        if (amount <= 0) throw new Error("missing_amount");

        const contractId = String(invData.contractId || "").trim();
        const contractRef = contractId
          ? doc(db, "contracts", contractId)
          : generatedContractRef;
        const now = serverTimestamp();
        const invUpdate: any = {
          status: "pending_contract",
          contractStatus: "draft",
          approvedAmount: amount,
          approvedAt: now,
          finalizedAt: null,
          signedAt: null,
          startAt: null,
          plannedEndAt: null,
          annualReturnAtSign: null,
          durationMonthsAtSign: null,
          expectedProfit: null,
          earnedProfit: null,
          withdrawnAt: null,
          actualEndAt: null,
          exitType: null,
          projectTitleAtSign: null,
          termsLockedAt: null,
          legalTermsSnapshot: null,
          contractId: contractRef.id,
          updatedAt: new Date(),
        };
        tx.update(invRef, invUpdate);

        tx.set(
          contractRef,
          {
            investmentId: inv.id,
            projectId,
            projectTitle: String(proj.titleAr || proj.title || invData.projectTitle || ""),
            investorUid: String(invData.investorUid || invData.userId || ""),
            investorName: String(invData.investorName || ""),
            investorEmail: invData.investorEmail || null,
            investorPhone: invData.investorPhone || null,
            amount,
            currency: invData.currency || "SAR",
            status: contractId ? invData.contractStatus || "draft" : "draft",
            signedAt: null,
            termsLockedAt: null,
            legalTermsSnapshot: null,
            legalReference: null,
            ...(contractId ? {} : { createdAt: new Date() }),
            updatedAt: new Date(),
          },
          { merge: true }
        );
          }),
      });

      toast.success("تم اعتماد الطلب مبدئيًا وتجهيز مسار العقد");
      setIsApproveDialogOpen(false);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error("فشل اعتماد الطلب مبدئيًا");
    }
  };

  const closeInvestmentEarlyTx = async () => {
    if (!selectedInvestment) return;

    try {
      await runAuditedOperation({
        action: AUDIT_ACTIONS.INVESTMENT_COMPLETED,
        category: "investment",
        entityType: "investment",
        source: buildAuditSource({
          area: "admin",
          page: "Financial",
          method: "close",
        }),
        relatedIds: {
          investmentId: selectedInvestment.id,
          projectId: String(selectedInvestment.projectId || "") || undefined,
          userId: String(selectedInvestment.investorUid || selectedInvestment.userId || "") || undefined,
        },
        message: `Closed investment ${selectedInvestment.id} early`,
        meta: {
          closeDate,
          projectName: getProjectName(String(selectedInvestment.projectId || "")),
        },
        targets: [{ ref: doc(db, "investments", selectedInvestment.id), entityType: "investment" }],
        execute: async () =>
          runTransaction(db, async (tx) => {
        const invRef = doc(db, "investments", selectedInvestment.id);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error("investment_not_found");

        const inv: any = invSnap.data();

        const st = String(inv.status || "").toLowerCase();
        if (st === "completed" || st === "closed") {
          throw new Error("investment_already_closed");
        }
        if (st !== "active") {
          throw new Error("invalid_status_for_close");
        }

        const projectId = String(inv.projectId || "");
        if (!projectId) throw new Error("missing_projectId");

        const projRef = doc(db, "projects", projectId);
        const projSnap = await tx.get(projRef);
        if (!projSnap.exists()) throw new Error("project_not_found");

        const proj: any = projSnap.data();

        const amount = toNumber(inv.approvedAmount, 0) || toNumber(inv.amount, 0);
        const startAtValue = inv.startAt || inv.signedAt || inv.createdAt;
        if (!startAtValue) throw new Error("missing_start_date");
        const startDate = toDate(startAtValue);
        const exitDate = closeDate ? new Date(`${closeDate}T00:00:00`) : new Date();
        if (!Number.isFinite(exitDate.getTime())) throw new Error("invalid_close_date");
        if (exitDate.getTime() < startDate.getTime()) throw new Error("close_before_start");

        const annualReturnAtSign =
          toNumber(inv.annualReturnAtSign, 0) ||
          toNumber(inv.customRate, 0) ||
          toNumber(proj.annualReturn, 0);
        if (annualReturnAtSign <= 0) throw new Error("missing_frozen_rate");

        const actualDurationMonths = monthsBetween(startDate, exitDate);
        const earnedProfit = roundMoney(
          amount * (annualReturnAtSign / 100) * (actualDurationMonths / 12)
        );
        const settlementTotal = roundMoney(amount + earnedProfit);

        const closureAt = Timestamp.fromDate(exitDate);

        tx.update(invRef, {
          status: "completed",
          actualEndAt: closureAt,
          withdrawnAt: closureAt,
          exitType: "early_withdrawal",
          earnedProfit,
          actualDurationMonths,
          settlementTotal,
          settlementPrincipal: amount,
          settlementAnnualReturnPercent: annualReturnAtSign,
          settlementFormula: "principal * annualRate * (actualDurationMonths / 12)",
          settlementLockedAt: closureAt,
          settlementLocked: true,
          closureLocked: true,
          updatedAt: new Date(),
        });

          }),
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
    const status = String(selectedInvestment.status || "").toLowerCase();
    if (status !== "pending") {
      toast.error("لا يمكن تعديل الشروط بعد الاعتماد/الإغلاق.");
      return;
    }

    try {
      const invRef = doc(db, "investments", selectedInvestment.id);
      await auditedUpdateDoc({
        ref: invRef,
        data: {
          customRate: toNumber(customRate) || null,
          customDuration: toNumber(customDuration) || null,
          updatedAt: new Date(),
        },
        action: AUDIT_ACTIONS.INVESTMENT_FINANCIALS_UPDATED,
        category: "investment",
        entityType: "investment",
        source: buildAuditSource({
          area: "admin",
          page: "Financial",
          method: "update_financials",
        }),
        relatedIds: {
          investmentId: selectedInvestment.id,
          projectId: String(selectedInvestment.projectId || "") || undefined,
          userId: String(selectedInvestment.investorUid || selectedInvestment.userId || "") || undefined,
        },
        message: `Updated financial terms for investment ${selectedInvestment.id}`,
        meta: {
          customRate: toNumber(customRate) || null,
          customDuration: toNumber(customDuration) || null,
        },
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
    const currentStatus = String(selectedInvestment.status || "").toLowerCase();
    if (currentStatus === "completed" || currentStatus === "closed") {
      toast.error("لا يمكن تعديل الاستثمار بعد الإغلاق.");
      return;
    }

    try {
      const invRef = doc(db, "investments", selectedInvestment.id);
      await auditedUpdateDoc({
        ref: invRef,
        data: {
          status,
          ...data,
          updatedAt: new Date(),
        },
        action:
          status === "rejected"
            ? AUDIT_ACTIONS.INVESTMENT_REJECTED
            : AUDIT_ACTIONS.INVESTMENT_STATUS_CHANGED,
        category: "investment",
        entityType: "investment",
        source: buildAuditSource({
          area: "admin",
          page: "Financial",
          method: status === "rejected" ? "reject" : "update_status",
        }),
        relatedIds: {
          investmentId: selectedInvestment.id,
          projectId: String(selectedInvestment.projectId || "") || undefined,
          userId: String(selectedInvestment.investorUid || selectedInvestment.userId || "") || undefined,
        },
        message: `Updated investment ${selectedInvestment.id} status to ${status}`,
        meta: {
          nextStatus: status,
          rejectionReason: data?.rejectionReason || null,
        },
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
      const reportDate = formatDateEN(new Date(), {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });

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
تاريخ بدء الاستثمار: ${startAt ? formatDateEN(startAt, { year: "numeric", month: "numeric", day: "numeric" }) : "-"}
تاريخ الانتهاء المخطط: ${plannedEndAt ? formatDateEN(plannedEndAt, { year: "numeric", month: "numeric", day: "numeric" }) : "-"}
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
      const reportDate = formatDateEN(new Date(), {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });

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
تاريخ بدء الاستثمار: ${startAt ? formatDateEN(startAt, { year: "numeric", month: "numeric", day: "numeric" }) : "-"}
تاريخ الانتهاء المخطط: ${plannedEndAt ? formatDateEN(plannedEndAt, { year: "numeric", month: "numeric", day: "numeric" }) : "-"}
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
      const reportDate = formatDateEN(new Date(), {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });

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
تاريخ بدء الاستثمار: ${startAt ? formatDateEN(startAt, { year: "numeric", month: "numeric", day: "numeric" }) : "-"}
تاريخ الانتهاء المخطط: ${plannedEndAt ? formatDateEN(plannedEndAt, { year: "numeric", month: "numeric", day: "numeric" }) : "-"}
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
        <div className="grid gap-4 md:grid-cols-2">
          <AdminPanelStatCard
            title="الاستثمارات المعلقة"
            value={pendingInvestments.length}
            description="الطلبات التي ما زالت تنتظر اعتمادًا ماليًا أو قرارًا تشغيليًا قبل الإقفال."
            helper={`إجمالي المبالغ المعلقة: ${formatCurrencyEN(totalPendingAmount)}`}
            icon={<Clock className="h-5 w-5" />}
            accent="amber"
          />

          <AdminPanelStatCard
            title="الاستثمارات المعتمدة"
            value={approvedInvestments.length}
            description="الاستثمارات التي اجتازت الاعتماد وأصبحت ضمن المسار المالي النشط أو المكتمل."
            helper={`إجمالي المبالغ المعتمدة: ${formatCurrencyEN(totalApprovedAmount)}`}
            icon={<CheckCircle className="h-5 w-5" />}
            accent="emerald"
          />

          <AdminPanelStatCard
            title="الإجمالي المالي"
            value={investments.length}
            description="الصورة الكاملة لكل السجلات الاستثمارية المرتبطة بالشؤون المالية في النظام."
            helper={`إجمالي المبالغ قيد المتابعة: ${formatCurrencyEN(totalPendingAmount + totalApprovedAmount)}`}
            icon={<DollarSign className="h-5 w-5" />}
            accent="blue"
            className="md:col-span-2"
          />
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
                        {formatCurrencyEN(inv.amount)}
                      </TableCell>
                      <TableCell>{formatDateEN(toDate(inv.createdAt), {
                        year: "numeric",
                        month: "numeric",
                        day: "numeric",
                      })}</TableCell>
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
                        {formatCurrencyEN(inv.amount)}
                      </TableCell>
                      <TableCell>{getStatusBadge(inv.status)}</TableCell>

                      <TableCell>
                        {inv.status === "active" ? (
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
