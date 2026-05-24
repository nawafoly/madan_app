// client/src/pages/admin/Clients.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

import DashboardLayout from "@/components/DashboardLayout";
import AdminPanelStatCard from "@/components/AdminPanelStatCard";
import { hasPermission, useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Crown,
  Search,
  Edit2,
  FileText,
  Mail,
  CalendarDays,
  Wallet,
  TrendingUp,
  ShieldCheck,
  CircleOff,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";

import { collection, onSnapshot, doc, Timestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";
import {
  AUDIT_ACTIONS,
  auditedUpdateDoc,
  buildAuditSource,
} from "@/lib/auditLog";
import {
  formatCurrencyEN,
  formatDateEN,
  formatNumberEN,
} from "@/lib/formatters";
import { buildProjectsMap } from "@/lib/projectDisplay";
import {
  emailLocalPart,
  getInvestmentIdentityBuckets,
  getUserDisplayName,
  getUserIdentityBuckets,
  pickText,
} from "@/lib/investorIdentity";
import { getOwnerRoleLabel } from "@/lib/ownerAccounts";
import { getProjectProfitFallback } from "@/lib/projectProfitFallback";
import { resolveUserAccountStatus } from "@/lib/userAccountStatus";
import {
  getInvestmentProfitSnapshot,
  hasReadableInvestmentProfit,
  roundMoney,
  type InvestmentProfitLike,
} from "@shared/investmentProfit";

type UserDoc = {
  id: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  uid?: string;
  userId?: string;
  authUid?: string;
  phone?: string;
  mobile?: string;
  phoneNumber?: string;
  profile?: Record<string, any>;
  contact?: Record<string, any>;

  role?: string;
  roleKey?: string;
  active?: boolean | string | number | null;
  isActive?: boolean | string | number | null;
  status?: string | boolean | number | null;

  vipStatus?: "regular" | "vip";
  vipTier?: string;
  internalNotes?: string;

  createdAt?: Timestamp | number;

  // ✅ Aggregates محفوظة داخل users (تتحدث من ClientProfile)
  totalInvested?: number;
  expectedProfitTotal?: number;
  profitToDate?: number;
  aggregatesUpdatedAt?: any;
};

type InvestmentUserSnapshot = Record<string, unknown> & {
  id?: string;
  uid?: string;
  userId?: string;
  authUid?: string;
  clientId?: string;
  displayName?: string;
  name?: string;
  email?: string;
};

type InvestmentDoc = InvestmentProfitLike &
  Record<string, unknown> & {
    id: string;
    userId?: string;
    investorUid?: string;
    investorId?: string;
    clientId?: string;
    customerId?: string;
    uid?: string;
    createdByUid?: string;
    investorName?: string;
    investorEmail?: string;
    projectId?: string;
    userSnapshot?: InvestmentUserSnapshot;
  };
type ProjectDoc = Record<string, any> & { id: string };

function safeNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrencySAR(value: any) {
  return formatCurrencyEN(safeNum(value));
}

function formatDateAR(value: any) {
  const date =
    value instanceof Timestamp
      ? value.toDate()
      : value
        ? new Date(value)
        : null;

  if (!date || Number.isNaN(date.getTime())) return "—";

  return formatDateEN(date);
}

const EMPLOYEE_ACCOUNT_ROLES = new Set([
  "owner",
  "admin",
  "accountant",
  "hr",
  "staff",
  "employee",
]);

function isEmployeeAccount(user: Pick<UserDoc, "role" | "roleKey">) {
  const role = String(user.role || user.roleKey || "")
    .trim()
    .toLowerCase();

  return EMPLOYEE_ACCOUNT_ROLES.has(role);
}

function getRoleBadge(role?: string, email?: string) {
  const key = String(role || "client")
    .trim()
    .toLowerCase();
  const map: Record<string, { label: string; className: string }> = {
    owner: {
      label: getOwnerRoleLabel(email),
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    admin: {
      label: "الإدارة",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    },
    accountant: {
      label: "المحاسب",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    staff: {
      label: "الموظف",
      className: "border-indigo-200 bg-indigo-50 text-indigo-700",
    },
    client: {
      label: "العميل",
      className: "border-slate-200 bg-slate-100 text-slate-700",
    },
  };

  return (
    map[key] || {
      label: role || "—",
      className: "border-slate-200 bg-slate-100 text-slate-700",
    }
  );
}

function getStatusBadge(user: Pick<UserDoc, "active" | "isActive" | "status">) {
  const { isActive: active } = resolveUserAccountStatus(user);
  if (active) {
    return {
      label: "نشط",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: ShieldCheck,
    };
  }

  return {
    label: "غير نشط",
    className: "border-slate-200 bg-slate-100 text-slate-600",
    icon: CircleOff,
  };
}

function getVipBadge(user: UserDoc) {
  if (user.vipStatus === "vip") {
    return {
      label: user.vipTier ? `VIP - ${user.vipTier}` : "VIP",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      featured: true,
    };
  }

  return {
    label: "عادي",
    className: "border-slate-200 bg-slate-50 text-slate-600",
    featured: false,
  };
}

type UserIdentityIndex = {
  byUserId: Map<string, string>;
  byEmail: Map<string, string>;
  byPhone: Map<string, string>;
};

function buildUserIdentityIndex(users: UserDoc[]): UserIdentityIndex {
  const byUserId = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();

  for (const user of users) {
    const buckets = getUserIdentityBuckets(user);

    for (const value of buckets.userIds) {
      if (!byUserId.has(value)) byUserId.set(value, user.id);
    }

    for (const value of buckets.emails) {
      if (!byEmail.has(value)) byEmail.set(value, user.id);
    }

    for (const value of buckets.phones) {
      if (!byPhone.has(value)) byPhone.set(value, user.id);
    }
  }

  return { byUserId, byEmail, byPhone };
}

function resolveInvestmentOwnerUserId(
  investment: InvestmentDoc,
  identityIndex: UserIdentityIndex
) {
  const buckets = getInvestmentIdentityBuckets(investment);

  for (const value of buckets.userIds) {
    const userId = identityIndex.byUserId.get(value);
    if (userId) return userId;
  }

  for (const value of buckets.emails) {
    const userId = identityIndex.byEmail.get(value);
    if (userId) return userId;
  }

  for (const value of buckets.phones) {
    const userId = identityIndex.byPhone.get(value);
    if (userId) return userId;
  }

  return "";
}

const LIVE_CARD_PROFIT_REFRESH_MS = 60_000;

export default function ClientsManagement() {
  const { user } = useAuth();
  const canManageUsers = hasPermission(user, "users.manage");
  const [, setLocation] = useLocation();

  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [investments, setInvestments] = useState<InvestmentDoc[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const [selectedUser, setSelectedUser] = useState<UserDoc | null>(null);
  const [isVipDialogOpen, setIsVipDialogOpen] = useState(false);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  const [vipStatus, setVipStatus] = useState<"regular" | "vip">("regular");
  const [vipTier, setVipTier] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, LIVE_CARD_PROFIT_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  /* =========================
     USERS SNAPSHOT (خفيف ✅)
  ========================= */
  useEffect(() => {
    let usersLoaded = false;
    let investmentsLoaded = false;
    let projectsLoaded = false;

    const done = () => {
      if (usersLoaded && investmentsLoaded && projectsLoaded) {
        setLoading(false);
      }
    };

    setLoading(true);

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      snap => {
        setUsers(
          snap.docs.map(d => ({
            id: d.id,
            ...(d.data() as any),
          })) as UserDoc[]
        );
        usersLoaded = true;
        done();
      },
      err => {
        console.error("users snapshot error:", err);
        usersLoaded = true;
        done();
        toast.error("تعذر تحميل العملاء");
      }
    );

    const unsubInvestments = onSnapshot(
      collection(db, "investments"),
      snap => {
        setInvestments(
          snap.docs.map(d => ({
            id: d.id,
            ...(d.data() as any),
          })) as InvestmentDoc[]
        );
        investmentsLoaded = true;
        done();
      },
      err => {
        console.error("investments snapshot error:", err);
        setInvestments([]);
        investmentsLoaded = true;
        done();
        toast.error("تعذر تحميل الاستثمارات المرتبطة");
      }
    );

    const unsubProjects = onSnapshot(
      collection(db, "projects"),
      snap => {
        setProjects(
          snap.docs.map(d => ({
            id: d.id,
            ...(d.data() as any),
          })) as ProjectDoc[]
        );
        projectsLoaded = true;
        done();
      },
      err => {
        console.error("projects snapshot error:", err);
        setProjects([]);
        projectsLoaded = true;
        done();
      }
    );

    return () => {
      unsubUsers();
      unsubInvestments();
      unsubProjects();
    };
  }, []);

  const projectsMap = useMemo(() => buildProjectsMap(projects), [projects]);

  const clientUsers = useMemo(
    () => users.filter(user => !isEmployeeAccount(user)),
    [users]
  );

  const userIdentityIndex = useMemo(
    () => buildUserIdentityIndex(clientUsers),
    [clientUsers]
  );

  const linkedInvestmentsByUserId = useMemo(() => {
    const grouped: Record<string, InvestmentDoc[]> = {};

    for (const user of clientUsers) {
      grouped[user.id] = [];
    }

    for (const investment of investments) {
      const ownerUserId = resolveInvestmentOwnerUserId(
        investment,
        userIdentityIndex
      );
      if (!ownerUserId) continue;

      (grouped[ownerUserId] ??= []).push(investment);
    }

    return grouped;
  }, [clientUsers, investments, userIdentityIndex]);

  const clientCards = useMemo(() => {
    return clientUsers.map(user => {
      const linkedInvestments = linkedInvestmentsByUserId[user.id] ?? [];
      const linkedNameFallbacks = linkedInvestments.flatMap(investment => [
        pickText(
          investment?.investorName,
          investment?.userSnapshot?.displayName,
          investment?.userSnapshot?.name
        ),
        emailLocalPart(investment?.investorEmail),
        emailLocalPart(investment?.userSnapshot?.email),
      ]);
      const displayName = getUserDisplayName(user, ...linkedNameFallbacks);
      const email =
        pickText(
          user?.email,
          user?.profile?.email,
          user?.contact?.email,
          ...linkedInvestments.map(investment => investment?.investorEmail)
        ) || "—";
      const liveSnapshots = linkedInvestments.map(investment =>
        getInvestmentProfitSnapshot(investment, {
          now,
          projectFallback: getProjectProfitFallback(
            projectsMap[String(investment?.projectId || "").trim()]
          ),
        })
      );
      const liveSnapshotCount = liveSnapshots.filter(snapshot =>
        hasReadableInvestmentProfit(snapshot)
      ).length;
      const liveTotalInvested = roundMoney(
        liveSnapshots.reduce(
          (sum, snapshot) => sum + snapshot.principalAmount,
          0
        )
      );
      const liveProfitToDate = roundMoney(
        liveSnapshots.reduce((sum, snapshot) => sum + snapshot.currentProfit, 0)
      );
      const storedTotalInvestedRaw = Number(user?.totalInvested);
      const storedProfitToDateRaw = Number(user?.profitToDate);
      const hasStoredTotalInvested = Number.isFinite(storedTotalInvestedRaw);
      const hasStoredProfitToDate = Number.isFinite(storedProfitToDateRaw);
      const totalInvestedValue =
        linkedInvestments.length > 0
          ? liveTotalInvested
          : hasStoredTotalInvested
            ? storedTotalInvestedRaw
            : 0;
      const profitToDateValue =
        liveSnapshotCount > 0
          ? liveProfitToDate
          : hasStoredProfitToDate
            ? storedProfitToDateRaw
            : 0;

      let profitHelper = "لا توجد استثمارات مرتبطة بعد";
      if (liveSnapshotCount > 0) {
        profitHelper =
          liveSnapshotCount === linkedInvestments.length
            ? `محدث حيًا من ${formatNumberEN(linkedInvestments.length)} استثمار`
            : `محدث حيًا من ${formatNumberEN(liveSnapshotCount)} من أصل ${formatNumberEN(linkedInvestments.length)} استثمار`;
      } else if (linkedInvestments.length > 0 && hasStoredProfitToDate) {
        profitHelper = "معروض من آخر تجميع محفوظ لحين اكتمال بيانات الربح الحي";
      } else if (linkedInvestments.length > 0) {
        profitHelper = "البيانات الحالية لا تكفي لحساب الربح الحي";
      } else if (hasStoredProfitToDate) {
        profitHelper = "معروض من آخر تجميع محفوظ";
      }

      const totalInvestedHelper =
        linkedInvestments.length > 0
          ? `${formatNumberEN(linkedInvestments.length)} استثمار مرتبط`
          : hasStoredTotalInvested
            ? "معروض من آخر تجميع محفوظ"
            : "لا توجد استثمارات مرتبطة";

      const searchText = [
        displayName,
        email,
        user?.username,
        user?.phone,
        user?.mobile,
        user?.id,
      ]
        .map(value => String(value || "").toLowerCase())
        .join(" ");

      return {
        user,
        displayName,
        email,
        registeredAt: formatDateAR(user?.createdAt),
        totalInvestedValue,
        totalInvestedHelper,
        profitToDateValue,
        profitHelper,
        hasLiveProfit: liveSnapshotCount > 0,
        searchText,
      };
    });
  }, [clientUsers, linkedInvestmentsByUserId, now, projectsMap]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clientCards;
    return clientCards.filter(card => card.searchText.includes(q));
  }, [clientCards, searchQuery]);

  const vipUsers = clientUsers.filter(u => u.vipStatus === "vip").length;
  const regularUsers = clientUsers.filter(u => u.vipStatus !== "vip").length;

  const openClientProfile = (userId: string) => {
    setLocation(`/admin/client-profile?id=${userId}`);
  };

  const handleUpdateVipStatus = async () => {
    if (!canManageUsers) {
      toast.error("لا تملك صلاحية إدارة العملاء.");
      return;
    }
    if (!selectedUser) return;
    const selectedUserLabel = getUserDisplayName(selectedUser);
    try {
      await auditedUpdateDoc({
        ref: doc(db, "users", selectedUser.id),
        data: {
          vipStatus,
          vipTier: vipStatus === "vip" ? vipTier : "",
        },
        action: AUDIT_ACTIONS.USER_UPDATED,
        category: "user",
        entityType: "user",
        source: buildAuditSource({
          area: "admin",
          page: "Clients",
          method: "update_vip_status",
        }),
        relatedIds: { userId: selectedUser.id },
        message: `Updated VIP status for ${selectedUserLabel}`,
        meta: {
          targetUserEmail: selectedUser.email || null,
          targetUserName: selectedUserLabel,
          vipStatus,
          vipTier: vipStatus === "vip" ? vipTier : "",
        },
      });
      toast.success("تم تحديث حالة VIP");
      setIsVipDialogOpen(false);
    } catch {
      toast.error("حدث خطأ أثناء التحديث");
    }
  };

  const handleUpdateNotes = async () => {
    if (!canManageUsers) {
      toast.error("لا تملك صلاحية إدارة العملاء.");
      return;
    }
    if (!selectedUser) return;
    const selectedUserLabel = getUserDisplayName(selectedUser);
    try {
      await auditedUpdateDoc({
        ref: doc(db, "users", selectedUser.id),
        data: {
          internalNotes: notes,
        },
        action: AUDIT_ACTIONS.USER_UPDATED,
        category: "user",
        entityType: "user",
        source: buildAuditSource({
          area: "admin",
          page: "Clients",
          method: "update_notes",
        }),
        relatedIds: { userId: selectedUser.id },
        message: `Updated internal notes for ${selectedUserLabel}`,
        meta: {
          targetUserEmail: selectedUser.email || null,
          targetUserName: selectedUserLabel,
          noteLength: notes.trim().length,
        },
      });
      toast.success("تم حفظ الملاحظات");
      setIsNotesDialogOpen(false);
    } catch {
      toast.error("حدث خطأ أثناء الحفظ");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">إدارة العملاء</h1>
          <p className="text-muted-foreground text-lg">
            عرض وإدارة بيانات العملاء مع واجهة أوضح للحالة والدور والبيانات
            المالية والإجراءات
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <AdminPanelStatCard
            title="إجمالي العملاء"
            value={clientUsers.length}
            description="إجمالي الحسابات المعروضة في صفحة إدارة العملاء ضمن هذا العرض الحالي."
            helper={`${formatNumberEN(filteredUsers.length)} حساب مطابق للبحث الحالي`}
            icon={<Users className="h-5 w-5" />}
            accent="blue"
          />

          <AdminPanelStatCard
            title="عملاء VIP"
            value={vipUsers}
            description="الحسابات المصنفة ضمن الفئة المميزة والتي تحمل حالة VIP داخل النظام."
            helper="عملاء مميزون بمتابعة وحالة خاصة"
            icon={<Crown className="h-5 w-5" />}
            accent="amber"
            className="border-amber-300/40 bg-[radial-gradient(circle_at_top_right,rgba(242,183,5,0.32),transparent_34%),linear-gradient(135deg,#3b2a03_0%,#7a5610_48%,#3a2500_100%)] shadow-xl shadow-amber-950/20"
            valueClassName="text-[#FFF4C2]"
          />

          <AdminPanelStatCard
            title="عملاء عاديون"
            value={regularUsers}
            description="الحسابات غير المصنفة ضمن فئة VIP وتظهر ضمن القاعدة التشغيلية العامة."
            helper="يشمل كل العملاء غير المميزين"
            icon={<Users className="h-5 w-5" />}
            accent="slate"
          />
        </div>

        {/* Search */}
        <Card className="border-slate-200/80 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-xl">
                <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="البحث عن عميل بالاسم أو البريد..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-11 pr-10"
                />
              </div>

              <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
                {formatNumberEN(filteredUsers.length)} نتيجة
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Clients list */}
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="gap-4 border-b border-slate-200/70 pb-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle>قائمة العملاء</CardTitle>

              <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
                شبكة بطاقات responsive
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              عرض واضح لبيانات العميل الأساسية والمالية مع إجراءات مرتبة وبدون
              أي تمرير أفقي داخل القسم.
            </p>
          </CardHeader>

          <CardContent className="pt-6">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 py-12 text-center text-muted-foreground">
                جاري التحميل...
              </div>
            ) : filteredUsers.length ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredUsers.map(card => {
                  const { user } = card;
                  const statusBadge = getStatusBadge(user);
                  const roleBadge = getRoleBadge(user.role, card.email);
                  const vipBadge = getVipBadge(user);
                  const StatusIcon = statusBadge.icon;
                  const totalInvested = formatCurrencySAR(
                    card.totalInvestedValue
                  );
                  const profitToDate = formatCurrencySAR(
                    card.profitToDateValue
                  );

                  return (
                    <article
                      key={user.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openClientProfile(user.id)}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openClientProfile(user.id);
                        }
                      }}
                      className="group flex h-full cursor-pointer flex-col rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-5 shadow-sm ring-1 ring-slate-100/80 transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-slate-900 break-words">
                              {card.displayName}
                            </h3>
                            {vipBadge.featured ? (
                              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <Crown className="h-4 w-4" />
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-2 flex items-start gap-2 text-sm text-slate-500">
                            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                            <span className="min-w-0 break-all">
                              {card.email}
                            </span>
                          </div>
                        </div>

                        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors group-hover:border-slate-300 group-hover:text-slate-700">
                          <ArrowUpRight className="h-4 w-4" />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={statusBadge.className}
                        >
                          <StatusIcon className="ml-1 h-3.5 w-3.5" />
                          {statusBadge.label}
                        </Badge>

                        <Badge
                          variant="outline"
                          className={roleBadge.className}
                        >
                          {roleBadge.label}
                        </Badge>

                        <Badge variant="outline" className={vipBadge.className}>
                          {vipBadge.featured ? (
                            <Crown className="ml-1 h-3.5 w-3.5" />
                          ) : null}
                          {vipBadge.label}
                        </Badge>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                            <Wallet className="h-3.5 w-3.5" />
                            إجمالي الاستثمار
                          </div>
                          <div className="mt-2 break-words text-base font-bold text-slate-900">
                            {totalInvested}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {card.totalInvestedHelper}
                          </div>
                        </div>

                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 shadow-sm">
                          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-emerald-700">
                            <TrendingUp className="h-3.5 w-3.5" />
                            الربح حتى اليوم
                          </div>
                          <div className="mt-2 break-words text-base font-bold text-emerald-700">
                            {profitToDate}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-emerald-700/80">
                            {card.profitHelper}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                            <CalendarDays className="h-3.5 w-3.5" />
                            تاريخ التسجيل
                          </div>
                          <div className="mt-2 break-words text-base font-bold text-slate-900">
                            {card.registeredAt}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 border-t border-slate-200 pt-4">
                        <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          الإجراءات
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="h-auto min-h-9 w-full justify-center whitespace-normal text-center sm:w-auto"
                            onClick={e => {
                              e.stopPropagation();
                              openClientProfile(user.id);
                            }}
                          >
                            <FileText className="w-4 h-4 ml-1" />
                            ملف العميل
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="h-auto min-h-9 w-full justify-center whitespace-normal text-center sm:w-auto"
                            disabled={!canManageUsers}
                            onClick={e => {
                              e.stopPropagation();
                              setSelectedUser(user);
                              setVipStatus(user.vipStatus ?? "regular");
                              setVipTier(user.vipTier || "");
                              setIsVipDialogOpen(true);
                            }}
                          >
                            <Crown className="w-4 h-4 ml-1" />
                            VIP
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="h-auto min-h-9 w-full justify-center whitespace-normal text-center sm:w-auto"
                            disabled={!canManageUsers}
                            onClick={e => {
                              e.stopPropagation();
                              setSelectedUser(user);
                              setNotes(user.internalNotes || "");
                              setIsNotesDialogOpen(true);
                            }}
                          >
                            <Edit2 className="w-4 h-4 ml-1" />
                            ملاحظات
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 py-12 text-center text-muted-foreground">
                لا توجد نتائج مطابقة للبحث الحالي
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* VIP Dialog */}
      <Dialog open={isVipDialogOpen} onOpenChange={setIsVipDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تحديث حالة VIP</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>الحالة</Label>
              <Select
                value={vipStatus}
                onValueChange={(v: "regular" | "vip") => setVipStatus(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">عادي</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {vipStatus === "vip" && (
              <div>
                <Label>مستوى VIP</Label>
                <Input
                  value={vipTier}
                  onChange={e => setVipTier(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsVipDialogOpen(false)}>
              إلغاء
            </Button>
            <Button disabled={!canManageUsers} onClick={handleUpdateVipStatus}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ملاحظات داخلية</DialogTitle>
          </DialogHeader>

          <Textarea
            rows={6}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsNotesDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button disabled={!canManageUsers} onClick={handleUpdateNotes}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
