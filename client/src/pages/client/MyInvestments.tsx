// client/src/pages/client/MyInvestments.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, Calendar, Building2, Eye } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";

/* =========================
   Types
========================= */
type Investment = any;
type Project = any;

export default function MyInvestments() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  /* =========================
     Load Firestore data
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

      setInvestments(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };

    load();
  }, [user]);

  /* =========================
     Filters & calculations
  ========================= */
  const filteredInvestments = useMemo(() => {
    if (statusFilter === "all") return investments;
    return investments.filter(i => i.status === statusFilter);
  }, [investments, statusFilter]);

  const totalInvested = useMemo(
    () => investments.reduce((s, i) => s + Number(i.amount || 0), 0),
    [investments]
  );

  const totalExpectedReturn = useMemo(
    () => investments.reduce((s, i) => s + Number(i.estimatedReturn || 0), 0),
    [investments]
  );

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold mb-2">استثماراتي</h1>
          <p className="text-muted-foreground text-lg">
            عرض تفصيلي لجميع استثماراتك
          </p>
        </div>

        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard title="إجمالي المستثمر" value={`${totalInvested.toLocaleString()} ر.س`} />
          <SummaryCard title="العائد المتوقع" value={`${totalExpectedReturn.toLocaleString()} ر.س`} green />
          <SummaryCard title="عدد الاستثمارات" value={investments.length} />
        </div>

        {/* Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">تصفية حسب الحالة:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="pending">معلق</SelectItem>
                  <SelectItem value="approved">معتمد</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                  <SelectItem value="rejected">مرفوض</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        {loading ? (
          <Loading />
        ) : filteredInvestments.length === 0 ? (
          <Empty statusFilter={statusFilter} />
        ) : (
          <div className="space-y-4">
            {filteredInvestments.map(inv => {
              const project = projects.find(p => p.id === inv.projectId);
              const progress = project?.targetAmount
                ? (Number(project.currentAmount) / Number(project.targetAmount)) * 100
                : 0;

              return (
                <Card key={inv.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex flex-col lg:flex-row gap-6">
                      {/* Image */}
                      <div className="lg:w-48 h-48 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                        {project?.coverImage ? (
                          <img src={project.coverImage} className="w-full h-full object-cover" />
                        ) : (
                          <Building2 className="w-12 h-12 text-muted-foreground" />
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 space-y-4">
                        <div className="flex justify-between">
                          <div>
                            <h3 className="text-2xl font-bold">
                              {project?.titleAr || "مشروع غير معروف"}
                            </h3>
                            <div className="text-sm text-muted-foreground">
                              #{project?.issueNumber} • {project?.locationAr}
                            </div>
                          </div>
                          {statusBadge(inv.status)}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <Stat label="المبلغ المستثمر" value={`${Number(inv.amount).toLocaleString()} ر.س`} primary />
                          <Stat label="العائد المتوقع" value={`${Number(inv.estimatedReturn).toLocaleString()} ر.س`} green />
                          <Stat label="نسبة العائد" value={`${inv.customRate || project?.annualReturn || "-"}%`} />
                          <Stat label="المدة" value={`${inv.customDuration || project?.duration || "-"} شهر`} />
                        </div>

                        {project && (
                          <div>
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-muted-foreground">تقدم المشروع</span>
                              <span className="font-bold">{progress.toFixed(0)}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-2 border-t">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            {new Date(inv.createdAt).toLocaleDateString("ar-SA")}
                          </div>

                          {project && (
                            <Link href={`/projects/${project.id}`}>
                              <Button variant="outline" size="sm">
                                <Eye className="w-4 h-4 ml-2" />
                                عرض المشروع
                              </Button>
                            </Link>
                          )}
                        </div>

                        {inv.status === "rejected" && inv.rejectionReason && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <div className="font-medium text-red-900 mb-1">سبب الرفض:</div>
                            <div className="text-sm text-red-800">
                              {inv.rejectionReason}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

/* =========================
   Helpers
========================= */
function SummaryCard({ title, value, green }: any) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${green ? "text-green-600" : "text-primary"}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, primary, green }: any) {
  return (
    <div>
      <div className="text-sm text-muted-foreground mb-1">{label}</div>
      <div className={`text-xl font-bold ${primary ? "text-primary" : ""} ${green ? "text-green-600" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="text-center py-12">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
    </div>
  );
}

function Empty({ statusFilter }: any) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground mb-4">
          {statusFilter === "all"
            ? "لم تقم بأي استثمارات بعد"
            : "لا توجد استثمارات بهذه الحالة"}
        </p>
        <Link href="/projects">
          <Button>
            <TrendingUp className="w-4 h-4 ml-2" />
            استكشف المشاريع
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
