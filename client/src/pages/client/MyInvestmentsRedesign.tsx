import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

import ClientLayout from "@/components/ClientLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";
import { buildR2DownloadUrl } from "@/lib/documentUploadService";
import {
  formatCurrencyShort,
  formatDateEN,
  formatDateTimeEN,
  formatNumberEN,
} from "@/lib/formatters";
import { getUserDisplayName } from "@/lib/investorIdentity";
import { deriveInvestmentStage } from "@/lib/investmentStage";
import { getRoleDisplayLabel } from "@/lib/ownerAccounts";
import { buildProjectsMap, getProjectDisplayTitle } from "@/lib/projectDisplay";
import { normalizeLinkId } from "@/lib/requestInvestmentLink";
import { resolveUserAccountStatus } from "@/lib/userAccountStatus";
import { cn } from "@/lib/utils";
import {
  getClientContractStatusMeta,
  getClientInvestmentStatusMeta,
} from "@/lib/workflowStatusMeta";
import { normalizeWorkflowStatus } from "@shared/investmentLifecycle";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CircleOff,
  Clock3,
  Download,
  Eye,
  FileText,
  History,
  LayoutGrid,
  Mail,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  Timestamp,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

type Investment = any;
type Project = any;
type InterestRequest = any;

type PortfolioTab =
  | "overview"
  | "requests"
  | "active"
  | "completed"
  | "documents";

type BucketKey =
  | "under_review"
  | "awaiting_signature"
  | "active"
  | "completed"
  | "cancelled";

type StatusPill = {
  label: string;
  className: string;
};

type DocumentLink = {
  id: "original" | "signed";
  label: string;
  fileName: string;
  viewUrl: string;
  downloadUrl: string;
  uploadedAt: Date | null;
};

type RequestRow = {
  kind: "request";
  id: string;
  projectTitle: string;
  referenceLabel: string;
  bucketKey: BucketKey;
  statusPill: StatusPill;
  workflowPill: StatusPill;
  amount: number | null;
  requestDate: Date | null;
  lastUpdatedAt: Date | null;
  sortDate: Date | null;
  actionHref: string;
  actionLabel: string;
  summary: string;
};

type InvestmentRow = {
  kind: "investment";
  id: string;
  projectTitle: string;
  referenceLabel: string;
  bucketKey: BucketKey;
  statusPill: StatusPill;
  workflowPill: StatusPill;
  contractPill: StatusPill | null;
  amount: number;
  requestDate: Date | null;
  lastUpdatedAt: Date | null;
  sortDate: Date | null;
  detailsHref: string;
  contractHref: string | null;
  documents: DocumentLink[];
  summary: string;
};

type PortfolioRow = RequestRow | InvestmentRow;

type BucketMeta = {
  title: string;
  shortTitle: string;
  description: string;
  className: string;
  borderClassName: string;
  accentClassName: string;
  icon: LucideIcon;
  tab: Exclude<PortfolioTab, "overview" | "documents">;
};

const EMPTY = "-";

const BUCKET_META: Record<BucketKey, BucketMeta> = {
  under_review: {
    title: "طلباتي الاستثمارية (تحت الطلب / قيد المراجعة)",
    shortTitle: "تحت الطلب",
    description: "طلبات أو سجلات ما زالت في المراجعة الأولية.",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    borderClassName: "border-amber-200/80",
    accentClassName: "from-amber-500/15 via-amber-100/60 to-white",
    icon: BriefcaseBusiness,
    tab: "requests",
  },
  awaiting_signature: {
    title: "بانتظار التوقيع / تجهيز العقد",
    shortTitle: "بانتظار التوقيع",
    description: "سجلات وصلت إلى مرحلة العقد وتحتاج توقيعًا أو متابعة.",
    className: "border-sky-200 bg-sky-50 text-sky-800",
    borderClassName: "border-sky-200/80",
    accentClassName: "from-sky-500/15 via-sky-100/60 to-white",
    icon: ReceiptText,
    tab: "requests",
  },
  active: {
    title: "استثماراتي النشطة",
    shortTitle: "نشطة",
    description: "استثمارات مفعّلة أو موقعة وجاهزة للمتابعة التشغيلية.",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    borderClassName: "border-emerald-200/80",
    accentClassName: "from-emerald-500/15 via-emerald-100/60 to-white",
    icon: TrendingUp,
    tab: "active",
  },
  completed: {
    title: "الاستثمارات المكتملة / المنتهية",
    shortTitle: "مكتملة",
    description: "استثمارات اكتملت مدتها أو أغلقت رسميًا.",
    className: "border-slate-300 bg-slate-100 text-slate-800",
    borderClassName: "border-slate-200/90",
    accentClassName: "from-slate-400/15 via-slate-100/70 to-white",
    icon: History,
    tab: "completed",
  },
  cancelled: {
    title: "الملغية / المرفوضة",
    shortTitle: "ملغية",
    description: "طلبات أو استثمارات تم رفضها أو إيقافها.",
    className: "border-rose-200 bg-rose-50 text-rose-800",
    borderClassName: "border-rose-200/80",
    accentClassName: "from-rose-500/15 via-rose-100/60 to-white",
    icon: CircleOff,
    tab: "requests",
  },
};

function toDateSafe(value: unknown) {
  try {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value : null;
    }
    if (value instanceof Timestamp) return value.toDate();
    if (typeof (value as { seconds?: unknown })?.seconds === "number") {
      return new Date(Number((value as { seconds: number }).seconds) * 1000);
    }
    const date = new Date(String(value));
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

function formatDateAR(value: unknown) {
  return formatDateEN(toDateSafe(value));
}

function formatDateTimeAR(value: unknown) {
  return formatDateTimeEN(toDateSafe(value));
}

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function readNestedValue(source: any, path: string) {
  const keys = String(path || "")
    .split(".")
    .map((value) => value.trim())
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
    const value = pickText(readNestedValue(source, candidate));
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

function latestDate(...values: unknown[]) {
  let result: Date | null = null;
  values.forEach((value) => {
    const date = value instanceof Date ? value : toDateSafe(value);
    if (!date) return;
    if (!result || date.getTime() > result.getTime()) result = date;
  });
  return result;
}

function sortRowsByDate<T extends { sortDate: Date | null }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftTime = left.sortDate?.getTime() ?? 0;
    const rightTime = right.sortDate?.getTime() ?? 0;
    return rightTime - leftTime;
  });
}

