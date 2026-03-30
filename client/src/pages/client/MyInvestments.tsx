// client/src/pages/client/MyInvestments.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

import ClientLayout from "@/components/ClientLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCurrencyShort, formatDateEN, formatNumberEN } from "@/lib/formatters";
import { getClientInvestmentStatusMeta } from "@/lib/workflowStatusMeta";
import { cn } from "@/lib/utils";

import { useAuth } from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";
import { getRoleDisplayLabel } from "@/lib/ownerAccounts";
import { normalizeLinkId } from "@/lib/requestInvestmentLink";
import {
  buildProjectsMap,
  getProjectDisplayTitle,
} from "@/lib/projectDisplay";

import {
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle,
  Building2,
  FileText,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";

import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
  orderBy,
} from "firebase/firestore";

type Investment = any;
type Project = any;
type InterestRequest = any;

function formatStatValue(value: string | number, format: "plain" | "number" | "sar") {
  if (format === "sar") return formatCurrencyShort(value);
  if (format === "number" && typeof value === "number") return formatNumberEN(value);
  return String(value ?? "—");
}

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

function formatDateAR(v: any) {
  return formatDateEN(toDateSafe(v));
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

export default function MyInvestments() {
  const { user, logout } = useAuth();

  const [investments, setInvestments] = useState<Investment[]>([]);
  const [requests, setRequests] = useState<InterestRequest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const projectsMap = useMemo(() => buildProjectsMap(projects), [projects]);

  const role = String((user as any)?.role || "").toLowerCase();
  const isClient = role === "client" || role === "investor";
  const isGuest = role === "guest";

  // ✅ Live: investments + interest_requests
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

        // ✅ مو مسجل دخول
        if (!user?.uid) {
          setInvestments([]);
          setRequests([]);
          setProjects([]);
          setLoading(false);
          return;
        }

        // ✅ إذا مو عميل: ما نجيب investments/requests
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
              setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
              projectsLoaded = true;
              done();
            },
            (err) => {
              logFirestoreBackgroundError("projects_permission_or_error", err);
              setProjects([]);
              projectsLoaded = true;
              done();
            }
          );
          return;
        }

        // ✅ listener لاستثمارات العميل
        const qInv = query(
          collection(db, "investments"),
          where("investorUid", "==", user.uid)
        );

        unsubInv = onSnapshot(
          qInv,
          (snap) => {
            const invs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

            // ترتيب محلي (بدون index)
            invs.sort((a: any, b: any) => {
              const ta = toDateSafe(a.createdAt)?.getTime() ?? 0;
              const tb = toDateSafe(b.createdAt)?.getTime() ?? 0;
              return tb - ta;
            });

            setInvestments(invs);
            invLoaded = true;
            done();
          },
          (err) => {
            logFirestoreBackgroundError("investments_permission_or_error", err);
            setInvestments([]);
            invLoaded = true;
            done();
          }
        );

        // ✅ listener لطلبات الاهتمام من interest_requests (طلبات المستثمر)
        const qReq = query(
          collection(db, "interest_requests"),
          where("investorUid", "==", user.uid),
          orderBy("createdAt", "desc")
        );

        unsubReq = onSnapshot(
          qReq,
          (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

            // تخزين الطلبات الخام، ثم فلترتها لاحقًا مع الاستثمارات من state الحي.
            setRequests(rows as any);
            reqLoaded = true;
            done();
          },
          (err) => {
            logFirestoreBackgroundError("interest_requests_permission_or_error", err);
            setRequests([]);
            reqLoaded = true;
            done();
          }
        );

        // ✅ مشاريع منشورة
        const projectsQuery = query(
          collection(db, "projects"),
          where("status", "==", "published")
        );
        unsubProjects = onSnapshot(
          projectsQuery,
          (snap) => {
            setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            projectsLoaded = true;
            done();
          },
          (err) => {
            logFirestoreBackgroundError("projects_permission_or_error", err);
            setProjects([]);
            projectsLoaded = true;
            done();
          }
        );
      } catch (e) {
        logFirestoreBackgroundError("my_investments_load_error", e);
        setLoading(false);
      }
    };

    run();

    return () => {
      if (unsubInv) unsubInv();
      if (unsubReq) unsubReq();
      if (unsubProjects) unsubProjects();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, isClient]);

  // ✅ إجماليات (من investments فقط)
  const totalInvested = useMemo(
    () => investments.reduce((s, i) => s + Number(i.amount || 0), 0),
    [investments]
  );

  const totalExpectedReturn = useMemo(
    () =>
      investments.reduce(
        (s, i) => s + Number(i.expectedProfit ?? i.estimatedReturn ?? 0),
        0
      ),
    [investments]
  );

  const activeInvestments = useMemo(
    () =>
      investments.filter((i) =>
        ["active"].includes(String(i.status || ""))
      ).length,
    [investments]
  );

  const pendingInvestmentsOnly = useMemo(
    () =>
      investments.filter((i) =>
        ["pending", "pending_review", "reviewing", "pending_contract", "signing", "signed", "approved"].includes(
          String(i.status || "")
        )
      ).length,
    [investments]
  );

  const visibleRequests = useMemo(() => {
    if (!requests.length) return [];

    const investedRequestIds = new Set(
      investments
        .map((i: any) => normalizeLinkId(i?.requestId))
        .filter(Boolean)
    );
    const investedInvestmentIds = new Set(
      investments
        .map((i: any) => normalizeLinkId(i?.id))
        .filter(Boolean)
    );

    return requests.filter((r: any) => {
      const rid = normalizeLinkId(r?.id);
      if (rid && investedRequestIds.has(rid)) return false;

      // fallback للبيانات القديمة التي لا تحتوي requestId
      const linkedInvestmentId = normalizeLinkId(r?.investmentId);
      if (linkedInvestmentId && investedInvestmentIds.has(linkedInvestmentId)) return false;

      return true;
    });
  }, [requests, investments]);

  const pendingRequests = useMemo(
    () =>
      visibleRequests.filter((r: any) =>
        ["pending", "pending_review", "reviewing", "approved"].includes(String(r.status || "pending"))
      ).length,
    [visibleRequests]
  );

  // ✅ قيد المراجعة = pending investments + pending requests
  const pendingTotal = pendingInvestmentsOnly + pendingRequests;

  const statusBadge = (status: string) => {
    const meta = getClientInvestmentStatusMeta(status);
    return <Badge className={meta.cls}>{meta.label}</Badge>;
  };

  // ✅ not logged in
  if (!user) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>لوحة المستثمر</CardTitle>
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

  // ✅ role not client (guest/other)
  if (!isClient) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>لوحة المستثمر</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline">{getRoleDisplayLabel(role) || role || "—"}</Badge>
              <Badge variant="secondary">{user.email}</Badge>
            </div>

            <p className="text-muted-foreground leading-relaxed">
              حسابك مسجّل دخول، لكن الدور الحالي ليس <b>client</b>.
              {isGuest ? (
                <>
                  <br />
                  <span className="text-sm">
                    أنت الآن <b>Guest</b> — تقدر تتصفح المشاريع، لكن الاستثمارات تظهر فقط
                    لحسابات المستثمرين (client).
                  </span>
                </>
              ) : null}
              <br />
              إذا هذا المفروض حساب مستثمر، عدّل:
              <br />
              <b>users/{user.uid}.role = "client"</b>
            </p>

            <div className="grid gap-3">
              <Link href="/projects">
                <Button className="w-full">تصفّح المشاريع</Button>
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
      <ClientLayout className="py-12">
        <div className="py-20 text-center">جاري التحميل...</div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout className="py-12">
      <div className="space-y-8">
        {/* Welcome */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              مرحباً، {user?.displayName || user?.email || "عزيزي المستثمر"}
            </h1>
            <p className="text-muted-foreground text-lg">
              هنا تتابع طلباتك واستثماراتك وحالتها خطوة بخطوة
            </p>
          </div>

          <Link href="/projects">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              تصفّح المشاريع
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Stat
            title="إجمالي الاستثمارات"
            icon={DollarSign}
            value={totalInvested}
            format="sar"
          />
          <Stat
            title="العائد المتوقع"
            icon={TrendingUp}
            value={totalExpectedReturn}
            format="sar"
            tone="success"
          />
          <Stat title="استثمارات نشطة" icon={CheckCircle} value={activeInvestments} format="number" />
          <Stat title="قيد المراجعة" icon={Clock} value={pendingTotal} format="number" />
        </div>

        {/* ✅ Requests (interest_requests) */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>طلباتي الاستثمارية</CardTitle>
            <Link href="/projects">
              <Button variant="outline">طلب استثمار جديد</Button>
            </Link>
          </CardHeader>

          <CardContent>
            {visibleRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                لا توجد طلبات استثمار حالياً
              </div>
            ) : (
              <div className="space-y-4">
                {visibleRequests.map((m: any) => {
                  const project = projectsMap[String(m.projectId || "").trim()];
                  const createdAt = m.createdAt ? formatDateAR(m.createdAt) : "—";
                  const status = String(m.status || "pending");
                  const amount = m.amount != null ? Number(m.amount) : null;
                  const linkedInvestmentId = normalizeLinkId(m?.investmentId);

                  return (
                    <Card key={m.id} className="overflow-hidden">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-bold truncate">
                              {getProjectDisplayTitle(
                                project,
                                m?.projectTitle,
                                "مشروع غير معروف"
                              ) || "مشروع غير معروف"}
                            </h3>

                            <div className="mt-1 text-xs text-muted-foreground">
                              تاريخ الطلب: {createdAt}
                            </div>

                            {amount != null && (
                              <p className="mt-2 text-sm">
                                <span className="text-muted-foreground">المبلغ: </span>
                                <b>{formatCurrencyShort(amount)}</b>
                              </p>
                            )}

                            <div className="mt-2 text-xs text-muted-foreground break-all">
                              رقم الطلب: {m.id}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            {statusBadge(status)}

                            <div className="flex flex-wrap gap-2 justify-end">
                              {linkedInvestmentId ? (
                                <Link href={`/client/investments/${linkedInvestmentId}`}>
                                  <Button size="sm" variant="outline">
                                    <FileText className="w-4 h-4 ml-2" />
                                    تفاصيل الاستثمار
                                  </Button>
                                </Link>
                              ) : (
                                <Button size="sm" variant="outline" disabled>
                                  <FileText className="w-4 h-4 ml-2" />
                                  بانتظار إنشاء الاستثمار
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Investments */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>استثماراتي</CardTitle>
            <Link href="/projects">
              <Button variant="outline">استثمر الآن</Button>
            </Link>
          </CardHeader>

          <CardContent>
            {investments.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-4">
                {investments.map((inv) => {
                  const project = projectsMap[String(inv.projectId || "").trim()];

                  const status = String(inv.status || "pending_review");
                  const createdAt = inv.createdAt ? formatDateAR(inv.createdAt) : "—";

                  const contractId = inv?.contractId || null;
                  const contractUrl = inv?.contractUrl || null;

                  return (
                    <Card key={inv.id} className="overflow-hidden">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-bold truncate">
                              {getProjectDisplayTitle(
                                project,
                                inv?.projectTitle,
                                "مشروع غير معروف"
                              ) || "مشروع غير معروف"}
                            </h3>

                            <div className="mt-1 text-xs text-muted-foreground">
                              تاريخ الطلب: {createdAt}
                            </div>

                            {inv?.amount != null && (
                              <p className="mt-2 text-sm">
                                <span className="text-muted-foreground">المبلغ: </span>
                                <b>{formatCurrencyShort(inv.amount)}</b>
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            {statusBadge(status)}

                            <div className="flex flex-wrap gap-2 justify-end">
                              <Link href={`/client/investments/${inv.id}`}>
                                <Button size="sm">
                                  <FileText className="w-4 h-4 ml-2" />
                                  تفاصيل الاستثمار
                                </Button>
                              </Link>

                              {/* ✅ عقد اختياري فقط */}
                              {contractUrl ? (
                                <a href={contractUrl} target="_blank" rel="noreferrer">
                                  <Button size="sm" variant="outline">
                                    عرض ملف العقد
                                  </Button>
                                </a>
                              ) : contractId ? (
                                <Link href={`/client/contracts/${inv.id}`}>
                                  <Button size="sm" variant="outline">
                                    عرض العقد (اختياري)
                                  </Button>
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projects */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>مشاريع متاحة</CardTitle>
            <Link href="/projects">
              <Button variant="outline">عرض الكل</Button>
            </Link>
          </CardHeader>

          <CardContent className="grid md:grid-cols-2 gap-4">
            {projects.slice(0, 4).map((p) => {
              const progress = p.targetAmount
                ? (Number(p.currentAmount) / Number(p.targetAmount)) * 100
                : 0;

              return (
                <Card key={p.id}>
                  <CardContent className="pt-6">
                    <h3 className="font-bold mb-2">{p.titleAr}</h3>
                    <Progress value={progress} />
                    <Link href={`/projects/${p.id}`}>
                      <Button size="sm" className="w-full mt-4">
                        عرض التفاصيل
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </ClientLayout>
  );
}

/* =========================
   Small components
========================= */
type StatProps = {
  title: string;
  icon: LucideIcon;
  value: string | number;
  format?: "plain" | "number" | "sar";
  tone?: "default" | "success";
};

function Stat({
  title,
  icon: Icon,
  value,
  format = "plain",
  tone = "default",
}: StatProps) {
  const isSuccess = tone === "success";
  const displayValue = formatStatValue(value, format);

  return (
    <Card className="relative overflow-hidden border border-white/10 bg-gradient-to-br from-[#0D0D0D] via-[#1a1f2e] to-[#0a0f1f] text-white shadow-[0_22px_55px_rgba(2,6,23,0.34)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_38%,transparent_100%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

      <CardHeader className="relative flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0 space-y-2">
          <CardTitle className="text-sm font-medium tracking-tight text-white/70">
            {title}
          </CardTitle>
        </div>

        <div
          className={cn(
            "shrink-0 rounded-2xl border p-2.5 backdrop-blur-sm",
            isSuccess
              ? "border-emerald-400/20 bg-emerald-400/10"
              : "border-[#F2B705]/20 bg-[#F2B705]/10"
          )}
        >
          <Icon
            className={cn(
              "h-5 w-5",
              isSuccess ? "text-emerald-300" : "text-[#F2B705]"
            )}
          />
        </div>
      </CardHeader>

      <CardContent className="relative pt-0">
        <div
          className={cn(
            "min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] text-[clamp(1.45rem,5vw,2.7rem)] font-semibold leading-[1.1] tracking-tight tabular-nums sm:text-[clamp(1.7rem,3.6vw,3rem)]",
            isSuccess ? "text-emerald-300" : "text-white"
          )}
        >
          {displayValue}
        </div>
      </CardContent>
    </Card>
  );
}

function Empty() {
  return (
    <div className="text-center py-12">
      <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
      <p className="text-muted-foreground mb-4">لم تقم بأي استثمار بعد</p>
      <Link href="/projects">
        <Button>استكشف المشاريع</Button>
      </Link>
    </div>
  );
}
