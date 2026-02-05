// client/src/pages/admin/Reports.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { collection, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { Download, TrendingUp, DollarSign, Users, Building2 } from "lucide-react";
import { toast } from "sonner";

type AnyDoc = Record<string, any> & { id: string };

export default function Reports() {
  const [reportType, setReportType] = useState<"monthly" | "quarterly" | "yearly">(
    "monthly"
  );
  const [selectedYear, setSelectedYear] = useState("2024");

  const [projects, setProjects] = useState<AnyDoc[]>([]);
  const [investments, setInvestments] = useState<AnyDoc[]>([]);
  const [users, setUsers] = useState<AnyDoc[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  /* =========================
     Helpers
  ========================= */
  const toNumberSafe = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const getDate = (createdAt: any): Date | null => {
    if (!createdAt) return null;
    if (createdAt instanceof Timestamp) return createdAt.toDate();
    if (typeof createdAt === "number") return new Date(createdAt);
    if (createdAt?.seconds) return new Date(createdAt.seconds * 1000);
    return null;
  };

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

  /* =========================
     Load data (Realtime)
  ========================= */
  useEffect(() => {
    setLoading(true);
    setError("");

    const unsubs: Array<() => void> = [];

    const sub = (colName: string, setter: (rows: AnyDoc[]) => void, markDone?: boolean) => {
      const unsub = onSnapshot(
        collection(db, colName),
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          setter(rows);
          if (markDone) setLoading(false);
        },
        (err) => {
          console.error(`${colName} snapshot error:`, err);
          setError("تعذر تحميل بيانات التقارير (صلاحيات/اتصال).");
          if (markDone) setLoading(false);
        }
      );
      unsubs.push(unsub);
    };

    // ✅ نعتبر المشاريع هي التي توقف التحميل
    sub("projects", setProjects, true);
    sub("investments", setInvestments);
    sub("users", setUsers);

    return () => unsubs.forEach((u) => u());
  }, []);

  /* =========================
     Filters
  ========================= */
  const yearNum = useMemo(() => Number(selectedYear), [selectedYear]);

  const investmentsInYear = useMemo(() => {
    return investments.filter((inv) => {
      const dt = getDate(inv.createdAt);
      return dt ? dt.getFullYear() === yearNum : false;
    });
  }, [investments, yearNum]);

  /* =========================
     Calculations
  ========================= */
  const totalInvestments = useMemo(
    () => investmentsInYear.reduce((s, i) => s + toNumberSafe(i.amount), 0),
    [investmentsInYear]
  );

  const totalProjects = projects.length;

  // NOTE: حسب كودك السابق تعتبر المستثمرين = users.role === "user"
  const totalInvestors = useMemo(
    () => users.filter((u) => u.role === "user").length,
    [users]
  );

  const avgInvestment = totalInvestors > 0 ? totalInvestments / totalInvestors : 0;

  /* =========================
     Charts data (Dynamic)
  ========================= */

  // ✅ تجميع الاستثمارات حسب (شهري / ربع سنوي / سنوي)
  const timeSeriesData = useMemo(() => {
    // returns غير محسوب فعليًا (ما عندنا مصدر موحد)
    const addRow = (label: string, amountAdd: number) => ({
      label,
      investments: Math.round(amountAdd),
      returns: 0, // تقديري مؤقت
    });

    if (reportType === "yearly") {
      // سنة واحدة فقط (السنة المختارة)
      return [addRow(String(yearNum), totalInvestments)];
    }

    if (reportType === "quarterly") {
      const quarters = [
        { label: "Q1", months: [0, 1, 2] },
        { label: "Q2", months: [3, 4, 5] },
        { label: "Q3", months: [6, 7, 8] },
        { label: "Q4", months: [9, 10, 11] },
      ];

      return quarters.map((q) => {
        const sum = investmentsInYear.reduce((acc, inv) => {
          const dt = getDate(inv.createdAt);
          if (!dt) return acc;
          const m = dt.getMonth();
          if (!q.months.includes(m)) return acc;
          return acc + toNumberSafe(inv.amount);
        }, 0);

        return addRow(q.label, sum);
      });
    }

    // monthly
    const monthSums = new Array(12).fill(0);
    for (const inv of investmentsInYear) {
      const dt = getDate(inv.createdAt);
      if (!dt) continue;
      const m = dt.getMonth();
      monthSums[m] += toNumberSafe(inv.amount);
    }

    return monthNames.map((name, idx) => addRow(name, monthSums[idx]));
  }, [reportType, yearNum, investmentsInYear, totalInvestments]);

  const projectTypeData = useMemo(() => {
    return [
      {
        name: "صكوك",
        value: projects.filter((p) => p.projectType === "sukuk").length,
        color: "#F2B705",
      },
      {
        name: "تطوير أراضي",
        value: projects.filter((p) => p.projectType === "land_development").length,
        color: "#030640",
      },
      {
        name: "VIP حصري",
        value: projects.filter((p) => p.projectType === "vip_exclusive").length,
        color: "#8B7355",
      },
    ];
  }, [projects]);

  const investmentStatusData = useMemo(() => {
    // ✅ نحسب حالات الاستثمارات داخل السنة المختارة
    const inv = investmentsInYear;

    return [
      {
        name: "نشط",
        value: inv.filter((i) => i.status === "active").length,
        color: "#10b981",
      },
      {
        name: "معلق",
        value: inv.filter((i) => i.status === "pending").length,
        color: "#f59e0b",
      },
      {
        name: "مكتمل",
        value: inv.filter((i) => i.status === "completed").length,
        color: "#6366f1",
      },
      {
        name: "مرفوض",
        value: inv.filter((i) => i.status === "rejected").length,
        color: "#ef4444",
      },
    ];
  }, [investmentsInYear]);

  /* =========================
     Export (placeholder)
  ========================= */
  const handleExportPDF = () => {
    toast.success("تصدير PDF (لاحقًا)");
  };

  const handleExportExcel = () => {
    toast.success("تصدير Excel (لاحقًا)");
  };

  /* =========================
     UI
  ========================= */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">التقارير المالية</h1>
            <p className="text-muted-foreground">تقارير شاملة عن أداء المنصة</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={reportType} onValueChange={(v: any) => setReportType(v)}>
              <SelectTrigger className="w-[140px] sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">شهري</SelectItem>
                <SelectItem value="quarterly">ربع سنوي</SelectItem>
                <SelectItem value="yearly">سنوي</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[110px] sm:w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
                <SelectItem value="2022">2022</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={handleExportPDF}>
              <Download className="h-4 w-4 mr-2" /> PDF
            </Button>
            <Button className="bg-[#F2B705] hover:bg-[#d9a504]" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" /> Excel
            </Button>
          </div>
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

        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-4">
          <Summary
            title="إجمالي الاستثمارات"
            value={`${totalInvestments.toLocaleString()} ر.س`}
            icon={<DollarSign />}
          />
          <Summary title="عدد المشاريع" value={totalProjects} icon={<Building2 />} />
          <Summary title="عدد المستثمرين" value={totalInvestors} icon={<Users />} />
          <Summary
            title="متوسط الاستثمار"
            value={`${Math.round(avgInvestment).toLocaleString()} ر.س`}
            icon={<TrendingUp />}
          />
        </div>

        {/* Line chart */}
        <Card>
          <CardHeader>
            <CardTitle>
              اتجاه الاستثمارات{" "}
              {reportType === "monthly"
                ? "الشهرية"
                : reportType === "quarterly"
                ? "الربع سنوية"
                : "السنوية"}{" "}
              ({selectedYear})
            </CardTitle>
            <CardDescription>الاستثمارات (العوائد تقديرية لاحقًا)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line dataKey="investments" stroke="#F2B705" strokeWidth={2} />
                <Line dataKey="returns" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          <ChartPie title="توزيع المشاريع" data={projectTypeData} />
          <ChartBar title="حالة الاستثمارات (حسب السنة)" data={investmentStatusData} />
        </div>
      </div>
    </DashboardLayout>
  );
}

/* =========================
   Small components
========================= */

function Summary({ title, value, icon }: any) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function ChartPie({ title, data }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={data} dataKey="value" outerRadius={80} label>
              {data.map((d: any, i: number) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ChartBar({ title, data }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value">
              {data.map((d: any, i: number) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
