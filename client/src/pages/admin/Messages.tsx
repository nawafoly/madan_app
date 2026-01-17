// client/src/pages/admin/MessagesManagement.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  Timestamp,
  serverTimestamp,
  runTransaction,
  getDoc,
} from "firebase/firestore";
import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { MessageSquare, Mail, Phone, Calendar, Eye, X } from "lucide-react";
import { toast } from "sonner";

/* =========================
   helpers
========================= */

// ✅ safer date (عشان serverTimestamp قبل ما يتحول لـ Timestamp)
const toDateSafe = (v: any) => {
  try {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate();
    // بعض الأحيان يرجع شكل {seconds,nanoseconds}
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
};

function formatDateTimeAR(v: any) {
  const d = toDateSafe(v);
  return d ? d.toLocaleString("ar-SA") : "—";
}
function formatDateAR(v: any) {
  const d = toDateSafe(v);
  return d ? d.toLocaleDateString("ar-SA") : "—";
}

function toNumOrNull(v: any) {
  const s = String(v ?? "").trim().replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ✅ حالات الرسائل (نستخدم الموجود ونبقيه بسيط)
type MessageStatus =
  | "new"
  | "in_progress"
  | "resolved"
  | "closed"
  | "approved"
  | "rejected"
  | "needs_account";

// ✅ "عند مين الدور الآن"
type StageRole = "staff" | "owner" | "accountant" | "client" | "system";

export default function MessagesManagement() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);

  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const [status, setStatus] = useState<MessageStatus>("new");
  const [internalNotes, setInternalNotes] = useState("");

  const [approvedAmount, setApprovedAmount] = useState<string>("");

  const [contractBusy, setContractBusy] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);

  /* =========================
     Role permissions (حسب كلامك)
  ========================= */
  const myRole = String(user?.role || "");
  // ✅ staff فقط يسوي "تسجيل استثمار مبدئي"
  const canStaffActions = myRole === "staff";
  // ✅ الأونر/المحاسب فقط: عقد + إرسال توقيع + ترحيل نهائي
  const canOwnerAccountantActions = myRole === "owner" || myRole === "accountant";

  const actionMeta = () => ({
    lastActionByRole: myRole || null,
    lastActionByUid: user?.uid || null,
    lastActionByEmail: user?.email || null,
    lastActionAt: serverTimestamp(),
  });

  /* =========================
     Load messages
  ========================= */
  const loadMessages = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, "messages"));
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل الرسائل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  /* =========================
     Stats
  ========================= */
  const stats = useMemo(
    () => ({
      new: messages.filter((m) => m.status === "new").length,
      in_progress: messages.filter((m) => m.status === "in_progress").length,
      resolved: messages.filter((m) => m.status === "resolved").length,
      total: messages.length,
    }),
    [messages]
  );

  /* =========================
     Badges
  ========================= */
  const getMessageTypeBadge = (type: string) => {
    const map: any = {
      investment_request: { label: "طلب استثمار", cls: "bg-blue-500" },
      land_development: { label: "تطوير أراضي", cls: "bg-green-500" },
      general_inquiry: { label: "استفسار عام", cls: "bg-gray-500" },
      vip_request: { label: "طلب VIP", cls: "bg-accent" },
    };
    const c = map[type] || map.general_inquiry;
    return <Badge className={c.cls}>{c.label}</Badge>;
  };

  const getStatusBadge = (s: string) => {
    const map: any = {
      new: { label: "جديد", cls: "bg-orange-500" },
      in_progress: { label: "قيد المعالجة", cls: "bg-blue-500" },
      resolved: { label: "تم الحل", cls: "bg-green-500" },
      closed: { label: "مغلق", cls: "bg-gray-500" },

      approved: { label: "مقبول", cls: "bg-green-600" },
      rejected: { label: "مرفوض", cls: "bg-red-600" },
      needs_account: { label: "يتطلب حساب", cls: "bg-yellow-600" },
    };
    const c = map[s] || map.new;
    return <Badge className={c.cls}>{c.label}</Badge>;
  };

  const getStageBadge = (stageRole?: StageRole) => {
    const map: Record<string, [string, string]> = {
      staff: ["عند المراجع", "bg-slate-600"],
      owner: ["عند الأونر", "bg-amber-700"],
      accountant: ["عند المحاسب", "bg-emerald-700"],
      client: ["عند العميل", "bg-indigo-700"],
      system: ["مقفل", "bg-gray-600"],
    };
    const [label, cls] = map[String(stageRole || "staff")] || map.staff;
    return <Badge className={cls}>{label}</Badge>;
  };

  /* =========================
     Update (عام)
  ========================= */
  const handleUpdateStatus = async () => {
    if (!selectedMessage) return;

    try {
      await updateDoc(doc(db, "messages", selectedMessage.id), {
        status,
        internalNotes: internalNotes || null,

        updatedAt: serverTimestamp(),
        updatedByUid: user?.uid || null,
        updatedByEmail: user?.email || null,

        ...actionMeta(),
      });

      toast.success("تم تحديث حالة الرسالة");
      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث حالة الرسالة");
    }
  };

  /* =========================
     ✅ 1) تسجيل استثمار مبدئي (STAFF فقط)
  ========================= */
  const createPreInvestment = async () => {
    if (!selectedMessage) return;

    if (!canStaffActions) {
      toast.error("هذا الإجراء للمراجع (Staff) فقط");
      return;
    }

    const investorUid = selectedMessage?.createdByUid || null;

    if (!investorUid) {
      try {
        await updateDoc(doc(db, "messages", selectedMessage.id), {
          status: "needs_account",
          internalNotes:
            internalNotes ||
            "لا يمكن إنشاء استثمار لأن الطلب قُدّم بدون حساب. اطلب من العميل تسجيل الدخول وإعادة الإرسال.",

          stageRole: "client" as StageRole,

          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,

          ...actionMeta(),
        });

        toast.warning("هذا الطلب بدون حساب — تم تحويله إلى: يتطلب حساب");
        setIsDetailDialogOpen(false);
        loadMessages();
      } catch (e) {
        console.error(e);
        toast.error("فشل تحديث الحالة");
      }
      return;
    }

    const approved = toNumOrNull(approvedAmount);
    const estimated = toNumOrNull(selectedMessage?.estimatedAmount);
    const amount = approved ?? estimated ?? null;

    if (!amount || amount <= 0) {
      toast.error("لا يمكن التسجيل بدون مبلغ صحيح (المعتمد أو المقدر)");
      return;
    }

    try {
      const { investmentId } = await runTransaction(db, async (tx) => {
        const msgRef = doc(db, "messages", selectedMessage.id);

        const msgSnap = await tx.get(msgRef);
        if (!msgSnap.exists()) throw new Error("message_not_found");
        const msg = msgSnap.data() as any;

        if (msg?.investmentId) throw new Error("investment_already_created");
        if (!msg?.projectId) throw new Error("missing_project_id");

        const invRef = doc(collection(db, "investments"));

        tx.set(invRef, {
          projectId: msg.projectId,
          projectTitle: msg.projectTitle || null,
          sourceMessageId: msgRef.id,

          investorUid,
          investorEmail: msg.email || null,
          investorName: msg.name || null,
          investorPhone: msg.phone || null,

          amount,
          currency: "SAR",

          status: "pending_contract",
          createdAt: serverTimestamp(),
          createdByUid: user?.uid || null,
          createdByEmail: user?.email || null,

          approvedAmount: amount,

          ...actionMeta(),
        });

        // ✅ بعد تسجيل المبدئي: الدور يروح للأونر/المحاسب
        tx.update(msgRef, {
          status: "in_progress",
          stageRole: "owner" as StageRole, // تقدر تغيّرها لـ "accountant" لو تبغى

          investmentId: invRef.id,
          approvedAmount: amount,

          internalNotes: internalNotes || null,

          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,

          ...actionMeta(),
        });

        return { investmentId: invRef.id };
      });

      toast.success(`تم تسجيل استثمار مبدئي ✅ Investment: ${investmentId}`);
      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e: any) {
      console.error(e);
      const msg = String(e?.message || "");
      if (msg.includes("investment_already_created")) {
        toast.warning("تم إنشاء Investment مسبقاً لهذه الرسالة");
        return;
      }
      if (msg.includes("missing_project_id")) {
        toast.error("لا يوجد projectId داخل الرسالة");
        return;
      }
      toast.error("فشل تسجيل الاستثمار");
    }
  };

  /* =========================
     ✅ 2) إنشاء عقد (OWNER/ACCOUNTANT فقط)
     ✅ مهم: شلنا window.open عشان ما يصير فشل أو يخرب التنسيق
  ========================= */
  const createContractForInvestment = async () => {
    if (!selectedMessage) return;

    if (!canOwnerAccountantActions) {
      toast.error("هذا الإجراء للأونر/المحاسب فقط");
      return;
    }

    const investorUid = selectedMessage?.createdByUid || null;
    const investmentId = selectedMessage?.investmentId || null;

    if (!investorUid) return toast.warning("لا يمكن إنشاء عقد لأن الطلب بدون حساب");
    if (!investmentId) return toast.warning("سجل استثمار مبدئي أولاً (عشان يطلع InvestmentId)");
    if (selectedMessage?.contractId) return toast.warning("تم إنشاء عقد مسبقاً لهذه الرسالة");

    try {
      setContractBusy(true);

      const contractId = await runTransaction(db, async (tx) => {
        const msgRef = doc(db, "messages", selectedMessage.id);

        const msgSnap = await tx.get(msgRef);
        if (!msgSnap.exists()) throw new Error("message_not_found");
        const msg = msgSnap.data() as any;

        if (msg?.contractId) throw new Error("contract_already_created");
        if (!msg?.investmentId) throw new Error("missing_investment_id");

        const invRef = doc(db, "investments", msg.investmentId);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error("investment_not_found");
        const inv = invSnap.data() as any;

        if (inv?.investorUid !== investorUid) throw new Error("investment_uid_mismatch");

        const cRef = doc(collection(db, "contracts"));

        tx.set(cRef, {
          investmentId: msg.investmentId,
          projectId: inv.projectId || msg.projectId || null,
          projectTitle: inv.projectTitle || msg.projectTitle || null,

          investorUid: inv.investorUid,
          investorName: inv.investorName ?? msg.name ?? null,
          investorEmail: inv.investorEmail ?? msg.email ?? null,
          investorPhone: inv.investorPhone ?? msg.phone ?? null,

          amount: inv.amount ?? null,
          currency: inv.currency ?? "SAR",

          status: "pending", // pending -> signing -> signed
          createdAt: serverTimestamp(),
          createdByUid: user?.uid || null,
          createdByEmail: user?.email || null,

          body: "",
          terms: { version: 1, title: "عقد استثمار إلكتروني" },

          ...actionMeta(),
        });

        tx.update(msgRef, {
          contractId: cRef.id,
          contractStatus: "pending",
          stageRole: "owner" as StageRole, // باقي عند الإدارة

          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,

          ...actionMeta(),
        });

        tx.update(invRef, {
          contractId: cRef.id,
          contractStatus: "pending",
          updatedAt: serverTimestamp(),

          ...actionMeta(),
        });

        return cRef.id;
      });

      toast.success(`تم إنشاء العقد ✅ ContractId: ${contractId}`);

      setSelectedMessage((prev: any) =>
        prev ? { ...prev, contractId, contractStatus: "pending" } : prev
      );

      loadMessages();
    } catch (e: any) {
      console.error(e);
      const m = String(e?.message || "");
      if (m.includes("contract_already_created")) return toast.warning("العقد موجود مسبقاً");
      if (m.includes("missing_investment_id")) return toast.error("لا يوجد investmentId على الرسالة");
      if (m.includes("investment_not_found")) return toast.error("الاستثمار غير موجود");
      if (m.includes("investment_uid_mismatch")) return toast.error("عدم تطابق investorUid مع الاستثمار");
      toast.error("فشل إنشاء العقد");
    } finally {
      setContractBusy(false);
    }
  };

  /* =========================
     ✅ 3) إرسال العقد للعميل للتوقيع (OWNER/ACCOUNTANT)
  ========================= */
  const sendContractForSigning = async () => {
    if (!selectedMessage) return;

    if (!canOwnerAccountantActions) {
      toast.error("هذا الإجراء للأونر/المحاسب فقط");
      return;
    }

    const investmentId = selectedMessage?.investmentId || null;
    const contractId = selectedMessage?.contractId || null;

    if (!investmentId) return toast.warning("لا يوجد Investment للرسالة");
    if (!contractId) return toast.warning("أنشئ العقد أولاً");

    try {
      setContractBusy(true);

      await runTransaction(db, async (tx) => {
        const invRef = doc(db, "investments", investmentId);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error("investment_not_found");

        const cRef = doc(db, "contracts", contractId);
        const cSnap = await tx.get(cRef);
        if (!cSnap.exists()) throw new Error("contract_not_found");

        tx.update(invRef, {
          status: "signing",
          signingAt: serverTimestamp(),
          contractStatus: "signing",
          updatedAt: serverTimestamp(),
          ...actionMeta(),
        });

        tx.update(cRef, {
          status: "signing",
          signingAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...actionMeta(),
        });

        const msgRef = doc(db, "messages", selectedMessage.id);
        tx.update(msgRef, {
          contractStatus: "signing",
          stageRole: "client" as StageRole,

          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,

          ...actionMeta(),
        });
      });

      toast.success("تم إرسال العقد للعميل للتوقيع ✍️");
      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل إرسال العقد للتوقيع");
    } finally {
      setContractBusy(false);
    }
  };

  /* =========================
     ✅ 4) الترحيل النهائي للمشروع (آخر خطوة) OWNER/ACCOUNTANT
     - بعد signed فقط
  ========================= */
  const finalizeInvestment = async () => {
    if (!selectedMessage) return;

    if (!canOwnerAccountantActions) {
      toast.error("هذا الإجراء للأونر/المحاسب فقط");
      return;
    }

    const investmentId = selectedMessage?.investmentId || null;
    const contractId = selectedMessage?.contractId || null;

    if (!investmentId) return toast.warning("لا يوجد Investment للرسالة");
    if (!contractId) return toast.warning("لا يوجد عقد مرتبط");

    try {
      setFinalizeBusy(true);

      await runTransaction(db, async (tx) => {
        const msgRef = doc(db, "messages", selectedMessage.id);
        const invRef = doc(db, "investments", investmentId);
        const cRef = doc(db, "contracts", contractId);

        const msgSnap = await tx.get(msgRef);
        if (!msgSnap.exists()) throw new Error("message_not_found");
        const msg = msgSnap.data() as any;

        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error("investment_not_found");
        const inv = invSnap.data() as any;

        const cSnap = await tx.get(cRef);
        if (!cSnap.exists()) throw new Error("contract_not_found");
        const c = cSnap.data() as any;

        const cStatus = String(c?.status || "pending");
        if (cStatus !== "signed") throw new Error("contract_not_signed");

        const projectId = inv?.projectId || msg?.projectId || null;
        if (!projectId) throw new Error("missing_project_id");

        const projectRef = doc(db, "projects", projectId);
        const projectSnap = await tx.get(projectRef);
        if (!projectSnap.exists()) throw new Error("project_not_found");

        if (inv?.finalizedAt) throw new Error("already_finalized");

        const amount = toNumOrNull(inv?.amount);
        if (!amount || amount <= 0) throw new Error("invalid_amount");

        const prevAmount = toNumOrNull((projectSnap.data() as any)?.currentAmount) ?? 0;

        tx.update(projectRef, {
          currentAmount: prevAmount + amount,
          updatedAt: serverTimestamp(),
        });

        tx.update(invRef, {
          status: "active",
          finalizedAt: serverTimestamp(),
          finalizedByUid: user?.uid || null,
          finalizedByEmail: user?.email || null,
          updatedAt: serverTimestamp(),
          ...actionMeta(),
        });

        tx.update(msgRef, {
          status: "resolved",
          internalNotes: internalNotes || null,
          stageRole: "system" as StageRole,

          finalizedAt: serverTimestamp(),
          finalizedByUid: user?.uid || null,
          finalizedByEmail: user?.email || null,

          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,

          ...actionMeta(),
        });
      });

      toast.success("تم ترحيل الاستثمار للمشروع ✅ (بعد توقيع العقد)");
      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e: any) {
      console.error(e);
      const m = String(e?.message || "");
      if (m.includes("contract_not_signed")) return toast.warning("ما نقدر نرحّل قبل توقيع العقد");
      if (m.includes("already_finalized")) return toast.warning("تم الترحيل مسبقًا");
      if (m.includes("project_not_found")) return toast.error("المشروع غير موجود");
      toast.error("فشل الترحيل النهائي");
    } finally {
      setFinalizeBusy(false);
    }
  };

  const rejectInvestmentRequest = async () => {
    if (!selectedMessage) return;

    try {
      await updateDoc(doc(db, "messages", selectedMessage.id), {
        status: "rejected",
        internalNotes: internalNotes || null,
        stageRole: "system" as StageRole,

        updatedAt: serverTimestamp(),
        updatedByUid: user?.uid || null,
        updatedByEmail: user?.email || null,

        ...actionMeta(),
      });

      toast.success("تم رفض الطلب");
      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل رفض الطلب");
    }
  };

  /* =========================
     UI flags
  ========================= */
  const isInvestment = selectedMessage?.type === "investment_request";

  const canCreateContract =
    isInvestment &&
    !!selectedMessage?.createdByUid &&
    !!selectedMessage?.investmentId &&
    !selectedMessage?.contractId;

  const canSendForSigning =
    isInvestment && !!selectedMessage?.investmentId && !!selectedMessage?.contractId;

  // ✅ (1) أهم تعديل: الترحيل النهائي يظهر/يتفعل فقط إذا Signed
  const canFinalize =
    isInvestment &&
    !!selectedMessage?.investmentId &&
    !!selectedMessage?.contractId &&
    String(selectedMessage?.contractStatus || "") === "signed";

  const hydrateContractStatus = async (msg: any) => {
    try {
      if (!msg?.contractId) return msg;
      const snap = await getDoc(doc(db, "contracts", msg.contractId));
      if (!snap.exists()) return msg;

      const c = snap.data() as any;
      const contractStatus = String(c?.status || msg?.contractStatus || "");
      return { ...msg, contractStatus };
    } catch {
      return msg;
    }
  };

  const isSigned = String(selectedMessage?.contractStatus || "") === "signed";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold mb-2">صندوق الرسائل</h1>
          <p className="text-muted-foreground text-lg">إدارة الرسائل والاستفسارات الواردة</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="رسائل جديدة" value={stats.new} color="text-orange-600" />
          <StatCard title="قيد المعالجة" value={stats.in_progress} color="text-blue-600" />
          <StatCard title="تم الحل" value={stats.resolved} color="text-green-600" />
          <StatCard title="الإجمالي" value={stats.total} />
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              جميع الرسائل
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center">جاري التحميل...</div>
            ) : messages.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>النوع</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>التواصل</TableHead>
                    <TableHead>الموضوع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>آخر تحديث</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{getMessageTypeBadge(m.type)}</TableCell>
                      <TableCell className="font-medium">{m.name}</TableCell>

                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <Mail className="w-3 h-3" /> {m.email}
                          </div>
                          {m.phone && (
                            <div className="flex items-center gap-2 opacity-70">
                              <Phone className="w-3 h-3" /> {m.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="max-w-xs truncate">
                        {m.subject || (m.projectTitle ? `مشروع: ${m.projectTitle}` : "—")}
                      </TableCell>

                      <TableCell className="space-y-1">
                        <div>{getStatusBadge(m.status)}</div>
                        {m.stageRole ? <div>{getStageBadge(m.stageRole)}</div> : null}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {m.lastActionAt ? (
                          <div className="space-y-1">
                            <div>بواسطة: {String(m.lastActionByRole || "—")}</div>
                            <div>{formatDateTimeAR(m.lastActionAt)}</div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-3 h-3" />
                          {formatDateAR(m.createdAt)}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const hydrated = await hydrateContractStatus(m);

                            setSelectedMessage(hydrated);
                            setStatus((hydrated.status || "new") as MessageStatus);
                            setInternalNotes(hydrated.internalNotes || "");

                            setApprovedAmount(
                              hydrated?.approvedAmount != null
                                ? String(hydrated.approvedAmount)
                                : hydrated?.estimatedAmount != null
                                  ? String(hydrated.estimatedAmount)
                                  : ""
                            );

                            setIsDetailDialogOpen(true);
                          }}
                        >
                          <Eye className="w-4 h-4 ml-1" />
                          عرض
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center">لا توجد رسائل</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent
          className="
            w-[min(1280px,calc(100vw-24px))]
            max-w-[1280px] 2xl:max-w-[1440px]
            p-0 overflow-hidden rounded-2xl
          "
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-white/60 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-xl md:text-2xl">تفاصيل الرسالة</DialogTitle>

                {selectedMessage && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {getMessageTypeBadge(selectedMessage.type)}
                    {getStatusBadge(selectedMessage.status)}
                    {selectedMessage.stageRole ? getStageBadge(selectedMessage.stageRole) : null}

                    {selectedMessage.createdByUid ? (
                      <Badge className="bg-green-600">مرتبط بحساب</Badge>
                    ) : (
                      <Badge className="bg-yellow-600">بدون حساب</Badge>
                    )}

                    {selectedMessage.contractStatus && (
                      <Badge variant="outline" className="border-primary/20">
                        عقد: {String(selectedMessage.contractStatus)}
                      </Badge>
                    )}

                    {selectedMessage.lastActionAt && (
                      <Badge variant="outline" className="border-primary/20">
                        آخر تحديث: {String(selectedMessage.lastActionByRole || "—")} •{" "}
                        {formatDateTimeAR(selectedMessage.lastActionAt)}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsDetailDialogOpen(false)}
                className="rounded-full"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </DialogHeader>

          <div className="px-6 py-6 max-h-[72vh] overflow-auto">
            {selectedMessage && (
              <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
                <div className="space-y-4">
                  <Card className="rsg-card rsg-card--tight">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">معلومات سريعة</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <InfoRow label="الاسم" value={selectedMessage.name || "—"} />
                      <InfoRow label="البريد" value={selectedMessage.email || "—"} />
                      <InfoRow label="الجوال" value={selectedMessage.phone || "—"} />
                      <InfoRow label="التاريخ" value={formatDateAR(selectedMessage.createdAt)} />

                      {selectedMessage.projectTitle && (
                        <div className="pt-2 border-t">
                          <div className="text-xs text-muted-foreground mb-1">المشروع</div>
                          <div className="font-semibold">{selectedMessage.projectTitle}</div>
                          {selectedMessage.projectId && (
                            <div className="text-xs text-muted-foreground mt-1 break-all">
                              ID: {selectedMessage.projectId}
                            </div>
                          )}
                        </div>
                      )}

                      {selectedMessage.investmentId && (
                        <div className="pt-2 border-t">
                          <div className="text-xs text-muted-foreground mb-1">Investment</div>
                          <div className="font-semibold break-all">{selectedMessage.investmentId}</div>
                        </div>
                      )}

                      {selectedMessage.contractId && (
                        <div className="pt-2 border-t">
                          <div className="text-xs text-muted-foreground mb-1">Contract</div>
                          <div className="font-semibold break-all">{selectedMessage.contractId}</div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rsg-card rsg-card--tight">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">نص الرسالة</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-xl bg-muted/60 border p-4 whitespace-pre-wrap leading-relaxed">
                        {selectedMessage.message || "—"}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4">
                  {isInvestment && (
                    <Card className="rsg-card rsg-card--tight">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">سير طلب الاستثمار</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="text-sm text-muted-foreground leading-relaxed">
                          1) المراجع يسجل <b>استثمار مبدئي</b> (بدون ترحيل للمشروع).
                          <br />
                          2) الأونر/المحاسب ينشئ <b>العقد</b>.
                          <br />
                          3) الأونر/المحاسب يرسل العقد للعميل <b>للتوقيع</b>.
                          <br />
                          4) بعد توقيع العميل: الأونر/المحاسب يسوي{" "}
                          <b>ترحيل للمشروع</b> (آخر خطوة).
                        </div>

                        <div className="space-y-2">
                          <Label>المبلغ المعتمد (اختياري)</Label>
                          <Input
                            inputMode="numeric"
                            value={approvedAmount}
                            onChange={(e) => setApprovedAmount(e.target.value)}
                            placeholder="اتركه فاضي لاستخدام المبلغ المقدر"
                            className="h-11"
                          />
                          <div className="text-xs text-muted-foreground">
                            إذا تركته فاضي: يستخدم <b>estimatedAmount</b> إن وجد.
                          </div>
                        </div>

                        {/* ✅ ترتيب الأزرار + صلاحيات + أسماء أوضح */}
                        <div className="grid gap-2 sm:grid-cols-2 pt-1">
                          <Button
                            variant="outline"
                            disabled={
                              contractBusy ||
                              finalizeBusy ||
                              !!selectedMessage?.investmentId ||
                              !canStaffActions
                            }
                            onClick={createPreInvestment}
                            className="h-11"
                            title={!canStaffActions ? "للمراجع (Staff) فقط" : ""}
                          >
                            تسجيل استثمار مبدئي
                          </Button>

                          <Button
                            variant="outline"
                            disabled={!canOwnerAccountantActions || !canCreateContract || contractBusy}
                            onClick={createContractForInvestment}
                            className="h-11"
                            title={!canOwnerAccountantActions ? "للأونر/المحاسب فقط" : ""}
                          >
                            إنشاء عقد
                          </Button>

                          <Button
                            disabled={!canOwnerAccountantActions || !canSendForSigning || contractBusy}
                            onClick={sendContractForSigning}
                            className="h-11 sm:col-span-2"
                            title={!canOwnerAccountantActions ? "للأونر/المحاسب فقط" : ""}
                          >
                            إرسال للعميل للتوقيع
                          </Button>

                          <Button
                            disabled={!canOwnerAccountantActions || !canFinalize || finalizeBusy}
                            onClick={finalizeInvestment}
                            className="h-11 sm:col-span-2"
                            title={!isSigned ? "لازم العقد يكون (signed) أولاً" : ""}
                          >
                            {finalizeBusy ? "جاري الترحيل..." : "ترحيل الاستثمار للمشروع (إقفال نهائي)"}
                          </Button>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          * زر <b>الترحيل النهائي</b> ما يشتغل إلا بعد ما العقد يصير <b>signed</b>.
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="rsg-card rsg-card--tight">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">تحديث الحالة</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>الحالة</Label>
                        <Select value={status} onValueChange={(v) => setStatus(v as MessageStatus)}>
                          <SelectTrigger className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">جديد</SelectItem>
                            <SelectItem value="in_progress">قيد المعالجة</SelectItem>
                            <SelectItem value="resolved">تم الحل</SelectItem>
                            <SelectItem value="closed">مغلق</SelectItem>
                            <SelectItem value="approved">مقبول</SelectItem>
                            <SelectItem value="rejected">مرفوض</SelectItem>
                            <SelectItem value="needs_account">يتطلب حساب</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>ملاحظات داخلية</Label>
                        <Textarea
                          value={internalNotes}
                          onChange={(e) => setInternalNotes(e.target.value)}
                          className="min-h-[110px] resize-y"
                          placeholder="اكتب ملاحظتك…"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-white/70 backdrop-blur flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)} className="h-11">
                إغلاق
              </Button>
              <Button onClick={handleUpdateStatus} className="h-11">
                حفظ التغييرات
              </Button>
            </div>

            {isInvestment && selectedMessage && (
              <div className="flex gap-2">
                <Button variant="destructive" onClick={rejectInvestmentRequest} className="h-11">
                  رفض الطلب
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

/* =========================
   Small components
========================= */
function StatCard({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${color || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-right break-words">{value}</div>
    </div>
  );
}
