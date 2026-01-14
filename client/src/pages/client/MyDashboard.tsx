// client/src/pages/client/ClientDashboard.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle,
  Crown,
  Building2,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { db } from "@/_core/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";

/* =========================
   Types
========================= */
type Investment = any;
type Project = any;
type VipOffer = any;

export default function ClientDashboard() {
  const { user } = useAuth();

  const [investments, setInvestments] = useState<Investment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [vipOffers, setVipOffers] = useState<VipOffer[]>([]);
  const [loading, setLoading] = useState(true);

  /* =========================
     Load data
  ========================= */
  useEffect(() => {
    if (!user?.uid) return;

    const load = async () => {
      const invSnap = await getDocs(
        query(
          collection(db, "investments"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        )
      );

      const projSnap = await getDocs(
        query(
          collection(db, "projects"),
          where("status", "==", "published")
        )
      );

      const vipSnap =
        user.vipTier && user.vipTier !== "none"
          ? await getDocs(
              query(
                collection(db, "vipOffers"),
                where("isActive", "==", true)
              )
            )
          : null;

      setInvestments(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setVipOffers(vipSnap ? vipSnap.docs.map(d => ({ id: d.id, ...d.data() })) : []);
      setLoading(false);
    };

    load();
  }, [user]);

  /* =========================
     Calculations
  ========================= */
  const totalInvested = useMemo(
    () => investments.reduce((s, i) => s + Number(i.amount || 0), 0),
    [investments]
  );

  const totalExpectedReturn = useMemo(
    () => investments.reduce((s, i) => s + Number(i.estimatedReturn || 0), 0),
    [investments]
  );

  const activeInvestments = investments.filter(
    i => i.status === "active" || i.status === "approved"
  ).length;

  const pendingInvestments = investments.filter(
    i => i.status === "pending"
  ).length;

  const statusBadge = (status: string) => {
    const map: any = {
      pending: ["معلق", "bg-orange-500"],
      approved: ["معتمد", "bg-green-500"],
      active: ["نشط", "bg-blue-500"],
      rejected: ["مرفوض", "bg-red-500"],
      completed: ["مكتمل", "bg-gray-500"],
    };
    const [label, cls] = map[status] || map.pending;
    return <Badge className={cls}>{label}</Badge>;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="py-20 text-center">جاري التحميل...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              مرحباً، {user?.name || "عزيزي المستثمر"}
            </h1>
            <p className="text-muted-foreground text-lg">
              نظرة عامة على استثماراتك
            </p>
          </div>

          {user?.vipTier && user.vipTier !== "none" && (
            <Badge className="bg-accent text-lg px-4 py-2">
              <Crown className="w-5 h-5 ml-2" />
              VIP – {user.vipTier.toUpperCase()}
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Stat title="إجمالي الاستثمارات" icon={DollarSign} value={`${totalInvested.toLocaleString()} ر.س`} />
          <Stat title="العائد المتوقع" icon={TrendingUp} value={`${totalExpectedReturn.toLocaleString()} ر.س`} green />
          <Stat title="استثمارات نشطة" icon={CheckCircle} value={activeInvestments} />
          <Stat title="قيد المراجعة" icon={Clock} value={pendingInvestments} />
        </div>

        {/* VIP Offers */}
        {vipOffers.length > 0 && (
          <Card className="border-2 border-accent">
            <CardHeader>
              <CardTitle className="flex gap-2">
                <Crown /> عروض VIP
              </CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              {vipOffers.map(o => (
                <Card key={o.id}>
                  <CardContent className="pt-6">
                    <h3 className="font-bold mb-2">{o.titleAr}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{o.descriptionAr}</p>
                    <Button size="sm" className="w-full">
                      استفد من العرض
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        )}

        {/* My Investments */}
        <Card>
          <CardHeader className="flex justify-between">
            <CardTitle>استثماراتي</CardTitle>
            <Link href="/client/investments">
              <Button variant="outline">عرض الكل</Button>
            </Link>
          </CardHeader>

          <CardContent>
            {investments.length === 0 ? (
              <Empty />
            ) : (
              investments.slice(0, 5).map(inv => {
                const project = projects.find(p => p.id === inv.projectId);
                return (
                  <Card key={inv.id} className="mb-4">
                    <CardContent className="pt-6">
                      <div className="flex justify-between mb-3">
                        <div>
                          <h3 className="font-bold">{project?.titleAr}</h3>
                          <p className="text-sm text-muted-foreground">#{project?.issueNumber}</p>
                        </div>
                        {statusBadge(inv.status)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Projects */}
        <Card>
          <CardHeader className="flex justify-between">
            <CardTitle>مشاريع متاحة</CardTitle>
            <Link href="/projects">
              <Button variant="outline">عرض الكل</Button>
            </Link>
          </CardHeader>

          <CardContent className="grid md:grid-cols-2 gap-4">
            {projects.slice(0, 4).map(p => {
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
    </DashboardLayout>
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
