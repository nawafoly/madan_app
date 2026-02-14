/* eslint-disable @typescript-eslint/no-unused-vars */
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
  query,
  orderBy,
  where,
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
  Eye,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  PenLine,
  ShieldCheck,
  Clock3,
  Building2,
  AlertTriangle,
  ExternalLink,
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
  return d
    ? d.toLocaleString("ar-SA", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

const pick = (...vals: any[]) => {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s !== "undefined" && s !== "null") return s;
  }
  return "";
};

const getClientName = (m: any) =>
  pick(
    m?.name,
    m?.fullName,
    m?.full_name,
    m?.clientName,
    m?.customerName,
    m?.contactName,
    m?.contact?.name,
    m?.profile?.name,
    m?.investorName,
    m?.userSnapshot?.displayName
  );

const getClientEmail = (m: any) =>
  pick(
    m?.email,
    m?.contactEmail,
    m?.clientEmail,
    m?.userEmail,
    m?.contact?.email,
    m?.profile?.email,
    m?.investorEmail,
    m?.userSnapshot?.email
  );

const getClientPhone = (m: any) =>
  pick(
    m?.phone,
    m?.mobile,
    m?.phoneNumber,
    m?.contactPhone,
    m?.clientPhone,
    m?.contact?.phone,
    m?.profile?.phone,
    m?.investorPhone,
    m?.userSnapshot?.phone
  );

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function moneySAR(v: any) {
  const n = toNum(v);
  return `${n.toLocaleString("ar-SA")} ر.س`;
}

function stageLabel(v: any) {
  const s = String(v || "");
  const map: Record<string, string> = {
    staff: "مراجع",
    accountant: "محاسب",
    client: "العميل",
    owner: "المالك",
    completed: "مقفل",
  };
  return map[s] || (s ? s : "—");
}

function requestNumber(m: any) {
  return (
    pick(m?.issueNumber, m?.requestNumber, m?.mk) ||
    (m?.id ? String(m.id).slice(0, 8) : "—")
  );
}

function lastTouchedBy(m: any) {
  // ✅ أفضلية: آخر تحديث محفوظ
  const v = pick(m?.updatedByEmail, m?.updatedByUid, m?.processedByName, m?.processedByUid);
  if (v) return v;

  // ✅ fallback: آخر حدث
  if (Array.isArray(m?.events) && m.events.length) {
    const last = m.events[m.events.length - 1];
    return pick(last?.byEmail, last?.byUid, last?.byRole) || "—";
  }

  return "—";
}

type StageRole = "staff" | "accountant" | "client" | "owner" | "completed";

type MessageStatus =
  | "new"
  | "in_progress"
  | "needs_account"
  | "waiting_client_confirmation"
  | "resolved"
  | "completed"
  | "rejected"
  | "no_account"
  | "closed";

type ContractFileKind = "draft_pdf" | "signed_pdf" | "other";

type ContractFile = {
  kind: ContractFileKind;
  name: string;
  url: string;
  uploadedAt?: any;
};

type ContractDoc = {
  id: string;
  status?: "draft" | "sent" | "signed" | "returned";
  files?: ContractFile[];
  createdAt?: any;
  updatedAt?: any;
};

type TimelineEvent = {
  type: string;
  title: string;
  note?: string | null;
  byRole?: string | null;
  byUid?: string | null;
  byEmail?: string | null;
  at?: any;
  meta?: any;
};

/* =========================
  Timeline helpers
========================= */

const myActor = (user?: any, myRole?: string) => {
  return {
    byRole: myRole || null,
    byUid: user?.uid || null,
    byEmail: user?.email || null,
  };
};

const actionMeta = (user?: any, myRole?: string) => {
  return {
    actionByRole: myRole || null,
    actionByUid: user?.uid || null,
    actionByEmail: user?.email || null,
  };
};

const makeEvent = (opts: {
  type: string;
  title: string;
  note?: string | null;
  byRole?: string | null;
  byUid?: string | null;
  byEmail?: string | null;
  meta?: any;
}) => {
  return {
    type: opts.type,
    title: opts.title,
    note: opts.note || null,
    byRole: opts.byRole || null,
    byUid: opts.byUid || null,
    byEmail: opts.byEmail || null,
    at: Timestamp.now(),
    meta: opts.meta || {},
  };
};

/* =========================
  ✅ Roles (Safe + Backward compatible)
========================= */
type AppRole = "owner" | "admin" | "accountant" | "staff" | "client" | "guest";

function normalizeRole(raw: any): AppRole {
  if (!raw) return "guest";
  const r = String(raw).toLowerCase();

  if (r.includes("owner")) return "owner";
  if (r.includes("admin")) return "admin";
  if (r.includes("account")) return "accountant";
  if (r.includes("staff") || r.includes("reception")) return "staff";
  if (r.includes("client") || r.includes("investor")) return "client";
  if (r.includes("guest")) return "guest";

  return "guest";
}

