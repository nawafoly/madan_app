import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { useAuth, hasPermission } from "@/_core/hooks/useAuth";
import { AUDIT_ACTIONS, auditedUpdateDoc, buildAuditSource } from "@/lib/auditLog";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
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
type InboxDialogKind = "messages" | "requests" | null;

const MONTH_NAMES_AR = [
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

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value === "number") return new Date(value);
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDateTimeAR(value: any) {
  const date = toDateSafe(value);
  return date
    ? date.toLocaleString("ar-SA", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "بدون تاريخ";
}

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function sortByCreatedAtDesc(rows: AnyDoc[]) {
  return [...rows].sort((a, b) => {
    const aTime = toDateSafe(a?.createdAt)?.getTime() ?? 0;
    const bTime = toDateSafe(b?.createdAt)?.getTime() ?? 0;
    return bTime - aTime;
  });
}

function normalizeRequestStatus(raw: unknown) {
  const status = String(raw ?? "").trim().toLowerCase();
  const legacyMap: Record<string, string> = {
    new: "pending",
    in_progress: "reviewing",
    pending_review: "reviewing",
    needs_account: "reviewing",
    waiting_client_confirmation: "reviewing",
    resolved: "approved",
    closed: "completed",
  };
  return legacyMap[status] || status || "pending";
}

function isUnreadMessage(row: AnyDoc) {
  return String(row?.status || "").trim().toLowerCase() === "new" && !row?.adminReadAt;
}

function isUnreadRequest(row: AnyDoc) {
  const status = normalizeRequestStatus(row?.status);
  return ["pending", "reviewing"].includes(status) && !row?.adminSeenAt;
}

function getClientDisplayName(row: AnyDoc) {
  return pickText(
    row?.name,
    row?.investorName,
    row?.userSnapshot?.displayName,
    row?.email,
    row?.createdByEmail,
    "عميل غير محدد"
  );
}

function getProjectDisplayName(row: AnyDoc) {
  return pickText(
    row?.projectTitle,
    row?.projectSnapshot?.titleAr,
    row?.projectSnapshot?.title,
    "بدون مشروع مرتبط"
  );
}

function getLinkedRequestId(row: AnyDoc) {
  return pickText(row?.parentRequestId, row?.requestId, row?.parentMessageId);
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const canSeeProjects = hasPermission(user, "projects.view");
  const canSeeInvestments = hasPermission(user, "investments.view");
  const canSeeUsers = hasPermission(user, "users.view");
  const canSeeMessages = hasPermission(user, "messages.view");
  const canSeeRequests = canSeeMessages;

  const [projects, setProjects] = useState<AnyDoc[]>([]);
  const [investments, setInvestments] = useState<AnyDoc[]>([]);
  const [usersRows, setUsersRows] = useState<AnyDoc[]>([]);
  const [requests, setRequests] = useState<AnyDoc[]>([]);
  const [messages, setMessages] = useState<AnyDoc[]>([]);
  const [activeDialog, setActiveDialog] = useState<InboxDialogKind>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          setter(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as any),
            }))
          );

          if (markLoaded) setLoading(false);
        },
        (err) => {
          console.error(`${colName} snapshot error:`, err);

          if (colName === "projects") {
            setError("تعذر تحميل بيانات لوحة التحكم.");
          }

          if (markLoaded) setLoading(false);
          setter([]);
        }
      );

      unsubs.push(unsub);
    };

    const loaders: Array<{
      allowed: boolean;
      col: string;
      setter: (rows: AnyDoc[]) => void;
    }> = [
      { allowed: canSeeProjects, col: "projects", setter: setProjects },
      { allowed: canSeeInvestments, col: "investments", setter: setInvestments },
      { allowed: canSeeUsers, col: "users", setter: setUsersRows },
      { allowed: canSeeRequests, col: "interest_requests", setter: setRequests },
      { allowed: canSeeMessages, col: "messages", setter: setMessages },
    ];

    const firstLoader = loaders.find((row) => row.allowed);

    if (!canSeeProjects) setProjects([]);
    if (!canSeeInvestments) setInvestments([]);
    if (!canSeeUsers) setUsersRows([]);
    if (!canSeeRequests) setRequests([]);
    if (!canSeeMessages) setMessages([]);

    if (canSeeProjects) sub("projects", setProjects, firstLoader?.col === "projects");
    if (canSeeInvestments) {
      sub("investments", setInvestments, firstLoader?.col === "investments");
    }
    if (canSeeUsers) sub("users", setUsersRows, firstLoader?.col === "users");
    if (canSeeRequests) {
      sub("interest_requests", setRequests, firstLoader?.col === "interest_requests");
    }
    if (canSeeMessages) sub("messages", setMessages, firstLoader?.col === "messages");

    if (!firstLoader) setLoading(false);

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [canSeeProjects, canSeeInvestments, canSeeUsers, canSeeRequests, canSeeMessages]);

  const toNumberSafe = (value: unknown) => {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
  };

  const unreadMessageRows = useMemo(
    () => sortByCreatedAtDesc(messages.filter(isUnreadMessage)),
    [messages]
  );

  const unreadRequestRows = useMemo(
    () => sortByCreatedAtDesc(requests.filter(isUnreadRequest)),
    [requests]
  );

  const stats = useMemo(
    () => ({
      totalProjects: projects.length,
      publishedProjects: projects.filter((row) => row.status === "published").length,
      totalInvestments: investments.length,
      totalUsers: usersRows.length,
      vipUsers: usersRows.filter((row) => row.vipStatus === "vip").length,
      pendingRequests: unreadRequestRows.length,
      newMessages: unreadMessageRows.length,
      totalMessages: messages.length,
    }),
    [projects, investments, usersRows, unreadRequestRows.length, unreadMessageRows.length, messages.length]
  );

  const totalInvestedAmount = useMemo(
    () => investments.reduce((sum, inv) => sum + toNumberSafe(inv.amount), 0),
    [investments]
  );

  const approvedInvestments = useMemo(
    () =>
      investments.filter((row) =>
        ["active", "completed"].includes(String(row.status || ""))
      ).length,
    [investments]
  );

  const investmentsGrowthData = useMemo(() => {
    const totalsByMonth = new Map<string, { year: number; month: number; amount: number }>();

    for (const inv of investments) {
      const date = toDateSafe(inv.createdAt);
      if (!date) continue;

      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      const previous = totalsByMonth.get(key);
      const amount = toNumberSafe(inv.amount);

      if (previous) previous.amount += amount;
      else totalsByMonth.set(key, { year, month, amount });
    }

    const now = new Date();
    const buckets: Array<{ year: number; month: number }> = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      const bucketDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      buckets.push({ year: bucketDate.getFullYear(), month: bucketDate.getMonth() });
    }

    return buckets.map(({ year, month }) => {
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      return {
        month: MONTH_NAMES_AR[month],
        amount: Math.round(totalsByMonth.get(key)?.amount ?? 0),
      };
    });
  }, [investments]);

  const projectDistribution = useMemo(
    () => [
      { name: "صكوك", value: projects.filter((row) => row.projectType === "sukuk").length },
      {
        name: "أراضٍ",
        value: projects.filter((row) => row.projectType === "land_development").length,
      },
      {
        name: "VIP",
        value: projects.filter((row) => row.projectType === "vip_exclusive").length,
      },
    ],
    [projects]
  );

  const markMessageAsRead = async (row: AnyDoc) => {
    if (row.adminReadAt) return;

    await auditedUpdateDoc({
      ref: doc(db, "messages", row.id),
      data: {
        adminReadAt: serverTimestamp(),
        adminReadByUid: user?.uid || null,
        adminReadByEmail: user?.email || null,
        isRead: true,
        updatedAt: serverTimestamp(),
      },
      action: AUDIT_ACTIONS.MESSAGE_REVIEWED,
      category: "message",
      entityType: "message",
      source: buildAuditSource({
        area: "admin",
        page: "Dashboard",
        method: "mark_read",
      }),
      message: `Marked message ${row.id} as read`,
      relatedIds: { requestId: row.id },
      meta: {
        messageType: row.type || null,
      },
      ignoreFields: [],
    });
  };

  const markRequestAsSeen = async (row: AnyDoc) => {
    if (row.adminSeenAt) return;

    await auditedUpdateDoc({
      ref: doc(db, "interest_requests", row.id),
      data: {
        adminSeenAt: serverTimestamp(),
        adminSeenByUid: user?.uid || null,
        adminSeenByEmail: user?.email || null,
        updatedAt: serverTimestamp(),
      },
      action: AUDIT_ACTIONS.REQUEST_REVIEWED,
      category: "request",
      entityType: "request",
      source: buildAuditSource({
        area: "admin",
        page: "Dashboard",
        method: "mark_seen",
      }),
      message: `Marked request ${row.id} as seen`,
      relatedIds: { requestId: row.id },
      meta: {
        requestStatus: row.status || null,
      },
      ignoreFields: [],
    });
  };

  const handleOpenMessage = async (row: AnyDoc) => {
    const linkedRequestId = getLinkedRequestId(row);

    try {
      await markMessageAsRead(row);
    } catch (error) {
      console.error("mark message as read failed", error);
    }

    if (!linkedRequestId) return;

    setActiveDialog(null);
    setLocation(`/admin/messages?requestId=${encodeURIComponent(linkedRequestId)}`);
  };

  const handleOpenRequest = async (row: AnyDoc) => {
    try {
      await markRequestAsSeen(row);
    } catch (error) {
      console.error("mark request as seen failed", error);
    }

    setActiveDialog(null);
    setLocation(`/admin/messages?requestId=${encodeURIComponent(row.id)}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">لوحة التحكم</h1>
          <p className="text-muted-foreground text-lg">نظرة عامة على أداء المنصة</p>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center">جاري التحميل...</CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-10 text-center text-red-600">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {canSeeProjects && (
            <Stat
              title="إجمالي المشاريع"
              value={stats.totalProjects}
              sub={`${stats.publishedProjects} منشور`}
              icon={<Building2 />}
            />
          )}

          {canSeeInvestments && (
            <Stat
              title="إجمالي الاستثمارات"
              value={stats.totalInvestments}
              sub={`${approvedInvestments} معتمد`}
              icon={<DollarSign />}
            />
          )}

          {canSeeUsers && (
            <Stat
              title="إجمالي المستخدمين"
              value={stats.totalUsers}
              sub={`${stats.vipUsers} VIP`}
              icon={<Users />}
            />
          )}

          {canSeeMessages && (
            <Stat
              title="الرسائل"
              value={stats.totalMessages}
              sub={`${stats.newMessages} غير مقروء`}
              icon={<MessageSquare />}
            />
          )}
        </div>

        {canSeeInvestments && (
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
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {canSeeInvestments && (
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
          )}

          {canSeeProjects && (
            <Card>
              <CardHeader>
                <CardTitle>توزيع المشاريع</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={projectDistribution} outerRadius={80} dataKey="value" label>
                      {["#F2B705", "#030640", "#0B0F19"].map((color, index) => (
                        <Cell key={index} fill={color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {canSeeRequests && (
            <AlertCard
              title="استشارات معلقة"
              count={stats.pendingRequests}
              okText="لا توجد استشارات جديدة"
              warnText="طلب يحتاج مراجعة"
              icon={<Clock />}
              onClick={() => setActiveDialog("requests")}
            />
          )}

          {canSeeMessages && (
            <AlertCard
              title="رسائل جديدة"
              count={stats.newMessages}
              okText="لا توجد رسائل جديدة"
              warnText="رسالة جديدة"
              icon={<MessageSquare />}
              onClick={() => setActiveDialog("messages")}
            />
          )}
        </div>

        <Dialog
          open={activeDialog !== null}
          onOpenChange={(open) => {
            if (!open) setActiveDialog(null);
          }}
        >
          <DialogContent dir="rtl" className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {activeDialog === "messages" ? "الرسائل الجديدة" : "الاستشارات الجديدة"}
              </DialogTitle>
            </DialogHeader>

            {activeDialog === "messages" ? (
              unreadMessageRows.length > 0 ? (
                <ScrollArea className="max-h-[65vh]">
                  <div className="space-y-3 pr-1">
                    {unreadMessageRows.map((row) => {
                      const linkedRequestId = getLinkedRequestId(row);

                      return (
                        <div key={row.id} className="rounded-xl border p-4 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="font-semibold">{getClientDisplayName(row)}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDateTimeAR(row.createdAt)}
                              </div>
                            </div>

                            <Button
                              size="sm"
                              className="bg-[#F2B705] text-black hover:bg-[#d9a305]"
                              onClick={() => void handleOpenMessage(row)}
                            >
                              {linkedRequestId ? "فتح الطلب" : "تعليم كمقروء"}
                            </Button>
                          </div>

                          <div className="text-sm leading-7 whitespace-pre-line">
                            {pickText(row.message, row.note, "لا يوجد محتوى للرسالة")}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            المشروع: {getProjectDisplayName(row)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="py-10 text-center text-muted-foreground">
                  لا توجد رسائل غير مقروءة
                </div>
              )
            ) : unreadRequestRows.length > 0 ? (
              <ScrollArea className="max-h-[65vh]">
                <div className="space-y-3 pr-1">
                  {unreadRequestRows.map((row) => (
                    <div key={row.id} className="rounded-xl border p-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-semibold">{getClientDisplayName(row)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTimeAR(row.createdAt)}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          className="bg-[#F2B705] text-black hover:bg-[#d9a305]"
                          onClick={() => void handleOpenRequest(row)}
                        >
                          فتح الطلب
                        </Button>
                      </div>

                      <div className="text-sm text-muted-foreground">
                        المشروع: {getProjectDisplayName(row)}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        المبلغ: {toNumberSafe(row.amount).toLocaleString("ar-SA")} ر.س
                      </div>

                      <div className="text-sm leading-7 whitespace-pre-line">
                        {pickText(row.note, "بدون ملاحظة من العميل")}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="py-10 text-center text-muted-foreground">
                لا توجد استشارات غير مقروءة
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

function Stat({
  title,
  value,
  sub,
  icon,
}: {
  title: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
}) {
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

function AlertCard({
  title,
  count,
  okText,
  warnText,
  icon,
  onClick,
}: {
  title: string;
  count: number;
  okText: string;
  warnText: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  const isInteractive = typeof onClick === "function" && count > 0;
  const statusNode =
    count > 0 ? (
      <div className="flex items-center gap-2 text-orange-600">
        <AlertCircle className="w-5 h-5" />
        {count} {warnText}
      </div>
    ) : (
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle className="w-5 h-5" />
        {okText}
      </div>
    );

  return (
    <Card className={isInteractive ? "transition-colors hover:border-[#F2B705]/50" : ""}>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isInteractive ? (
          <button type="button" className="w-full text-right space-y-3" onClick={onClick}>
            {statusNode}
            <div className="text-xs text-muted-foreground">اضغط لعرض العناصر الجديدة</div>
          </button>
        ) : (
          statusNode
        )}
      </CardContent>
    </Card>
  );
}
