import { useEffect, useMemo, useState } from "react";
import ClientLayout from "@/components/ClientLayout";
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
import { TrendingUp, Calendar, Building2, Eye, FileText, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

/* =========================
   helpers (safer)
========================= */
const toDateSafe = (v: any) => {
  try {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
};
const formatDateAR = (v: any) => {
  const d = toDateSafe(v);
  return d ? d.toLocaleDateString("ar-SA") : "—";
};

/* =========================
   Types
========================= */
type Investment = any;
type Project = any;

function statusBadge(status: string) {
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
}

/* =========================
   Stage (timeline) helpers
========================= */
type StageKey = "pre" | "contract" | "sent" | "signed" | "final";
const STAGES: { key: StageKey; label: string }[] = [
  { key: "pre", label: "استثمار مبدئي" },
  { key: "contract", label: "إعداد العقد" },
  { key: "sent", label: "أُرسل للتوقيع" },
  { key: "signed", label: "تم التوقيع" },
  { key: "final", label: "تم الترحيل" },
];

// نطلع المرحلة حسب بيانات الاستثمار (بدون ما نعتمد على messages هنا)
function getStage(inv: any): StageKey {
  const st = String(inv?.status || "");
  const cst = String(inv?.contractStatus || "");

  // آخر شيء: ترحيل للمشروع (active) أو finalizedAt
  if (st === "active" || inv?.finalizedAt) return "final";

  // تم التوقيع
  if (st === "signed" || cst === "signed" || inv?.signedAt) return "signed";

  // تم الإرسال للتوقيع
  if (st === "signing" || cst === "signing" || inv?.signingAt) return "sent";

  // عقد موجود (إعداد عقد)
  if (inv?.contractId || cst === "pending" || st === "pending") return "contract";

  // مبدئي
  return "pre";
}

function stageIndex(key: StageKey) {
  return STAGES.findIndex((s) => s.key === key);
}

function StageTimeline({ stage }: { stage: StageKey }) {
  const idx = stageIndex(stage);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>مرحلة الطلب</span>
        <span>
          {STAGES[idx]?.label}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {STAGES.map((s, i) => {
          const done = i < idx;
          const active = i === idx;

          return (
            <div key={s.key} className="space-y-2">
              <div
                className={[
                  "h-2 rounded-full border",
                  done ? "bg-primary border-primary" : "",
                  active ? "bg-primary/40 border-primary" : "",
                  !done && !active ? "bg-muted border-border" : "",
                ].join(" ")}
              />
              <div
                className={[
                  "text-[11px] leading-tight text-center",
                  done ? "text-foreground" : active ? "text-foreground" : "text-muted-foreground",
                ].join(" ")}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground">
        {stage === "sent" ? "العقد عندك الآن للتوقيع." : null}
        {stage === "contract" ? "الإدارة تجهّز العقد." : null}
        {stage === "pre" ? "تم تسجيل طلبك وبدأت مراجعته." : null}
        {stage === "signed" ? "تم توقيع العقد، بانتظار الترحيل للمشروع." : null}
        {stage === "final" ? "تم ترحيل الاستثمار للمشروع وإقفاله." : null}
      </div>
    </div>
  );
}

export default function MyInvestments() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const isClient = user?.role === "client";

  /* =========================
     Load Firestore data
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
     Filters & calculations
  ========================= */
  const filteredInvestments = useMemo(() => {
    if (statusFilter === "all") return investments;
    return investments.filter((i) => String(i.status) === statusFilter);
  }, [investments, statusFilter]);

  const totalInvested = useMemo(
    () => investments.reduce((s, i) => s + Number(i.amount || 0), 0),
    [investments]
  );

  const totalExpectedReturn = useMemo(
    () => investments.reduce((s, i) => s + Number(i.estimatedReturn || 0), 0),
    [investments]
  );

  // لو مو مسجل أو مو client
  if (!user) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>استثماراتي</CardTitle>
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
            <CardTitle>هذه الصفحة خاصة بالعميل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              دور حسابك الحالي هو <b>{user.role}</b> وليس <b>client</b>.
            </p>
            <Link href="/projects">
              <Button className="w-full">تصفّح المشاريع</Button>
            </Link>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout className="py-12">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold mb-2">استثماراتي</h1>
          <p className="text-muted-foreground text-lg">
            تقدر تشوف استثمارك وين وصل بالضبط خطوة بخطوة
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <span className="text-sm font-medium">تصفية حسب الحالة:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>

                  <SelectItem value="pending_contract">بانتظار العقد</SelectItem>
                  <SelectItem value="signing">قيد التوقيع</SelectItem>
                  <SelectItem value="signed">تم التوقيع</SelectItem>

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
            {filteredInvestments.map((inv) => {
              const project = projects.find((p) => p.id === inv.projectId);
              const progress = project?.targetAmount
                ? (Number(project.currentAmount || 0) / Number(project.targetAmount || 1)) * 100
                : 0;

              const contractId = inv?.contractId || null;
              const stage = getStage(inv);

              return (
                <Card key={inv.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex flex-col xl:flex-row gap-6">
                      {/* Image */}
                      <div className="xl:w-56 w-full h-44 xl:h-56 rounded-xl bg-muted flex items-center justify-center overflow-hidden">
                        {project?.coverImage ? (
                          <img
                            src={project.coverImage}
                            className="w-full h-full object-cover"
                            alt={project?.titleAr || "project"}
                          />
                        ) : (
                          <Building2 className="w-12 h-12 text-muted-foreground" />
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 space-y-4 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-2xl font-bold truncate">
                              {project?.titleAr || "مشروع غير معروف"}
                            </h3>
                            <div className="text-sm text-muted-foreground truncate">
                              #{project?.issueNumber || "—"} • {project?.locationAr || "—"}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {statusBadge(String(inv.status || "pending"))}
                            {stage === "final" ? (
                              <Badge className="bg-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                                مكتمل إداريًا
                              </Badge>
                            ) : null}
                          </div>
                        </div>

                        {/* ✅ Timeline */}
                        <div className="rounded-xl border bg-muted/30 p-4">
                          <StageTimeline stage={stage} />
                        </div>

                        {/* Progress (project funding) */}
                        {project && (
                          <div>
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-muted-foreground">تقدم المشروع</span>
                              <span className="font-bold">{Number.isFinite(progress) ? progress.toFixed(0) : "0"}%</span>
                            </div>
                            <Progress value={Number.isFinite(progress) ? progress : 0} className="h-2" />
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            {formatDateAR(inv.createdAt)}
                          </div>

                          {/* ✅ Actions */}
                          <div className="flex flex-col sm:flex-row gap-2">
                            {/* ✅ زر العقد */}
                            {contractId ? (
                              <Link href={`/client/contracts/${contractId}`}>
                                <Button size="sm">
                                  <FileText className="w-4 h-4 ml-2" />
                                  {stage === "sent" ? "توقيع العقد" : "عرض العقد"}
                                </Button>
                              </Link>
                            ) : (
                              <Button size="sm" variant="outline" disabled>
                                <FileText className="w-4 h-4 ml-2" />
                                العقد غير جاهز بعد
                              </Button>
                            )}

                            {project ? (
                              <Link href={`/projects/${project.id}`}>
                                <Button variant="outline" size="sm">
                                  <Eye className="w-4 h-4 ml-2" />
                                  عرض المشروع
                                </Button>
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ClientLayout>
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
          {statusFilter === "all" ? "لم تقم بأي استثمارات بعد" : "لا توجد استثمارات بهذه الحالة"}
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
