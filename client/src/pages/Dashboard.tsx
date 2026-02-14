// client/src/pages/client/MyDashboard.tsx
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
} from "lucide-react";

import { collection, getDocs, query, where, orderBy } from "firebase/firestore";

/* =========================
   Types
========================= */
type Investment = any;
type Project = any;

/* =========================
   Helpers
========================= */
function daysBetween(a: Date, b: Date) {
  return Math.max(
    0,
    Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
  );
}

export default function MyDashboard() {
  const { user, logout } = useAuth();

  const [investments, setInvestments] = useState<Investment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const isClient = user?.role === "client";

  /* =========================
     Load client data
  ========================= */
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!user?.uid || !isClient) {
        if (mounted) setLoading(false);
        return;
      }

      const invSnap = await getDocs(
        query(
          collection(db, "investments"),
          where("investorUid", "==", user.uid),
          orderBy("createdAt", "desc")
        )
      );

      const projSnap = await getDocs(
        query(collection(db, "projects"), where("status", "==", "published"))
      );

      if (!mounted) return;

      setInvestments(invSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setProjects(projSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };

    load();

    return () => {
      mounted = false;
    };
  }, [user?.uid, isClient]);

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

  /* ✅ الأرباح حتى اليوم */
  const profitToDate = useMemo(() => {
    const today = new Date();

    return investments.reduce((sum, inv) => {
      if (!inv.startAt || !inv.plannedEndAt) return sum;

      const expected = Number(inv.estimatedReturn || 0);
      if (!expected) return sum;

      const start = inv.startAt.toDate();
      const end = inv.plannedEndAt.toDate();

      const totalDays = daysBetween(start, end);
      const elapsedDays = Math.min(
        totalDays,
        daysBetween(start, today)
      );

      if (totalDays <= 0) return sum;

      return sum + expected * (elapsedDays / totalDays);
    }, 0);
  }, [investments]);

  const activeInvestments = useMemo(
    () =>
      investments.filter((i) =>
        ["active", "approved", "signing", "signed"].includes(
          String(i.status || "")
        )
      ).length,
    [investments]
  );

  const pendingInvestments = useMemo(
    () =>
      investments.filter((i) =>
        ["pending", "pending_contract"].includes(String(i.status || ""))
      ).length,
    [investments]
  );

  const statusBadge = (status: string) => {
    const map: any = {
      pending: ["معلق", "bg-orange-500"],
      approved: ["معتمد", "bg-green-500"],
      active: ["نشط", "bg-blue-500"],
      rejected: ["مرفوض", "bg-red-500"],
      completed: ["مكتمل", "bg-gray-500"],
      pending_contract: ["بانتظار العقد", "bg-purple-600"],
      signing: ["قيد التوقيع", "bg-indigo-600"],
      signed: ["تم التوقيع", "bg-green-700"],
    };
    const [label, cls] = map[status] || map.pending;
    return <Badge className={cls}>{label}</Badge>;
  };

  /* =========================
     Views
  ========================= */
  if (!user) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>لوحة العميل</CardTitle>
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

  if (!isClient) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>حسابك ليس عميل حالياً</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline">{user.role}</Badge>
              <Badge variant="secondary">{user.email}</Badge>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              حسابك مسجّل دخول، لكن الدور الحالي ليس <b>client</b>.
            </p>
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

        <div>
          <h1 className="text-4xl font-bold mb-2">
            مرحباً، {user?.displayName || user?.email || "عزيزي المستثمر"}
          </h1>
          <p className="text-muted-foreground text-lg">
            نظرة عامة على استثماراتك
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
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
            title="الأرباح حتى اليوم"
            icon={TrendingUp}
            value={`${Math.round(profitToDate).toLocaleString()} ر.س`}
            green
          />
          <Stat
            title="استثمارات نشطة"
            icon={CheckCircle}
            value={activeInvestments}
          />
          <Stat
            title="قيد المراجعة"
            icon={Clock}
            value={pendingInvestments}
          />
        </div>

        {/* باقي الصفحة كما هي بدون أي حذف */}
      </div>
    </ClientLayout>
  );
}

/* ========================= */
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