/* =========================
  Main
========================= */
export default function MessagesManagement() {
  const REQUESTS_COL = "interest_requests"; // ✅ مصدر الحقيقة

  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);

  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const [status, setStatus] = useState<MessageStatus>("new");
  const [stageRole, setStageRole] = useState<StageRole>("staff");

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
    ✅ تحميل المشاريع مرة وحدة (عشان نعرض اسم المشروع في الجدول)
  ========================= */
  const [projectsMap, setProjectsMap] = useState<Record<string, any>>({});

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const snap = await getDocs(collection(db, "projects"));
        const map: Record<string, any> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...(d.data() as any) };
        });
        setProjectsMap(map);
      } catch (e) {
        console.error(e);
        // لا نوقف الصفحة لو فشل، بس نخلي الاسم يظهر "—"
      }
    };
    loadProjects();
  }, []);

  const getProjectTitle = (projectId: any) => {
    const pid = String(projectId || "");
    if (!pid) return "—";
    const p = projectsMap[pid];
    if (!p) return "—";
    return pick(p?.titleAr, p?.nameAr, p?.title, p?.name) || "—";
  };

  const getProjectRemaining = (projectId: any) => {
    const pid = String(projectId || "");
    if (!pid) return null;
    const p = projectsMap[pid];
    if (!p) return null;

    const target = toNum(p?.targetAmount);
    const current = toNum(p?.currentAmount);
    if (!target) return null;
    return Math.max(0, target - current);
  };

  /* =========================
    ✅ Role permissions (MAEDIN principle)
  ========================= */
  const OWNER_EMAIL = "nawafaaa0@gmail.com";

  const [myRoleDb, setMyRoleDb] = useState<string>("");
  const [roleDocMissing, setRoleDocMissing] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        setRoleDocMissing(false);

        if (!user?.uid) {
          setMyRoleDb("");
          return;
        }

        // ✅ owner bootstrap by email (نجاة للحسابات القديمة)
        const email = String(user?.email || "").toLowerCase();
        if (email && email === OWNER_EMAIL) {
          setMyRoleDb("owner");
          return;
        }

        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) {
          setRoleDocMissing(true);
          setMyRoleDb("");
          return;
        }
        const role = (snap.data() as any)?.role || "";
        setMyRoleDb(String(role));
      } catch (e) {
        console.error(e);
        setRoleDocMissing(true);
        setMyRoleDb("");
      }
    };
    run();
  }, [user?.uid, user?.email]);

  const myRole = useMemo<AppRole>(() => {
    // ✅ fallback
    const email = String(user?.email || "").toLowerCase();
    if (email && email === OWNER_EMAIL) return "owner";
    return normalizeRole(myRoleDb);
  }, [myRoleDb, user?.email]);

  const canOwnerAccountantActions = myRole === "owner" || myRole === "accountant";
  const canStaffActions = myRole === "staff" || myRole === "admin" || myRole === "owner";
  const canAdmin = myRole === "admin" || myRole === "owner";

  /* =========================
    status badge
  ========================= */
  const getStatusBadge = (s: string) => {
    const map: any = {
      new: { label: "جديد", cls: "bg-orange-500" },
      in_progress: { label: "قيد المعالجة", cls: "bg-blue-500" },
      resolved: { label: "تم تعميد العميل", cls: "bg-emerald-700" },
      closed: { label: "مغلق (قديم)", cls: "bg-gray-500" },
      approved: { label: "مقبول", cls: "bg-green-600" },
      rejected: { label: "مرفوض", cls: "bg-red-600" },
      needs_account: { label: "عند المحاسب", cls: "bg-yellow-600" },
      no_account: { label: "بدون حساب", cls: "bg-rose-700" },
      waiting_client_confirmation: { label: "بانتظار تعميد العميل", cls: "bg-indigo-700" },
      completed: { label: "مقفل نهائيًا", cls: "bg-gray-800" },
    };

    const key = String(s || "new");
    return map[key] || { label: key, cls: "bg-gray-400" };
  };

  /* =========================
    normalize for display
  ========================= */
  const normalizeForDisplay = (m: any) => {
    const st = String(m?.status || "new") as MessageStatus;
    const sr = (String(m?.stageRole || "staff") as StageRole) || "staff";

    const fixed: any = {
      ...m,
      status: st,
      stageRole: sr,
      createdAt: m?.createdAt || m?.created_at || null,
    };

    // ✅ events safe
    fixed.events = Array.isArray(m?.events) ? m.events : [];

    return fixed;
  };

  /* =========================
    load
  ========================= */
  const loadMessages = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, REQUESTS_COL), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);

      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setMessages(list);
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
    contracts doc load
  ========================= */
  const loadContractDoc = async (contractId: string | null) => {
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

      setContractDoc({
        id: snap.id,
        ...(snap.data() as any),
      });
    } catch (e) {
      console.error(e);
      setContractDoc(null);
    }
  };

  /* =========================
    UI filters
  ========================= */
  const normalized = useMemo(() => messages.map(normalizeForDisplay), [messages]);

  const filtered = useMemo(() => {
    if (view === "all") return normalized;

    if (view === "open") {
      return normalized.filter((m) => {
        const st = String(m.status || "");
        return st !== "completed" && st !== "rejected" && st !== "closed";
      });
    }

    if (view === "completed") {
      return normalized.filter((m) => {
        const st = String(m.status || "");
        return st === "completed" || st === "closed";
      });
    }

    if (view === "rejected") {
      return normalized.filter((m) => String(m.status || "") === "rejected");
    }

    return normalized;
  }, [normalized, view]);

  const stats = useMemo(() => {
    const all = normalized;
    const open = all.filter(
      (m) =>
        String(m.status || "") !== "completed" &&
        String(m.status || "") !== "rejected" &&
        String(m.status || "") !== "closed"
    );
    const completed = all.filter((m) => {
      const st = String(m.status || "");
      return st === "completed" || st === "closed";
    });
    const rejected = all.filter((m) => String(m.status || "") === "rejected");

    return { all: all.length, open: open.length, completed: completed.length, rejected: rejected.length };
  }, [normalized]);

  /* =========================
    flags
  ========================= */
  const isInvestment = selectedMessage?.type === "investment_request";

  const isLockedFinal =
    String(selectedMessage?.status || "") === "completed" ||
    String(selectedMessage?.status || "") === "closed";

  /* =========================
    save notes only
  ========================= */
  const handleSaveNotesOnly = async () => {
    if (!selectedMessage) return;

    if (myRole === "client") return toast.error("صلاحيتك عرض فقط.");
    if (isLockedFinal && myRole !== "owner")
      return toast.warning("الطلب مقفل ولا يمكن تعديل الملاحظات.");

    try {
      const ev = makeEvent({
        type: "notes_updated",
        title: "تحديث ملاحظات داخلية",
        note: internalNotes || null,
        ...myActor(user, myRole),
      });

      await updateDoc(doc(db, REQUESTS_COL, selectedMessage.id), {
        internalNotes: internalNotes || null,
        updatedAt: serverTimestamp(),
        updatedByUid: user?.uid || null,
        updatedByEmail: user?.email || null,
        events: arrayUnion(ev),
        ...actionMeta(user, myRole),
      });

      toast.success("تم حفظ الملاحظات");
      setSelectedMessage((prev: any) =>
        prev
          ? {
              ...prev,
              internalNotes: internalNotes || null,
              events: Array.isArray(prev.events) ? [...prev.events, ev] : [ev],
            }
          : prev
      );
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ الملاحظات");
    }
  };

  // ✅ حفظ الحالة/المرحلة + الملاحظات (يدوي) — للباك أوفيس فقط
  const handleUpdateStatus = async () => {
    if (!selectedMessage) return;

    if (myRole === "client") {
      toast.error("صلاحيتك عرض فقط.");
      return;
    }

    if (isLockedFinal && myRole !== "owner") {
      toast.warning("الطلب مقفل ولا يمكن تعديل حالته.");
      return;
    }

    try {
      const ev = makeEvent({
        type: "status_changed",
        title: "تحديث الحالة/المرحلة",
        note: `status: ${status} • stageRole: ${stageRole}`,
        ...myActor(user, myRole),
        meta: { status, stageRole },
      });

      await updateDoc(doc(db, REQUESTS_COL, selectedMessage.id), {
        status,
        stageRole,
        internalNotes: internalNotes || null,
        updatedAt: serverTimestamp(),
        updatedByUid: user?.uid || null,
        updatedByEmail: user?.email || null,
        events: arrayUnion(ev),
        ...actionMeta(user, myRole),
      });

      toast.success("تم حفظ التغييرات");
      setSelectedMessage((prev: any) =>
        prev
          ? {
              ...prev,
              status,
              stageRole,
              internalNotes: internalNotes || null,
              events: Array.isArray(prev.events) ? [...prev.events, ev] : [ev],
            }
          : prev
      );
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ التغييرات");
    }
  };

  /* =========================
    moveTo step helper
  ========================= */
  const moveTo = async (next: {
    status: MessageStatus;
    stageRole: StageRole;
    note?: string;
    notifyClientText?: string;
  }) => {
    if (!selectedMessage) return;

    if (isLockedFinal && myRole !== "owner") {
      toast.warning("الطلب مقفل.");
      return;
    }

    if (myRole === "client") {
      const ok = next.status === "resolved" && next.stageRole === "owner";
      if (!ok) {
        toast.error("العميل يقدر فقط يسوي: موافقة وتعميد (نقل للأونر).");
        return;
      }
    }

    const ev = makeEvent({
      type: "status_changed",
      title: "تحديث خطوة الطلب",
      note: next.note || `تم نقل الطلب إلى: ${next.status} / ${next.stageRole}`,
      ...myActor(user, myRole),
      meta: { status: next.status, stageRole: next.stageRole },
    });

    await updateDoc(doc(db, REQUESTS_COL, selectedMessage.id), {
      status: next.status,
      stageRole: next.stageRole,
      updatedAt: serverTimestamp(),
      updatedByUid: user?.uid || null,
      updatedByEmail: user?.email || null,
      events: arrayUnion(ev),
      ...actionMeta(user, myRole),
    });

    setSelectedMessage((prev: any) =>
      prev
        ? {
            ...prev,
            status: next.status,
            stageRole: next.stageRole,
            events: Array.isArray(prev.events) ? [...prev.events, ev] : [ev],
          }
        : prev
    );

    toast.success("تم ترحيل الطلب ✅");
    loadMessages();
  };

  // 1) Staff: ترحيل مبدئي -> للمحاسب
  const stepStaffForwardToAccountant = async () => {
    if (!canStaffActions) return toast.error("هذا الإجراء للمراجع فقط");
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    await moveTo({
      status: "needs_account",
      stageRole: "accountant",
      note: "ترحيل مبدئي من المراجع إلى المحاسب",
      notifyClientText: "تمت مراجعة طلبك مبدئيًا وهو الآن عند المحاسب.",
    });
  };

  // 2) Accountant: تمت مراجعة الحساب -> للعميل
  const stepAccountantForwardToClient = async () => {
    if (!canOwnerAccountantActions) return toast.error("هذا الإجراء للمحاسب/الأونر");
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    await moveTo({
      status: "waiting_client_confirmation",
      stageRole: "client",
      note: "تمت مراجعة الحساب وترحيل الطلب للعميل للتعميد",
      notifyClientText: "تمت مراجعة الحساب. الرجاء الدخول لتعميد الطلب.",
    });
  };

  // 3) Client: موافقة وتعميد -> للأونر
  const stepClientApproveAndForwardToOwner = async () => {
    if (myRole !== "client") return toast.error("هذا الإجراء للعميل فقط");
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    await moveTo({
      status: "resolved",
      stageRole: "owner",
      note: "تم تعميد العميل — تحويل للمالك للتعميد النهائي",
      notifyClientText: "تم استلام تعميدك، وسيتم الإقفال النهائي بعد مراجعة المالك.",
    });
  };

  // 4) Owner: تعميد نهائي + قفل
  const stepOwnerFinalizeAndClose = async () => {
    if (myRole !== "owner") return toast.error("هذا الإجراء للمالك فقط");
    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    await moveTo({
      status: "completed",
      stageRole: "completed",
      note: "تعميد نهائي وإقفال الطلب",
      notifyClientText: "تم إقفال الطلب نهائيًا. شكرًا لك.",
    });
  };

  /* =========================
    Investment flow (Legacy)
  ========================= */

  const createPreInvestment = async () => {
    if (!selectedMessage) return;

    try {
      // ✅ إذا الطلب بدون حساب (createdByUid null) => حوّله لبدون حساب
      if (!selectedMessage?.createdByUid) {
        const ev = makeEvent({
          type: "needs_account",
          title: "بدون حساب",
          note: "الطلب لا يحتوي على حساب مرتبط (createdByUid فارغ).",
          ...myActor(user, myRole),
          meta: { messageId: selectedMessage.id },
        });

        await updateDoc(doc(db, REQUESTS_COL, selectedMessage.id), {
          status: "no_account",
          stageRole: "client" as StageRole,
          events: arrayUnion(ev),
          ...actionMeta(user, myRole),
        });

        toast.warning("هذا الطلب بدون حساب — تم تحويله إلى: بدون حساب");
        loadMessages();
        return;
      }

      // باقي منطق pre-investment (لو موجود عندك) …
      toast.success("تم (مبدئيًا) إنشاء الاستثمار");
    } catch (e) {
      console.error(e);
      toast.error("فشل إنشاء الاستثمار");
    }
  };

  const createContractForInvestment = async () => {
    toast.info("نظام العقود موقوف حاليًا (حسب CONTRACTS_DISABLED)");
  };

  const sendContractForSigning = async () => {
    toast.info("إرسال للتوقيع (مستقبل)");
  };

  const returnContractWithNote = async () => {
    toast.info("إرجاع العقد (مستقبل)");
  };

  const finalizeInvestment = async () => {
    if (!selectedMessage) return;

    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    try {
      setFinalizeBusy(true);

      await runTransaction(db, async (tx) => {
        const msgRef = doc(db, REQUESTS_COL, selectedMessage.id);

        tx.update(msgRef, {
          status: "completed",
          stageRole: "completed" as StageRole,
          finalizedAt: serverTimestamp(),
          finalizedByUid: user?.uid || null,
          finalizedByEmail: user?.email || null,
          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,
          events: arrayUnion(
            makeEvent({
              type: "finalized",
              title: "ترحيل نهائي للمشروع",
              note: "تم الترحيل النهائي وقفل الطلب.",
              ...myActor(user, myRole),
              meta: { messageId: selectedMessage.id },
            })
          ),
          ...actionMeta(user, myRole),
        });
      });

      toast.success("تم الترحيل النهائي ✅");
      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل الترحيل النهائي");
    } finally {
      setFinalizeBusy(false);
    }
  };

  const rejectInvestmentRequest = async () => {
    if (!selectedMessage) return;

    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    try {
      const ev = makeEvent({
        type: "rejected",
        title: "تم رفض الطلب",
        note: "تم رفض الطلب من الإدارة.",
        ...myActor(user, myRole),
        meta: { messageId: selectedMessage.id },
      });

      await updateDoc(doc(db, REQUESTS_COL, selectedMessage.id), {
        status: "rejected",
        stageRole: "completed" as StageRole,
        rejectedAt: serverTimestamp(),
        rejectedByUid: user?.uid || null,
        rejectedByEmail: user?.email || null,
        events: arrayUnion(ev),
        ...actionMeta(user, myRole),
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
    if (myRole !== "owner") return toast.error("هذا الإجراء للمالك فقط");

    try {
      setReopenBusy(true);

      const ev = makeEvent({
        type: "reopened",
        title: "تم إعادة فتح الطلب",
        note: "تم فتح الطلب مرة أخرى لمتابعة الإجراءات.",
        ...myActor(user, myRole),
      });

      await updateDoc(doc(db, REQUESTS_COL, selectedMessage.id), {
        status: "in_progress",
        stageRole: "owner" as StageRole,
        reopenedAt: serverTimestamp(),
        reopenedByUid: user?.uid || null,
        reopenedByEmail: user?.email || null,
        events: arrayUnion(ev),
        ...actionMeta(user, myRole),
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

          {/* ✅ تنبيه للحسابات القديمة (doc ناقص / role ناقص) */}
          {roleDocMissing && myRole !== "owner" ? (
            <div className="mt-3 p-3 rounded-lg bg-amber-50 border text-sm">
              ملاحظة: لم يتم العثور على ملف صلاحيات لحسابك في{" "}
              <code>users/{user?.uid}</code>. قد تظهر لك بعض الصلاحيات كعرض فقط.
            </div>
          ) : null}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard title="الكل" value={stats.all} />
          <StatCard title="المفتوحة" value={stats.open} color="text-blue-600" />
          <StatCard title="المقفلة" value={stats.completed} color="text-gray-800" />
          <StatCard title="المرفوضة" value={stats.rejected} color="text-red-600" />
        </div>

        {/* Filters */}
        <Card className="rsg-card">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={view === "open" ? "default" : "outline"}
                onClick={() => setView("open")}
              >
                مفتوح
              </Button>
              <Button
                variant={view === "completed" ? "default" : "outline"}
                onClick={() => setView("completed")}
              >
                مقفل
              </Button>
              <Button
                variant={view === "rejected" ? "default" : "outline"}
                onClick={() => setView("rejected")}
              >
                مرفوض
              </Button>
              <Button
                variant={view === "all" ? "default" : "outline"}
                onClick={() => setView("all")}
              >
                الكل
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="rsg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              الرسائل
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                جاري التحميل...
              </div>
            ) : filtered.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العميل</TableHead>
                    <TableHead>اسم المشروع</TableHead>
                    <TableHead>رقم الطلب</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>المتبقي</TableHead>
                    <TableHead>الاستثمار</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>المرحلة</TableHead>
                    <TableHead>آخر تعديل</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead className="text-left">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => {
                    const badge = getStatusBadge(m.status);

                    const pid = pick(m?.projectId, m?.project_id, m?.project?.id);
                    const projectTitle = getProjectTitle(pid);

                    const amount =
                      toNum(m?.approvedAmount) ||
                      toNum(m?.amount) ||
                      toNum(m?.requestedAmount) ||
                      toNum(m?.estimatedAmount) ||
                      0;

                    const remaining = getProjectRemaining(pid);
                    const exceeded = remaining != null ? amount > remaining : false;

                    const invState = m?.investmentId
                      ? { label: "تم الإنشاء", cls: "bg-emerald-700" }
                      : { label: "بانتظار", cls: "bg-slate-600" };

                    const touchedBy = lastTouchedBy(m);

                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-semibold">
                          {getClientName(m) || "—"}
                        </TableCell>

                        <TableCell className="font-medium">
                          {projectTitle}
                        </TableCell>

                        <TableCell className="font-mono">
                          {requestNumber(m)}
                        </TableCell>

                        <TableCell className="font-semibold">
                          {moneySAR(amount)}
                        </TableCell>

                        <TableCell>
                          {remaining == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : exceeded ? (
                            <Badge className="bg-red-700">
                              {moneySAR(remaining)} (تجاوز)
                            </Badge>
                          ) : (
                            <Badge variant="outline">{moneySAR(remaining)}</Badge>
                          )}
                        </TableCell>

                        <TableCell>
                          <Badge className={invState.cls}>{invState.label}</Badge>
                        </TableCell>

                        <TableCell>
                          <Badge className={badge.cls}>{badge.label}</Badge>
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline">{stageLabel(m.stageRole)}</Badge>
                        </TableCell>

                        <TableCell className="text-xs">
                          {touchedBy}
                        </TableCell>

                        <TableCell>
                          {formatDateTimeAR(
                            m.createdAt ||
                              m.created_at ||
                              m.submittedAt ||
                              m.timestamp
                          )}
                        </TableCell>

                        <TableCell className="text-left">
                          <div className="flex gap-2 justify-end">
                            {/* ✅ ملف العميل */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const clientId = pick(
                                  m?.createdByUid,
                                  m?.investorUid,
                                  m?.userId,
                                  m?.userSnapshot?.uid
                                );
                                if (!clientId) {
                                  toast.warning("لا يوجد حساب عميل مرتبط بهذا الطلب.");
                                  return;
                                }
                                window.location.href = `/admin/client-profile?id=${clientId}`;
                              }}
                            >
                              <FileText className="w-4 h-4 ml-1" />
                              ملف العميل
                            </Button>

                            {/* ✅ فتح المشروع */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (!pid) {
                                  toast.warning("لا يوجد مشروع مرتبط بهذا الطلب.");
                                  return;
                                }
                                window.location.href = `/admin/projects/${pid}/edit`;
                              }}
                            >
                              <ExternalLink className="w-4 h-4 ml-1" />
                              المشروع
                            </Button>

                            {/* ✅ عرض */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const fixed = normalizeForDisplay(m);
                                const normalizedOne = {
                                  ...fixed,
                                  ...normalizeForDisplay(fixed),
                                };

                                setSelectedMessage(normalizedOne);
                                setStatus(
                                  (normalizedOne.status || "new") as MessageStatus
                                );
                                setStageRole(
                                  (normalizedOne.stageRole || "staff") as StageRole
                                );
                                setInternalNotes(String(normalizedOne.internalNotes || ""));
                                setApprovedAmount(
                                  normalizedOne?.approvedAmount != null
                                    ? String(normalizedOne.approvedAmount)
                                    : normalizedOne?.estimatedAmount != null
                                    ? String(normalizedOne.estimatedAmount)
                                    : ""
                                );

                                await loadContractDoc(normalizedOne?.contractId || null);

                                setIsDetailDialogOpen(true);
                              }}
                            >
                              <Eye className="w-4 h-4 ml-1" />
                              عرض
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                لا توجد رسائل
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent
            className="w-[98vw] max-w-[1400px] 2xl:max-w-[1600px] p-0 max-h-[92vh] overflow-y-auto"
            dir="rtl"
          >
            <DialogHeader className="px-6 py-4 border-b bg-white/60 backdrop-blur">
              <DialogTitle className="text-xl">تفاصيل الطلب</DialogTitle>
            </DialogHeader>

            {selectedMessage ? (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  <Card className="rsg-card">
                    <CardHeader>
                      <CardTitle>بيانات العميل</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <InfoRow label="الاسم" value={getClientName(selectedMessage) || "—"} />
                      <InfoRow label="البريد" value={getClientEmail(selectedMessage) || "—"} />
                      <InfoRow label="الجوال" value={getClientPhone(selectedMessage) || "—"} />

                      <div className="pt-2 flex flex-wrap gap-2">
                        {(() => {
                          const clientId = pick(
                            selectedMessage?.createdByUid,
                            selectedMessage?.investorUid,
                            selectedMessage?.userId,
                            selectedMessage?.userSnapshot?.uid
                          );

                          const pid = pick(
                            selectedMessage?.projectId,
                            selectedMessage?.project_id,
                            selectedMessage?.project?.id
                          );

                          return (
                            <>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  if (!clientId) {
                                    toast.warning("لا يوجد حساب عميل مرتبط بهذا الطلب.");
                                    return;
                                  }
                                  window.location.href = `/admin/client-profile?id=${clientId}`;
                                }}
                              >
                                <FileText className="w-4 h-4 ml-2" />
                                فتح ملف العميل
                              </Button>

                              <Button
                                variant="outline"
                                onClick={() => {
                                  if (!pid) {
                                    toast.warning("لا يوجد مشروع مرتبط بهذا الطلب.");
                                    return;
                                  }
                                  window.location.href = `/admin/projects/${pid}/edit`;
                                }}
                              >
                                <ExternalLink className="w-4 h-4 ml-2" />
                                فتح المشروع
                              </Button>
                            </>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        {(() => {
                          const emailToUse = getClientEmail(selectedMessage);
                          const phoneToUse = getClientPhone(selectedMessage);

                          return (
                            <>
                              {emailToUse ? (
                                <a className="inline-flex" href={`mailto:${emailToUse}`}>
                                  <Button variant="outline">
                                    <Mail className="w-4 h-4 ml-2" />
                                    إيميل
                                  </Button>
                                </a>
                              ) : null}

                              {phoneToUse ? (
                                <a className="inline-flex" href={`tel:${phoneToUse}`}>
                                  <Button variant="outline">
                                    <Phone className="w-4 h-4 ml-2" />
                                    اتصال
                                  </Button>
                                </a>
                              ) : null}
                            </>
                          );
                        })()}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rsg-card">
                    <CardHeader>
                      <CardTitle>ملخص الطلب</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(() => {
                        const pid = pick(
                          selectedMessage?.projectId,
                          selectedMessage?.project_id,
                          selectedMessage?.project?.id
                        );

                        const projectTitle = getProjectTitle(pid);

                        const amount =
                          toNum(selectedMessage?.approvedAmount) ||
                          toNum(selectedMessage?.amount) ||
                          toNum(selectedMessage?.requestedAmount) ||
                          toNum(selectedMessage?.estimatedAmount) ||
                          0;

                        const remaining = getProjectRemaining(pid);
                        const exceeded = remaining != null ? amount > remaining : false;

                        const invState = selectedMessage?.investmentId
                          ? "تم إنشاء الاستثمار"
                          : "بانتظار إنشاء الاستثمار";

                        return (
                          <>
                            <InfoRow label="رقم الطلب" value={requestNumber(selectedMessage)} />
                            <InfoRow label="اسم المشروع" value={projectTitle} />
                            <InfoRow label="المبلغ" value={moneySAR(amount)} />
                            <InfoRow
                              label="المتبقي"
                              value={
                                remaining == null
                                  ? "—"
                                  : exceeded
                                  ? `${moneySAR(remaining)} (تجاوز)`
                                  : moneySAR(remaining)
                              }
                            />
                            <InfoRow label="الاستثمار" value={invState} />
                            <InfoRow
                              label="التاريخ"
                              value={formatDateTimeAR(
                                selectedMessage.createdAt ||
                                  selectedMessage.created_at ||
                                  selectedMessage.submittedAt ||
                                  selectedMessage.timestamp
                              )}
                            />
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  <Card className="rsg-card">
                    <CardHeader>
                      <CardTitle>الحالة</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusBadge(selectedMessage.status).cls}>
                          {getStatusBadge(selectedMessage.status).label}
                        </Badge>
                        <Badge variant="outline">{stageLabel(selectedMessage.stageRole)}</Badge>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-2">
                          <Label>المرحلة</Label>
                          <Select
                            value={stageRole}
                            onValueChange={(v) => setStageRole(v as StageRole)}
                            disabled={isLockedFinal || myRole === "client"}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="اختر المرحلة" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="staff">مراجع</SelectItem>
                              <SelectItem value="accountant">محاسب</SelectItem>
                              <SelectItem value="client">العميل</SelectItem>
                              <SelectItem value="owner">المالك</SelectItem>
                              <SelectItem value="completed">مقفل</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>الحالة</Label>
                          <Select
                            value={status}
                            onValueChange={(v) => setStatus(v as MessageStatus)}
                            disabled={isLockedFinal || myRole === "client"}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="اختر الحالة" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">جديد</SelectItem>
                              <SelectItem value="in_progress">قيد المعالجة</SelectItem>
                              <SelectItem value="needs_account">عند المحاسب</SelectItem>
                              <SelectItem value="waiting_client_confirmation">بانتظار تعميد العميل</SelectItem>
                              <SelectItem value="resolved">تم تعميد العميل</SelectItem>
                              <SelectItem value="completed">مقفل نهائيًا</SelectItem>
                              <SelectItem value="no_account">بدون حساب</SelectItem>
                              <SelectItem value="rejected">مرفوض</SelectItem>
                              <SelectItem value="closed">مغلق (قديم)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>ملاحظات داخلية</Label>
                          <Textarea
                            value={internalNotes}
                            onChange={(e) => setInternalNotes(e.target.value)}
                            placeholder="ملاحظات للإدارة فقط..."
                            disabled={isLockedFinal || myRole === "client"}
                            className="min-h-[96px]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button
                          onClick={handleUpdateStatus}
                          disabled={isLockedFinal || myRole === "client"}
                        >
                          <CheckCircle2 className="w-4 h-4 ml-2" />
                          حفظ التغييرات
                        </Button>

                        {/* ✅ Step Machine Buttons */}
                        {selectedMessage ? (
                          <>
                            {/* 1) Staff -> Accountant */}
                            {canStaffActions &&
                            normalizeForDisplay(selectedMessage).status === "new" &&
                            normalizeForDisplay(selectedMessage).stageRole === "staff" ? (
                              <Button
                                className="bg-yellow-700 hover:bg-yellow-800"
                                onClick={stepStaffForwardToAccountant}
                                disabled={isLockedFinal}
                              >
                                <Clock3 className="w-4 h-4 ml-2" />
                                ترحيل للمحاسب
                              </Button>
                            ) : null}

                            {/* 2) Accountant -> Client */}
                            {canOwnerAccountantActions &&
                            normalizeForDisplay(selectedMessage).status === "needs_account" &&
                            normalizeForDisplay(selectedMessage).stageRole === "accountant" ? (
                              <Button
                                className="bg-indigo-700 hover:bg-indigo-800"
                                onClick={stepAccountantForwardToClient}
                                disabled={isLockedFinal}
                              >
                                <PenLine className="w-4 h-4 ml-2" />
                                تمّت المراجعة — للعميل
                              </Button>
                            ) : null}

                            {/* 3) Client -> Owner */}
                            {myRole === "client" &&
                            normalizeForDisplay(selectedMessage).status === "waiting_client_confirmation" &&
                            normalizeForDisplay(selectedMessage).stageRole === "client" ? (
                              <Button
                                className="bg-emerald-700 hover:bg-emerald-800"
                                onClick={stepClientApproveAndForwardToOwner}
                                disabled={isLockedFinal}
                              >
                                <CheckCircle2 className="w-4 h-4 ml-2" />
                                موافقة وتعميد
                              </Button>
                            ) : null}

                            {/* 4) Owner -> Completed/Locked */}
                            {myRole === "owner" &&
                            normalizeForDisplay(selectedMessage).status === "resolved" &&
                            normalizeForDisplay(selectedMessage).stageRole === "owner" ? (
                              <Button
                                className="bg-gray-800 hover:bg-gray-900"
                                onClick={stepOwnerFinalizeAndClose}
                                disabled={isLockedFinal}
                              >
                                <ShieldCheck className="w-4 h-4 ml-2" />
                                تعميد نهائي وإقفال
                              </Button>
                            ) : null}
                          </>
                        ) : null}

                        {/* ✅ Staff: Pre-investment */}
                        {isInvestment ? (
                          <Button
                            variant="outline"
                            onClick={createPreInvestment}
                            disabled={isLockedFinal}
                          >
                            <PenLine className="w-4 h-4 ml-2" />
                            إنشاء الاستثمار (قديم)
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
                            إقفال نهائي
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
                          إعادة فتح (للمالك)
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : null}

            <DialogFooter className="px-6 py-4 border-t bg-white/60 backdrop-blur">
              <div className="flex items-center justify-between w-full gap-3">
                <div className="text-xs text-muted-foreground">
                  {isLockedFinal ? "هذا الطلب مقفل." : "تأكد من حفظ التغييرات بعد أي تعديل."}
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
                placeholder="اكتب سبب الإرجاع."
                className="min-h-[120px]"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
                إلغاء
              </Button>
              <Button className="w-full sm:w-auto" onClick={returnContractWithNote}>
                إرسال
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
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
    <div className="grid grid-cols-[110px_1fr] items-start gap-3">
      <div className="text-xs text-muted-foreground text-right pt-1">{label}</div>

      <div className="text-sm font-semibold text-right break-words leading-7">
        {value ?? "—"}
      </div>
    </div>
  );
}
