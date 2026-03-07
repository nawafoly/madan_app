// client/src/pages/client/InvestmentDetails.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";

import ClientLayout from "@/components/ClientLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

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
} from "lucide-react";
import { toast } from "sonner";

import {
  doc,
  onSnapshot,
  getDoc,
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
    approved: ["تمت الموافقة", "bg-green-600"],
    active: ["نشط", "bg-emerald-700"],
    rejected: ["مرفوض", "bg-red-600"],
    completed: ["مكتمل", "bg-gray-600"],
    pending_contract: ["بانتظار مستند", "bg-purple-600"],
    signing: ["بانتظار إجراء منك", "bg-indigo-600"],
    signed: ["تم الإجراء", "bg-green-700"],
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

function getContractStatusMeta(status: any) {
  const s = String(status || "").trim().toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "مسودة", cls: "bg-slate-600" },
    sent: { label: "مرسل", cls: "bg-blue-600" },
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

  useEffect(() => {
    if (!user?.uid || !id) return;

    let unsubInv: null | (() => void) = null;

    const run = async () => {
      try {
        setLoading(true);

        const invRef = doc(db, "investments", id);

        unsubInv = onSnapshot(
          invRef,
          async (snap) => {
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
              setLoading(false);
              return;
            }

            // ✅ load project (مرة واحدة كل تحديث)
            if (inv.projectId) {
              const pSnap = await getDoc(doc(db, "projects", String(inv.projectId)));
              setProject(pSnap.exists() ? { id: pSnap.id, ...pSnap.data() } : null);
            } else {
              setProject(null);
            }

            // ✅ load source message (إن وجد)
            if (inv.sourceMessageId) {
              const mSnap = await getDoc(doc(db, "messages", String(inv.sourceMessageId)));
              setMessageDoc(mSnap.exists() ? { id: mSnap.id, ...mSnap.data() } : null);
            } else {
              setMessageDoc(null);
            }

            // ✅ contract optional
            if (inv.contractId) {
              const cSnap = await getDoc(doc(db, "contracts", String(inv.contractId)));
              setContractDoc(cSnap.exists() ? { id: cSnap.id, ...cSnap.data() } : null);
            } else {
              setContractDoc(null);
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

  const mergedTimeline = useMemo(() => {
    const list: TimelineEvent[] = [];

    const pushEvents = (src: TimelineEvent["_source"], docAny: any) => {
      const evs = Array.isArray(docAny?.events) ? docAny.events : [];
      evs.forEach((ev: any) =>
        list.push({
          ...(ev || {}),
          _source: src,
          id: ev?.id || `${src}-${Math.random().toString(16).slice(2)}`,
        })
      );
    };

    pushEvents("investment", investment);
    pushEvents("message", messageDoc);
    pushEvents("contract", contractDoc);

    // sort asc
    list.sort((a, b) => {
      const ta = toDateSafe(a.at)?.getTime() ?? 0;
      const tb = toDateSafe(b.at)?.getTime() ?? 0;
      return ta - tb;
    });

    return list;
  }, [investment, messageDoc, contractDoc]);


  const status = String(investment?.status || "pending_review");
  const [stLabel, stCls] = statusLabel(status);
  const help = stageHelp(status);
  const investmentId = String(investment?.id || "").trim();

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

      if (!resolvedSignedPathFromDocs) {
        const candidate = expectedContractPath(investmentId, "signed");
        const status = candidate ? await r2ObjectStatus(candidate) : "unknown";
        probe.signed = status;
        if (candidate && status === "exists") {
          next.signed = candidate;
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
  const signedExpectedPath = expectedContractPath(investmentId, "signed");

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

  const signedPath = pickFirstNonEmptyString(
    resolvedSignedPathFromDocs,
    r2DetectedPathByKind.signed,
    !r2ProbeStatusByKind.signed || r2ProbeStatusByKind.signed === "unknown"
      ? signedExpectedPath
      : ""
  );
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

  const contractStatusValue = String(
    investment?.contractStatus || (hasSignedContract ? "signed" : hasOriginalContract ? "sent" : "draft")
  );
  const contractStatusMeta = getContractStatusMeta(contractStatusValue);
  const canUploadSigned = Boolean(investmentId && hasOriginalContract && !hasSignedContract);

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

    if (!hasOriginalContract) {
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
              <InfoRow label="المبلغ" value={investment?.amount != null ? `${Number(investment.amount).toLocaleString()} ر.س` : "—"} />
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

                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">العقد الأصلي</div>
                    <Badge variant="outline">{hasOriginalContract ? "مرفوع" : "لا يوجد"}</Badge>
                  </div>
                  {hasOriginalContract ? (
                    <div className="mt-1.5 space-y-2">
                      <div className="font-semibold break-words">{originalName}</div>
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
                    </div>
                  ) : (
                    <div className="mt-1.5 text-xs text-muted-foreground">لا يوجد</div>
                  )}
                </div>

                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">العقد الموقّع</div>
                    <Badge variant="outline">{hasSignedContract ? "مرفوع" : "لا يوجد"}</Badge>
                  </div>
                  {hasSignedContract ? (
                    <div className="mt-1.5 space-y-2">
                      <div className="font-semibold break-words">{signedName}</div>
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
                    </div>
                  ) : (
                    <div className="mt-1.5 text-xs text-muted-foreground">لم يتم رفع العقد الموقّع بعد</div>
                  )}
                </div>

                {investmentId && !hasSignedContract ? (
                  <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
                    <div className="text-xs text-muted-foreground">رفع العقد الموقّع</div>
                    <Input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setSignedUploadFile(e.target.files?.[0] ?? null)}
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
