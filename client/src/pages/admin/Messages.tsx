/* eslint-disable @typescript-eslint/no-unused-vars */
// client/src/pages/admin/MessagesManagement.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ContractFilePicker from "@/components/ContractFilePicker";
import {
  collection,
  deleteField,
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
import { resolveInvestmentActivationTerms } from "@shared/investmentActivation";
import { useAuth } from "@/_core/hooks/useAuth";
import { uploadInvestmentDocument } from "@/lib/documentUploadService";

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
  Download,
} from "lucide-react";
import { toast } from "sonner";

/* =========================
  ✅ Switch: Disable contracts/files now
  - True = لا عقود + لا رفع + لا signed (ترحيل يدوي)
  - False = يرجع نظام العقود القديم بالكامل
========================= */
const CONTRACTS_DISABLED = false;

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

const pickFirstNonEmptyString = (...vals: any[]) => {
  for (const v of vals) {
    const s = String(v || "").trim();
    if (s && s !== "undefined" && s !== "null") return s;
  }
  return "";
};

function readNestedValue(source: any, path: string) {
  const keys = String(path || "")
    .split(".")
    .map((v) => v.trim())
    .filter(Boolean);
  let current = source;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

function resolveDocPath(source: any, candidates: string[]) {
  for (const candidate of candidates) {
    const value = pickFirstNonEmptyString(readNestedValue(source, candidate));
    if (value) return value;
  }
  return "";
}

function resolveDocValue(source: any, candidates: string[]) {
  for (const candidate of candidates) {
    const value = readNestedValue(source, candidate);
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return undefined;
}

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

function toPositiveInt(v: any) {
  const n = toNum(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function toBooleanSafe(v: any) {
  if (v === true) return true;
  if (v === false) return false;
  const raw = String(v || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function moneySAR(v: any) {
  const n = toNum(v);
  return `${n.toLocaleString("ar-SA")} ر.س`;
}

function stageLabel(v: any) {
  const s = String(v || "");
  const map: Record<string, string> = {
    reviewer: "مراجع",
    review: "مراجعة",
    staff: "مراجع",
    accountant: "محاسب",
    client: "العميل",
    investment: "الاستثمار",
    contract: "العقد",
    owner: "المالك",
    completed: "مقفل",
  };
  return map[s] || (s ? s : "—");
}

function normalizeRequestStatus(raw: any): MessageStatus {
  const s = String(raw || "").trim().toLowerCase();
  const legacyMap: Record<string, MessageStatus> = {
    new: "pending",
    in_progress: "reviewing",
    pending_review: "reviewing",
    needs_account: "reviewing",
    waiting_client_confirmation: "reviewing",
    resolved: "approved",
    closed: "completed",
  };
  if (legacyMap[s]) return legacyMap[s];
  if (
    [
      "pending",
      "reviewing",
      "approved",
      "completed",
      "rejected",
      "no_account",
      "closed",
    ].includes(s)
  ) {
    return s as MessageStatus;
  }
  return "pending";
}

function normalizeStageRole(raw: any, status: MessageStatus, hasInvestment: boolean): StageRole {
  const s = String(raw || "").trim().toLowerCase();
  if (
    [
      "reviewer",
      "review",
      "staff",
      "accountant",
      "client",
      "investment",
      "contract",
      "owner",
      "completed",
    ].includes(s)
  ) {
    return s as StageRole;
  }
  if (status === "completed" || status === "rejected" || status === "closed") return "completed";
  if (hasInvestment || status === "approved") return "investment";
  return "review";
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

function getFileNameFromPath(path: any): string {
  const p = String(path || "").trim();
  if (!p) return "â€”";
  const normalized = p.replace(/\\/g, "/");
  const last = normalized.split("/").pop();
  return String(last || "â€”").trim() || "â€”";
}

function buildR2DownloadUrl(path: any, forceDownload = false) {
  const objectPath = String(path || "").trim();
  if (!objectPath) return "";

  const explicitDownloadBase = String(import.meta.env.VITE_R2_DOWNLOAD_WORKER_URL || "").trim();
  const uploadWorkerUrl = String(import.meta.env.VITE_R2_UPLOAD_WORKER_URL || "").trim();
  const baseUrl = explicitDownloadBase || uploadWorkerUrl;
  if (!baseUrl) return "";

  try {
    const url = new URL(baseUrl);
    url.pathname = "/download";
    url.search = "";
    url.hash = "";
    url.searchParams.set("path", objectPath);
    if (forceDownload) {
      url.searchParams.set("download", "1");
    }
    return url.toString();
  } catch {
    return "";
  }
}

function expectedContractPath(investmentId: string, kind: "original" | "signed") {
  const id = String(investmentId || "").trim();
  if (!id) return "";
  return kind === "original" ? `contracts/${id}/original.pdf` : `contracts/${id}/signed.pdf`;
}

type R2ProbeStatus = "exists" | "missing" | "unknown";

async function r2ObjectStatus(path: string): Promise<R2ProbeStatus> {
  const rawUrl = buildR2DownloadUrl(path, false);
  if (!rawUrl) return "unknown";
  try {
    const probeUrl = new URL(rawUrl);
    probeUrl.searchParams.set("probe", "1");
    const response = await fetch(probeUrl.toString(), { method: "GET" });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload && typeof payload.exists === "boolean") {
      return payload.exists ? "exists" : "missing";
    }
    try {
      await response.body?.cancel();
    } catch {
      // ignore
    }
    if (response.ok) return "exists";
    if (response.status === 404) return "missing";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function getContractStatusLabel(status: any): string {
  const s = String(status || "").trim().toLowerCase();
  const map: Record<string, string> = {
    draft: "مسودة",
    sent: "مرسل",
    pending_signature: "بانتظار توقيع المستثمر",
    signed: "موقّع",
    issued: "مرسل",
    signed_uploaded: "موقّع",
    under_review: "قيد المراجعة",
    approved: "معتمد",
  };
  return map[s] || (s ? String(status) : "â€”");
}

function getContractStatusClass(status: any): string {
  const s = String(status || "").trim().toLowerCase();
  const map: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700 border-slate-200",
    sent: "bg-blue-100 text-blue-700 border-blue-200",
    pending_signature: "bg-amber-100 text-amber-700 border-amber-200",
    signed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    issued: "bg-blue-100 text-blue-700 border-blue-200",
    signed_uploaded: "bg-emerald-100 text-emerald-700 border-emerald-200",
    under_review: "bg-amber-100 text-amber-700 border-amber-200",
    approved: "bg-green-100 text-green-700 border-green-200",
  };
  return map[s] || "bg-slate-100 text-slate-700 border-slate-200";
}

type StageRole =
  | "reviewer"
  | "review"
  | "staff"
  | "accountant"
  | "client"
  | "investment"
  | "contract"
  | "owner"
  | "completed";

type MessageStatus =
  | "pending"
  | "reviewing"
  | "approved"
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
  status?:
    | "draft"
    | "sent"
    | "pending_signature"
    | "signed"
    | "under_review"
    | "approved"
    | "returned";
  files?: ContractFile[];
  createdAt?: any;
  updatedAt?: any;
  originalContract?: { path?: string; fileName?: string; url?: string };
  contractFile?: { path?: string; fileName?: string; url?: string };
  signedContract?: { path?: string; fileName?: string; url?: string };
  signedContractFile?: { path?: string; fileName?: string; url?: string };
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

  const [internalNotes, setInternalNotes] = useState("");

  const [approvedAmount, setApprovedAmount] = useState<string>("");

  const [contractBusy, setContractBusy] = useState(false);
  const [approveCreateBusy, setApproveCreateBusy] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);

  // ✅ ملفات/عقد
  const [contractDoc, setContractDoc] = useState<ContractDoc | null>(null);
  const [investmentDoc, setInvestmentDoc] = useState<any>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [localUploadedByKind, setLocalUploadedByKind] = useState<
    Partial<Record<"original" | "signed", { path: string; fileName: string }>>
  >({});
  const [r2DetectedPathByKind, setR2DetectedPathByKind] = useState<
    Partial<Record<"original" | "signed", string>>
  >({});
  const [r2ProbeStatusByKind, setR2ProbeStatusByKind] = useState<
    Partial<Record<"original" | "signed", R2ProbeStatus>>
  >({});

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

    map.pending = { label: "قيد الانتظار", cls: "bg-slate-600" };
    map.reviewing = { label: "قيد المراجعة", cls: "bg-blue-600" };
    map.new = { label: "قيد الانتظار", cls: "bg-slate-600" };
    map.in_progress = { label: "قيد المراجعة", cls: "bg-blue-600" };
    map.resolved = { label: "موافقة أولية", cls: "bg-emerald-700" };
    map.approved = { label: "موافقة أولية", cls: "bg-green-600" };
    map.needs_account = { label: "قيد المراجعة", cls: "bg-blue-600" };
    map.waiting_client_confirmation = { label: "قيد المراجعة", cls: "bg-blue-600" };

    const key = normalizeRequestStatus(s);
    return map[key] || { label: key, cls: "bg-gray-400" };
  };

  /* =========================
  normalize for display
  ========================= */
  const normalizeForDisplay = (m: any) => {
    const hasInvestment = !!pick(m?.investmentId);
    const st = normalizeRequestStatus(pick(m?.status, "pending"));
    const sr = normalizeStageRole(pick(m?.stageRole, m?.stage, ""), st, hasInvestment);

    const fixed: any = {
      ...m,
      status: st,
      stageRole: sr,
      stage: pick(m?.stage, sr),
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

  const loadInvestmentDoc = async (investmentId: string | null) => {
    try {
      if (!investmentId) {
        setInvestmentDoc(null);
        return;
      }

      const snap = await getDoc(doc(db, "investments", investmentId));
      if (!snap.exists()) {
        setInvestmentDoc(null);
        return;
      }

      setInvestmentDoc({
        id: snap.id,
        ...(snap.data() as any),
      });
    } catch (e) {
      console.error(e);
      setInvestmentDoc(null);
    }
  };

  const activeInvestmentId = pick(selectedMessage?.investmentId, investmentDoc?.id);
  const originalPathFromDocs = pickFirstNonEmptyString(
    resolveDocPath(investmentDoc, [
      "originalContract.path",
      "contractFile.path",
      "originalContractPath",
      "originalPath",
      "contractPath",
      "documentPath",
    ]),
    resolveDocPath(contractDoc, [
      "originalContract.path",
      "contractFile.path",
      "originalContractPath",
      "originalPath",
      "contractPath",
      "documentPath",
    ]),
    resolveDocPath(selectedMessage, [
      "originalContract.path",
      "contractFile.path",
      "originalContractPath",
      "originalPath",
      "contractPath",
      "documentPath",
    ])
  );
  const signedPathFromDocs = pickFirstNonEmptyString(
    resolveDocPath(investmentDoc, [
      "signedContract.path",
      "signedContractFile.path",
      "signedContractPath",
      "signedPath",
      "signedDocumentPath",
    ]),
    resolveDocPath(contractDoc, [
      "signedContract.path",
      "signedContractFile.path",
      "signedContractPath",
      "signedPath",
      "signedDocumentPath",
    ]),
    resolveDocPath(selectedMessage, [
      "signedContract.path",
      "signedContractFile.path",
      "signedContractPath",
      "signedPath",
      "signedDocumentPath",
    ])
  );

  useEffect(() => {
    setLocalUploadedByKind({});
    setR2DetectedPathByKind({});
    setR2ProbeStatusByKind({});
  }, [activeInvestmentId]);

  useEffect(() => {
    let cancelled = false;

    if (!activeInvestmentId) {
      setR2DetectedPathByKind({});
      setR2ProbeStatusByKind({});
      return () => {
        cancelled = true;
      };
    }

    const run = async () => {
      const next: Partial<Record<"original" | "signed", string>> = {};
      const probe: Partial<Record<"original" | "signed", R2ProbeStatus>> = {};

      if (!originalPathFromDocs && !localUploadedByKind.original?.path) {
        const candidate = expectedContractPath(activeInvestmentId, "original");
        const status = candidate ? await r2ObjectStatus(candidate) : "unknown";
        probe.original = status;
        if (candidate && status === "exists") next.original = candidate;
      }

      if (!cancelled) {
        setR2DetectedPathByKind(next);
        setR2ProbeStatusByKind(probe);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    activeInvestmentId,
    originalPathFromDocs,
    signedPathFromDocs,
    localUploadedByKind,
  ]);

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
  const isInvestment = !!selectedMessage;
  const selectedRequestStatus = normalizeRequestStatus(selectedMessage?.status);
  const selectedInvestmentStatus = String(
    pick(investmentDoc?.status, selectedMessage?.investmentStatus)
  )
    .trim()
    .toLowerCase();

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

  const approveRequestAndCreateInvestment = async () => {
    if (!selectedMessage) return;

    if (myRole === "client") return toast.error("صلاحيتك عرض فقط.");
    if (isLockedFinal && myRole !== "owner") return toast.warning("الطلب مقفل.");

    if (normalizeRequestStatus(selectedMessage?.status) !== "approved") {
      return toast.warning("لا يمكن إنشاء الاستثمار قبل المراجعة والموافقة الأولية.");
    }

    const requestId = String(selectedMessage?.id || "").trim();
    const projectId = pick(
      selectedMessage?.projectId,
      selectedMessage?.project_id,
      selectedMessage?.project?.id
    );
    const investorUid = pick(
      selectedMessage?.investorUid,
      selectedMessage?.userId,
      selectedMessage?.createdByUid,
      selectedMessage?.userSnapshot?.uid
    );
    const amount =
      toNum(approvedAmount) ||
      toNum(selectedMessage?.approvedAmount) ||
      toNum(selectedMessage?.amount) ||
      toNum(selectedMessage?.requestedAmount) ||
      toNum(selectedMessage?.estimatedAmount);
    const projectTitle = pick(
      selectedMessage?.projectTitle,
      selectedMessage?.projectSnapshot?.titleAr,
      selectedMessage?.projectSnapshot?.title,
      selectedMessage?.projectSnapshot?.name
    );

    if (!requestId) return toast.error("تعذر تحديد رقم الطلب.");
    if (!projectId) return toast.error("لا يوجد مشروع مرتبط بهذا الطلب.");
    if (!investorUid) return toast.error("لا يوجد مستثمر مرتبط بهذا الطلب.");
    if (!Number.isFinite(amount) || amount <= 0)
      return toast.error("المبلغ غير صالح لإنشاء الاستثمار.");

    try {
      setApproveCreateBusy(true);

      const msgRef = doc(db, REQUESTS_COL, requestId);
      const existingInvSnap = await getDocs(
        query(collection(db, "investments"), where("requestId", "==", requestId))
      );
      const existingInvId = existingInvSnap.docs[0]?.id || "";

      let finalInvestmentId = "";

      await runTransaction(db, async (tx) => {
        const msgSnap = await tx.get(msgRef);
        if (!msgSnap.exists()) throw new Error("request_not_found");

        const msgData = msgSnap.data() as any;
        if (normalizeRequestStatus(msgData?.status) !== "approved") {
          throw new Error("request_not_initially_approved");
        }
        const linkedInvId = pick(msgData?.investmentId, existingInvId);

        if (linkedInvId) {
          finalInvestmentId = linkedInvId;
          const linkedInvRef = doc(db, "investments", linkedInvId);
          tx.set(
            linkedInvRef,
            {
              requestId,
              projectId,
              investorUid,
              userId: investorUid,
              amount,
              status: "pending_contract",
              contractStatus: "draft",
              updatedAt: serverTimestamp(),
              updatedByUid: user?.uid || null,
              updatedByEmail: user?.email || null,
            },
            { merge: true }
          );
        } else {
          const invRef = doc(collection(db, "investments"));
          finalInvestmentId = invRef.id;
          tx.set(invRef, {
            requestId,
            projectId,
            investorUid,
            userId: investorUid,
            amount,
            status: "pending_contract",
            contractStatus: "draft",
            source: "interest_request",
            projectTitle: projectTitle || null,
            projectSnapshot: selectedMessage?.projectSnapshot || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdByUid: user?.uid || null,
            createdByEmail: user?.email || null,
          });
        }

        const ev = makeEvent({
          type: "investment_created",
          title: "قبول الطلب وإنشاء الاستثمار",
          note: "تم قبول طلب الاهتمام وإنشاء سجل استثمار بانتظار العقد.",
          ...myActor(user, myRole),
          meta: {
            requestId,
            investmentId: finalInvestmentId,
            projectId,
            investorUid,
            amount,
            investmentStatus: "pending_contract",
          },
        });

        tx.update(msgRef, {
          status: "approved",
          stageRole: "investment" as StageRole,
          stage: "investment",
          approvedAmount: amount,
          investmentId: finalInvestmentId,
          investmentStatus: "pending_contract",
          contractStatus: "draft",
          investmentCreatedAt: serverTimestamp(),
          investmentCreatedByUid: user?.uid || null,
          investmentCreatedByEmail: user?.email || null,
          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,
          events: arrayUnion(ev),
          ...actionMeta(user, myRole),
        });
      });

      toast.success("تم قبول الطلب وإنشاء الاستثمار ✅");
      setSelectedMessage((prev: any) =>
        prev
          ? {
              ...prev,
              status: "approved",
              stageRole: "investment",
              stage: "investment",
              approvedAmount: amount,
              investmentId: finalInvestmentId,
              investmentStatus: "pending_contract",
              contractStatus: "draft",
            }
          : prev
      );
      loadMessages();
    } catch (e: any) {
      console.error(e);
      const errorCode = String(e?.message || "");
      if (errorCode === "request_not_initially_approved") {
        toast.error("يلزم إنهاء المراجعة والموافقة الأولية قبل إنشاء الاستثمار.");
      } else if (errorCode === "request_not_found") {
        toast.error("الطلب غير موجود أو تم حذفه.");
      } else {
        toast.error("فشل تنفيذ عملية قبول الطلب وإنشاء الاستثمار");
      }
    } finally {
      setApproveCreateBusy(false);
    }
  };

  const createContractForInvestment = async () => {
    if (!selectedMessage) return;

    if (!canAdmin) {
      toast.error("هذا الإجراء يتطلب صلاحية المدير أو المالك.");
      return;
    }

    const investmentId = String(selectedMessage?.investmentId || "").trim();
    if (!investmentId) {
      toast.error("لا يوجد investmentId مرتبط بهذا الطلب.");
      return;
    }

    if (!draftFile) {
      toast.warning("الرجاء اختيار ملف PDF");
      return;
    }

    const draftFileName = String(draftFile.name || "").toLowerCase();
    const draftFileMime = String(draftFile.type || "").toLowerCase();
    const isPdf = draftFileMime === "application/pdf" || draftFileName.endsWith(".pdf");
    if (!isPdf) {
      toast.warning("الرجاء اختيار ملف PDF");
      return;
    }

    try {
      setContractBusy(true);
      const hadSignedBeforeRevision = hasSignedContract;

      const uploaded = await uploadInvestmentDocument({
        investmentId,
        file: draftFile,
        kind: "original",
      });
      await runTransaction(db, async (tx) => {
        const msgRef = doc(db, REQUESTS_COL, selectedMessage.id);
        const invRef = doc(db, "investments", investmentId);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) {
          throw new Error("investment_not_found");
        }

        const inv = (invSnap.data() || {}) as Record<string, any>;
        const now = serverTimestamp();
        const currentVersion = toPositiveInt(
          inv?.contractVersion ?? inv?.originalContract?.version ?? inv?.contractFile?.version
        );
        const nextContractVersion = currentVersion > 0 ? currentVersion + 1 : 1;
        const hasSignedFromDoc = Boolean(
          String(inv?.signedContract?.path || "").trim() ||
            String(inv?.signedContractFile?.path || "").trim() ||
            String(inv?.signedContract?.url || "").trim() ||
            String(inv?.signedContractFile?.url || "").trim() ||
            String(inv?.signedContractPath || "").trim() ||
            String(inv?.signedPath || "").trim() ||
            String(inv?.signedDocumentPath || "").trim() ||
            String(inv?.signedContractUrl || "").trim()
        );
        const hasSigned = hadSignedBeforeRevision || hasSignedFromDoc;

        tx.set(
          invRef,
          {
            originalContract: {
              fileName: uploaded.fileName,
              path: uploaded.path,
              storagePath: uploaded.path,
              contentType: uploaded.contentType,
              uploadedAt: now,
              uploadedBy: user?.uid || null,
              version: nextContractVersion,
            },
            contractFile: {
              fileName: uploaded.fileName,
              path: uploaded.path,
              storagePath: uploaded.path,
              contentType: uploaded.contentType,
              uploadedAt: now,
              uploadedBy: user?.uid || null,
              version: nextContractVersion,
            },
            contractVersion: nextContractVersion,
            signedContract: deleteField(),
            signedContractFile: deleteField(),
            signedContractPath: deleteField(),
            signedContractUrl: deleteField(),
            signedPath: deleteField(),
            signedDocumentPath: deleteField(),
            signedAgainstContractVersion: deleteField(),
            signedContractOutdated: false,
            requiresResign: false,
            signedContractOutdatedAt: null,
            signedAt: null,
            verifiedAt: deleteField(),
            verifiedByUid: deleteField(),
            verifiedByEmail: deleteField(),
            contractStatus: hasSigned ? "pending_signature" : "sent",
            status: "signing",
            updatedAt: now,
            lastDocumentUploadAt: now,
            lastDocumentUploadBy: user?.uid || null,
          },
          { merge: true }
        );
        tx.set(
          msgRef,
          {
            stageRole: "contract",
            contractStatus: hasSigned ? "pending_signature" : "sent",
            investmentStatus: "signing",
            updatedAt: now,
            updatedByUid: user?.uid || null,
            updatedByEmail: user?.email || null,
          },
          { merge: true }
        );
      });

      setLocalUploadedByKind({
        original: { path: uploaded.path, fileName: uploaded.fileName },
      });

      toast.success("تم رفع العقد الأصلي بنجاح");
      setDraftFile(null);

      await loadInvestmentDoc(investmentId);
      await loadMessages();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "فشل الرفع");
    } finally {
      setContractBusy(false);
    }
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

  const verifySignedContract = async () => {
    if (!selectedMessage) return;

    if (!canAdmin) {
      toast.error("هذا الإجراء يتطلب صلاحية المدير أو المالك.");
      return;
    }

    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    const investmentId = String(selectedMessage?.investmentId || "").trim();
    if (!investmentId) {
      toast.error("لا يوجد استثمار مرتبط بهذا الطلب.");
      return;
    }

    try {
      setFinalizeBusy(true);
      const verifiedAt = serverTimestamp();

      await runTransaction(db, async (tx) => {
        const msgRef = doc(db, REQUESTS_COL, selectedMessage.id);
        const invRef = doc(db, "investments", investmentId);

        const [msgSnap, invSnap] = await Promise.all([tx.get(msgRef), tx.get(invRef)]);
        if (!msgSnap.exists()) throw new Error("request_not_found");
        if (!invSnap.exists()) throw new Error("investment_not_found");

        const msgData = (msgSnap.data() || {}) as Record<string, any>;
        const invData = (invSnap.data() || {}) as Record<string, any>;
        const currentInvestmentStatus = String(invData?.status || "")
          .trim()
          .toLowerCase();
        if (["active", "completed", "closed"].includes(currentInvestmentStatus)) {
          throw new Error("investment_already_activated");
        }
        const currentContractStatus = String(
          pick(invData?.contractStatus, msgData?.contractStatus, selectedMessage?.contractStatus)
        )
          .trim()
          .toLowerCase();
        if (!["under_review", "signed"].includes(currentContractStatus)) {
          throw new Error("contract_not_ready_for_verification");
        }

        const hasSignedPath = Boolean(
          pick(
            invData?.signedContract?.path,
            invData?.signedContractFile?.path,
            invData?.signedContractPath,
            invData?.signedPath,
            invData?.signedDocumentPath,
            invData?.signedContractUrl
          )
        );
        if (!hasSignedPath) {
          throw new Error("signed_contract_missing");
        }

        const originalVersion = toPositiveInt(
          invData?.contractVersion ?? invData?.originalContract?.version ?? invData?.contractFile?.version
        );
        const signedForVersion = toPositiveInt(
          invData?.signedAgainstContractVersion ??
            invData?.signedContract?.signedForVersion ??
            invData?.signedContract?.originalVersion
        );
        const outdatedFlag = toBooleanSafe(
          invData?.signedContractOutdated ?? invData?.requiresResign ?? invData?.signedContract?.isOutdated
        );
        const isSignedOutdated =
          outdatedFlag ||
          (originalVersion > 0 && signedForVersion > 0 && signedForVersion < originalVersion);
        if (isSignedOutdated) {
          throw new Error("signed_contract_outdated");
        }

        const contractId = String(
          pick(invData?.contractId, msgData?.contractId, selectedMessage?.contractId)
        ).trim();
        const contractRef = contractId ? doc(db, "contracts", contractId) : null;

        tx.set(
          invRef,
          {
            status: "signed",
            contractStatus: "approved",
            signedAt: invData?.signedAt || verifiedAt,
            verifiedAt,
            verifiedByUid: user?.uid || null,
            verifiedByEmail: user?.email || null,
            updatedAt: verifiedAt,
            updatedByUid: user?.uid || null,
            updatedByEmail: user?.email || null,
          },
          { merge: true }
        );

        if (contractRef) {
          tx.set(
            contractRef,
            {
              status: "approved",
              verifiedAt,
              verifiedByUid: user?.uid || null,
              verifiedByEmail: user?.email || null,
              updatedAt: verifiedAt,
              updatedByUid: user?.uid || null,
              updatedByEmail: user?.email || null,
            },
            { merge: true }
          );
        }

        tx.update(msgRef, {
          stageRole: "owner" as StageRole,
          contractStatus: "approved",
          investmentStatus: "signed",
          verifiedAt,
          verifiedByUid: user?.uid || null,
          verifiedByEmail: user?.email || null,
          updatedAt: verifiedAt,
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,
          events: arrayUnion(
            makeEvent({
              type: "contract_verified",
              title: "تم التحقق من العقد الموقّع",
              note: "تم اعتماد العقد الموقّع وأصبح الاستثمار جاهزًا للتفعيل النهائي.",
              ...myActor(user, myRole),
              meta: {
                messageId: selectedMessage.id,
                investmentId,
                contractStatus: "approved",
                investmentStatus: "signed",
              },
            })
          ),
          ...actionMeta(user, myRole),
        });
      });

      toast.success("تم التحقق من العقد الموقّع.");
      await loadInvestmentDoc(investmentId);
      await loadMessages();
    } catch (e: any) {
      console.error(e);
      const code = String(e?.message || "");
      if (code === "contract_not_ready_for_verification") {
        toast.error("يجب أن يرفع المستثمر العقد الموقّع أولًا قبل التحقق.");
      } else if (code === "signed_contract_missing") {
        toast.error("لا يوجد عقد موقّع صالح للتحقق.");
      } else if (code === "signed_contract_outdated") {
        toast.error("العقد الموقّع قديم ويجب رفع نسخة محدثة.");
      } else if (code === "request_not_found") {
        toast.error("الطلب غير موجود.");
      } else if (code === "investment_not_found") {
        toast.error("سجل الاستثمار غير موجود.");
      } else {
        toast.error("فشل التحقق من العقد الموقّع.");
      }
    } finally {
      setFinalizeBusy(false);
    }
  };

  const activateInvestmentAfterApproval = async () => {
    if (!selectedMessage) return;

    if (isLockedFinal) return toast.warning("الطلب مقفل.");

    const investmentId = String(selectedMessage?.investmentId || "").trim();
    if (!investmentId) {
      toast.error("لا يوجد استثمار مرتبط بهذا الطلب.");
      return;
    }

    try {
      setFinalizeBusy(true);
      const activatedAt = Timestamp.now();
      const activatedAtDate = activatedAt.toDate();
      const activatedAtServer = serverTimestamp();

      await runTransaction(db, async (tx) => {
        const msgRef = doc(db, REQUESTS_COL, selectedMessage.id);
        const invRef = doc(db, "investments", investmentId);

        const [msgSnap, invSnap] = await Promise.all([tx.get(msgRef), tx.get(invRef)]);
        if (!msgSnap.exists()) throw new Error("request_not_found");
        if (!invSnap.exists()) throw new Error("investment_not_found");

        const msgData = (msgSnap.data() || {}) as Record<string, any>;
        const invData = (invSnap.data() || {}) as Record<string, any>;
        const currentInvestmentStatus = String(invData?.status || "")
          .trim()
          .toLowerCase();
        if (["active", "completed", "closed"].includes(currentInvestmentStatus)) {
          throw new Error("investment_already_activated");
        }
        if (currentInvestmentStatus !== "signed") {
          throw new Error("investment_not_ready_for_activation");
        }

        const contractId = String(
          pick(invData?.contractId, msgData?.contractId, selectedMessage?.contractId)
        ).trim();
        const contractRef = contractId ? doc(db, "contracts", contractId) : null;
        const contractSnap = contractRef ? await tx.get(contractRef) : null;
        const contractData =
          contractSnap && contractSnap.exists()
            ? ((contractSnap.data() || {}) as Record<string, any>)
            : null;

        const currentContractStatus = String(
          pick(contractData?.status, invData?.contractStatus, msgData?.contractStatus)
        )
          .trim()
          .toLowerCase();
        if (!CONTRACTS_DISABLED && currentContractStatus !== "approved") {
          throw new Error("contract_not_ready_for_activation");
        }

        const projectId = String(
          pick(
            invData?.projectId,
            msgData?.projectId,
            msgData?.project_id,
            selectedMessage?.projectId,
            selectedMessage?.project_id
          )
        ).trim();
        const projectRef = projectId ? doc(db, "projects", projectId) : null;
        const projectSnap = projectRef ? await tx.get(projectRef) : null;
        const projectData =
          projectSnap && projectSnap.exists()
            ? ((projectSnap.data() || {}) as Record<string, any>)
            : null;

        const settingsRef = doc(db, "settings", "app");
        const settingsSnap = await tx.get(settingsRef);
        const appSettings = settingsSnap.exists()
          ? ((settingsSnap.data() || {}) as Record<string, any>)
          : null;

        const amount =
          toNum(invData?.approvedAmount) ||
          toNum(invData?.amount) ||
          toNum(msgData?.approvedAmount) ||
          toNum(msgData?.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error("missing_amount");
        }

        const activationTerms = resolveInvestmentActivationTerms({
          amount,
          investment: invData,
          project: projectData,
          appSettings,
          startAt: activatedAtDate,
        });
        const plannedEndAt = Timestamp.fromDate(activationTerms.plannedEndAt);
        const legalTermsSnapshot = {
          version: 1,
          approvedAt: activatedAt,
          principalAmount: amount,
          annualReturnPercent: activationTerms.annualReturn,
          annualReturnSource: activationTerms.annualReturnSource,
          durationMonths: activationTerms.durationMonths,
          durationSource: activationTerms.durationSource,
          startAt: activatedAt,
          endAt: plannedEndAt,
          expectedProfit: activationTerms.expectedProfit,
          formula: activationTerms.legalTermsSnapshot.formula,
          isFrozen: true,
        };
        const projectTitleAtSign =
          pick(
            projectData?.titleAr,
            projectData?.title,
            msgData?.projectTitle,
            msgData?.projectSnapshot?.titleAr,
            msgData?.projectSnapshot?.title,
            invData?.projectTitle
          ) || null;

        tx.set(
          invRef,
          {
            status: "active",
            contractStatus: "approved",
            approvedAmount: amount,
            startAt: activatedAt,
            plannedEndAt,
            annualReturnAtSign: activationTerms.annualReturn,
            durationMonthsAtSign: activationTerms.durationMonths,
            expectedProfit: activationTerms.expectedProfit,
            earnedProfit: null,
            actualEndAt: null,
            withdrawnAt: null,
            exitType: null,
            projectTitleAtSign,
            termsLockedAt: activatedAt,
            legalTermsSnapshot,
            activatedAt,
            activatedByUid: user?.uid || null,
            activatedByEmail: user?.email || null,
            finalizedAt: activatedAtServer,
            updatedAt: activatedAtServer,
            updatedByUid: user?.uid || null,
            updatedByEmail: user?.email || null,
          },
          { merge: true }
        );

        if (contractRef) {
          tx.set(
            contractRef,
            {
              status: "approved",
              amount,
              projectId: projectId || null,
              investmentId,
              requestId: selectedMessage.id,
              approvedAt: activatedAt,
              approvedByUid: user?.uid || null,
              approvedByEmail: user?.email || null,
              termsLockedAt: activatedAt,
              legalTermsSnapshot,
              legalReference: {
                source: "investment.activation",
                isFinal: true,
                version: 1,
              },
              updatedAt: activatedAtServer,
              updatedByUid: user?.uid || null,
              updatedByEmail: user?.email || null,
            },
            { merge: true }
          );
        }

        tx.update(msgRef, {
          status: "completed",
          stageRole: "completed" as StageRole,
          contractStatus: "approved",
          investmentStatus: "active",
          finalizedAt: activatedAtServer,
          finalizedByUid: user?.uid || null,
          finalizedByEmail: user?.email || null,
          updatedAt: activatedAtServer,
          updatedByUid: user?.uid || null,
          updatedByEmail: user?.email || null,
          events: arrayUnion(
            makeEvent({
              type: "finalized",
              title: "اعتماد العقد وتفعيل الاستثمار",
              note:
                "تم الاعتماد النهائي للعقد وتفعيل الاستثمار. تبدأ مدة الاستثمار وحساب الربح من وقت الاعتماد النهائي فقط.",
              ...myActor(user, myRole),
              meta: {
                messageId: selectedMessage.id,
                investmentId,
                projectId: projectId || null,
                contractStatus: "approved",
                investmentStatus: "active",
              },
            })
          ),
          ...actionMeta(user, myRole),
        });
      });

      toast.success("تم اعتماد العقد وتفعيل الاستثمار");
      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e: any) {
      console.error(e);
      const code = String(e?.message || "");
      if (code === "request_not_found") {
        toast.error("الطلب غير موجود.");
      } else if (code === "investment_not_found") {
        toast.error("سجل الاستثمار غير موجود.");
      } else if (code === "contract_not_ready_for_activation") {
        toast.error("لا يمكن تفعيل الاستثمار قبل اكتمال توقيع العقد ومراجعته.");
      } else if (code === "investment_not_ready_for_activation") {
        toast.error("يجب التحقق من العقد الموقّع قبل تفعيل الاستثمار.");
      } else if (code === "investment_already_activated") {
        toast.error("الاستثمار مفعّل مسبقًا.");
      } else if (
        code === "missing_amount" ||
        code === "missing_final_annual_return" ||
        code === "missing_final_duration_months"
      ) {
        toast.error("بيانات التفعيل النهائية غير مكتملة بعد.");
      } else {
        toast.error("فشل اعتماد العقد وتفعيل الاستثمار");
      }
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
        status: "reviewing",
        stageRole: "review" as StageRole,
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

  const originalExpectedPath = expectedContractPath(activeInvestmentId, "original");

  const originalContractPath = pick(
    localUploadedByKind.original?.path,
    originalPathFromDocs,
    r2DetectedPathByKind.original,
    !r2ProbeStatusByKind.original || r2ProbeStatusByKind.original === "unknown"
      ? originalExpectedPath
      : ""
  );
  const originalContractUrlFromDocs = pickFirstNonEmptyString(
    resolveDocPath(investmentDoc, ["originalContract.url", "contractFile.url", "contractUrl"]),
    resolveDocPath(contractDoc, ["originalContract.url", "contractFile.url", "contractUrl"]),
    resolveDocPath(selectedMessage, ["originalContract.url", "contractFile.url", "contractUrl"])
  );
  const originalContractFileName = pickFirstNonEmptyString(
    localUploadedByKind.original?.fileName,
    resolveDocPath(investmentDoc, ["originalContract.fileName", "contractFile.fileName"]),
    resolveDocPath(contractDoc, ["originalContract.fileName", "contractFile.fileName"]),
    resolveDocPath(selectedMessage, ["originalContract.fileName", "contractFile.fileName"]),
    originalContractPath ? getFileNameFromPath(originalContractPath) : ""
  );
  const hasOriginalContract = Boolean(originalContractPath || originalContractUrlFromDocs);
  const originalContractViewUrl = pick(
    buildR2DownloadUrl(originalContractPath, false),
    originalContractUrlFromDocs
  );
  const originalContractDownloadUrl = pick(
    buildR2DownloadUrl(originalContractPath, true),
    originalContractUrlFromDocs
  );

  const signedContractPath = pick(
    localUploadedByKind.signed?.path,
    signedPathFromDocs
  );
  const signedContractUrlFromDocs = pickFirstNonEmptyString(
    resolveDocPath(investmentDoc, ["signedContract.url", "signedContractFile.url", "signedContractUrl"]),
    resolveDocPath(contractDoc, ["signedContract.url", "signedContractFile.url", "signedContractUrl"]),
    resolveDocPath(selectedMessage, ["signedContract.url", "signedContractFile.url", "signedContractUrl"])
  );
  const signedContractFileName = pickFirstNonEmptyString(
    localUploadedByKind.signed?.fileName,
    resolveDocPath(investmentDoc, ["signedContract.fileName", "signedContractFile.fileName"]),
    resolveDocPath(contractDoc, ["signedContract.fileName", "signedContractFile.fileName"]),
    resolveDocPath(selectedMessage, ["signedContract.fileName", "signedContractFile.fileName"]),
    signedContractPath ? getFileNameFromPath(signedContractPath) : ""
  );
  const hasSignedContract = Boolean(signedContractPath || signedContractUrlFromDocs);
  const signedContractViewUrl = pick(
    buildR2DownloadUrl(signedContractPath, false),
    signedContractUrlFromDocs
  );
  const signedContractDownloadUrl = pick(
    buildR2DownloadUrl(signedContractPath, true),
    signedContractUrlFromDocs
  );

  const originalUploadedAt = resolveDocValue(investmentDoc, ["originalContract.uploadedAt", "contractFile.uploadedAt"]) ??
    resolveDocValue(contractDoc, ["originalContract.uploadedAt", "contractFile.uploadedAt"]) ??
    resolveDocValue(selectedMessage, ["originalContract.uploadedAt", "contractFile.uploadedAt"]);
  const signedUploadedAt = resolveDocValue(investmentDoc, ["signedContract.uploadedAt", "signedContractFile.uploadedAt"]) ??
    resolveDocValue(contractDoc, ["signedContract.uploadedAt", "signedContractFile.uploadedAt"]) ??
    resolveDocValue(selectedMessage, ["signedContract.uploadedAt", "signedContractFile.uploadedAt"]);

  const originalVersion = Number(
    pick(
      resolveDocValue(investmentDoc, ["contractVersion", "originalContract.version", "contractFile.version"]),
      resolveDocValue(contractDoc, ["contractVersion", "originalContract.version", "contractFile.version"]),
      resolveDocValue(selectedMessage, ["contractVersion", "originalContract.version", "contractFile.version"]),
      0
    )
  );
  const signedForVersion = Number(
    pick(
      resolveDocValue(investmentDoc, [
        "signedContract.signedForVersion",
        "signedContract.originalVersion",
        "signedAgainstContractVersion",
      ]),
      resolveDocValue(contractDoc, [
        "signedContract.signedForVersion",
        "signedContract.originalVersion",
        "signedAgainstContractVersion",
      ]),
      resolveDocValue(selectedMessage, [
        "signedContract.signedForVersion",
        "signedContract.originalVersion",
        "signedAgainstContractVersion",
      ]),
      0
    )
  );
  const outdatedFlag = String(
    pick(
      resolveDocValue(investmentDoc, ["signedContractOutdated", "requiresResign", "signedContract.isOutdated"]),
      resolveDocValue(contractDoc, ["signedContractOutdated", "requiresResign", "signedContract.isOutdated"]),
      resolveDocValue(selectedMessage, ["signedContractOutdated", "requiresResign", "signedContract.isOutdated"]),
      ""
    )
  )
    .trim()
    .toLowerCase();
  const isSignedOutdatedByVersion =
    hasSignedContract &&
    Number.isFinite(originalVersion) &&
    Number.isFinite(signedForVersion) &&
    originalVersion > 0 &&
    signedForVersion > 0 &&
    signedForVersion < originalVersion;
  const originalUploadedAtDate = toDateSafe(originalUploadedAt);
  const signedUploadedAtDate = toDateSafe(signedUploadedAt);
  const isSignedOutdatedByTime =
    hasSignedContract &&
    !!originalUploadedAtDate &&
    !!signedUploadedAtDate &&
    originalUploadedAtDate.getTime() > signedUploadedAtDate.getTime();
  const isSignedOutdatedByFlag =
    outdatedFlag === "true" || outdatedFlag === "1" || outdatedFlag === "yes" || outdatedFlag === "on";
  const isSignedOutdated =
    hasSignedContract &&
    (isSignedOutdatedByFlag || isSignedOutdatedByVersion || isSignedOutdatedByTime);

  const storedContractStatus = String(
    pick(investmentDoc?.contractStatus, contractDoc?.status, selectedMessage?.contractStatus)
  )
    .trim()
    .toLowerCase();
  const needsFreshSignedContract = storedContractStatus === "pending_signature" || isSignedOutdated;
  const hasCurrentSignedContract = hasSignedContract && !needsFreshSignedContract;
  const contractStatusValue = needsFreshSignedContract
    ? "pending_signature"
    : hasCurrentSignedContract
    ? ["approved", "under_review"].includes(storedContractStatus)
      ? storedContractStatus
      : "signed"
    : hasOriginalContract
    ? storedContractStatus && storedContractStatus !== "draft"
      ? storedContractStatus
      : "sent"
    : storedContractStatus || "draft";

  const needsNewSignedContract = CONTRACTS_DISABLED ? false : !hasCurrentSignedContract;
  const contractFollowupChipLabel =
    hasOriginalContract && !hasCurrentSignedContract && contractStatusValue !== "pending_signature"
    ? "بانتظار توقيع المستثمر"
    : "";

  const canStartRequestReview =
    !!selectedMessage &&
    myRole !== "client" &&
    !isLockedFinal &&
    !selectedMessage?.investmentId &&
    selectedRequestStatus === "pending";
  const canInitialApproveRequest =
    !!selectedMessage &&
    myRole !== "client" &&
    !isLockedFinal &&
    !selectedMessage?.investmentId &&
    selectedRequestStatus === "reviewing";
  const canCreateInvestmentFromRequest =
    !!selectedMessage &&
    myRole !== "client" &&
    !isLockedFinal &&
    !selectedMessage?.investmentId &&
    selectedRequestStatus === "approved";
  const canVerifySignedContract =
    !!selectedMessage &&
    canAdmin &&
    !isLockedFinal &&
    !!selectedMessage?.investmentId &&
    ["signing", "signed"].includes(selectedInvestmentStatus) &&
    ["under_review", "signed"].includes(contractStatusValue) &&
    hasCurrentSignedContract &&
    !needsNewSignedContract;
  const canFinalize = CONTRACTS_DISABLED
    ? !!selectedMessage?.investmentId && selectedInvestmentStatus === "signed"
    : isInvestment &&
      !!selectedMessage?.investmentId &&
      selectedInvestmentStatus === "signed" &&
      contractStatusValue === "approved" &&
      hasCurrentSignedContract &&
      !needsNewSignedContract;

  const canApproveAndCreateInvestment = canCreateInvestmentFromRequest;

  const startRequestReview = async () => {
    if (!selectedMessage) return;
    await moveTo({
      status: "reviewing",
      stageRole: "review",
      note: "تم بدء مراجعة طلب الاستثمار.",
    });
  };

  const initialApproveRequest = async () => {
    if (!selectedMessage) return;

    const ev = makeEvent({
      type: "request_initial_approved",
      title: "تمت الموافقة الأولية على الطلب",
      note: "اكتملت مراجعة الطلب وأصبح جاهزًا لإنشاء سجل الاستثمار.",
      ...myActor(user, myRole),
      meta: { messageId: selectedMessage.id, status: "approved", stageRole: "investment" },
    });

    try {
      await updateDoc(doc(db, REQUESTS_COL, selectedMessage.id), {
        status: "approved",
        stageRole: "investment" as StageRole,
        initialApprovedAt: serverTimestamp(),
        initialApprovedByUid: user?.uid || null,
        initialApprovedByEmail: user?.email || null,
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
              status: "approved",
              stageRole: "investment",
              events: Array.isArray(prev.events) ? [...prev.events, ev] : [ev],
            }
          : prev
      );

      toast.success("تمت الموافقة الأولية على الطلب.");
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث حالة الطلب.");
    }
  };

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
                                setInternalNotes(String(normalizedOne.internalNotes || ""));
                                setApprovedAmount(
                                  normalizedOne?.approvedAmount != null
                                    ? String(normalizedOne.approvedAmount)
                                    : normalizedOne?.estimatedAmount != null
                                    ? String(normalizedOne.estimatedAmount)
                                    : ""
                                );

                                await loadContractDoc(normalizedOne?.contractId || null);
                                await loadInvestmentDoc(normalizedOne?.investmentId || null);

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
                          onClick={handleSaveNotesOnly}
                          disabled={isLockedFinal || myRole === "client"}
                        >
                          <CheckCircle2 className="w-4 h-4 ml-2" />
                          حفظ الملاحظات
                        </Button>
                        {canStartRequestReview ? (
                          <Button
                            className="bg-yellow-700 hover:bg-yellow-800"
                            onClick={startRequestReview}
                            disabled={isLockedFinal}
                          >
                            <Clock3 className="w-4 h-4 ml-2" />
                            بدء المراجعة
                          </Button>
                        ) : null}

                        {canInitialApproveRequest ? (
                          <Button
                            className="bg-indigo-700 hover:bg-indigo-800"
                            onClick={initialApproveRequest}
                            disabled={isLockedFinal}
                          >
                            <ShieldCheck className="w-4 h-4 ml-2" />
                            موافقة أولية
                          </Button>
                        ) : null}

                        {canCreateInvestmentFromRequest ? (
                          <Button
                            className="bg-blue-700 hover:bg-blue-800"
                            onClick={approveRequestAndCreateInvestment}
                            disabled={approveCreateBusy || isLockedFinal}
                          >
                            {approveCreateBusy ? (
                              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 ml-2" />
                            )}
                            إنشاء الاستثمار
                          </Button>
                        ) : null}

                        {canVerifySignedContract ? (
                          <Button
                            className="bg-amber-700 hover:bg-amber-800"
                            onClick={verifySignedContract}
                            disabled={isLockedFinal || finalizeBusy}
                          >
                            {finalizeBusy ? (
                              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-4 h-4 ml-2" />
                            )}
                            اعتماد العقد الموقّع
                          </Button>
                        ) : null}

                        {/* ✅ Step Machine Buttons */}
                        {selectedMessage ? (
                          <>
                            {/* 1) Staff -> Accountant */}
                            {false && canStaffActions &&
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
                            {false && canOwnerAccountantActions &&
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
                            {false && myRole === "client" &&
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
                            {false && myRole === "owner" &&
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
                        {false && isInvestment ? (
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
                            onClick={activateInvestmentAfterApproval}
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

                        {false && canApproveAndCreateInvestment ? (
                          <Button
                            className="bg-blue-700 hover:bg-blue-800"
                            onClick={approveRequestAndCreateInvestment}
                            disabled={approveCreateBusy || isLockedFinal}
                          >
                            {approveCreateBusy ? (
                              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 ml-2" />
                            )}
                            قبول الطلب وإنشاء الاستثمار
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

                  <Card className="rsg-card">
                    <CardHeader>
                      <CardTitle>مستندات الاستثمار (Cloudflare R2)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <InfoRow
                        label="رقم الاستثمار"
                        value={String(selectedMessage?.investmentId || "â€”")}
                      />

                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 sm:px-4">
                        <div className="text-xs text-muted-foreground mb-2">حالة العقد</div>
                        <div className="flex items-center flex-wrap gap-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getContractStatusClass(
                              contractStatusValue
                            )}`}
                          >
                            {getContractStatusLabel(contractStatusValue)}
                          </span>
                          {contractFollowupChipLabel ? (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              {contractFollowupChipLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold">العقد الأصلي</div>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                                hasOriginalContract
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              {hasOriginalContract ? "مرفوع" : "لا يوجد"}
                            </span>
                          </div>

                          {hasOriginalContract ? (
                            <>
                              <div className="text-sm font-medium text-slate-900 break-words">
                                {originalContractFileName}
                              </div>
                              <div className="flex flex-wrap gap-2 pt-1">
                                {originalContractViewUrl ? (
                                  <a href={originalContractViewUrl} target="_blank" rel="noreferrer">
                                    <Button variant="outline" size="sm" className="gap-2">
                                      <Eye className="w-4 h-4" />
                                      عرض
                                    </Button>
                                  </a>
                                ) : null}
                                {originalContractDownloadUrl ? (
                                  <a href={originalContractDownloadUrl} target="_blank" rel="noreferrer">
                                    <Button variant="outline" size="sm" className="gap-2">
                                      <Download className="w-4 h-4" />
                                      تنزيل
                                    </Button>
                                  </a>
                                ) : null}
                              </div>
                              {needsFreshSignedContract ? (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                  تم تحديث العقد الأصلي، وسيحتاج المستثمر إلى توقيع النسخة الجديدة.
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground">لا يوجد</div>
                          )}
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold">العقد الموقّع</div>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                                hasCurrentSignedContract
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              {hasCurrentSignedContract ? "مرفوع" : "لا يوجد"}
                            </span>
                          </div>

                          {hasCurrentSignedContract ? (
                            <>
                              <div className="text-sm font-medium text-slate-900 break-words">
                                {signedContractFileName}
                              </div>
                              <div className="flex flex-wrap gap-2 pt-1">
                                {signedContractViewUrl ? (
                                  <a href={signedContractViewUrl} target="_blank" rel="noreferrer">
                                    <Button variant="outline" size="sm" className="gap-2">
                                      <Eye className="w-4 h-4" />
                                      عرض
                                    </Button>
                                  </a>
                                ) : null}
                                {signedContractDownloadUrl ? (
                                  <a href={signedContractDownloadUrl} target="_blank" rel="noreferrer">
                                    <Button variant="outline" size="sm" className="gap-2">
                                      <Download className="w-4 h-4" />
                                      تنزيل
                                    </Button>
                                  </a>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              {needsFreshSignedContract
                                ? "لم يتم رفع عقد موقّع من المستثمر بعد."
                                : "لم يتم رفع العقد الموقّع بعد"}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-4">
                        <div className="text-xs text-muted-foreground mb-3">رفع المستندات</div>

                        <div className="grid grid-cols-1 gap-4">
                          <div className="rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3 sm:px-4 space-y-3">
                            <ContractFilePicker
                              buttonLabel="رفع العقد الأصلي (PDF)"
                              file={draftFile}
                              onFileChange={setDraftFile}
                              disabled={contractBusy || !selectedMessage?.investmentId}
                            />
                            <Button
                              className="w-full bg-blue-700 hover:bg-blue-800"
                              onClick={createContractForInvestment}
                              disabled={
                                contractBusy ||
                                !selectedMessage?.investmentId ||
                                !draftFile ||
                                !canAdmin
                              }
                            >
                              {contractBusy ? (
                                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                              ) : (
                                <Upload className="w-4 h-4 ml-2" />
                              )}
                              رفع العقد الأصلي
                            </Button>
                          </div>
                        </div>
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
