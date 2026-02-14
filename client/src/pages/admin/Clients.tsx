// client/src/pages/admin/Clients.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

import DashboardLayout from "@/components/DashboardLayout";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Crown, Search, Edit2, FileText } from "lucide-react";
import { toast } from "sonner";

import { collection, onSnapshot, updateDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";

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

  const handleUpdateVipStatus = async () => {
    if (!selectedUser) return;
    try {
      await updateDoc(doc(db, "users", selectedUser.id), {
        vipStatus,
        vipTier: vipStatus === "vip" ? vipTier : "",
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
      await updateDoc(doc(db, "users", selectedUser.id), {
        internalNotes: notes,
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
            عرض وإدارة بيانات العملاء + فتح ملف العميل
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4" />
                إجمالي العملاء
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{users.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Crown className="w-4 h-4" />
                عملاء VIP
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-accent">{vipUsers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">عملاء عاديون</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{regularUsers}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث عن عميل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>قائمة العملاء</CardTitle>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="text-center py-12">جاري التحميل...</div>
            ) : filteredUsers.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>البريد</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>VIP</TableHead>
                    <TableHead>إجمالي الاستثمار</TableHead>
                    <TableHead>الربح حتى اليوم</TableHead>
                    <TableHead>التسجيل</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredUsers.map((user) => {
                    const date =
                      user.createdAt instanceof Timestamp
                        ? user.createdAt.toDate()
                        : user.createdAt
                        ? new Date(user.createdAt)
                        : null;

                    const totalInvested = safeNum(user.totalInvested);
                    const profitToDate = safeNum(user.profitToDate);

                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium flex items-center gap-2">
                          {user.vipStatus === "vip" && <Crown className="w-4 h-4 text-accent" />}
                          {user.name || "غير محدد"}
                        </TableCell>

                        <TableCell>{user.email || "-"}</TableCell>

                        <TableCell>
                          <div className="flex gap-2">
                            <Badge variant="outline">{user.role || "—"}</Badge>
                            <Badge variant="secondary">{user.active ? "نشط" : "غير نشط"}</Badge>
                          </div>
                        </TableCell>

                        <TableCell>
                          {user.vipStatus === "vip" ? (
                            <Badge className="bg-accent">
                              VIP {user.vipTier ? `- ${user.vipTier}` : ""}
                            </Badge>
                          ) : (
                            <Badge variant="outline">عادي</Badge>
                          )}
                        </TableCell>

                        <TableCell className="font-bold">
                          {totalInvested ? `${totalInvested.toLocaleString("ar-SA")} ر.س` : "—"}
                        </TableCell>

                        <TableCell className="font-bold text-green-700">
                          {profitToDate ? `${profitToDate.toLocaleString("ar-SA")} ر.س` : "—"}
                        </TableCell>

                        <TableCell>{date ? date.toLocaleDateString("ar-SA") : "-"}</TableCell>

                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            {/* ✅ زر ملف العميل (بدون reload) */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setLocation(`/admin/client-profile?id=${user.id}`)}
                            >
                              <FileText className="w-4 h-4 ml-1" />
                              ملف العميل
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
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
                              onClick={() => {
                                setSelectedUser(user);
                                setNotes(user.internalNotes || "");
                                setIsNotesDialogOpen(true);
                              }}
                            >
                              <Edit2 className="w-4 h-4 ml-1" />
                              ملاحظات
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">لا توجد نتائج</div>
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
