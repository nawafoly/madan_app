import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardLayout from "@/components/DashboardLayout";
import {
  TrendingUp,
  Users,
  Building2,
  MessageSquare,
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";

import {
  collection,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/_core/firebase";

import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type AnyDoc = Record<string, any> & { id: string };

export default function AdminDashboard() {
  const [projects, setProjects] = useState<AnyDoc[]>([]);
  const [investments, setInvestments] = useState<AnyDoc[]>([]);
  const [users, setUsers] = useState<AnyDoc[]>([]);
  const [messages, setMessages] = useState<AnyDoc[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // ✅ Realtime subscriptions
  useEffect(() => {
    setLoading(true);
    setError("");

    const unsubs: Array<() => void> = [];

    const sub = (
      colName: string,
      setter: (rows: AnyDoc[]) => void,
      markLoaded?: boolean
    ) => {
      const unsub = onSnapshot(
        collection(db, colName),
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          setter(rows);
          if (markLoaded) setLoading(false);
        },
        (err) => {
          console.error(`${colName} snapshot error:`, err);
          setError("تعذر تحميل بيانات لوحة التحكم (صلاحيات/اتصال).");
          if (markLoaded) setLoading(false);
        }
      );
      unsubs.push(unsub);
    };

    // ✅ نعتبر projects هو اللي “يوقف” loading (وباقي الداتا تلحق)
    sub("projects", setProjects, true);
    sub("investments", setInvestments);
    sub("users", setUsers);
    sub("messages", setMessages);

    return () => {
      unsubs.forEach((u) => u());
    };
  }, []);

  const toNumberSafe = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const stats = useMemo(() => {
    return {
      totalProjects: projects.length,
      publishedProjects: projects.filter((p) => p.status === "published").length,
      totalInvestments: investments.length,
      pendingInvestments: investments.filter((i) => i.status === "pending").length,
      totalUsers: users.length,
      vipUsers: users.filter((u) => u.vipStatus === "vip").length,
      newMessages: messages.filter((m) => m.status === "new").length,
      totalMessages: messages.length,
    };
  }, [projects, investments, users, messages]);

  const totalInvestedAmount = useMemo(() => {
    return investments.reduce((sum, inv) => sum + toNumberSafe(inv.amount), 0);
  }, [investments]);

  const approvedInvestments = useMemo(() => {
    return investments.filter(
      (i) => i.status === "approved" || i.status === "active"
    ).length;
  }, [investments]);

  // ✅ Dynamic line chart from Firestore: last 6 months totals
  const investmentsGrowthData = useMemo(() => {
    const monthNames = [
      "يناير",
      "فبراير",
      "مارس",
      "أبريل",
      "مايو",
      "يونيو",
      "يوليو",
      "أغسطس",
      "سبتمبر",
      "أكتوبر",
      "نوفمبر",
      "ديسمبر",
    ];

    const getDate = (createdAt: any): Date | null => {
      if (!createdAt) return null;
      if (createdAt instanceof Timestamp) return createdAt.toDate();
      if (typeof createdAt === "number") return new Date(createdAt);
      // أحيانًا تكون { seconds, nanoseconds }
      if (createdAt?.seconds) return new Date(createdAt.seconds * 1000);
      return null;
    };

    // key: YYYY-MM
    const map = new Map<string, { y: number; m: number; amount: number }>();

    for (const inv of investments) {
      const dt = getDate(inv.createdAt);
      if (!dt) continue;

      const y = dt.getFullYear();
      const m = dt.getMonth(); // 0..11
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;

      const prev = map.get(key);
      const add = toNumberSafe(inv.amount);
      if (prev) prev.amount += add;
      else map.set(key, { y, m, amount: add });
    }

    // آخر 6 شهور (حتى لو ما فيها بيانات)
    const now = new Date();
    const buckets: Array<{ y: number; m: number }> = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      buckets.push({ y: d.getFullYear(), m: d.getMonth() });
    }

    const rows = buckets.map(({ y, m }) => {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      const found = map.get(key);
      return {
        month: monthNames[m],
        amount: found ? Math.round(found.amount) : 0,
      };
    });

    return rows;
  }, [investments]);

  const projectDistribution = useMemo(() => {
    return [
      { name: "صكوك", value: projects.filter((p) => p.projectType === "sukuk").length },
      {
        name: "أراضي",
        value: projects.filter((p) => p.projectType === "land_development").length,
      },
      {
        name: "VIP",
        value: projects.filter((p) => p.projectType === "vip_exclusive").length,
      },
    ];
  }, [projects]);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">لوحة التحكم</h1>
          <p className="text-muted-foreground text-lg">نظرة عامة على أداء المنصة</p>
        </div>

        {/* Loading / Error */}
        {loading ? (
          <Card>
            <CardContent className="py-10 text-center">جاري التحميل...</CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-10 text-center text-red-600">{error}</CardContent>
          </Card>
        ) : null}

        {/* Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Stat
            title="إجمالي المشاريع"
            value={stats.totalProjects}
            sub={`${stats.publishedProjects} منشور`}
            icon={<Building2 />}
          />
          <Stat
            title="إجمالي الاستثمارات"
            value={stats.totalInvestments}
            sub={`${approvedInvestments} معتمد`}
            icon={<DollarSign />}
          />
          <Stat
            title="إجمالي المستخدمين"
            value={stats.totalUsers}
            sub={`${stats.vipUsers} VIP`}
            icon={<Users />}
          />
          <Stat
            title="الرسائل"
            value={stats.totalMessages}
            sub={`${stats.newMessages} جديد`}
            icon={<MessageSquare />}
          />
        </div>

        {/* Financial */}
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2 items-center">
              <TrendingUp className="w-5 h-5" /> نظرة مالية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <Metric
                label="إجمالي الاستثمارات"
                value={`${totalInvestedAmount.toLocaleString()} ر.س`}
              />
              <Metric
                label="متوسط الاستثمار"
                value={
                  stats.totalInvestments
                    ? `${(totalInvestedAmount / stats.totalInvestments).toFixed(0)} ر.س`
                    : "0"
                }
              />
              <Metric
                label="معدل الموافقة"
                value={
                  stats.totalInvestments
                    ? `${((approvedInvestments / stats.totalInvestments) * 100).toFixed(1)}%`
                    : "0%"
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>نمو الاستثمارات (آخر 6 شهور)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={investmentsGrowthData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line dataKey="amount" stroke="#F2B705" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>توزيع المشاريع</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={projectDistribution}
                    outerRadius={80}
                    dataKey="value"
                    label
                  >
                    {["#F2B705", "#030640", "#0B0F19"].map((c, i) => (
                      <Cell key={i} fill={c} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        <div className="grid md:grid-cols-2 gap-6">
          <AlertCard
            title="استثمارات معلقة"
            count={stats.pendingInvestments}
            okText="لا توجد طلبات معلقة"
            warnText="طلب بانتظار المراجعة"
            icon={<Clock />}
          />
          <AlertCard
            title="رسائل جديدة"
            count={stats.newMessages}
            okText="لا توجد رسائل جديدة"
            warnText="رسالة جديدة"
            icon={<MessageSquare />}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}

/* Helpers */

function Stat({ title, value, sub, icon }: any) {
  return (
    <Card>
      <CardHeader className="flex flex-row justify-between pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: any) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

function AlertCard({ title, count, okText, warnText, icon }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {count > 0 ? (
          <div className="flex items-center gap-2 text-orange-600">
            <AlertCircle className="w-5 h-5" />
            {count} {warnText}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-5 h-5" />
            {okText}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