function normalizeStatusKey(status: unknown) {
  return normalizeWorkflowStatus(status);
}

function normalizeLabel(value: string) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^\u0600-\u06FFA-Za-z0-9]/g, "")
    .toLowerCase();
}

function isDistinctLabel(a: string, b: string) {
  return normalizeLabel(a) !== normalizeLabel(b);
}

function formatReference(prefix: string, id: string) {
  const value = String(id || "").trim();
  if (!value) return prefix;
  return `${prefix} #${value.slice(-6).toUpperCase()}`;
}

function shouldIgnoreFirestoreError(error: unknown) {
  const code = String((error as any)?.code || "").toLowerCase();
  const message = String((error as any)?.message || "").toLowerCase();
  return code.includes("permission-denied") || message.includes("permission-denied");
}

function logFirestoreBackgroundError(scope: string, error: unknown) {
  if (shouldIgnoreFirestoreError(error)) return;
  console.error(scope, error);
}

function getAccountBadge(user: any) {
  const { isActive } = resolveUserAccountStatus(user);
  return isActive
    ? {
        label: "الحساب نشط",
        className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
        icon: ShieldCheck,
      }
    : {
        label: "الحساب غير نشط",
        className: "border-slate-400/25 bg-slate-400/10 text-slate-100",
        icon: CircleOff,
      };
}

