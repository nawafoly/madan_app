// client/src/pages/client/InvestmentDetails.tsx
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useRoute } from "wouter";

import ClientLayout from "@/components/ClientLayout";
import ContractFilePicker from "@/components/ContractFilePicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

import { useAuth } from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";
import {
  uploadInvestmentDocument,
  type InvestmentDocumentKind,
  type UploadDocumentResult,
} from "@/lib/documentUploadService";

import {
  Building2,
  Clock3,
  Phone,
  Mail,
  MessageSquare,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { getInvestmentProfitSnapshot } from "@shared/investmentProfit";
import {
  getInvestorActivationMessage,
  isInvestmentActivatedStatus,
} from "@shared/investmentLifecycle";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

type TimelineEvent = {
  id?: string;
  type?: string;
  title?: string;
  note?: string | null;
  byRole?: string | null;
  byEmail?: string | null;
  at?: any;
  meta?: Record<string, any>;
  _source?: "message" | "investment" | "contract";
};

function toDateSafe(v: any) {
  try {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

function formatDateTimeAR(v: any) {
  const d = toDateSafe(v);
  return d ? d.toLocaleString("ar-SA") : "—";
}

const CONTACT = {
  whatsapp: "https://wa.me/966500000000",
  phone: "tel:0549010366",
  email: "mailto:info@maedin.sa",
};

function statusLabel(status: string) {
  const map: any = {
    pending_review: ["قيد المراجعة", "bg-blue-600"],
    pending: ["قيد المراجعة", "bg-blue-600"],
    approved: ["بانتظار التفعيل", "bg-amber-600"],
    active: ["نشط", "bg-emerald-700"],
    rejected: ["مرفوض", "bg-red-600"],
    completed: ["مكتمل", "bg-gray-600"],
    pending_contract: ["العقد قيد التجهيز", "bg-purple-600"],
    signing: ["بانتظار توقيعك", "bg-indigo-600"],
    signed: ["بانتظار الاعتماد", "bg-amber-600"],
  };
  return map[status] || ["قيد المراجعة", "bg-blue-600"];
}

function getFileNameFromPath(path: any) {
  const raw = String(path || "").trim();
  if (!raw) return "â€”";
  const normalized = raw.replace(/\\/g, "/");
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
  const url = buildR2DownloadUrl(path, false);
  if (!url) return "unknown";
  try {
    const response = await fetch(url, { method: "GET" });
    try {
      await response.body?.cancel();
    } catch {
      // ignore cancel errors
    }
    if (response.ok) return "exists";
    if (response.status === 404) return "missing";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function pickFirstNonEmptyString(...values: any[]) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

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

function resolveDocPath(
  source: any,
  candidates: string[]
) {
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

async function tryGetDocSafe(colName: string, docId: string) {
  const normalizedId = String(docId || "").trim();
  if (!normalizedId) return null;
  try {
    const snap = await getDoc(doc(db, colName, normalizedId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as any) };
  } catch (error) {
    console.error(`${colName}_read_error`, error);
    return null;
  }
}

function toPositiveInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function getContractStatusMeta(status: any) {
  const s = String(status || "").trim().toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "مسودة", cls: "bg-slate-600" },
    sent: { label: "مرسل", cls: "bg-blue-600" },
    pending_signature: { label: "بانتظار توقيعك", cls: "bg-indigo-600" },
    signed: { label: "موقّع", cls: "bg-emerald-700" },
    issued: { label: "مرسل", cls: "bg-blue-600" },
    signed_uploaded: { label: "موقّع", cls: "bg-emerald-700" },
    under_review: { label: "قيد المراجعة", cls: "bg-amber-600" },
    approved: { label: "معتمد", cls: "bg-green-700" },
  };

  if (map[s]) return map[s];
  if (s) return { label: String(status), cls: "bg-slate-600" };
  return { label: "â€”", cls: "bg-slate-500" };
}

function stageHelp(status: string) {
  // ✅ كل مرحلة فيها “وش تسوي الآن؟” + خيارات تواصل
  if (status === "signing" || status === "pending_contract") {
    return {
      title: "مطلوب إجراء منك",
      desc: "إذا احتجت مساعدة في إكمال الإجراء أو إرسال مستند، تواصل معنا مباشرة.",
      emphasis: true,
    };
  }
  if (status === "pending" || status === "pending_review") {
    return {
      title: "طلبك تحت المراجعة",
      desc: "نراجع التفاصيل وسيتم إشعارك عند أي تحديث.",
      emphasis: false,
    };
  }
  if (status === "approved") {
    return {
      title: "تمت الموافقة",
      desc: "سيتم التواصل معك لاستكمال الإجراءات، وإذا احتجت تسريع التواصل معنا.",
      emphasis: false,
    };
  }
  if (status === "active") {
    return {
      title: "استثمارك نشط",
      desc: "تابع التحديثات من هنا، وإذا عندك أي استفسار نحن جاهزين.",
      emphasis: false,
    };
  }
  if (status === "rejected") {
    return {
      title: "تم رفض الطلب",
      desc: "تقدر تتواصل معنا لمعرفة التفاصيل أو تقديم طلب جديد.",
      emphasis: true,
    };
  }
  if (status === "completed") {
    return {
      title: "تم إكمال الاستثمار",
      desc: "إذا تحتاج أي مستند أو استفسار بعد الإكمال، تواصل معنا.",
      emphasis: false,
    };
  }
  return {
    title: "تحديثات الاستثمار",
    desc: "تابع الحالة وخط السير من هنا.",
    emphasis: false,
  };
}

function formatMoneyAR(
  value: number | null | undefined,
  minimumFractionDigits = 0,
  maximumFractionDigits = minimumFractionDigits
) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${amount.toLocaleString("ar-SA", {
    minimumFractionDigits,
    maximumFractionDigits,
  })} ر.س`;
}

function formatDateAR(value: Date | null | undefined) {
  return value ? value.toLocaleDateString("ar-SA") : "—";
}

function formatPercentAR(value: number | null | undefined, digits = 2) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return "—";
  return `${percent.toLocaleString("ar-SA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}%`;
}

function formatDurationLabel(months: number | null | undefined) {
  const totalMonths = Number(months);
  if (!Number.isFinite(totalMonths) || totalMonths <= 0) return "—";

  const roundedMonths = Math.round(totalMonths * 10) / 10;
  if (Math.abs(roundedMonths - 12) < 0.05) return "سنة";
  if (roundedMonths > 12 && Math.abs(roundedMonths % 12) < 0.05) {
    return `${(roundedMonths / 12).toLocaleString("ar-SA", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })} سنة`;
  }

  return `${roundedMonths.toLocaleString("ar-SA", {
    minimumFractionDigits: roundedMonths % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })} شهر`;
}

function liveProfitDecimals(profitPerSecond: number, isLive: boolean) {
  if (!isLive) return 2;
  if (profitPerSecond >= 0.01) return 2;
  if (profitPerSecond >= 0.001) return 3;
  return 4;
}

function performanceNote(metrics: ReturnType<typeof getInvestmentProfitSnapshot>) {
  if (!metrics.hasPerformanceTerms) {
    return "سيظهر عداد الربح بعد تثبيت مبلغ الاستثمار ونسبة الربح وتاريخ البداية والنهاية في النظام.";
  }
  if (metrics.freezeReason === "rejected" || metrics.freezeReason === "cancelled") {
    return "هذا الاستثمار غير نشط، لذلك لا يتم احتساب ربح جارٍ له.";
  }
  if (metrics.freezeReason === "not_started") {
    return "سيبدأ عداد الربح تلقائيًا عند دخول تاريخ بداية الاستثمار.";
  }
  if (metrics.freezeReason === "completed") {
    return "تم إقفال الاستثمار وتثبيت الربح النهائي بناءً على الحالة النهائية المسجلة.";
  }
  if (metrics.freezeReason === "timeline_ended") {
    return "اكتملت مدة المشروع، لذلك توقف العداد عند الربح النهائي المتوقع.";
  }
  return "الربح الجاري للعرض فقط، ويتم احتسابه مباشرة من الوقت المنقضي بين بداية الاستثمار ونهاية المشروع.";
}

export default function InvestmentDetails() {
  const { user } = useAuth();
  const [, params] = useRoute("/client/investments/:id");
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [investment, setInvestment] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [messageDoc, setMessageDoc] = useState<any>(null);
  const [contractDoc, setContractDoc] = useState<any>(null);
  const [signedUploadFile, setSignedUploadFile] = useState<File | null>(null);
  const [signedUploadBusy, setSignedUploadBusy] = useState(false);
  const [localUploadedByKind, setLocalUploadedByKind] = useState<
    Partial<Record<InvestmentDocumentKind, UploadDocumentResult>>
  >({});
  const [r2DetectedPathByKind, setR2DetectedPathByKind] = useState<
    Partial<Record<"original" | "signed", string>>
  >({});
  const [r2ProbeStatusByKind, setR2ProbeStatusByKind] = useState<
    Partial<Record<"original" | "signed", R2ProbeStatus>>
  >({});
  const [profitNow, setProfitNow] = useState(() => new Date());

  useEffect(() => {
    if (!user?.uid || !id) return;

    let unsubInv: null | (() => void) = null;

    const run = async () => {
      try {
        setLoading(true);

        const invRef = doc(db, "investments", id);

        unsubInv = onSnapshot(
          invRef,
          (snap) => {
            if (!snap.exists()) {
              setInvestment(null);
              setProject(null);
              setMessageDoc(null);
              setContractDoc(null);
              setLoading(false);
              return;
            }

            const invData = (snap.data() || {}) as Record<string, any>;
            const inv = { id: snap.id, ...invData } as Record<string, any>;
            setInvestment(inv);

            // ✅ أمنياً: نتأكد أنه يخص نفس المستثمر
            if (String(inv.investorUid || "") !== String(user.uid)) {
              setInvestment({ __forbidden: true });
              setProject(null);
              setMessageDoc(null);
              setContractDoc(null);
              setLoading(false);
              return;
            }

            setLoading(false);
          },
          (err) => {
            console.error("investment_read_error", err);
            setLoading(false);
          }
        );
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };

    run();

    return () => {
      if (unsubInv) unsubInv();
    };
  }, [user?.uid, id]);

  useEffect(() => {
    const projectId = String(investment?.projectId || "").trim();
    if (!projectId || investment?.__forbidden) {
      setProject(null);
      return;
    }

    const ref = doc(db, "projects", projectId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProject(snap.exists() ? { id: snap.id, ...(snap.data() as any) } : null);
      },
      (error) => {
        console.error("project_snapshot_error", error);
        setProject(null);
      }
    );

    return () => {
      unsub();
    };
  }, [investment?.projectId, investment?.__forbidden]);

  useEffect(() => {
    const investmentId = String(investment?.id || "").trim();
    const investorUid = String(investment?.investorUid || "").trim();
    if (!investmentId || !user?.uid || investment?.__forbidden || investorUid !== String(user.uid)) {
      setMessageDoc(null);
      return;
    }

    let cancelled = false;
    let unsub: null | (() => void) = null;

    const attachRequestSnapshot = (colName: "interest_requests" | "messages", docId: string) => {
      const ref = doc(db, colName, docId);
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (cancelled) return;
          setMessageDoc(snap.exists() ? { id: snap.id, ...(snap.data() as any) } : null);
        },
        (error) => {
          console.error(`${colName}_snapshot_error`, error);
          if (!cancelled) setMessageDoc(null);
        }
      );
    };

    const resolveRequestDoc = async () => {
      setMessageDoc(null);

      const candidates: Array<{ col: "interest_requests" | "messages"; id: string }> = [
        { col: "interest_requests", id: String(investment?.requestId || "").trim() },
        { col: "interest_requests", id: String(investment?.sourceMessageId || "").trim() },
        { col: "messages", id: String(investment?.sourceMessageId || "").trim() },
      ];

      const seen = new Set<string>();
      for (const candidate of candidates) {
        if (!candidate.id) continue;
        const key = `${candidate.col}:${candidate.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const docData = await tryGetDocSafe(candidate.col, candidate.id);
        if (cancelled) return;
        if (!docData) continue;

        setMessageDoc(docData);
        attachRequestSnapshot(candidate.col, candidate.id);
        return;
      }

      try {
        const requestQuery = query(
          collection(db, "interest_requests"),
          where("investmentId", "==", investmentId),
          limit(1)
        );
        const requestSnap = await getDocs(requestQuery);
        if (cancelled) return;
        const firstMatch = requestSnap.docs[0];
        if (firstMatch) {
          setMessageDoc({ id: firstMatch.id, ...(firstMatch.data() as any) });
          attachRequestSnapshot("interest_requests", firstMatch.id);
          return;
        }
      } catch (error) {
        console.error("interest_requests_lookup_error", error);
      }

      if (!cancelled) setMessageDoc(null);
    };

    void resolveRequestDoc();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [investment?.id, investment?.requestId, investment?.sourceMessageId, investment?.investorUid, investment?.__forbidden, user?.uid]);

  useEffect(() => {
    const contractId = String(investment?.contractId || "").trim();
    if (!contractId || investment?.__forbidden) {
      setContractDoc(null);
      return;
    }

    let cancelled = false;
    let unsub: null | (() => void) = null;

    const run = async () => {
      const contract = await tryGetDocSafe("contracts", contractId);
      if (cancelled) return;
      if (!contract) {
        setContractDoc(null);
        return;
      }

      setContractDoc(contract);
      const ref = doc(db, "contracts", contractId);
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (cancelled) return;
          setContractDoc(snap.exists() ? { id: snap.id, ...(snap.data() as any) } : null);
        },
        (error) => {
          console.error("contract_snapshot_error", error);
          if (!cancelled) setContractDoc(null);
        }
      );
    };

    void run();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [investment?.contractId, investment?.__forbidden]);

  const mergedTimeline = useMemo(() => {
    const list: TimelineEvent[] = [];

    const pushEvent = (event: TimelineEvent | null | undefined) => {
      if (!event) return;
      const atMs = toDateSafe(event.at)?.getTime() ?? 0;
      const stableId = String(
        event.id || `${event._source || "system"}:${event.type || "update"}:${atMs}:${event.title || ""}`
      );
      if (list.some((existing) => String(existing.id || "") === stableId)) return;
      list.push({ ...event, id: stableId });
    };

    const pushEvents = (src: TimelineEvent["_source"], docAny: any) => {
      const evs = Array.isArray(docAny?.events) ? docAny.events : [];
      evs.forEach((ev: any) =>
        pushEvent({
          ...(ev || {}),
          _source: src,
        })
      );
    };

    pushEvents("investment", investment);
    pushEvents("message", messageDoc);
    pushEvents("contract", contractDoc);

    const hasType = (...types: string[]) =>
      list.some((ev) => types.includes(String(ev?.type || "").trim().toLowerCase()));

    const requestCreatedAt =
      toDateSafe(messageDoc?.createdAt) || toDateSafe(investment?.createdAt);
    if (requestCreatedAt && !hasType("interest_request_created", "request_created", "created")) {
      pushEvent({
        _source: "message",
        type: "request_created",
        title: "تم استلام الطلب",
        note: "تم إنشاء طلب الاهتمام الاستثماري وتسجيله داخل النظام.",
        at: requestCreatedAt,
      });
    }

    const investmentCreatedAt =
      toDateSafe(messageDoc?.investmentCreatedAt) || toDateSafe(investment?.createdAt);
    if (investmentCreatedAt && !hasType("investment_created")) {
      pushEvent({
        _source: "investment",
        type: "investment_created",
        title: "تم إنشاء سجل الاستثمار",
        note: "تم إنشاء سجل الاستثمار وربطه بالطلب تمهيدًا لتجهيز العقد.",
        at: investmentCreatedAt,
      });
    }

    const originalContractUploadedAt =
      toDateSafe(investment?.originalContract?.uploadedAt) ||
      toDateSafe(investment?.contractFile?.uploadedAt) ||
      toDateSafe(contractDoc?.originalContract?.uploadedAt) ||
      toDateSafe(contractDoc?.contractFile?.uploadedAt) ||
      toDateSafe(messageDoc?.originalContract?.uploadedAt) ||
      toDateSafe(messageDoc?.contractFile?.uploadedAt);
    if (
      originalContractUploadedAt &&
      !hasType("contract_uploaded", "contract_prepared", "original_contract_uploaded")
    ) {
      pushEvent({
        _source: "investment",
        type: "contract_uploaded",
        title: "تم تجهيز العقد",
        note: "تم رفع العقد الأصلي وإتاحته للمراجعة والتوقيع.",
        at: originalContractUploadedAt,
      });
    }

    const signedContractAt =
      toDateSafe(investment?.signedAt) ||
      toDateSafe(investment?.signedContract?.uploadedAt) ||
      toDateSafe(investment?.signedContractFile?.uploadedAt) ||
      toDateSafe(contractDoc?.signedContract?.uploadedAt) ||
      toDateSafe(contractDoc?.signedContractFile?.uploadedAt) ||
      toDateSafe(messageDoc?.signedContract?.uploadedAt) ||
      toDateSafe(messageDoc?.signedContractFile?.uploadedAt);
    if (signedContractAt && !hasType("contract_signed", "signed_uploaded")) {
      pushEvent({
        _source: "investment",
        type: "contract_signed",
        title: "تم استلام العقد الموقّع",
        note: "تم رفع العقد الموقّع من المستثمر وبانتظار التحقق والاعتماد النهائي.",
        at: signedContractAt,
      });
    }

    const contractVerifiedAt =
      toDateSafe(investment?.verifiedAt) ||
      toDateSafe(contractDoc?.verifiedAt) ||
      toDateSafe(messageDoc?.verifiedAt);
    if (contractVerifiedAt && !hasType("contract_verified")) {
      pushEvent({
        _source: "investment",
        type: "contract_verified",
        title: "تم اعتماد العقد",
        note: "تم التحقق من العقد الموقّع وأصبح الاستثمار جاهزًا للتفعيل.",
        at: contractVerifiedAt,
      });
    }

    const activatedAt =
      toDateSafe(investment?.activatedAt) || toDateSafe(investment?.startAt);
    if (
      activatedAt &&
      isInvestmentActivatedStatus(investment?.status) &&
      !hasType("finalized", "investment_activated", "activated")
    ) {
      pushEvent({
        _source: "investment",
        type: "investment_activated",
        title: "تم تفعيل الاستثمار",
        note: "بدأت مدة الاستثمار واحتساب الربح من هذا الوقت.",
        at: activatedAt,
      });
    }

    if (!list.length) {
      pushEvent({
        _source: "investment",
        type: "created",
        title: "تم إنشاء الاستثمار",
        note: "تم إنشاء سجل الاستثمار، ولا توجد أحداث إضافية مسجلة بعد.",
        at: investment?.createdAt || messageDoc?.createdAt || contractDoc?.createdAt,
      });
    }

    // sort asc
    list.sort((a, b) => {
      const ta = toDateSafe(a.at)?.getTime() ?? 0;
      const tb = toDateSafe(b.at)?.getTime() ?? 0;
      return ta - tb;
    });

    return list;
  }, [investment, messageDoc, contractDoc]);

  const projectProfitFallback = useMemo(
    () =>
      project
        ? {
            annualReturn: project?.annualReturn ?? null,
            durationMonths: project?.durationMonths ?? project?.duration ?? null,
            plannedEndAt: project?.plannedEndAt ?? null,
          }
        : null,
    [project]
  );

  const profitMetrics = useMemo(
    () =>
      getInvestmentProfitSnapshot(investment, {
        now: profitNow,
        projectFallback: projectProfitFallback,
      }),
    [investment, profitNow, projectProfitFallback]
  );

  useEffect(() => {
    setProfitNow(new Date());
  }, [investment?.id, project?.id]);

  useEffect(() => {
    if (!profitMetrics.isLive) return;

    const timer = window.setInterval(() => {
      setProfitNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [profitMetrics.isLive]);


  const status = String(investment?.status || "pending_review");
  const [stLabel, stCls] = statusLabel(status);
  const baseHelp = stageHelp(status);
  const investmentId = String(investment?.id || "").trim();
  const currentProfitDigits = liveProfitDecimals(
    profitMetrics.profitPerSecond,
    profitMetrics.isLive
  );
  const profitProgressPercent = Math.max(
    0,
    Math.min(100, profitMetrics.progressRatio * 100)
  );
  const profitStatusMeta = profitMetrics.isLive
    ? {
        label: "يتحدث تلقائيًا",
        cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
      }
    : profitMetrics.isFrozen
      ? {
          label: "مثبت",
          cls: "border-slate-200 bg-slate-100 text-slate-700",
        }
      : {
          label: "بانتظار التفعيل",
          cls: "border-amber-200 bg-amber-50 text-amber-700",
        };

  // Display source priority:
  // 1) live upload result from this page
  // 2) stored fields (if available)
  // 3) detected object in R2 using deterministic contract path
  const resolvedOriginalPathFromDocs = pickFirstNonEmptyString(
    localUploadedByKind.original?.path,
    resolveDocPath(investment, [
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
    resolveDocPath(messageDoc, ["originalContract.path", "contractFile.path", "contractPath"])
  );

  const resolvedSignedPathFromDocs = pickFirstNonEmptyString(
    localUploadedByKind.signed?.path,
    resolveDocPath(investment, [
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
    resolveDocPath(messageDoc, ["signedContract.path", "signedContractFile.path", "signedContractPath"])
  );

  useEffect(() => {
    let cancelled = false;

    const investmentId = String(investment?.id || "").trim();
    if (!investmentId) {
      setR2DetectedPathByKind({});
      return () => {
        cancelled = true;
      };
    }

    const run = async () => {
      const next: Partial<Record<"original" | "signed", string>> = {};
      const probe: Partial<Record<"original" | "signed", R2ProbeStatus>> = {};

      if (!resolvedOriginalPathFromDocs) {
        const candidate = expectedContractPath(investmentId, "original");
        const status = candidate ? await r2ObjectStatus(candidate) : "unknown";
        probe.original = status;
        if (candidate && status === "exists") {
          next.original = candidate;
        }
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
  }, [investment?.id, resolvedOriginalPathFromDocs, resolvedSignedPathFromDocs]);

  const originalExpectedPath = expectedContractPath(investmentId, "original");

  const originalPath = pickFirstNonEmptyString(
    resolvedOriginalPathFromDocs,
    r2DetectedPathByKind.original,
    !r2ProbeStatusByKind.original || r2ProbeStatusByKind.original === "unknown"
      ? originalExpectedPath
      : ""
  );
  const originalDirectUrl = pickFirstNonEmptyString(
    resolveDocPath(investment, ["originalContract.url", "contractFile.url", "contractUrl"]),
    resolveDocPath(contractDoc, ["originalContract.url", "contractFile.url", "contractUrl"]),
    resolveDocPath(messageDoc, ["originalContract.url", "contractFile.url", "contractUrl"])
  );
  const originalViewUrl = pickFirstNonEmptyString(buildR2DownloadUrl(originalPath, false), originalDirectUrl);
  const originalDownloadUrl = pickFirstNonEmptyString(
    buildR2DownloadUrl(originalPath, true),
    originalDirectUrl
  );
  const originalName = pickFirstNonEmptyString(
    localUploadedByKind.original?.fileName,
    resolveDocPath(investment, ["originalContract.fileName", "contractFile.fileName"]),
    resolveDocPath(contractDoc, ["originalContract.fileName", "contractFile.fileName"]),
    resolveDocPath(messageDoc, ["originalContract.fileName", "contractFile.fileName"]),
    getFileNameFromPath(originalPath || originalDirectUrl)
  );
  const hasOriginalContract = Boolean(originalPath || originalDirectUrl);

  const signedPath = resolvedSignedPathFromDocs;
  const signedDirectUrl = pickFirstNonEmptyString(
    resolveDocPath(investment, ["signedContract.url", "signedContractFile.url", "signedContractUrl"]),
    resolveDocPath(contractDoc, ["signedContract.url", "signedContractFile.url", "signedContractUrl"]),
    resolveDocPath(messageDoc, ["signedContract.url", "signedContractFile.url", "signedContractUrl"])
  );
  const signedViewUrl = pickFirstNonEmptyString(buildR2DownloadUrl(signedPath, false), signedDirectUrl);
  const signedDownloadUrl = pickFirstNonEmptyString(buildR2DownloadUrl(signedPath, true), signedDirectUrl);
  const signedName = pickFirstNonEmptyString(
    localUploadedByKind.signed?.fileName,
    resolveDocPath(investment, ["signedContract.fileName", "signedContractFile.fileName"]),
    resolveDocPath(contractDoc, ["signedContract.fileName", "signedContractFile.fileName"]),
    resolveDocPath(messageDoc, ["signedContract.fileName", "signedContractFile.fileName"]),
    getFileNameFromPath(signedPath || signedDirectUrl)
  );
  const hasSignedContract = Boolean(signedPath || signedDirectUrl);

  const originalUploadedAt = resolveDocValue(investment, ["originalContract.uploadedAt", "contractFile.uploadedAt"]) ??
    resolveDocValue(contractDoc, ["originalContract.uploadedAt", "contractFile.uploadedAt"]) ??
    resolveDocValue(messageDoc, ["originalContract.uploadedAt", "contractFile.uploadedAt"]);
  const signedUploadedAt = resolveDocValue(investment, ["signedContract.uploadedAt", "signedContractFile.uploadedAt"]) ??
    resolveDocValue(contractDoc, ["signedContract.uploadedAt", "signedContractFile.uploadedAt"]) ??
    resolveDocValue(messageDoc, ["signedContract.uploadedAt", "signedContractFile.uploadedAt"]);

  const originalVersion = Number(
    pickFirstNonEmptyString(
      resolveDocPath(investment, ["contractVersion", "originalContract.version", "contractFile.version"]),
      resolveDocPath(contractDoc, ["contractVersion", "originalContract.version", "contractFile.version"]),
      resolveDocPath(messageDoc, ["contractVersion", "originalContract.version", "contractFile.version"]),
      "0"
    )
  );
  const signedForVersion = Number(
    pickFirstNonEmptyString(
      resolveDocPath(investment, [
        "signedContract.signedForVersion",
        "signedContract.originalVersion",
        "signedAgainstContractVersion",
      ]),
      resolveDocPath(contractDoc, [
        "signedContract.signedForVersion",
        "signedContract.originalVersion",
        "signedAgainstContractVersion",
      ]),
      resolveDocPath(messageDoc, [
        "signedContract.signedForVersion",
        "signedContract.originalVersion",
        "signedAgainstContractVersion",
      ]),
      "0"
    )
  );
  const outdatedFlag = String(
    pickFirstNonEmptyString(
      resolveDocPath(investment, ["signedContractOutdated", "requiresResign", "signedContract.isOutdated"]),
      resolveDocPath(contractDoc, ["signedContractOutdated", "requiresResign", "signedContract.isOutdated"]),
      resolveDocPath(messageDoc, ["signedContractOutdated", "requiresResign", "signedContract.isOutdated"]),
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

  const storedContractStatus = String(investment?.contractStatus || "").trim().toLowerCase();
  const needsFreshSignedContract = storedContractStatus === "pending_signature" || isSignedOutdated;
  const hasCurrentSignedContract = hasSignedContract && !needsFreshSignedContract;
  const contractStatusValue = String(
    needsFreshSignedContract
      ? "pending_signature"
      : hasCurrentSignedContract
      ? ["approved", "under_review"].includes(storedContractStatus)
        ? storedContractStatus
        : "signed"
      : hasOriginalContract
      ? storedContractStatus && storedContractStatus !== "draft"
        ? storedContractStatus
        : "sent"
      : storedContractStatus || "draft"
  );
  const contractStatusNormalized = contractStatusValue.trim().toLowerCase();
  const canInvestorUploadByStatus =
    contractStatusNormalized === "sent" || contractStatusNormalized === "pending_signature";
  const isOwnerInvestor = String(investment?.investorUid || "").trim() === String(user?.uid || "").trim();
  const contractStatusMeta = getContractStatusMeta(contractStatusValue);
  const investmentActivated = isInvestmentActivatedStatus(status);
  const activationMessage = getInvestorActivationMessage(status, contractStatusValue);
  const help = investmentActivated
    ? baseHelp
    : {
        title: activationMessage.title,
        desc: activationMessage.description,
        emphasis: false,
      };
  const canUploadSigned = Boolean(
    investmentId &&
      isOwnerInvestor &&
      canInvestorUploadByStatus &&
      !hasCurrentSignedContract
  );
  const originalDisplayName =
    originalName && originalName !== "—" && originalName !== "â€”" ? originalName : "original.pdf";
  const signedDisplayName =
    signedName && signedName !== "—" && signedName !== "â€”" ? signedName : "signed.pdf";
  const signedSectionEmptyMessage = needsFreshSignedContract
    ? "لم يتم رفع عقد موقّع من المستثمر بعد."
    : "لم يتم رفع العقد الموقّع بعد. يرجى تنزيل العقد الأصلي وتوقيعه ثم رفع النسخة الموقّعة هنا.";

  if (!user) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>تفاصيل الاستثمار</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">الرجاء تسجيل الدخول أولاً.</p>
            <Link href="/login">
              <Button className="w-full">تسجيل الدخول</Button>
            </Link>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  if (loading) {
    return (
      <ClientLayout className="py-12">
        <div className="py-20 text-center">جاري التحميل...</div>
      </ClientLayout>
    );
  }

  if (!investment) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>تفاصيل الاستثمار</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">لم يتم العثور على الاستثمار.</p>
            <Link href="/client/dashboard">
              <Button className="w-full">رجوع</Button>
            </Link>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  if (investment?.__forbidden) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>غير مصرح</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              لا يمكنك عرض هذا الاستثمار لأنه لا يخص حسابك.
            </p>
            <Link href="/client/dashboard">
              <Button className="w-full">رجوع</Button>
            </Link>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  const refreshInvestmentDoc = async () => {
    try {
      if (!id) return;
      const snap = await getDoc(doc(db, "investments", id));
      if (!snap.exists()) return;
      setInvestment({ id: snap.id, ...(snap.data() as any) });
    } catch (e) {
      console.error("refresh_investment_error", e);
    }
  };

  const handleInvestorSignedUpload = async () => {
    if (!investmentId) {
      toast.error("فشل الرفع");
      return;
    }

    if (!isOwnerInvestor) {
      toast.error("غير مصرح");
      return;
    }

    if (!canInvestorUploadByStatus && !isSignedOutdated) {
      toast.error("فشل الرفع");
      return;
    }

    if (!signedUploadFile) {
      toast.warning("الرجاء اختيار ملف PDF");
      return;
    }

    const signedFileName = String(signedUploadFile.name || "").toLowerCase();
    const signedFileMime = String(signedUploadFile.type || "").toLowerCase();
    const isPdf = signedFileMime === "application/pdf" || signedFileName.endsWith(".pdf");
    if (!isPdf) {
      toast.warning("الرجاء اختيار ملف PDF");
      return;
    }

    try {
      setSignedUploadBusy(true);
      const uploaded = await uploadInvestmentDocument({
        investmentId,
        file: signedUploadFile,
        kind: "signed",
      });
      const invRef = doc(db, "investments", investmentId);
      const latestInvSnap = await getDoc(invRef);
      const latestInv = latestInvSnap.exists() ? (latestInvSnap.data() as Record<string, any>) : {};
      const signedForVersion = toPositiveInt(
        latestInv?.contractVersion ??
          latestInv?.originalContract?.version ??
          latestInv?.contractFile?.version ??
          originalVersion
      ) || 1;
      const now = serverTimestamp();
      await updateDoc(invRef, {
        signedContract: {
          fileName: uploaded.fileName,
          path: uploaded.path,
          storagePath: uploaded.path,
          contentType: uploaded.contentType,
          uploadedAt: now,
          uploadedBy: user?.uid || null,
          signedForVersion,
          originalVersion: signedForVersion,
          isOutdated: false,
          outdatedAt: null,
          outdatedByOriginalVersion: null,
        },
        signedContractFile: {
          fileName: uploaded.fileName,
          path: uploaded.path,
          storagePath: uploaded.path,
          contentType: uploaded.contentType,
          uploadedAt: now,
          uploadedBy: user?.uid || null,
          signedForVersion,
        },
        signedAgainstContractVersion: signedForVersion,
        signedContractOutdated: false,
        requiresResign: false,
        signedContractOutdatedAt: null,
        status: "signed",
        contractStatus: "under_review",
        signedAt: now,
        lastDocumentUploadAt: now,
        lastDocumentUploadBy: user?.uid || null,
      });
      setLocalUploadedByKind((prev) => ({
        ...prev,
        [uploaded.kind]: uploaded,
      }));
      setSignedUploadFile(null);
      await refreshInvestmentDoc();
      toast.success("تم رفع العقد الموقّع بنجاح");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "فشل الرفع");
    } finally {
      setSignedUploadBusy(false);
    }
  };

  return (
    <ClientLayout className="py-12">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold">تفاصيل الاستثمار</h1>
              <Badge className={stCls}>{stLabel}</Badge>
            </div>

            <div className="mt-2 text-muted-foreground">
              {project?.titleAr || investment?.projectTitle || "—"}
            </div>
          </div>

          <Link href="/client/dashboard">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              رجوع
            </Button>
          </Link>
        </div>

        {/* Stage helper + contact */}
        <Card className={help.emphasis ? "border-primary/30" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              {help.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{help.desc}</p>

            <div className="flex flex-wrap gap-2">
              <a href={CONTACT.whatsapp} target="_blank" rel="noreferrer">
                <Button className="gap-2">
                  <MessageSquare className="w-4 h-4" />
                  واتساب
                </Button>
              </a>

              <a href={CONTACT.phone}>
                <Button variant="outline" className="gap-2">
                  <Phone className="w-4 h-4" />
                  اتصال
                </Button>
              </a>

              <a href={CONTACT.email}>
                <Button variant="outline" className="gap-2">
                  <Mail className="w-4 h-4" />
                  إيميل
                </Button>
              </a>

              <Link href="/contact">
                <Button variant="outline" className="gap-2">
                  تواصل معنا
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {investmentActivated ? (
          <Card className="overflow-hidden border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-white">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-700" />
                  أرباح استثمارك
                </CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  {performanceNote(profitMetrics)}
                </p>
              </div>

              <Badge
                variant="outline"
                className={`w-fit border ${profitStatusMeta.cls}`}
              >
                {profitStatusMeta.label}
              </Badge>
            </CardHeader>

            <CardContent className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-2xl border border-emerald-200/70 bg-white/90 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">ربحك حتى الآن</div>
                    <div className="text-4xl font-bold tracking-tight text-emerald-700 tabular-nums">
                      {formatMoneyAR(
                        profitMetrics.currentProfit,
                        currentProfitDigits,
                        currentProfitDigits
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-right">
                    <div className="text-xs text-muted-foreground">من الربح المتوقع</div>
                    <div className="text-lg font-semibold text-emerald-700 tabular-nums">
                      {formatPercentAR(profitProgressPercent, 2)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>التقدم الزمني للاستثمار</span>
                    <span className="tabular-nums">
                      {formatPercentAR(profitProgressPercent, 2)}
                    </span>
                  </div>
                  <Progress value={profitProgressPercent} className="h-2.5" />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <PerformanceMetric
                    label="الربح المتوقع"
                    value={formatMoneyAR(profitMetrics.expectedProfit, 2, 2)}
                  />
                  <PerformanceMetric
                    label="تاريخ نهاية المشروع"
                    value={formatDateAR(profitMetrics.displayEndAt)}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <PerformanceMetric
                  label="استثمارك"
                  value={formatMoneyAR(profitMetrics.principalAmount, 0, 0)}
                />
                <PerformanceMetric
                  label="نسبة الربح"
                  value={formatPercentAR(profitMetrics.returnPercent, 2)}
                  note={
                    profitMetrics.annualReturnPercent != null
                      ? `المعدل السنوي المثبت ${formatPercentAR(
                          profitMetrics.annualReturnPercent,
                          2
                        )}`
                      : undefined
                  }
                />
                <PerformanceMetric
                  label="مدة المشروع"
                  value={formatDurationLabel(profitMetrics.durationMonths)}
                  note={
                    profitMetrics.startAt || profitMetrics.displayEndAt
                      ? `${formatDateAR(profitMetrics.startAt)} - ${formatDateAR(
                          profitMetrics.displayEndAt
                        )}`
                      : undefined
                  }
                />
                <PerformanceMetric
                  label="حالة الاستثمار"
                  value={<Badge className={stCls}>{stLabel}</Badge>}
                />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-white">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <CardTitle className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-amber-700" />
                  لم يبدأ الاستثمار بعد
                </CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  {activationMessage.description}
                </p>
              </div>

              <Badge
                variant="outline"
                className="w-fit border border-amber-200 bg-amber-50 text-amber-700"
              >
                بانتظار الاعتماد النهائي
              </Badge>
            </CardHeader>

            <CardContent className="grid gap-3 md:grid-cols-3">
              <PerformanceMetric
                label="حالة الاستثمار"
                value={<Badge className={stCls}>{stLabel}</Badge>}
              />
              <PerformanceMetric
                label="حالة العقد"
                value={<Badge className={contractStatusMeta.cls}>{contractStatusMeta.label}</Badge>}
              />
              <PerformanceMetric
                label="استثمارك"
                value={formatMoneyAR(profitMetrics.principalAmount, 0, 0)}
              />
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          {/* Left: Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="w-5 h-5" />
                خط السير (Timeline)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mergedTimeline.length ? (
                <TimelineView events={mergedTimeline} />
              ) : (
                <div className="text-sm text-muted-foreground">
                  لا توجد أحداث مسجلة بعد.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                ملخص
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="المبلغ" value={formatMoneyAR(profitMetrics.principalAmount, 0, 0)} />
              {investmentActivated ? (
                <>
                  <InfoRow label="الربح المتوقع" value={formatMoneyAR(profitMetrics.expectedProfit, 2, 2)} />
                  <InfoRow
                    label="ربحك حتى الآن"
                    value={formatMoneyAR(
                      profitMetrics.currentProfit,
                      currentProfitDigits,
                      currentProfitDigits
                    )}
                  />
                  <InfoRow label="تاريخ نهاية المشروع" value={formatDateAR(profitMetrics.displayEndAt)} />
                </>
              ) : (
                <>
                  <InfoRow label="حالة العقد" value={<Badge className={contractStatusMeta.cls}>{contractStatusMeta.label}</Badge>} />
                  <InfoRow label="بدء الاستثمار" value="لم يبدأ بعد" />
                </>
              )}
              <InfoRow label="تاريخ الإنشاء" value={investment?.createdAt ? formatDateTimeAR(investment.createdAt) : "—"} />
              <InfoRow label="Project ID" value={investment?.projectId || "—"} />
              <InfoRow label="Investment ID" value={investment?.id || "—"} />

              <Separator />

              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">مستندات الاستثمار (Cloudflare R2)</div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-xs text-muted-foreground">حالة العقد:</div>
                  <Badge className={contractStatusMeta.cls}>{contractStatusMeta.label}</Badge>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                    <div className="text-sm font-semibold">العقد الأصلي</div>
                    {hasOriginalContract ? (
                      <>
                        <div className="font-semibold break-words">{originalDisplayName}</div>
                        <div className="flex flex-wrap gap-2">
                          {originalViewUrl ? (
                            <a href={originalViewUrl} target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm">
                                عرض
                              </Button>
                            </a>
                          ) : null}
                          {originalDownloadUrl ? (
                            <a href={originalDownloadUrl} target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm">
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
                      <div className="text-xs text-muted-foreground">لا يوجد عقد أصلي مرفوع حالياً.</div>
                    )}
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                    <div className="text-sm font-semibold">العقد الموقّع</div>

                    {hasCurrentSignedContract ? (
                      <>
                        <div className="font-semibold break-words">{signedDisplayName}</div>
                        <div className="flex flex-wrap gap-2">
                          {signedViewUrl ? (
                            <a href={signedViewUrl} target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm">
                                عرض
                              </Button>
                            </a>
                          ) : null}
                          {signedDownloadUrl ? (
                            <a href={signedDownloadUrl} target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm">
                                تنزيل
                              </Button>
                            </a>
                          ) : null}
                        </div>
                      </>
                    ) : null}

                    {!hasCurrentSignedContract ? (
                      <div className="space-y-3 border-t border-border/60 pt-3">
                        <div className="text-xs text-muted-foreground">{signedSectionEmptyMessage}</div>
                        <ContractFilePicker
                          buttonLabel="رفع العقد الموقّع (PDF)"
                          file={signedUploadFile}
                          onFileChange={setSignedUploadFile}
                          disabled={signedUploadBusy || !canUploadSigned}
                        />
                        <Button
                          className="w-full"
                          onClick={handleInvestorSignedUpload}
                          disabled={signedUploadBusy || !canUploadSigned || !signedUploadFile}
                        >
                          {signedUploadBusy ? (
                            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 ml-2" />
                          )}
                          رفع العقد الموقّع
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ClientLayout>
  );
}

/* =========================
   UI Helpers
========================= */

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

function PerformanceMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white/90 p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold leading-7">{value}</div>
      {note ? (
        <div className="mt-2 text-xs leading-5 text-muted-foreground">{note}</div>
      ) : null}
    </div>
  );
}

function TimelineView({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="relative space-y-3">
      <div className="absolute right-[10px] top-2 bottom-2 w-px bg-border" />

      {events.map((ev, idx) => {
        const date = formatDateTimeAR(ev.at);
        const srcLabel =
          ev._source === "investment"
            ? "استثمار"
            : ev._source === "message"
              ? "طلب"
              : ev._source === "contract"
                ? "عقد"
                : "—";

        return (
          <div key={ev.id || idx} className="relative pr-7">
            <div className="absolute right-[6px] top-[6px] w-2.5 h-2.5 rounded-full bg-primary" />

            <div className="rounded-xl border bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{ev.title || "تحديث"}</div>
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
                <span className="px-2 py-0.5 rounded-full bg-muted">{srcLabel}</span>
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
