// client/src/pages/admin/Clients.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

import DashboardLayout from "@/components/DashboardLayout";
import AdminPanelStatCard from "@/components/AdminPanelStatCard";
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
import { AUDIT_ACTIONS, auditedUpdateDoc, buildAuditSource } from "@/lib/auditLog";
import { formatCurrencyEN, formatDateEN, formatNumberEN } from "@/lib/formatters";

type UserDoc = {
  id: string;
  name?: string;
  email?: string;

  role?: string;
  active?: boolean;

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

function safeNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrencySAR(value: any) {
  return formatCurrencyEN(safeNum(value));
}

function formatDateAR(value: any) {
  const date =
    value instanceof Timestamp ? value.toDate() : value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) return "—";

  return formatDateEN(date);
}

function getRoleBadge(role?: string) {
  const key = String(role || "client").trim().toLowerCase();
  const map: Record<string, { label: string; className: string }> = {
    owner: {
      label: "المالك",
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

  return map[key] || {
    label: role || "—",
    className: "border-slate-200 bg-slate-100 text-slate-700",
  };
}

function getStatusBadge(active?: boolean) {
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

export default function ClientsManagement() {
  const [, setLocation] = useLocation();

  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedUser, setSelectedUser] = useState<UserDoc | null>(null);
  const [isVipDialogOpen, setIsVipDialogOpen] = useState(false);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  const [vipStatus, setVipStatus] = useState<"regular" | "vip">("regular");
  const [vipTier, setVipTier] = useState("");
  const [notes, setNotes] = useState("");

  /* =========================
     USERS SNAPSHOT (خفيف ✅)
  ========================= */
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as UserDoc[];

        setUsers(rows);
        setLoading(false);
      },
      (err) => {
        console.error("users snapshot error:", err);
        setLoading(false);
        toast.error("تعذر تحميل العملاء");
      }
    );

    return () => unsub();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;

    return users.filter((u) => {
      const name = String(u.name || "").toLowerCase();
      const email = String(u.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, searchQuery]);

  const vipUsers = users.filter((u) => u.vipStatus === "vip").length;
  const regularUsers = users.filter((u) => u.vipStatus !== "vip").length;

  const openClientProfile = (userId: string) => {
    setLocation(`/admin/client-profile?id=${userId}`);
  };

  const handleUpdateVipStatus = async () => {
    if (!selectedUser) return;
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
        message: `Updated VIP status for ${selectedUser.name || selectedUser.email || selectedUser.id}`,
        meta: {
          targetUserEmail: selectedUser.email || null,
          targetUserName: selectedUser.name || null,
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
    if (!selectedUser) return;
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
        message: `Updated internal notes for ${selectedUser.name || selectedUser.email || selectedUser.id}`,
        meta: {
          targetUserEmail: selectedUser.email || null,
          targetUserName: selectedUser.name || null,
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
            عرض وإدارة بيانات العملاء مع واجهة أوضح للحالة والدور والبيانات المالية والإجراءات
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <AdminPanelStatCard
            title="إجمالي العملاء"
            value={users.length}
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
                  onChange={(e) => setSearchQuery(e.target.value)}
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
              عرض واضح لبيانات العميل الأساسية والمالية مع إجراءات مرتبة وبدون أي تمرير أفقي داخل القسم.
            </p>
          </CardHeader>

          <CardContent className="pt-6">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 py-12 text-center text-muted-foreground">
                جاري التحميل...
              </div>
            ) : filteredUsers.length ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredUsers.map((user) => {
                  const statusBadge = getStatusBadge(user.active);
                  const roleBadge = getRoleBadge(user.role);
                  const vipBadge = getVipBadge(user);
                  const StatusIcon = statusBadge.icon;
                  const displayName = user.name || "غير محدد";
                  const email = user.email || "—";
                  const totalInvested = formatCurrencySAR(user.totalInvested);
                  const profitToDate = formatCurrencySAR(user.profitToDate);
                  const registeredAt = formatDateAR(user.createdAt);

                  return (
                    <article
                      key={user.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openClientProfile(user.id)}
                      onKeyDown={(e) => {
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
                              {displayName}
                            </h3>
                            {vipBadge.featured ? (
                              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <Crown className="h-4 w-4" />
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-2 flex items-start gap-2 text-sm text-slate-500">
                            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                            <span className="min-w-0 break-all">{email}</span>
                          </div>
                        </div>

                        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors group-hover:border-slate-300 group-hover:text-slate-700">
                          <ArrowUpRight className="h-4 w-4" />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={statusBadge.className}>
                          <StatusIcon className="ml-1 h-3.5 w-3.5" />
                          {statusBadge.label}
                        </Badge>

                        <Badge variant="outline" className={roleBadge.className}>
                          {roleBadge.label}
                        </Badge>

                        <Badge variant="outline" className={vipBadge.className}>
                          {vipBadge.featured ? <Crown className="ml-1 h-3.5 w-3.5" /> : null}
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
                        </div>

                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 shadow-sm">
                          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-emerald-700">
                            <TrendingUp className="h-3.5 w-3.5" />
                            الربح حتى اليوم
                          </div>
                          <div className="mt-2 break-words text-base font-bold text-emerald-700">
                            {profitToDate}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                            <CalendarDays className="h-3.5 w-3.5" />
                            تاريخ التسجيل
                          </div>
                          <div className="mt-2 break-words text-base font-bold text-slate-900">
                            {registeredAt}
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
                            onClick={(e) => {
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
                            onClick={(e) => {
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
                            onClick={(e) => {
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
              <Select value={vipStatus} onValueChange={(v: "regular" | "vip") => setVipStatus(v)}>
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
                <Input value={vipTier} onChange={(e) => setVipTier(e.target.value)} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsVipDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleUpdateVipStatus}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ملاحظات داخلية</DialogTitle>
          </DialogHeader>

          <Textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} />

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNotesDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleUpdateNotes}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