function getWorkflowPill(status: unknown): StatusPill {
  const key = normalizeStatusKey(status);
  const label = getClientInvestmentStatusMeta(status || "pending_review").label;

  if (key === "active") {
    return { label, className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (["completed", "closed", "ended", "finished"].includes(key)) {
    return { label, className: "border-slate-300 bg-slate-100 text-slate-700" };
  }
  if (["pending", "pending_review", "reviewing", "new", "in_progress"].includes(key)) {
    return { label, className: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  if (["pending_contract", "signing", "signed", "approved", "awaiting_signature", "pending_signature"].includes(key)) {
    return { label, className: "border-sky-200 bg-sky-50 text-sky-700" };
  }
  if (["cancelled", "rejected"].includes(key)) {
    return { label, className: "border-rose-200 bg-rose-50 text-rose-700" };
  }
  return { label, className: "border-slate-200 bg-slate-50 text-slate-600" };
}

function getContractPill(status: unknown): StatusPill | null {
  const key = normalizeStatusKey(status);
  if (!key) return null;
  const label = getClientContractStatusMeta(status).label;

  if (["draft", "generated", "contract_ready", "sent", "issued"].includes(key)) {
    return { label, className: "border-sky-200 bg-sky-50 text-sky-700" };
  }
  if (["awaiting_signature", "pending_signature"].includes(key)) {
    return { label, className: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  if (["signed", "signed_uploaded", "under_review", "pending_approval", "submitted_for_review", "uploaded"].includes(key)) {
    return { label, className: "border-violet-200 bg-violet-50 text-violet-700" };
  }
  if (["approved", "verified"].includes(key)) {
    return { label, className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  return { label, className: "border-slate-200 bg-slate-50 text-slate-600" };
}

function getFileNameFromPath(path: unknown) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/\\/g, "/");
  return normalized.split("/").pop() || "";
}

function resolveDocument(
  investment: Investment,
  kind: "original" | "signed"
): DocumentLink | null {
  const path =
    kind === "original"
      ? resolveDocPath(investment, [
          "originalContract.path",
          "contractFile.path",
          "originalContractPath",
          "documentPath",
        ])
      : resolveDocPath(investment, [
          "signedContract.path",
          "signedContractFile.path",
          "signedContractPath",
        ]);

  const url =
    kind === "original"
      ? pickText(
          resolveDocValue(investment, [
            "originalContract.url",
            "contractFile.url",
            "originalContractUrl",
            "contractUrl",
          ]),
          investment?.originalContractUrl,
          investment?.contractUrl
        )
      : pickText(
          resolveDocValue(investment, [
            "signedContract.url",
            "signedContractFile.url",
            "signedContractUrl",
          ]),
          investment?.signedContractUrl
        );

  const fileName =
    kind === "original"
      ? pickText(
          resolveDocValue(investment, [
            "originalContract.fileName",
            "contractFile.fileName",
          ]),
          getFileNameFromPath(path),
          "original.pdf"
        )
      : pickText(
          resolveDocValue(investment, [
            "signedContract.fileName",
            "signedContractFile.fileName",
          ]),
          getFileNameFromPath(path),
          "signed.pdf"
        );

  const viewUrl = pickText(url, buildR2DownloadUrl(path, false));
  const downloadUrl = pickText(buildR2DownloadUrl(path, true), url, viewUrl);
  const uploadedAt = toDateSafe(
    kind === "original"
      ? resolveDocValue(investment, [
          "originalContract.uploadedAt",
          "contractFile.uploadedAt",
        ])
      : resolveDocValue(investment, [
          "signedContract.uploadedAt",
          "signedContractFile.uploadedAt",
        ])
  );

  if (!viewUrl && !downloadUrl) return null;

  return {
    id: kind,
    label: kind === "original" ? "العقد الأصلي" : "العقد الموقّع",
    fileName,
    viewUrl,
    downloadUrl,
    uploadedAt,
  };
}

function classifyRequestBucket(request: InterestRequest): BucketKey {
  const key = normalizeStatusKey(request?.status || "pending");

  if (["cancelled", "rejected"].includes(key)) return "cancelled";
  if (
    [
      "draft",
      "generated",
      "contract_ready",
      "sent",
      "issued",
      "awaiting_signature",
      "pending_signature",
    ].includes(key)
  ) {
    return "awaiting_signature";
  }

  return "under_review";
}

function classifyInvestmentBucket(
  investment: Investment,
  originalDocument: DocumentLink | null,
  signedDocument: DocumentLink | null
): BucketKey {
  const contractStatus = normalizeStatusKey(investment?.contractStatus);
  const stage = deriveInvestmentStage({
    investmentStatus: investment?.status,
    contractStatus: investment?.contractStatus,
    hasInvestment: true,
    hasOriginalContract: Boolean(originalDocument),
    hasSignedContract: Boolean(signedDocument),
    hasVerifiedContract:
      Boolean(investment?.verifiedAt) ||
      contractStatus === "approved" ||
      contractStatus === "verified",
  });

  if (stage === "completed") return "completed";
  if (stage === "cancelled" || stage === "rejected") return "cancelled";
  if (
    stage === "active" ||
    stage === "contract_under_review" ||
    stage === "contract_verified"
  ) {
    return "active";
  }
  if (stage === "contract_preparing" || stage === "awaiting_signature") {
    return "awaiting_signature";
  }
  return "under_review";
}

function getBucketSummary(bucketKey: BucketKey, kind: "request" | "investment") {
  if (kind === "request") {
    if (bucketKey === "awaiting_signature") {
      return "وصل الطلب إلى مرحلة العقد أو انتظار التوقيع قبل إنشاء الاستثمار الفعلي.";
    }
    if (bucketKey === "cancelled") {
      return "تم إيقاف هذا الطلب قبل اكتمال مساره الاستثماري.";
    }
    return "الطلب ما زال تحت المراجعة الأولية ولم ينتقل بعد إلى مرحلة التفعيل.";
  }

  if (bucketKey === "awaiting_signature") {
    return "العقد قيد التجهيز أو بانتظار التوقيع قبل التفعيل.";
  }
  if (bucketKey === "active") {
    return "الاستثمار نشط ويمكن متابعة حالته التشغيلية ومستنداته من هذه البطاقة.";
  }
  if (bucketKey === "completed") {
    return "اكتمل الاستثمار أو تم إغلاقه رسميًا وهو مفصول هنا عن المحفظة الجارية.";
  }
  if (bucketKey === "cancelled") {
    return "تم إلغاء هذا الاستثمار أو رفضه قبل الوصول إلى مرحلة الاستمرارية.";
  }
  return "يجري استكمال المراجعة الأولية قبل التوقيع أو التفعيل.";
}

export default function MyInvestmentsRedesign() {
  const { user, logout } = useAuth();

  const [investments, setInvestments] = useState<Investment[]>([]);
  const [requests, setRequests] = useState<InterestRequest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PortfolioTab>("overview");

  const projectsMap = useMemo(() => buildProjectsMap(projects), [projects]);

  const role = String((user as any)?.role || "").toLowerCase();
  const isClient = role === "client" || role === "investor";
  const isGuest = role === "guest";

  useEffect(() => {
    let unsubInv: null | (() => void) = null;
    let unsubReq: null | (() => void) = null;
    let unsubProjects: null | (() => void) = null;

    let invLoaded = false;
    let reqLoaded = false;
    let projectsLoaded = false;

    const done = () => {
      if (invLoaded && reqLoaded && projectsLoaded) setLoading(false);
    };

    const run = async () => {
      try {
        setLoading(true);
        invLoaded = false;
        reqLoaded = false;
        projectsLoaded = false;

        if (!user?.uid) {
          setInvestments([]);
          setRequests([]);
          setProjects([]);
          setLoading(false);
          return;
        }

        if (!isClient) {
          setInvestments([]);
          setRequests([]);
          invLoaded = true;
          reqLoaded = true;

          const projectsQuery = query(
            collection(db, "projects"),
            where("status", "==", "published")
          );

          unsubProjects = onSnapshot(
            projectsQuery,
            (snap) => {
              setProjects(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
              projectsLoaded = true;
              done();
            },
            (error) => {
              logFirestoreBackgroundError("projects_permission_or_error", error);
              setProjects([]);
              projectsLoaded = true;
              done();
            }
          );

          return;
        }

        const investmentsQuery = query(
          collection(db, "investments"),
          where("investorUid", "==", user.uid)
        );

        unsubInv = onSnapshot(
          investmentsQuery,
          (snap) => {
            const rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            rows.sort((left: any, right: any) => {
              const leftTime = toDateSafe(left.createdAt)?.getTime() ?? 0;
              const rightTime = toDateSafe(right.createdAt)?.getTime() ?? 0;
              return rightTime - leftTime;
            });
            setInvestments(rows);
            invLoaded = true;
            done();
          },
          (error) => {
            logFirestoreBackgroundError("investments_permission_or_error", error);
            setInvestments([]);
            invLoaded = true;
            done();
          }
        );

        const requestsQuery = query(
          collection(db, "interest_requests"),
          where("investorUid", "==", user.uid),
          orderBy("createdAt", "desc")
        );

        unsubReq = onSnapshot(
          requestsQuery,
          (snap) => {
            setRequests(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as any);
            reqLoaded = true;
            done();
          },
          (error) => {
            logFirestoreBackgroundError("interest_requests_permission_or_error", error);
            setRequests([]);
            reqLoaded = true;
            done();
          }
        );

        const projectsQuery = query(
          collection(db, "projects"),
          where("status", "==", "published")
        );

        unsubProjects = onSnapshot(
          projectsQuery,
          (snap) => {
            setProjects(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
            projectsLoaded = true;
            done();
          },
          (error) => {
            logFirestoreBackgroundError("projects_permission_or_error", error);
            setProjects([]);
            projectsLoaded = true;
            done();
          }
        );
      } catch (error) {
        logFirestoreBackgroundError("my_investments_load_error", error);
        setLoading(false);
      }
    };

    void run();

    return () => {
      if (unsubInv) unsubInv();
      if (unsubReq) unsubReq();
      if (unsubProjects) unsubProjects();
    };
  }, [isClient, user?.uid]);

  const visibleRequests = useMemo(() => {
    if (!requests.length) return [];

    const investedRequestIds = new Set(
      investments
        .map((investment: any) => normalizeLinkId(investment?.requestId))
        .filter(Boolean)
    );
    const investedInvestmentIds = new Set(
      investments
        .map((investment: any) => normalizeLinkId(investment?.id))
        .filter(Boolean)
    );

    return requests.filter((request: any) => {
      const requestId = normalizeLinkId(request?.id);
      if (requestId && investedRequestIds.has(requestId)) return false;

      const linkedInvestmentId = normalizeLinkId(request?.investmentId);
      if (linkedInvestmentId && investedInvestmentIds.has(linkedInvestmentId)) {
        return false;
      }

      return true;
    });
  }, [investments, requests]);

  const totalInvested = useMemo(
    () => investments.reduce((sum, investment) => sum + Number(investment?.amount || 0), 0),
    [investments]
  );

  const totalExpectedReturn = useMemo(
    () =>
      investments.reduce(
        (sum, investment) =>
          sum + Number(investment?.expectedProfit ?? investment?.estimatedReturn ?? 0),
        0
      ),
    [investments]
  );

  const requestRows = useMemo<RequestRow[]>(() => {
    return sortRowsByDate(
      visibleRequests.map((request: any) => {
        const project = projectsMap[String(request?.projectId || "").trim()];
        const bucketKey = classifyRequestBucket(request);
        const requestDate = toDateSafe(request?.createdAt);
        const lastUpdatedAt = latestDate(
          request?.updatedAt,
          request?.reviewedAt,
          request?.approvedAt,
          requestDate
        );
        const linkedInvestmentId = normalizeLinkId(request?.investmentId);

        return {
          kind: "request",
          id: String(request?.id || ""),
          projectTitle:
            getProjectDisplayTitle(project, request?.projectTitle, "مشروع غير معروف") ||
            "مشروع غير معروف",
          referenceLabel: formatReference("طلب", String(request?.id || "")),
          bucketKey,
          statusPill: {
            label: BUCKET_META[bucketKey].shortTitle,
            className: BUCKET_META[bucketKey].className,
          },
          workflowPill: getWorkflowPill(request?.status || "pending"),
          amount:
            request?.amount === null || request?.amount === undefined
              ? null
              : Number(request?.amount || 0),
          requestDate,
          lastUpdatedAt,
          sortDate: latestDate(lastUpdatedAt, requestDate),
          actionHref: linkedInvestmentId
            ? `/client/investments/${linkedInvestmentId}`
            : "/projects",
          actionLabel: linkedInvestmentId ? "تفاصيل الاستثمار" : "استعرض المشاريع",
          summary: getBucketSummary(bucketKey, "request"),
        };
      })
    );
  }, [projectsMap, visibleRequests]);

  const investmentRows = useMemo<InvestmentRow[]>(() => {
    return sortRowsByDate(
      investments.map((investment: any) => {
        const project = projectsMap[String(investment?.projectId || "").trim()];
        const originalDocument = resolveDocument(investment, "original");
        const signedDocument = resolveDocument(investment, "signed");
        const documents = [originalDocument, signedDocument].filter(
          (document): document is DocumentLink => Boolean(document)
        );
        const bucketKey = classifyInvestmentBucket(
          investment,
          originalDocument,
          signedDocument
        );
        const requestDate = toDateSafe(investment?.createdAt);
        const lastUpdatedAt = latestDate(
          investment?.updatedAt,
          investment?.verifiedAt,
          investment?.signedAt,
          ...documents.map((document) => document.uploadedAt),
          requestDate
        );

        return {
          kind: "investment",
          id: String(investment?.id || ""),
          projectTitle:
            getProjectDisplayTitle(
              project,
              investment?.projectTitle,
              "مشروع غير معروف"
            ) || "مشروع غير معروف",
          referenceLabel: formatReference("استثمار", String(investment?.id || "")),
          bucketKey,
          statusPill: {
            label: BUCKET_META[bucketKey].shortTitle,
            className: BUCKET_META[bucketKey].className,
          },
          workflowPill: getWorkflowPill(investment?.status || "pending_review"),
          contractPill: getContractPill(investment?.contractStatus),
          amount: Number(investment?.amount || 0),
          requestDate,
          lastUpdatedAt,
          sortDate: latestDate(lastUpdatedAt, requestDate),
          detailsHref: `/client/investments/${investment?.id}`,
          contractHref:
            investment?.contractId || documents.length > 0
              ? `/client/contracts/${investment?.id}`
              : null,
          documents,
          summary: getBucketSummary(bucketKey, "investment"),
        };
      })
    );
  }, [investments, projectsMap]);

  const sections = useMemo(
    () => ({
      under_review: sortRowsByDate([
        ...requestRows.filter((row) => row.bucketKey === "under_review"),
        ...investmentRows.filter((row) => row.bucketKey === "under_review"),
      ]),
      awaiting_signature: sortRowsByDate([
        ...requestRows.filter((row) => row.bucketKey === "awaiting_signature"),
        ...investmentRows.filter((row) => row.bucketKey === "awaiting_signature"),
      ]),
      active: sortRowsByDate(
        investmentRows.filter((row) => row.bucketKey === "active")
      ),
      completed: sortRowsByDate(
        investmentRows.filter((row) => row.bucketKey === "completed")
      ),
      cancelled: sortRowsByDate([
        ...requestRows.filter((row) => row.bucketKey === "cancelled"),
        ...investmentRows.filter((row) => row.bucketKey === "cancelled"),
      ]),
    }),
    [investmentRows, requestRows]
  );

  const allRows = useMemo(
    () => sortRowsByDate([...requestRows, ...investmentRows]),
    [investmentRows, requestRows]
  );

  const highlights = useMemo(
    () =>
      sortRowsByDate([
        ...sections.under_review,
        ...sections.awaiting_signature,
        ...sections.active,
      ]).slice(0, 3),
    [sections]
  );

  const latestUpdate = useMemo(
    () =>
      allRows.reduce<Date | null>(
        (latest, row) => latestDate(latest, row.lastUpdatedAt, row.requestDate),
        null
      ),
    [allRows]
  );

  const processingCount = sections.under_review.length + sections.awaiting_signature.length;
  const requestTabCount = processingCount + sections.cancelled.length;
  const documentedRows = investmentRows.filter(
    (row) => row.documents.length > 0 || Boolean(row.contractHref)
  );
  const originalCount = investmentRows.filter((row) =>
    row.documents.some((document) => document.id === "original")
  ).length;
  const signedCount = investmentRows.filter((row) =>
    row.documents.some((document) => document.id === "signed")
  ).length;
  const displayName = getUserDisplayName(
    user,
    (user as any)?.displayName,
    (user as any)?.fullName,
    (user as any)?.name,
    (user as any)?.email?.split?.("@")?.[0],
    "المستثمر"
  );

  const accountBadge = getAccountBadge(user);
  const AccountIcon = accountBadge.icon;
  const availableProjects = projects.slice(0, 4);

  const renderSection = (
    bucketKey: BucketKey,
    rows: PortfolioRow[],
    emptyTitle: string,
    emptyDescription: string,
    action?: any
  ) => (
    <section className="space-y-4">
      <SectionHeader bucketKey={bucketKey} count={rows.length} action={action} />
      {rows.length === 0 ? (
        <SectionEmpty
          bucketKey={bucketKey}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row) =>
            row.kind === "investment" ? (
              <InvestmentCard key={`investment-${row.id}`} row={row} />
            ) : (
              <RequestCard key={`request-${row.id}`} row={row} />
            )
          )}
        </div>
      )}
    </section>
  );

  if (!user) {
    return (
      <ClientLayout className="bg-[linear-gradient(180deg,#f8fafc_0%,#eef4f8_100%)] py-10">
        <Card className="mx-auto max-w-xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>لوحة المستثمر</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              الرجاء تسجيل الدخول أولًا للوصول إلى ملفك الاستثماري.
            </p>
            <Link href="/login">
              <Button className="w-full">تسجيل الدخول</Button>
            </Link>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  if (!isClient) {
    return (
      <ClientLayout className="bg-[linear-gradient(180deg,#f8fafc_0%,#eef4f8_100%)] py-10">
        <Card className="mx-auto max-w-2xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>لوحة المستثمر</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{getRoleDisplayLabel(role) || role || EMPTY}</Badge>
              <Badge variant="outline">{user.email || EMPTY}</Badge>
            </div>

            <p className="leading-8 text-muted-foreground">
              الحساب مسجل دخول، لكن الدور الحالي ليس <b>client</b>.
              {isGuest ? (
                <>
                  <br />
                  أنت الآن <b>Guest</b> ويمكنك تصفح المشاريع، لكن صفحة الاستثمارات
                  الكاملة مخصصة لحسابات المستثمرين فقط.
                </>
              ) : null}
              <br />
              إذا كان هذا الحساب يجب أن يكون مستثمرًا، حدّث الدور في:
              <br />
              <b>users/{user.uid}.role = "client"</b>
            </p>

            <div className="grid gap-3">
              <Link href="/projects">
                <Button className="w-full">تصفح المشاريع</Button>
              </Link>

              <Button
                variant="destructive"
                className="w-full"
                onClick={async () => {
                  await logout();
                }}
              >
                تسجيل الخروج
              </Button>
            </div>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  if (loading) {
    return (
      <ClientLayout className="bg-[linear-gradient(180deg,#f8fafc_0%,#eef4f8_100%)] py-10">
        <div className="rounded-[32px] border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="text-lg font-semibold text-slate-950">
            جاري تجهيز ملفك الاستثماري...
          </div>
          <p className="mt-2 text-sm leading-7 text-slate-500">
            نرتب الطلبات والاستثمارات والعقود في عرض موحّد وواضح.
          </p>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout className="bg-[linear-gradient(180deg,#f8fafc_0%,#eef4f8_100%)] py-8 md:py-10">
      <div className="space-y-8">
        <section className="relative overflow-hidden rounded-[36px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_28%),linear-gradient(135deg,#081120_0%,#0f172a_52%,#1e293b_100%)] p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:p-8">
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-white/10 bg-white/10 text-white">
                  {getRoleDisplayLabel(role) || "عميل"}
                </Badge>
                <Badge variant="outline" className={accountBadge.className}>
                  <AccountIcon className="ml-1 h-3.5 w-3.5" />
                  {accountBadge.label}
                </Badge>
              </div>

              <div>
                <p className="text-sm font-semibold tracking-[0.22em] text-slate-300">
                  CLIENT DASHBOARD
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {displayName}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-8 text-slate-300 sm:text-base">
                  ملف استثماري موحّد يوضح لك مباشرة ما الذي لا يزال تحت المعالجة،
                  وما الذي ينتظر التوقيع، وما الذي أصبح نشطًا، وما الذي اكتمل أو
                  أُلغي.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <HeroInfo label="البريد الإلكتروني" value={user.email || "غير متوفر"} icon={Mail} breakAll />
                <HeroInfo label="آخر تحديث للمحفظة" value={formatDateTimeAR(latestUpdate)} icon={Clock3} />
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/projects">
                  <Button className="h-11 rounded-full bg-white px-6 text-slate-950 hover:bg-slate-100">
                    استثمر الآن
                  </Button>
                </Link>

                <Button
                  variant="outline"
                  className="h-11 rounded-full border-white/15 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => setActiveTab("requests")}
                >
                  مراجعة الطلبات
                </Button>

                <Link href="/projects">
                  <Button
                    variant="outline"
                    className="h-11 rounded-full border-white/15 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    تصفح المشاريع
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <HeroMetric
                label="إجمالي الاستثمارات"
                value={formatCurrencyShort(totalInvested)}
                helper={`${formatNumberEN(investmentRows.length)} استثمار مسجل`}
                icon={Wallet}
              />
              <HeroMetric
                label="العائد المتوقع"
                value={formatCurrencyShort(totalExpectedReturn)}
                helper="محسوب من نفس البيانات الحالية"
                icon={TrendingUp}
                tone="success"
              />
              <HeroMetric
                label="الاستثمارات النشطة"
                value={formatNumberEN(sections.active.length)}
                helper="تشمل المفعّلة والموقعة"
                icon={TrendingUp}
              />
              <HeroMetric
                label="تحت المعالجة"
                value={formatNumberEN(processingCount)}
                helper="طلبات واستثمارات ما قبل التفعيل"
                icon={Clock3}
                tone="warning"
              />
              <HeroMetric
                label="الاستثمارات المكتملة"
                value={formatNumberEN(sections.completed.length)}
                helper="استثمارات منتهية أو مغلقة"
                icon={History}
              />
              <HeroMetric
                label="المستندات والعقود"
                value={formatNumberEN(documentedRows.length)}
                helper={`${formatNumberEN(originalCount)} أصلية • ${formatNumberEN(signedCount)} موقعة`}
                icon={FileText}
              />
            </div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PortfolioTab)} className="gap-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">
                  تنظيم واضح للمحفظة الاستثمارية
                </h2>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  كل العدادات والتقسيمات هنا تعتمد على نفس التصنيف الموحّد للحالات.
                </p>
              </div>

              <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-2xl bg-slate-100/80 p-1.5 lg:w-auto">
                <TabsTrigger value="overview" className="h-auto min-w-[150px] flex-none items-start justify-start rounded-xl px-4 py-3 text-right">
                  <TabMeta icon={LayoutGrid} title="نظرة عامة" count={formatNumberEN(allRows.length)} />
                </TabsTrigger>
                <TabsTrigger value="requests" className="h-auto min-w-[180px] flex-none items-start justify-start rounded-xl px-4 py-3 text-right">
                  <TabMeta icon={BriefcaseBusiness} title="طلباتي الاستثمارية" count={formatNumberEN(requestTabCount)} />
                </TabsTrigger>
                <TabsTrigger value="active" className="h-auto min-w-[170px] flex-none items-start justify-start rounded-xl px-4 py-3 text-right">
                  <TabMeta icon={TrendingUp} title="استثماراتي النشطة" count={formatNumberEN(sections.active.length)} />
                </TabsTrigger>
                <TabsTrigger value="completed" className="h-auto min-w-[180px] flex-none items-start justify-start rounded-xl px-4 py-3 text-right">
                  <TabMeta icon={History} title="الاستثمارات المكتملة" count={formatNumberEN(sections.completed.length)} />
                </TabsTrigger>
                <TabsTrigger value="documents" className="h-auto min-w-[180px] flex-none items-start justify-start rounded-xl px-4 py-3 text-right">
                  <TabMeta icon={FileText} title="المستندات والعقود" count={formatNumberEN(documentedRows.length)} />
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <BucketOverview bucketKey="under_review" count={sections.under_review.length} onOpenTab={(tab) => setActiveTab(tab)} />
              <BucketOverview bucketKey="awaiting_signature" count={sections.awaiting_signature.length} onOpenTab={(tab) => setActiveTab(tab)} />
              <BucketOverview bucketKey="active" count={sections.active.length} onOpenTab={(tab) => setActiveTab(tab)} />
              <BucketOverview bucketKey="completed" count={sections.completed.length} onOpenTab={(tab) => setActiveTab(tab)} />
              <BucketOverview bucketKey="cancelled" count={sections.cancelled.length} onOpenTab={(tab) => setActiveTab(tab)} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
              <Card className="border-slate-200/80 shadow-sm">
                <CardHeader className="border-b border-slate-200/70 pb-5">
                  <CardTitle>أهم التحركات الحالية</CardTitle>
                  <p className="text-sm leading-7 text-slate-500">
                    أحدث السجلات التي تحتاج متابعة الآن.
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  {highlights.length === 0 ? (
                    <SectionEmpty bucketKey="under_review" title="لا توجد حركة استثمارية حالية" description="لا توجد طلبات أو استثمارات تحتاج متابعة حالياً." />
                  ) : (
                    <div className="space-y-4">
                      {highlights.map((row) =>
                        row.kind === "investment" ? (
                          <InvestmentCard key={`highlight-investment-${row.id}`} row={row} />
                        ) : (
                          <RequestCard key={`highlight-request-${row.id}`} row={row} />
                        )
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="border-slate-200/80 shadow-sm">
                  <CardHeader className="border-b border-slate-200/70 pb-5">
                    <CardTitle>ملخص الحالة الحالية</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-6">
                    <InfoMetric label="طلبات تحت المعالجة" value={formatNumberEN(processingCount)} helper="يرتبط بنفس الأقسام الظاهرة في تبويب الطلبات" icon={BriefcaseBusiness} />
                    <InfoMetric label="ملغية أو مرفوضة" value={formatNumberEN(sections.cancelled.length)} helper="معروضة بشكل منفصل عن الحالات الجارية" icon={CircleOff} />
                    <InfoMetric label="المستندات المتاحة" value={formatNumberEN(documentedRows.length)} helper="استثمارات تحتوي على عقد أو مستند واحد على الأقل" icon={FileText} />
                  </CardContent>
                </Card>

                <Card className="border-slate-200/80 shadow-sm">
                  <CardHeader className="border-b border-slate-200/70 pb-5">
                    <CardTitle>فرص متاحة الآن</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {availableProjects.length === 0 ? (
                      <SectionEmpty bucketKey="active" title="لا توجد مشاريع منشورة حالياً" description="ستظهر هنا أبرز المشاريع المتاحة للاستثمار بمجرد توفرها." />
                    ) : (
                      <div className="space-y-4">
                        {availableProjects.map((project) => (
                          <ProjectPreview key={project.id} project={project} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="requests" className="space-y-8">
            {renderSection(
              "under_review",
              sections.under_review,
              "لا توجد طلبات تحت المراجعة حالياً",
              "كل الطلبات الحالية إما انتقلت إلى مرحلة العقود أو أصبحت نشطة أو مكتملة.",
              <Link href="/projects">
                <Button className="rounded-full px-5">طلب استثمار جديد</Button>
              </Link>
            )}
            {renderSection("awaiting_signature", sections.awaiting_signature, "لا توجد استثمارات بانتظار التوقيع أو تجهيز العقد", "لا يوجد حالياً أي سجل في مرحلة تجهيز العقد أو انتظار توقيعك.")}
            {renderSection("cancelled", sections.cancelled, "لا توجد طلبات أو استثمارات ملغية", "جميع السجلات الحالية ما زالت فعالة أو اكتملت، ولا توجد حالات مرفوضة أو ملغية.")}
          </TabsContent>

          <TabsContent value="active" className="space-y-8">
            {renderSection(
              "active",
              sections.active,
              "لا توجد استثمارات نشطة حالياً",
              "بمجرد تفعيل استثمار أو وصوله إلى المرحلة التشغيلية سيظهر هنا بشكل مستقل وواضح.",
              <Link href="/projects">
                <Button className="rounded-full px-5">استثمر الآن</Button>
              </Link>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-8">
            {renderSection("completed", sections.completed, "لا توجد استثمارات مكتملة أو منتهية", "عند اكتمال الاستثمار أو إغلاقه رسميًا سيظهر في هذا القسم مع كامل تفاصيله.")}
          </TabsContent>

          <TabsContent value="documents" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <InfoMetric label="استثمارات تحتوي على ملفات" value={formatNumberEN(documentedRows.length)} helper="تشمل العقود الأصلية والموقعة وصفحة العقد عند توفرها" icon={FileText} />
              <InfoMetric label="العقود الأصلية المتاحة" value={formatNumberEN(originalCount)} helper="عقود تم رفعها أو ربطها مع الاستثمار" icon={ReceiptText} />
              <InfoMetric label="العقود الموقعة المتاحة" value={formatNumberEN(signedCount)} helper="نسخ موقعة جاهزة للعرض أو التحميل" icon={ShieldCheck} />
            </div>

            {documentedRows.length === 0 ? (
              <SectionEmpty bucketKey="awaiting_signature" title="لا توجد مستندات أو عقود حالياً" description="بمجرد توفر عقود أو مستندات مرتبطة بالاستثمارات ستظهر هنا مع أزرار العرض والتنزيل." />
            ) : (
              <div className="space-y-4">
                {documentedRows.map((row) => (
                  <DocumentsCard key={`documents-${row.id}`} row={row} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ClientLayout>
  );
}

function TabMeta({
  icon: Icon,
  title,
  count,
}: {
  icon: LucideIcon;
  title: string;
  count: string;
}) {
  return (
    <div className="flex flex-col items-start text-right">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span>{title}</span>
      </div>
      <span className="mt-1 text-xs text-slate-500">{count}</span>
    </div>
  );
}

function HeroInfo({
  label,
  value,
  icon: Icon,
  breakAll = false,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  breakAll?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-300">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={cn("mt-2 text-sm font-semibold leading-7 text-white", breakAll ? "break-all" : "break-words")}>
        {value}
      </div>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  helper,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : "text-white";

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-300">
        <Icon className={cn("h-4 w-4", toneClass)} />
        {label}
      </div>
      <div className={cn("mt-3 text-2xl font-semibold tracking-tight", toneClass)}>
        {value}
      </div>
      {helper ? <p className="mt-2 text-sm leading-6 text-slate-400">{helper}</p> : null}
    </div>
  );
}

function InfoMetric({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-950">{value}</div>
      {helper ? <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p> : null}
    </div>
  );
}

function MetaField({
  label,
  value,
  breakAll = false,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
      <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className={cn("mt-2 text-sm font-semibold leading-7 text-slate-900", breakAll ? "break-all" : "break-words")}>
        {value}
      </div>
    </div>
  );
}

function SectionHeader({
  bucketKey,
  count,
  action,
}: {
  bucketKey: BucketKey;
  count: number;
  action?: any;
}) {
  const meta = BUCKET_META[bucketKey];
  const Icon = meta.icon;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border", meta.className)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-950">{meta.title}</h3>
            <p className="mt-2 text-sm leading-7 text-slate-500">{meta.description}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              العدد
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-950">
              {formatNumberEN(count)}
            </div>
          </div>
          {action}
        </div>
      </div>
    </div>
  );
}

function SectionEmpty({
  bucketKey,
  title,
  description,
}: {
  bucketKey: BucketKey;
  title: string;
  description: string;
}) {
  const meta = BUCKET_META[bucketKey];
  const Icon = meta.icon;

  return (
    <div className={cn("rounded-[28px] border border-dashed bg-white/70 px-6 py-10 text-center", meta.borderClassName)}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function BucketOverview({
  bucketKey,
  count,
  onOpenTab,
}: {
  bucketKey: BucketKey;
  count: number;
  onOpenTab: (tab: Exclude<PortfolioTab, "overview" | "documents">) => void;
}) {
  const meta = BUCKET_META[bucketKey];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onOpenTab(meta.tab)}
      className={cn("group relative overflow-hidden rounded-[28px] border bg-white p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg", meta.borderClassName)}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l", meta.accentClassName)} />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold", meta.className)}>
            <Icon className="ml-1 h-3.5 w-3.5" />
            {meta.shortTitle}
          </div>
          <div className="text-3xl font-bold tracking-tight text-slate-950">
            {formatNumberEN(count)}
          </div>
          <p className="text-sm leading-6 text-slate-500">{meta.description}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          عرض القسم
        </div>
      </div>
    </button>
  );
}

function RequestCard({ row }: { row: RequestRow }) {
  const meta = BUCKET_META[row.bucketKey];
  const showWorkflow = isDistinctLabel(row.statusPill.label, row.workflowPill.label);

  return (
    <article className="group relative overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className={cn("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l", meta.accentClassName)} />
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {row.referenceLabel}
              </span>
              <Badge variant="outline" className={row.statusPill.className}>
                {row.statusPill.label}
              </Badge>
              {showWorkflow ? (
                <Badge variant="outline" className={row.workflowPill.className}>
                  {row.workflowPill.label}
                </Badge>
              ) : null}
            </div>

            <div>
              <h3 className="text-lg font-semibold text-slate-950 break-words">
                {row.projectTitle}
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">{row.summary}</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 xl:min-w-[220px]">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              المبلغ المطلوب
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
              {row.amount != null ? formatCurrencyShort(row.amount) : "غير محدد"}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetaField label="رقم الطلب" value={row.id || EMPTY} breakAll />
          <MetaField label="تاريخ الطلب" value={formatDateAR(row.requestDate)} />
          <MetaField label="الحالة" value={row.statusPill.label} />
          <MetaField label="آخر تحديث" value={formatDateTimeAR(row.lastUpdatedAt)} />
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 p-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm leading-7 text-slate-500">
            سيظهر رقم الاستثمار والعقود هنا تلقائيًا بمجرد انتقال الطلب إلى المرحلة التالية.
          </p>
          <Link href={row.actionHref}>
            <Button variant="outline" className="rounded-full px-5">
              {row.actionLabel}
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

function DocumentButtons({ document }: { document: DocumentLink }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {document.viewUrl ? (
        <Button asChild variant="outline" size="sm" className="rounded-full px-4">
          <a href={document.viewUrl} target="_blank" rel="noreferrer">
            <Eye className="h-4 w-4" />
            عرض
          </a>
        </Button>
      ) : null}
      {document.downloadUrl ? (
        <Button asChild variant="outline" size="sm" className="rounded-full px-4">
          <a href={document.downloadUrl} rel="noreferrer" download={document.fileName || true}>
            <Download className="h-4 w-4" />
            تنزيل
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function InvestmentCard({ row }: { row: InvestmentRow }) {
  const meta = BUCKET_META[row.bucketKey];
  const showWorkflow = isDistinctLabel(row.statusPill.label, row.workflowPill.label);
  const showContract =
    row.contractPill &&
    isDistinctLabel(
      row.contractPill.label,
      showWorkflow ? row.workflowPill.label : row.statusPill.label
    );

  return (
    <article className="group relative overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className={cn("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l", meta.accentClassName)} />
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {row.referenceLabel}
              </span>
              <Badge variant="outline" className={row.statusPill.className}>
                {row.statusPill.label}
              </Badge>
              {showWorkflow ? (
                <Badge variant="outline" className={row.workflowPill.className}>
                  {row.workflowPill.label}
                </Badge>
              ) : null}
              {showContract && row.contractPill ? (
                <Badge variant="outline" className={row.contractPill.className}>
                  {row.contractPill.label}
                </Badge>
              ) : null}
            </div>

            <div>
              <h3 className="text-lg font-semibold text-slate-950 break-words">
                {row.projectTitle}
              </h3>
              <p className="mt-2 text-sm leading-7 text-slate-500">{row.summary}</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 xl:min-w-[220px]">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              المبلغ المستثمر
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
              {formatCurrencyShort(row.amount)}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetaField label="رقم الاستثمار" value={row.id || EMPTY} breakAll />
          <MetaField label="تاريخ الطلب" value={formatDateAR(row.requestDate)} />
          <MetaField label="المبلغ" value={formatCurrencyShort(row.amount)} />
          <MetaField label="الحالة" value={row.statusPill.label} />
          <MetaField label="آخر تحديث" value={formatDateTimeAR(row.lastUpdatedAt)} />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  المستندات والعقود
                </div>
                <p className="mt-1 text-sm leading-7 text-slate-500">
                  {row.documents.length > 0
                    ? "يمكنك فتح العقود المتاحة مباشرة من هذه البطاقة أو الانتقال لتفاصيل الاستثمار."
                    : "لا توجد مستندات مرفقة حالياً لهذا الاستثمار، وستظهر هنا تلقائيًا عند توفرها."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {row.documents.map((document) =>
                  document.viewUrl ? (
                    <Button
                      key={`${row.id}-${document.id}`}
                      asChild
                      variant="outline"
                      size="sm"
                      className="rounded-full px-4"
                    >
                      <a href={document.viewUrl} target="_blank" rel="noreferrer">
                        <FileText className="h-4 w-4" />
                        {document.label}
                      </a>
                    </Button>
                  ) : null
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {row.contractHref ? (
              <Link href={row.contractHref}>
                <Button variant="outline" className="rounded-full px-5">
                  العقود
                </Button>
              </Link>
            ) : null}
            <Link href={row.detailsHref}>
              <Button className="rounded-full px-5">
                <Eye className="h-4 w-4" />
                تفاصيل الاستثمار
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function DocumentsCard({ row }: { row: InvestmentRow }) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {row.referenceLabel}
            </span>
            <Badge variant="outline" className={row.statusPill.className}>
              {row.statusPill.label}
            </Badge>
          </div>
          <h3 className="text-lg font-semibold text-slate-950">{row.projectTitle}</h3>
          <p className="text-sm text-slate-500">
            آخر تحديث للمستندات: {formatDateTimeAR(row.lastUpdatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {row.contractHref ? (
            <Link href={row.contractHref}>
              <Button variant="outline" className="rounded-full">
                العقود
              </Button>
            </Link>
          ) : null}
          <Link href={row.detailsHref}>
            <Button variant="outline" className="rounded-full">
              <Eye className="h-4 w-4" />
              تفاصيل الاستثمار
            </Button>
          </Link>
        </div>
      </div>

      {row.documents.length === 0 ? (
        <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-500">
          لا توجد ملفات مرفقة مباشرة، لكن صفحة العقد متاحة عند الحاجة.
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {row.documents.map((document) => (
            <div key={`${row.id}-${document.id}`} className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">
                    {document.label}
                  </div>
                  <div className="mt-1 break-all text-sm text-slate-500">
                    {document.fileName || EMPTY}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    تاريخ الرفع: {formatDateTimeAR(document.uploadedAt)}
                  </div>
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  PDF
                </div>
              </div>

              <div className="mt-4">
                <DocumentButtons document={document} />
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ProjectPreview({ project }: { project: Project }) {
  const title =
    getProjectDisplayTitle(project, project?.titleAr, "فرصة استثمارية") ||
    "فرصة استثمارية";
  const targetAmount = Number(project?.targetAmount || 0);
  const currentAmount = Number(project?.currentAmount || 0);
  const progress =
    targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : 0;

  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-950">{title}</div>
          <p className="mt-1 text-sm leading-7 text-slate-500">
            استعراض سريع لنسبة التغطية الحالية مع وصول مباشر إلى صفحة المشروع.
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
          {formatNumberEN(progress)}%
        </div>
      </div>

      <div className="mt-4">
        <Progress
          value={progress}
          className="h-2.5 bg-slate-200 [&_[data-slot=progress-indicator]]:bg-slate-900"
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetaField label="المبلغ المجمع" value={formatCurrencyShort(currentAmount)} />
        <MetaField
          label="المبلغ المستهدف"
          value={targetAmount > 0 ? formatCurrencyShort(targetAmount) : "غير محدد"}
        />
      </div>

      <Link href={`/projects/${project.id}`}>
        <Button className="mt-4 w-full rounded-full">عرض المشروع</Button>
      </Link>
    </div>
  );
}
