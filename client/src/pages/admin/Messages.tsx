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
  addDoc,
  arrayUnion,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";

// ✅ Storage (اختر واحد فقط حسب مشروعك)
// ملاحظة: العقود/الرفع موقوفة حالياً، لكن تركت الكود كما هو للمستقبل.
// لا تحذف هذا الآن لو تبغى ترجع العقود لاحقاً.
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";

// إذا عندك export جاهز: import { storage } from "@/_core/firebase";

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

import {
  MessageSquare,
  Mail,
  Phone,
  Calendar,
  Eye,
  X,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  PenLine,
  ShieldCheck,
  Clock3,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

/* =========================
  ✅ Switch: Disable contracts/files now
  - True = لا عقود + لا رفع + لا signed (ترحيل يدوي)
  - False = يرجع نظام العقود القديم بالكامل
========================= */
const CONTRACTS_DISABLED = true;

/* =========================
  helpers
========================= */

// ✅ safer date (عشان serverTimestamp قبل ما يتحول لـ Timestamp)
const toDateSafe = (v: any) => {
  try {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate();
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

type MessageStatus =
  | "new"
  | "in_progress"
  | "resolved"
  | "closed"
  | "approved"
  | "rejected"
  | "needs_account";

type StageRole =
  | "staff"
  | "owner"
  | "accountant"
  | "client"
  | "completed"
  | "system";

// ✅ ملف عقد
type ContractFileKind = "draft" | "signed";
type ContractFile = {
  id: string;
  kind: ContractFileKind;
  version: number;
  name: string;
  contentType: string;
  size: number;
  url: string;
  path: string;
  isActive: boolean;
  uploadedAt: any;
  uploadedByUid?: string | null;
  uploadedByEmail?: string | null;
  note?: string | null; // مثال: "تم إلغاء النسخة السابقة..."
};

type ContractDoc = {
  status?: string; // pending_review | signing | returned | signed ...
  currentVersion?: number;
  files?: ContractFile[];
  returnNote?: string | null;
  returnedAt?: any;
  signedVerifiedAt?: any;
};

// ✅ Events (Timeline)
type TimelineEventType =
  | "message_created"
  | "status_changed"
  | "notes_updated"
  | "pre_investment_created"
  | "needs_account"
  | "contract_created"
  | "draft_uploaded"
  | "sent_for_signing"
  | "contract_returned"
  | "signed_uploaded"
  | "signed_verified"
  | "investment_finalized"
  | "rejected"
  | "reopened";

type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  title: string;
  note?: string | null;
  byRole?: string | null;
  byUid?: string | null;
  byEmail?: string | null;
  at: any; // serverTimestamp()
  meta?: Record<string, any>;
};

const makeEvent = (opts: {
  type: TimelineEventType;
  title: string;
  note?: string | null;
  byRole?: string | null;
  byUid?: string | null;
  byEmail?: string | null;
  meta?: Record<string, any>;
}): TimelineEvent => {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(16).slice(2)}`,
    type: opts.type,
    title: opts.title,
    note: opts.note || null,
    byRole: opts.byRole || null,
    byUid: opts.byUid || null,
    byEmail: opts.byEmail || null,
    at: serverTimestamp(),
    meta: opts.meta || {},
  };
};

/* =========================
  Main
========================= */
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
  const [reopenBusy, setReopenBusy] = useState(false);

  // ✅ ملفات/عقد
  const [contractDoc, setContractDoc] = useState<ContractDoc | null>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [replaceDraftFile, setReplaceDraftFile] = useState<File | null>(null);

  // ✅ إرجاع مع ملاحظة
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnNote, setReturnNote] = useState("");

  const [view, setView] = useState<"all" | "open" | "completed" | "rejected">(
    "open"
  );

  /* =========================
    Role permissions
  ========================= */
  const OWNER_EMAIL = "nawafaaa0@gmail.com";

  const myRole = useMemo(() => {
    const email = String(user?.email || "").toLowerCase();
    const role = String((user as any)?.role || "").toLowerCase();
    if (email === OWNER_EMAIL) return "owner";
    return role;
  }, [user?.email, (user as any)?.role]);

  const canStaffActions =
    myRole === "staff" || myRole === "owner" || myRole === "admin";
  const canOwnerAccountantActions =
    myRole === "owner" || myRole === "accountant" || myRole === "admin";

  const actionMeta = () => ({
    lastActionByRole: myRole || null,
    lastActionByUid: user?.uid || null,
    lastActionByEmail: user?.email || null,
    lastActionAt: serverTimestamp(),
  });

  const myActor = () => ({
    byRole: myRole || null,
    byUid: user?.uid || null,
    byEmail: user?.email || null,
  });

  /* =========================
    ✅ Notifications helper
  ========================= */
  const pushNotification = async (opts: {
    uid?: string | null;
    title: string;
    body: string;
    type?: string;
    meta?: Record<string, any>;
  }) => {
    const uid = String(opts.uid || "").trim();
    if (!uid) return;

    await addDoc(collection(db, "notifications"), {
      uid,
      title: opts.title,
      body: opts.body,
      type: opts.type || "system",
      read: false,
      createdAt: serverTimestamp(),
      meta: opts.meta || {},
    });
  };

  const notifyClient = async (
    msg: any,
    payload: {
      title: string;
      body: string;
      type?: string;
      meta?: Record<string, any>;
    }
  ) => {
    const uid =
      msg?.createdByUid ||
      msg?.investorUid ||
      (contractDoc as any)?.investorUid ||
      null;
    if (!uid) return;
    try {
      await pushNotification({
        uid,
        title: payload.title,
        body: payload.body,
        type: payload.type,
        meta: payload.meta,
      });
    } catch (e) {
      console.error("notifyClient_failed", e);
    }
  };

  /* =========================
    ✅ Events helper
  ========================= */
  const appendMessageEvent = async (messageId: string, ev: TimelineEvent) => {
    await updateDoc(doc(db, "messages", messageId), {
      events: arrayUnion(ev),
      updatedAt: serverTimestamp(),
      ...actionMeta(),
    });
  };

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
    Normalize
  ========================= */
  const normalizeForDisplay = (m: any) => {
    const st = String(m?.status || "");
    const sr = String(m?.stageRole || "");

    if (st === "rejected" || sr === "system") {
      return {
        status: "rejected" as MessageStatus,
        stageRole: "system" as StageRole,
      };
    }
    if (st === "resolved" || sr === "completed") {
      return {
        status: "resolved" as MessageStatus,
        stageRole: "completed" as StageRole,
      };
    }
    return {
      status: (st || "new") as MessageStatus,
      stageRole: (sr || "staff") as StageRole,
    };
  };

  /* =========================
    Stats
  ========================= */
  const stats = useMemo(() => {
    const total = messages.length;

    const newCount = messages.filter((m) => m.status === "new").length;
    const inProgress = messages.filter((m) => m.status === "in_progress").length;
    const resolved = messages.filter((m) => m.status === "resolved").length;

    const completed = messages.filter(
      (m) => normalizeForDisplay(m).stageRole === "completed"
    ).length;
    const rejected = messages.filter(
      (m) => normalizeForDisplay(m).stageRole === "system"
    ).length;
    const open = messages.filter((m) => {
      const n = normalizeForDisplay(m);
      return n.stageRole !== "completed" && n.stageRole !== "system";
    }).length;

    return {
      total,
      new: newCount,
      in_progress: inProgress,
      resolved,
      open,
      completed,
      rejected,
    };
  }, [messages]);

  /* =========================
    Filters
  ========================= */
  const filteredMessages = useMemo(() => {
    if (view === "all") return messages;

    if (view === "completed") {
      return messages.filter(
        (m) => normalizeForDisplay(m).stageRole === "completed"
      );
    }
    if (view === "rejected") {
      return messages.filter(
        (m) => normalizeForDisplay(m).stageRole === "system"
      );
    }
    return messages.filter((m) => {
      const n = normalizeForDisplay(m);
      return n.stageRole !== "completed" && n.stageRole !== "system";
    });
  }, [messages, view]);

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
      resolved: { label: "تم الحل", cls: "bg-green-600" },
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
      completed: ["مكتمل", "bg-gray-700"],
      system: ["مقفل", "bg-gray-600"],
    };
    const [label, cls] = map[String(stageRole || "staff")] || map.staff;
    return <Badge className={cls}>{label}</Badge>;
  };

  /* =========================
    Selection helpers
  ========================= */
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

  const loadContractDoc = async (contractId?: string | null) => {
    try {
      if (!contractId) {
        setContractDoc(null);
        return;
      }
      const snap = await getDoc(doc(db, "contracts", contractId));
      if (!snap.exists()) {
        setContractDoc(null);
        return;
      }
      setContractDoc(snap.data() as ContractDoc);
    } catch (e) {
      console.error(e);
      setContractDoc(null);
    }
  };

  /* =========================
    ✅ Locked state (المصدر الوحيد)
  ========================= */
  const isLockedFinal = useMemo(() => {
    if (!selectedMessage) return false;
    const n = normalizeForDisplay(selectedMessage);
    return n.stageRole === "completed" || n.stageRole === "system";
  }, [selectedMessage]);

  /* =========================
    ✅ Timeline derive (Admin preview)
  ========================= */
  const timelineItems = useMemo(() => {
    const evs: TimelineEvent[] = Array.isArray(selectedMessage?.events)
      ? selectedMessage.events
      : [];
    // ترتيب تقريبي حسب التاريخ (لو كان Timestamp)
    const sorted = [...evs].sort((a, b) => {
      const da = toDateSafe(a?.at)?.getTime() ?? 0;
      const dbb = toDateSafe(b?.at)?.getTime() ?? 0;
      return da - dbb;
    });
    return sorted;
  }, [selectedMessage]);

  /* =========================
    Update (عام)
  ========================= */
  const handleUpdateStatus = async () => {
    if (!selectedMessage) return;

    if (isLockedFinal) {
      toast.warning("الطلب مقفل ولا يمكن تعديل الحالة.");
      return;
    }

    try {
      const ev = makeEvent({
        type: "status_changed",
        title: "تحديث حالة الطلب",
        note: `تم تحديث الحالة إلى: ${status}${internalNotes ? `\nملاحظة: ${internalNotes}` : ""}`,
        ...myActor(),
        meta: { status },
      });

      await updateDoc(doc(db, "messages", selectedMessage.id), {
        status,
        internalNotes: internalNotes || null,
        updatedAt: serverTimestamp(),
        updatedByUid: user?.uid || null,
        updatedByEmail: user?.email || null,
        events: arrayUnion(ev),
        ...actionMeta(),
      });

      await notifyClient(selectedMessage, {
        title: "تحديث على طلبك",
        body: `تم تحديث حالة طلبك إلى: ${String(status)}`,
        type: "message_status",
        meta: { messageId: selectedMessage.id, status },
      });

      toast.success("تم تحديث حالة الرسالة");
      setSelectedMessage((prev: any) =>
        prev
          ? {
            ...prev,
            status,
            internalNotes: internalNotes || null,
            events: Array.isArray(prev.events) ? [...prev.events, ev] : [ev],
          }
          : prev
      );
      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث حالة الرسالة");
    }
  };

  /* =========================
    ✅ 1) تسجيل استثمار مبدئي (STAFF)
  ========================= */
  const createPreInvestment = async () => {
    if (!selectedMessage) return;

    if (!canStaffActions) return toast.error("هذا الإجراء للمراجع (Staff) فقط");
    if (isLockedFinal)
      return toast.warning("الطلب منتهي/مقفّل ولا يمكن تعديل سيره.");

    const investorUid = selectedMessage?.createdByUid || null;

    if (!investorUid) {
      try {
        const note =
          internalNotes ||
          "لا يمكن إنشاء استثمار لأن الطلب قُدّم بدون حساب. اطلب من العميل تسجيل الدخول وإعادة الإرسال.";

        const ev = makeEvent({
          type: "needs_account",
          title: "يتطلب حساب",
          note,
          ...myActor(),
        });

        await updateDoc(doc(db, "messages", selectedMessage.id), {
          status: "needs_account",
          internalNotes: note,
          stageRole: "client" as StageRole,
          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,
          events: arrayUnion(ev),
          ...actionMeta(),
        });

        toast.warning("هذا الطلب بدون حساب — تم تحويله إلى: يتطلب حساب");
        setSelectedMessage((prev: any) =>
          prev
            ? {
              ...prev,
              status: "needs_account",
              stageRole: "client",
              internalNotes: note,
              events: Array.isArray(prev.events) ? [...prev.events, ev] : [ev],
            }
            : prev
        );
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
    if (!amount || amount <= 0)
      return toast.error("لا يمكن التسجيل بدون مبلغ صحيح (المعتمد أو المقدر)");

    try {
      const { investmentId } = await runTransaction(db, async (tx) => {
        const msgRef = doc(db, "messages", selectedMessage.id);
        const msgSnap = await tx.get(msgRef);
        if (!msgSnap.exists()) throw new Error("message_not_found");
        const msg = msgSnap.data() as any;

        if (msg?.investmentId) throw new Error("investment_already_created");
        if (!msg?.projectId) throw new Error("missing_project_id");

        const invRef = doc(collection(db, "investments"));
        const ev = makeEvent({
          type: "pre_investment_created",
          title: "تم تسجيل استثمار مبدئي",
          note: `المبلغ: ${Number(amount).toLocaleString()} SAR`,
          ...myActor(),
          meta: { amount, investmentId: invRef.id },
        });

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

          // ✅ بدون عقود: نخليها pending_review (بدون pending_contract)
          status: CONTRACTS_DISABLED ? "pending_review" : "pending_contract",

          createdAt: serverTimestamp(),
          createdByUid: user?.uid || null,
          createdByEmail: user?.email || null,
          approvedAmount: amount,

          // ✅ timeline
          events: arrayUnion(ev),

          ...actionMeta(),
        });

        tx.update(msgRef, {
          status: "in_progress",
          stageRole: "owner" as StageRole,
          investmentId: invRef.id,
          approvedAmount: amount,
          internalNotes: internalNotes || null,
          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,

          // ✅ timeline
          events: arrayUnion(ev),

          ...actionMeta(),
        });

        return { investmentId: invRef.id };
      });

      await notifyClient(selectedMessage, {
        title: "تم تسجيل طلبك الاستثماري",
        body: CONTRACTS_DISABLED
          ? "تم تسجيل استثمار مبدئي وسيتم التواصل معك قريباً. يمكنك متابعة الحالة من لوحة العميل."
          : "تم تسجيل استثمار مبدئي لطلبك وسيتم تجهيز العقد قريباً.",
        type: "pre_investment_created",
        meta: { messageId: selectedMessage.id, investmentId },
      });

      toast.success(`تم تسجيل استثمار مبدئي ✅ Investment: ${investmentId}`);

      setSelectedMessage((prev: any) =>
        prev
          ? {
            ...prev,
            status: "in_progress",
            stageRole: "owner",
            investmentId,
            approvedAmount: amount,
          }
          : prev
      );

      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e: any) {
      console.error(e);
      const msg = String(e?.message || "");
      if (msg.includes("investment_already_created"))
        return toast.warning("تم إنشاء Investment مسبقاً لهذه الرسالة");
      if (msg.includes("missing_project_id"))
        return toast.error("لا يوجد projectId داخل الرسالة");
      toast.error("فشل تسجيل الاستثمار");
    }
  };

  /* =========================
    ✅ 2) إنشاء عقد (OWNER/ACCOUNTANT)
    - ينشئ doc contract فقط (بدون نص)
    - موجود للمستقبل 100% ✅
  ========================= */
  const createContractForInvestment = async () => {
    // ✅ العقود موقوفة حالياً (مستقبل فقط)
    if (CONTRACTS_DISABLED) {
      toast.info("العقود موقوفة حالياً — الاعتماد يدوي (المستقبل جاهز)");
      return;
    }

    if (!selectedMessage) return;
    if (!canOwnerAccountantActions)
      return toast.error("هذا الإجراء للأونر/المحاسب فقط");
    if (isLockedFinal)
      return toast.warning("الطلب منتهي/مقفّل ولا يمكن إنشاء عقد.");

    const investorUid = selectedMessage?.createdByUid || null;
    const investmentId = selectedMessage?.investmentId || null;

    if (!investorUid) return toast.warning("لا يمكن إنشاء عقد لأن الطلب بدون حساب");
    if (!investmentId) return toast.warning("سجل استثمار مبدئي أولاً");
    if (selectedMessage?.contractId)
      return toast.warning("تم إنشاء عقد مسبقاً لهذه الرسالة");

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

        const cRef = doc(collection(db, "contracts"));

        const ev = makeEvent({
          type: "contract_created",
          title: "تم إنشاء عقد",
          note: "تم إنشاء وثيقة العقد (جاهزة لرفع النسخة وإرسالها للتوقيع).",
          ...myActor(),
          meta: { contractId: cRef.id, investmentId: msg.investmentId },
        });

        tx.set(cRef, {
          investmentId: msg.investmentId,
          messageId: msgRef.id,

          projectId: inv.projectId || msg.projectId || null,
          projectTitle: inv.projectTitle || msg.projectTitle || null,

          investorUid: inv.investorUid,
          investorName: inv.investorName ?? msg.name ?? null,
          investorEmail: inv.investorEmail ?? msg.email ?? null,
          investorPhone: inv.investorPhone ?? msg.phone ?? null,

          amount: inv.amount ?? null,
          currency: inv.currency ?? "SAR",

          status: "pending_review",
          currentVersion: 0,
          files: [],

          createdAt: serverTimestamp(),
          createdByUid: user?.uid || null,
          createdByEmail: user?.email || null,

          events: arrayUnion(ev),

          ...actionMeta(),
        });

        tx.update(msgRef, {
          contractId: cRef.id,
          contractStatus: "pending_review",
          stageRole: "owner" as StageRole,
          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,

          events: arrayUnion(ev),

          ...actionMeta(),
        });

        tx.update(invRef, {
          contractId: cRef.id,
          contractStatus: "pending_review",
          updatedAt: serverTimestamp(),

          events: arrayUnion(ev),

          ...actionMeta(),
        });

        return cRef.id;
      });

      toast.success(`تم إنشاء العقد ✅ ContractId: ${contractId}`);

      setSelectedMessage((prev: any) =>
        prev ? { ...prev, contractId, contractStatus: "pending_review" } : prev
      );
      await loadContractDoc(contractId);
      loadMessages();
    } catch (e: any) {
      console.error(e);
      toast.error("فشل إنشاء العقد");
    } finally {
      setContractBusy(false);
    }
  };

  /* =========================
    ✅ Upload contract file (draft) - نسخة رسمية PDF/Word
    - موجود للمستقبل 100% ✅
  ========================= */
  const uploadContractDraft = async (file: File, asReplacement: boolean) => {
    // ✅ العقود/الرفع موقوفة حالياً
    if (CONTRACTS_DISABLED) {
      toast.info("رفع ملفات العقود موقوف حالياً — مستقبل فقط");
      return;
    }

    if (!selectedMessage?.contractId) return toast.warning("لا يوجد عقد مرتبط");
    if (!canOwnerAccountantActions)
      return toast.error("هذا الإجراء للأونر/المحاسب فقط");
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    const contractId = selectedMessage.contractId as string;

    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.type)) {
      toast.error("الملف لازم يكون PDF أو Word");
      return;
    }

    try {
      setContractBusy(true);

      const storage = getStorage();

      const cRef = doc(db, "contracts", contractId);
      const cSnap = await getDoc(cRef);
      if (!cSnap.exists()) {
        toast.error("العقد غير موجود");
        return;
      }

      const c = cSnap.data() as ContractDoc;
      const currentVersion = Number(c?.currentVersion ?? 0);
      const nextVersion = currentVersion + 1;

      const now = Date.now();
      const path = `contracts/${contractId}/v${nextVersion}/${now}-${file.name}`;
      const sRef = storageRef(storage, path);

      const task = uploadBytesResumable(sRef, file, { contentType: file.type });

      const url: string = await new Promise((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            console.log("upload draft %", pct);
          },
          (err) => reject(err),
          async () => {
            const u = await getDownloadURL(task.snapshot.ref);
            resolve(u);
          }
        );
      });

      const prevFiles = Array.isArray(c.files) ? c.files : [];
      const updatedFiles = prevFiles.map((f) =>
        f.kind === "draft" && f.isActive
          ? { ...f, isActive: false, note: "تم استبدالها بنسخة أحدث" }
          : f
      );

      const newFile: ContractFile = {
        id: `${now}-${Math.random().toString(16).slice(2)}`,
        kind: "draft",
        version: nextVersion,
        name: file.name,
        contentType: file.type,
        size: file.size,
        url,
        path,
        isActive: true,
        uploadedAt: serverTimestamp(),
        uploadedByUid: user?.uid || null,
        uploadedByEmail: user?.email || null,
        note: asReplacement
          ? "تم رفع نسخة جديدة (تلغي القديمة)"
          : "تم رفع نسخة العقد",
      };

      const ev = makeEvent({
        type: "draft_uploaded",
        title: "تم رفع نسخة العقد (Draft)",
        note: `النسخة: v${nextVersion} • ${file.name}`,
        ...myActor(),
        meta: { contractId, version: nextVersion },
      });

      await updateDoc(cRef, {
        status: "pending_review",
        currentVersion: nextVersion,
        files: [...updatedFiles, newFile],
        returnNote: null,
        returnedAt: null,
        updatedAt: serverTimestamp(),
        events: arrayUnion(ev),
        ...actionMeta(),
      });

      await updateDoc(doc(db, "messages", selectedMessage.id), {
        contractStatus: "pending_review",
        updatedAt: serverTimestamp(),
        events: arrayUnion(ev),
        ...actionMeta(),
      });

      const investmentId = selectedMessage?.investmentId || null;
      if (investmentId) {
        await updateDoc(doc(db, "investments", investmentId), {
          contractStatus: "pending_review",
          updatedAt: serverTimestamp(),
          events: arrayUnion(ev),
          ...actionMeta(),
        });
      }

      setContractDoc((prev) => ({
        ...(prev || {}),
        status: "pending_review",
        currentVersion: nextVersion,
        files: [...updatedFiles, newFile],
      }));

      toast.success("تم رفع العقد ✅ الآن تقدر ترسله للعميل للتوقيع");

      setDraftFile(null);
      setReplaceDraftFile(null);

      await loadContractDoc(contractId);
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل رفع ملف العقد");
    } finally {
      setContractBusy(false);
    }
  };

  const getActiveFile = (kind: ContractFileKind) => {
    const files = contractDoc?.files || [];
    return files.find((f) => f.kind === kind && f.isActive) || null;
  };

  /* =========================
    ✅ إرسال العقد للعميل للتوقيع (مستقبل)
  ========================= */
  const sendContractForSigning = async () => {
    if (CONTRACTS_DISABLED) {
      toast.info("إرسال العقد للتوقيع موقوف — الاعتماد يدوي");
      return;
    }

    if (!selectedMessage) return;
    if (!canOwnerAccountantActions)
      return toast.error("هذا الإجراء للأونر/المحاسب فقط");
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    const clientUid =
      selectedMessage?.createdByUid ||
      selectedMessage?.investorUid ||
      (contractDoc as any)?.investorUid ||
      null;

    const contractId = selectedMessage?.contractId || null;
    const investmentId = selectedMessage?.investmentId || null;

    if (!investmentId) return toast.warning("لا يوجد Investment للرسالة");
    if (!contractId) return toast.warning("أنشئ العقد أولاً");

    const activeDraft = getActiveFile("draft");
    if (!activeDraft)
      return toast.warning("ارفع ملف العقد (PDF/Word) أولاً قبل الإرسال");

    try {
      setContractBusy(true);

      const ev = makeEvent({
        type: "sent_for_signing",
        title: "تم إرسال العقد للتوقيع",
        note: "تم إرسال العقد للعميل للتوقيع ورفع ملف التوقيع.",
        ...myActor(),
        meta: { contractId, investmentId },
      });

      await runTransaction(db, async (tx) => {
        const invRef = doc(db, "investments", investmentId);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error("investment_not_found");

        const cRef = doc(db, "contracts", contractId);
        const cSnap = await tx.get(cRef);
        if (!cSnap.exists()) throw new Error("contract_not_found");

        tx.update(invRef, {
          status: "signing",
          contractStatus: "signing",
          signingAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          events: arrayUnion(ev),
          ...actionMeta(),
        });

        tx.update(cRef, {
          status: "signing",
          signingAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          events: arrayUnion(ev),
          ...actionMeta(),
        });

        const msgRef = doc(db, "messages", selectedMessage.id);
        tx.update(msgRef, {
          contractStatus: "signing",
          stageRole: "client" as StageRole,
          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,
          events: arrayUnion(ev),
          ...actionMeta(),
        });
      });

      if (clientUid) {
        await pushNotification({
          uid: clientUid,
          title: "العقد جاهز للتوقيع",
          body: "تم تجهيز العقد. حمّله ووقّعه ثم ارفعه في لوحة العميل.",
          type: "contract_ready",
          meta: { messageId: selectedMessage.id, contractId },
        });
      }

      toast.success("تم إرسال العقد للعميل للتوقيع ✍️");

      setSelectedMessage((prev: any) =>
        prev
          ? {
            ...prev,
            contractStatus: "signing",
            stageRole: "client",
            events: Array.isArray(prev.events) ? [...prev.events, ev] : [ev],
          }
          : prev
      );

      await loadContractDoc(contractId);
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
    ✅ اعتماد التوقيع (للأونر/المحاسب) (مستقبل)
  ========================= */
  const verifySignedAndMarkSigned = async () => {
    if (CONTRACTS_DISABLED) {
      toast.info("اعتماد التوقيع موقوف — الاعتماد يدوي");
      return;
    }

    if (!selectedMessage?.contractId) return toast.warning("لا يوجد عقد");
    if (!canOwnerAccountantActions)
      return toast.error("هذا الإجراء للأونر/المحاسب فقط");
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    const contractId = selectedMessage.contractId as string;
    const investmentId = selectedMessage?.investmentId || null;

    const signed = getActiveFile("signed");
    if (!signed) return toast.warning("لا يوجد ملف توقيع مرفوع من العميل");

    try {
      setContractBusy(true);

      const ev = makeEvent({
        type: "signed_verified",
        title: "تم اعتماد التوقيع",
        note: "تم التحقق من ملف التوقيع واعتماد العقد.",
        ...myActor(),
        meta: { contractId, investmentId },
      });

      await updateDoc(doc(db, "contracts", contractId), {
        status: "signed",
        signedVerifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        events: arrayUnion(ev),
        ...actionMeta(),
      });

      await updateDoc(doc(db, "messages", selectedMessage.id), {
        contractStatus: "signed",
        stageRole: "owner" as StageRole,
        updatedAt: serverTimestamp(),
        events: arrayUnion(ev),
        ...actionMeta(),
      });

      if (investmentId) {
        await updateDoc(doc(db, "investments", investmentId), {
          contractStatus: "signed",
          status: "active",
          updatedAt: serverTimestamp(),
          events: arrayUnion(ev),
          ...actionMeta(),
        });
      }

      toast.success("تم اعتماد التوقيع ✅");

      await loadContractDoc(contractId);
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل اعتماد التوقيع");
    } finally {
      setContractBusy(false);
    }
  };

  /* =========================
    ✅ إرجاع العقد مع ملاحظة (Returned) (مستقبل)
  ========================= */
  const returnContractWithNote = async () => {
    if (CONTRACTS_DISABLED) {
      toast.info("إرجاع العقد موقوف — الاعتماد يدوي");
      return;
    }

    if (!selectedMessage?.contractId) return toast.warning("لا يوجد عقد");
    if (!canOwnerAccountantActions)
      return toast.error("هذا الإجراء للأونر/المحاسب فقط");
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    const contractId = selectedMessage.contractId as string;

    if (!String(returnNote || "").trim()) {
      toast.error("اكتب ملاحظة الإرجاع");
      return;
    }

    try {
      setContractBusy(true);

      const ev = makeEvent({
        type: "contract_returned",
        title: "تم إرجاع العقد للتعديل",
        note: String(returnNote).trim(),
        ...myActor(),
        meta: { contractId },
      });

      await updateDoc(doc(db, "contracts", contractId), {
        status: "returned",
        returnNote: String(returnNote).trim(),
        returnedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        events: arrayUnion(ev),
        ...actionMeta(),
      });

      await updateDoc(doc(db, "messages", selectedMessage.id), {
        contractStatus: "returned",
        stageRole: "client" as StageRole,
        updatedAt: serverTimestamp(),
        events: arrayUnion(ev),
        ...actionMeta(),
      });

      await notifyClient(selectedMessage, {
        title: "تم إرجاع العقد للتعديل",
        body: `تم إرجاع العقد بسبب: ${String(returnNote).trim()}`,
        type: "contract_returned",
        meta: { messageId: selectedMessage.id, contractId },
      });

      toast.success("تم إرجاع العقد مع ملاحظة");
      setReturnDialogOpen(false);
      setReturnNote("");

      await loadContractDoc(contractId);
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل إرجاع العقد");
    } finally {
      setContractBusy(false);
    }
  };

  /* =========================
    ✅ 4) الترحيل النهائي للمشروع
    - إذا CONTRACTS_DISABLED = true: ترحيل يدوي بدون عقد
    - إذا false: يرجع شرط signed كما كان
  ========================= */
  const finalizeInvestment = async () => {
    if (!selectedMessage) return;
    if (!canOwnerAccountantActions)
      return toast.error("هذا الإجراء للأونر/المحاسب فقط");
    if (isLockedFinal) return toast.warning("الطلب مقفل بالفعل.");

    const investmentId = selectedMessage?.investmentId || null;
    const contractId = selectedMessage?.contractId || null;

    if (!investmentId) return toast.warning("لا يوجد Investment للرسالة");
    if (!CONTRACTS_DISABLED && !contractId)
      return toast.warning("لا يوجد عقد مرتبط");

    try {
      setFinalizeBusy(true);

      const ev = makeEvent({
        type: "investment_finalized",
        title: "تم ترحيل الاستثمار للمشروع",
        note: "تم اعتماد الاستثمار وإقفاله نهائياً.",
        ...myActor(),
        meta: { investmentId, contractId: contractId || null },
      });

      await runTransaction(db, async (tx) => {
        const msgRef = doc(db, "messages", selectedMessage.id);
        const invRef = doc(db, "investments", investmentId);

        const msgSnap = await tx.get(msgRef);
        if (!msgSnap.exists()) throw new Error("message_not_found");
        const msg = msgSnap.data() as any;

        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error("investment_not_found");
        const inv = invSnap.data() as any;

        // ✅ فقط إذا العقود شغالة نتحقق من signed
        if (!CONTRACTS_DISABLED) {
          const cRef = doc(db, "contracts", contractId as string);
          const cSnap = await tx.get(cRef);
          if (!cSnap.exists()) throw new Error("contract_not_found");
          const c = cSnap.data() as any;

          const cStatus = String(c?.status || "pending_review");
          if (cStatus !== "signed") throw new Error("contract_not_signed");
        }

        const projectId = inv?.projectId || msg?.projectId || null;
        if (!projectId) throw new Error("missing_project_id");

        const projectRef = doc(db, "projects", projectId);
        const projectSnap = await tx.get(projectRef);
        if (!projectSnap.exists()) throw new Error("project_not_found");

        if (inv?.finalizedAt) throw new Error("already_finalized");

        const amount = toNumOrNull(inv?.amount);
        if (!amount || amount <= 0) throw new Error("invalid_amount");

        tx.update(invRef, {
          status: "active",
          finalizedAt: serverTimestamp(),
          finalizedByUid: user?.uid || null,
          finalizedByEmail: user?.email || null,
          updatedAt: serverTimestamp(),
          events: arrayUnion(ev),
          ...actionMeta(),
        });

        tx.update(msgRef, {
          status: "resolved",
          internalNotes: internalNotes || null,
          stageRole: "completed" as StageRole,
          finalizedAt: serverTimestamp(),
          finalizedByUid: user?.uid || null,
          finalizedByEmail: user?.email || null,
          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,
          events: arrayUnion(ev),
          ...actionMeta(),
        });
      });

      await notifyClient(selectedMessage, {
        title: "تم تفعيل استثمارك",
        body: "تم اعتماد الاستثمار وترحيله للمشروع بنجاح.",
        type: "investment_finalized",
        meta: {
          messageId: selectedMessage.id,
          investmentId,
          contractId: contractId || null,
        },
      });

      toast.success("تم ترحيل الاستثمار للمشروع ✅");
      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e: any) {
      console.error(e);
      const m = String(e?.message || "");
      if (m.includes("contract_not_signed"))
        return toast.warning("لا يمكن الترحيل قبل اعتماد التوقيع (signed)");
      toast.error("فشل الترحيل النهائي");
    } finally {
      setFinalizeBusy(false);
    }
  };

  /* =========================
    Reject (مرفوض + system)
  ========================= */
  const rejectInvestmentRequest = async () => {
    if (!selectedMessage) return;
    if (isLockedFinal) return toast.warning("الطلب مقفل بالفعل.");

    try {
      const ev = makeEvent({
        type: "rejected",
        title: "تم رفض الطلب",
        note: internalNotes || "تم رفض الطلب من الإدارة.",
        ...myActor(),
      });

      await updateDoc(doc(db, "messages", selectedMessage.id), {
        status: "rejected",
        internalNotes: internalNotes || null,
        stageRole: "system" as StageRole,
        updatedAt: serverTimestamp(),
        updatedByUid: user?.uid || null,
        updatedByEmail: user?.email || null,
        events: arrayUnion(ev),
        ...actionMeta(),
      });

      await notifyClient(selectedMessage, {
        title: "تم رفض الطلب",
        body: "نعتذر، تم رفض طلبك. يمكنك إرسال طلب جديد أو التواصل معنا للاستفسار.",
        type: "message_rejected",
        meta: { messageId: selectedMessage.id },
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
    طوارئ: إعادة فتح (للأونر فقط)
  ========================= */
  const reopenMessage = async () => {
    if (!selectedMessage) return;
    if (myRole !== "owner") return toast.error("هذا الإجراء للأونر فقط");

    try {
      setReopenBusy(true);

      const ev = makeEvent({
        type: "reopened",
        title: "تم إعادة فتح الطلب",
        note: "تم فتح الطلب مرة أخرى لمتابعة الإجراءات.",
        ...myActor(),
      });

      await updateDoc(doc(db, "messages", selectedMessage.id), {
        status: "in_progress",
        stageRole: "owner" as StageRole,
        reopenedAt: serverTimestamp(),
        reopenedByUid: user?.uid || null,
        reopenedByEmail: user?.email || null,
        events: arrayUnion(ev),
        ...actionMeta(),
      });

      toast.success("تمت إعادة فتح الطلب");
      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل إعادة الفتح");
    } finally {
      setReopenBusy(false);
    }
  };

  /* =========================
    UI flags
  ========================= */
  const isInvestment = selectedMessage?.type === "investment_request";

  const canCreateContract =
    !CONTRACTS_DISABLED &&
    isInvestment &&
    !!selectedMessage?.createdByUid &&
    !!selectedMessage?.investmentId &&
    !selectedMessage?.contractId;

  const canSendForSigning =
    !CONTRACTS_DISABLED &&
    isInvestment &&
    !!selectedMessage?.investmentId &&
    !!selectedMessage?.contractId;

  const isSigned = CONTRACTS_DISABLED
    ? true
    : String(selectedMessage?.contractStatus || "") === "signed";

  const canFinalize = CONTRACTS_DISABLED
    ? isInvestment && !!selectedMessage?.investmentId
    : isInvestment &&
    !!selectedMessage?.investmentId &&
    !!selectedMessage?.contractId &&
    isSigned;

  /* =========================
    Render
  ========================= */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">صندوق الرسائل</h1>
          <p className="text-muted-foreground text-lg">
            إدارة الرسائل والاستفسارات الواردة
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-6">
          <StatCard title="المفتوحة" value={stats.open} color="text-blue-700" />
          <StatCard
            title="المكتملة"
            value={stats.completed}
            color="text-gray-700"
          />
          <StatCard title="المرفوضة" value={stats.rejected} color="text-red-700" />
          <StatCard title="جديد" value={stats.new} color="text-orange-600" />
          <StatCard
            title="قيد المعالجة"
            value={stats.in_progress}
            color="text-blue-600"
          />
          <StatCard title="الإجمالي" value={stats.total} />
        </div>

        <Card>
          <CardContent className="py-4 flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground">عرض:</span>

            <Button
              size="sm"
              variant={view === "open" ? "default" : "outline"}
              onClick={() => setView("open")}
            >
              المفتوحة ({stats.open})
            </Button>
            <Button
              size="sm"
              variant={view === "completed" ? "default" : "outline"}
              onClick={() => setView("completed")}
            >
              المكتملة ({stats.completed})
            </Button>
            <Button
              size="sm"
              variant={view === "rejected" ? "default" : "outline"}
              onClick={() => setView("rejected")}
            >
              المرفوضة ({stats.rejected})
            </Button>
            <Button
              size="sm"
              variant={view === "all" ? "default" : "outline"}
              onClick={() => setView("all")}
            >
              الكل ({stats.total})
            </Button>
          </CardContent>
        </Card>

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
            ) : filteredMessages.length > 0 ? (
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
                  {filteredMessages.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{getMessageTypeBadge(m.type)}</TableCell>
                      <TableCell className="font-medium">{m.name || "—"}</TableCell>

                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <Mail className="w-3 h-3" /> {m.email || "—"}
                          </div>
                          {m.phone && (
                            <div className="flex items-center gap-2 opacity-70">
                              <Phone className="w-3 h-3" /> {m.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="max-w-xs truncate">
                        {m.subject ||
                          (m.projectTitle ? `مشروع: ${m.projectTitle}` : "—")}
                      </TableCell>

                      <TableCell className="space-y-1">
                        {(() => {
                          const n = normalizeForDisplay(m);
                          return (
                            <>
                              <div>{getStatusBadge(n.status)}</div>
                              <div>{getStageBadge(n.stageRole)}</div>
                            </>
                          );
                        })()}
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
                            const normalized = {
                              ...hydrated,
                              ...normalizeForDisplay(hydrated),
                            };

                            setSelectedMessage(normalized);
                            setStatus((normalized.status || "new") as MessageStatus);
                            setInternalNotes(hydrated.internalNotes || "");

                            setApprovedAmount(
                              hydrated?.approvedAmount != null
                                ? String(hydrated.approvedAmount)
                                : hydrated?.estimatedAmount != null
                                  ? String(hydrated.estimatedAmount)
                                  : ""
                            );

                            await loadContractDoc(normalized?.contractId || null);

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
        <DialogContent className="w-[min(1280px,calc(100vw-24px))] max-w-[1280px] 2xl:max-w-[1440px] p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-white/60 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-xl md:text-2xl">
                  تفاصيل الرسالة
                </DialogTitle>

                {selectedMessage && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {getMessageTypeBadge(selectedMessage.type)}
                    {(() => {
                      const n = normalizeForDisplay(selectedMessage);
                      return (
                        <>
                          {getStatusBadge(n.status)}
                          {getStageBadge(n.stageRole)}
                        </>
                      );
                    })()}

                    {selectedMessage.createdByUid ? (
                      <Badge className="bg-green-600">مرتبط بحساب</Badge>
                    ) : (
                      <Badge className="bg-yellow-600">بدون حساب</Badge>
                    )}

                    {!CONTRACTS_DISABLED && selectedMessage.contractStatus ? (
                      <Badge variant="outline" className="border-primary/20">
                        عقد: {String(selectedMessage.contractStatus)}
                      </Badge>
                    ) : null}

                    {selectedMessage.lastActionAt ? (
                      <Badge variant="outline" className="border-primary/20">
                        آخر تحديث: {String(selectedMessage.lastActionByRole || "—")} •{" "}
                        {formatDateTimeAR(selectedMessage.lastActionAt)}
                      </Badge>
                    ) : null}

                    {isLockedFinal ? (
                      <Badge className="bg-gray-700">تم إقفال الإجراءات</Badge>
                    ) : null}

                    {CONTRACTS_DISABLED ? (
                      <Badge variant="outline" className="border-primary/20">
                        وضع يدوي: بدون عقود/رفع
                      </Badge>
                    ) : null}
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
                {/* Left */}
                <div className="space-y-4">
                  <Card className="rsg-card rsg-card--tight">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">معلومات سريعة</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <InfoRow label="الاسم" value={selectedMessage.name || "—"} />
                      <InfoRow label="البريد" value={selectedMessage.email || "—"} />
                      <InfoRow label="الجوال" value={selectedMessage.phone || "—"} />
                      <InfoRow
                        label="التاريخ"
                        value={formatDateAR(selectedMessage.createdAt)}
                      />

                      {selectedMessage.projectTitle ? (
                        <div className="pt-2 border-t">
                          <div className="text-xs text-muted-foreground mb-1">المشروع</div>
                          <div className="font-semibold">{selectedMessage.projectTitle}</div>
                          {selectedMessage.projectId ? (
                            <div className="text-xs text-muted-foreground mt-1 break-all">
                              ID: {selectedMessage.projectId}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {selectedMessage.investmentId ? (
                        <div className="pt-2 border-t">
                          <div className="text-xs text-muted-foreground mb-1">
                            Investment
                          </div>
                          <div className="font-semibold break-all">
                            {selectedMessage.investmentId}
                          </div>
                        </div>
                      ) : null}

                      {selectedMessage.contractId ? (
                        <div className="pt-2 border-t">
                          <div className="text-xs text-muted-foreground mb-1">Contract</div>
                          <div className="font-semibold break-all">
                            {selectedMessage.contractId}
                          </div>
                        </div>
                      ) : null}
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

                  {/* ✅ Timeline Preview */}
                  <Card className="rsg-card rsg-card--tight">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock3 className="w-4 h-4" />
                        خط سير الطلب (Timeline)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TimelineView events={timelineItems} />
                      {!timelineItems.length ? (
                        <div className="text-xs text-muted-foreground mt-3">
                          لا توجد أحداث محفوظة بعد. (بعد أول تحديث/إجراء بيبدأ يظهر)
                        </div>
                      ) : null}

                    </CardContent>
                  </Card>

                  {/* ✅ Actions / Update */}
                  <Card className="rsg-card rsg-card--tight">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <PenLine className="w-4 h-4" />
                        إجراءات
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {/* Status */}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>الحالة</Label>
                          <Select
                            value={status}
                            onValueChange={(v) => setStatus(v as MessageStatus)}
                            disabled={isLockedFinal}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="اختر الحالة" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">جديد</SelectItem>
                              <SelectItem value="in_progress">قيد المعالجة</SelectItem>
                              <SelectItem value="resolved">تم الحل</SelectItem>
                              <SelectItem value="closed">مغلق</SelectItem>
                              <SelectItem value="needs_account">يتطلب حساب</SelectItem>
                              <SelectItem value="rejected">مرفوض</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>المبلغ المعتمد (اختياري)</Label>
                          <Input
                            value={approvedAmount}
                            onChange={(e) => setApprovedAmount(e.target.value)}
                            placeholder="مثال: 50000"
                            disabled={isLockedFinal}
                          />
                          <div className="text-[11px] text-muted-foreground">
                            يُستخدم عند “تسجيل استثمار مبدئي”.
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>ملاحظات داخلية</Label>
                        <Textarea
                          value={internalNotes}
                          onChange={(e) => setInternalNotes(e.target.value)}
                          placeholder="اكتب ملاحظة تظهر للإدارة (وتُرسل للعميل عند التحديث)"
                          disabled={isLockedFinal}
                          className="min-h-[96px]"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={handleUpdateStatus}
                          disabled={isLockedFinal}
                        >
                          <CheckCircle2 className="w-4 h-4 ml-2" />
                          حفظ التغييرات
                        </Button>

                        {/* ✅ Staff: Pre-investment */}
                        {isInvestment ? (
                          <Button
                            variant="outline"
                            onClick={createPreInvestment}
                            disabled={isLockedFinal || !canStaffActions}
                          >
                            <ShieldCheck className="w-4 h-4 ml-2" />
                            تسجيل استثمار مبدئي
                          </Button>
                        ) : null}

                        {/* ✅ Owner/Accountant: Create contract (future) */}
                        {canCreateContract ? (
                          <Button
                            variant="outline"
                            onClick={createContractForInvestment}
                            disabled={isLockedFinal || contractBusy}
                          >
                            {contractBusy ? (
                              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                            ) : (
                              <FileText className="w-4 h-4 ml-2" />
                            )}
                            إنشاء عقد (مستقبل)
                          </Button>
                        ) : null}

                        {/* ✅ Send for signing (future) */}
                        {canSendForSigning ? (
                          <Button
                            variant="outline"
                            onClick={sendContractForSigning}
                            disabled={isLockedFinal || contractBusy}
                          >
                            {contractBusy ? (
                              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4 ml-2" />
                            )}
                            إرسال للتوقيع (مستقبل)
                          </Button>
                        ) : null}

                        {/* ✅ Finalize */}
                        {canFinalize ? (
                          <Button
                            className="bg-emerald-700 hover:bg-emerald-800"
                            onClick={finalizeInvestment}
                            disabled={isLockedFinal || finalizeBusy}
                          >
                            {finalizeBusy ? (
                              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                            ) : (
                              <Building2 className="w-4 h-4 ml-2" />
                            )}
                            ترحيل نهائي للمشروع
                          </Button>
                        ) : null}

                        {/* ✅ Reject */}
                        <Button
                          variant="destructive"
                          onClick={rejectInvestmentRequest}
                          disabled={isLockedFinal}
                        >
                          <AlertTriangle className="w-4 h-4 ml-2" />
                          رفض الطلب
                        </Button>

                        {/* ✅ Owner only reopen */}
                        <Button
                          variant="outline"
                          onClick={reopenMessage}
                          disabled={reopenBusy || myRole !== "owner"}
                        >
                          {reopenBusy ? (
                            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                          ) : (
                            <Clock3 className="w-4 h-4 ml-2" />
                          )}
                          إعادة فتح الطلب
                        </Button>
                      </div>

                      {/* ✅ Contract area (future) - UI hints */}
                      {!CONTRACTS_DISABLED && selectedMessage?.contractId ? (
                        <div className="mt-2 rounded-xl border bg-muted/40 p-4 space-y-3">
                          <div className="font-semibold text-sm">
                            إدارة العقد (مستقبل)
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>رفع نسخة العقد (Draft)</Label>
                              <Input
                                type="file"
                                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] || null;
                                  setDraftFile(f);
                                }}
                              />
                              <Button
                                variant="outline"
                                onClick={() => {
                                  if (draftFile) uploadContractDraft(draftFile, false);
                                  else toast.warning("اختر ملف أولاً");
                                }}
                                disabled={contractBusy}
                              >
                                {contractBusy ? (
                                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4 ml-2" />
                                )}
                                رفع
                              </Button>
                            </div>

                            <div className="space-y-2">
                              <Label>استبدال النسخة الحالية</Label>
                              <Input
                                type="file"
                                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] || null;
                                  setReplaceDraftFile(f);
                                }}
                              />
                              <Button
                                variant="outline"
                                onClick={() => {
                                  if (replaceDraftFile)
                                    uploadContractDraft(replaceDraftFile, true);
                                  else toast.warning("اختر ملف أولاً");
                                }}
                                disabled={contractBusy}
                              >
                                {contractBusy ? (
                                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4 ml-2" />
                                )}
                                استبدال
                              </Button>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setReturnDialogOpen(true)}
                              disabled={contractBusy}
                            >
                              إرجاع العقد للتعديل
                            </Button>

                            <Button
                              variant="outline"
                              onClick={verifySignedAndMarkSigned}
                              disabled={contractBusy}
                            >
                              اعتماد التوقيع
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>

                {/* Right */}
                <div className="space-y-4">
                  <Card className="rsg-card rsg-card--tight">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">الملخص</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <InfoRow
                        label="نوع الرسالة"
                        value={String(selectedMessage.type || "—")}
                      />
                      <InfoRow
                        label="الحالة الحالية"
                        value={String(normalizeForDisplay(selectedMessage).status)}
                      />
                      <InfoRow
                        label="المرحلة"
                        value={String(normalizeForDisplay(selectedMessage).stageRole)}
                      />
                      <InfoRow
                        label="آخر تحديث"
                        value={
                          selectedMessage.lastActionAt
                            ? formatDateTimeAR(selectedMessage.lastActionAt)
                            : "—"
                        }
                      />
                    </CardContent>
                  </Card>

                  {/* ✅ Contact quick actions */}
                  <Card className="rsg-card rsg-card--tight">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">تواصل سريع</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {selectedMessage?.email ? (
                        <a
                          className="inline-flex"
                          href={`mailto:${selectedMessage.email}`}
                        >
                          <Button variant="outline">
                            <Mail className="w-4 h-4 ml-2" />
                            بريد
                          </Button>
                        </a>
                      ) : null}

                      {selectedMessage?.phone ? (
                        <a className="inline-flex" href={`tel:${selectedMessage.phone}`}>
                          <Button variant="outline">
                            <Phone className="w-4 h-4 ml-2" />
                            اتصال
                          </Button>
                        </a>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-white/60 backdrop-blur">
            <div className="flex items-center justify-between w-full gap-3">
              <div className="text-xs text-muted-foreground">
                {isLockedFinal
                  ? "هذا الطلب مقفل."
                  : "تأكد من حفظ التغييرات بعد أي تعديل."}
              </div>

              <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
                إغلاق
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إرجاع العقد للتعديل</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label>ملاحظة الإرجاع</Label>
            <Textarea
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              placeholder="اكتب سبب الإرجاع..."
              className="min-h-[120px]"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={returnContractWithNote}>إرسال</Button>
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
    <Card className="rsg-card">
      <CardContent className="py-5">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className={`text-3xl font-bold ${color || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="text-xs text-muted-foreground shrink-0">{label}</div>
      <div className="text-sm font-semibold text-right break-words">
        {value ?? "—"}
      </div>
    </div>
  );
}

/* =========================
  Timeline UI (Admin)
========================= */

function TimelineView({ events }: { events: TimelineEvent[] }) {
  if (!events?.length) return null;

  return (
    <div className="relative space-y-3">
      <div className="absolute right-[10px] top-2 bottom-2 w-px bg-border" />

      {events.map((ev, idx) => {
        const date = formatDateTimeAR(ev.at);
        return (
          <div key={ev.id || idx} className="relative pr-7">
            <div className="absolute right-[6px] top-[6px] w-2.5 h-2.5 rounded-full bg-primary" />

            <div className="rounded-xl border bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{ev.title}</div>
                  {ev.note ? (
                    <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                      {ev.note}
                    </div>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground shrink-0">
                  {date}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                {ev.byRole ? (
                  <span className="px-2 py-0.5 rounded-full bg-muted">
                    {String(ev.byRole)}
                  </span>
                ) : null}
                {ev.byEmail ? (
                  <span className="px-2 py-0.5 rounded-full bg-muted break-all">
                    {String(ev.byEmail)}
                  </span>
                ) : null}
                {ev.type ? (
                  <span className="px-2 py-0.5 rounded-full bg-muted">
                    {String(ev.type)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
