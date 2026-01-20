// client/src/pages/client/MyInvestments.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

import ClientLayout from "@/components/ClientLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import { useAuth } from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";

import {
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle,
  Building2,
  FileText,
  ArrowLeft,
} from "lucide-react";

import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

type Investment = any;
type Project = any;

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
  const d = toDateSafe(v);
  return d ? d.toLocaleDateString("ar-SA") : "—";
}

export default function MyInvestments() {
  const { user, logout } = useAuth();

  const [investments, setInvestments] = useState<Investment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const role = String((user as any)?.role || "").toLowerCase();
  const isClient = role === "client";
  const isGuest = role === "guest";

  // ✅ Live: investments (بدون تحديث)
  useEffect(() => {
    let unsub: null | (() => void) = null;

    const run = async () => {
      try {
        setLoading(true);

        // ✅ مو مسجل دخول
        if (!user?.uid) {
          setInvestments([]);
          setProjects([]);
          setLoading(false);
          return;
        }

        // ✅ إذا مو عميل: ما نجيب investments (نخليها واضحة)
        if (!isClient) {
          setInvestments([]);
          // بس نجيب مشاريع منشورة عشان يقدر يتصفح
          const projSnap = await getDocs(
            query(collection(db, "projects"), where("status", "==", "published"))
          );
          setProjects(projSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
          return;
        }

        // ✅ listener لاستثمارات العميل
        const qInv = query(
          collection(db, "investments"),
          where("investorUid", "==", user.uid)
        );

        unsub = onSnapshot(
          qInv,
          async (snap) => {
            const invs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

            // ترتيب محلي (بدون index)
            invs.sort((a: any, b: any) => {
              const ta = toDateSafe(a.createdAt)?.getTime() ?? 0;
              const tb = toDateSafe(b.createdAt)?.getTime() ?? 0;
              return tb - ta;
            });

            setInvestments(invs);

            // ✅ مشاريع منشورة (للقسم السفلي + أسماء المشاريع)
            const projSnap = await getDocs(
              query(collection(db, "projects"), where("status", "==", "published"))
            );
            setProjects(projSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

            setLoading(false);
          },
          (err) => {
            console.error("investments_permission_or_error", err);
            setInvestments([]);
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
      if (unsub) unsub();
    };
  }, [user?.uid, isClient]);

  const totalInvested = useMemo(
    () => investments.reduce((s, i) => s + Number(i.amount || 0), 0),
    [investments]
  );

  const totalExpectedReturn = useMemo(
    () => investments.reduce((s, i) => s + Number(i.estimatedReturn || 0), 0),
    [investments]
  );

  const activeInvestments = useMemo(
    () =>
      investments.filter((i) =>
        ["active", "approved", "signing", "signed"].includes(String(i.status || ""))
      ).length,
    [investments]
  );

  const pendingInvestments = useMemo(
    () =>
      investments.filter((i) =>
        ["pending", "pending_review", "pending_contract"].includes(
          String(i.status || "")
        )
      ).length,
    [investments]
  );

  const statusBadge = (status: string) => {
    const map: any = {
      pending: ["معلق", "bg-orange-500"],
      pending_review: ["قيد المراجعة", "bg-blue-600"],
      approved: ["معتمد", "bg-green-600"],
      active: ["نشط", "bg-emerald-700"],
      rejected: ["مرفوض", "bg-red-600"],
      completed: ["مكتمل", "bg-gray-600"],

      pending_contract: ["بانتظار العقد", "bg-purple-600"],
      signing: ["قيد الإجراء", "bg-indigo-600"],
      signed: ["تم الإجراء", "bg-green-700"],
    };
    const [label, cls] = map[status] || ["قيد المراجعة", "bg-blue-600"];
    return <Badge className={cls}>{label}</Badge>;
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
              <Badge variant="outline">{role || "—"}</Badge>
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
              هنا تتابع استثماراتك وحالتها خطوة بخطوة
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
            value={`${totalInvested.toLocaleString()} ر.س`}
          />
          <Stat
            title="العائد المتوقع"
            icon={TrendingUp}
            value={`${totalExpectedReturn.toLocaleString()} ر.س`}
            green
          />
          <Stat
            title="استثمارات نشطة"
            icon={CheckCircle}
            value={activeInvestments}
          />
          <Stat title="قيد المراجعة" icon={Clock} value={pendingInvestments} />
        </div>

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
                  const project = projects.find((p) => p.id === inv.projectId);

                  const status = String(inv.status || "pending_review");
                  const createdAt = inv.createdAt ? formatDateAR(inv.createdAt) : "—";

                  // ✅ العقد صار “اختياري” (مو أساس)
                  const contractId = inv?.contractId || null;
                  const contractUrl = inv?.contractUrl || null;

                  return (
                    <Card key={inv.id} className="overflow-hidden">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-bold truncate">
                              {project?.titleAr || inv?.projectTitle || "مشروع غير معروف"}
                            </h3>

                            <div className="mt-1 text-xs text-muted-foreground">
                              تاريخ الطلب: {createdAt}
                            </div>

                            {inv?.amount != null && (
                              <p className="mt-2 text-sm">
                                <span className="text-muted-foreground">المبلغ: </span>
                                <b>{Number(inv.amount).toLocaleString()} ر.س</b>
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
                                <Link href={`/client/contracts/${contractId}`}>
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
function Stat({ title, icon: Icon, value, green }: any) {
  return (
    <Card>
      <CardHeader className="flex justify-between pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <Icon className={`w-5 h-5 ${green ? "text-green-600" : "text-primary"}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${green ? "text-green-600" : ""}`}>
          {value}
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
