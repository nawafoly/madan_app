// client/src/pages/admin/FinancialManagement.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/_core/firebase";

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
  CheckCircle,
  XCircle,
  Edit2,
  DollarSign,
  TrendingUp,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

/* =========================
   helpers
========================= */
const toDate = (v: any) =>
  v instanceof Timestamp ? v.toDate() : new Date(v);

export default function FinancialManagement() {
  const [loading, setLoading] = useState(true);

  const [investments, setInvestments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  const [selectedInvestment, setSelectedInvestment] = useState<any>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [rejectionReason, setRejectionReason] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customDuration, setCustomDuration] = useState("");

  /* =========================
     Load data
  ========================= */
  const loadAll = async () => {
    try {
      setLoading(true);

      const [invSnap, userSnap, projSnap] = await Promise.all([
        getDocs(collection(db, "investments")),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "projects")),
      ]);

      setInvestments(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل البيانات المالية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  /* =========================
     Derived
  ========================= */
  const pendingInvestments = useMemo(
    () => investments.filter(i => i.status === "pending"),
    [investments]
  );

  const approvedInvestments = useMemo(
    () => investments.filter(i => i.status === "approved" || i.status === "active"),
    [investments]
  );

  const totalPendingAmount = pendingInvestments.reduce(
    (s, i) => s + Number(i.amount || 0),
    0
  );

  const totalApprovedAmount = approvedInvestments.reduce(
    (s, i) => s + Number(i.amount || 0),
    0
  );

  const getUserName = (uid: string) =>
    users.find(u => u.id === uid)?.name || "غير معروف";

  const getProjectName = (pid: string) =>
    projects.find(p => p.id === pid)?.titleAr || "غير معروف";

  const getStatusBadge = (status: string) => {
    const map: any = {
      pending: { label: "معلق", cls: "bg-orange-500" },
      approved: { label: "معتمد", cls: "bg-green-500" },
      rejected: { label: "مرفوض", cls: "bg-red-500" },
      active: { label: "نشط", cls: "bg-blue-500" },
      completed: { label: "مكتمل", cls: "bg-gray-500" },
    };
    const c = map[status] || map.pending;
    return <Badge className={c.cls}>{c.label}</Badge>;
  };

  /* =========================
     Actions
  ========================= */
  const updateStatus = async (status: string, extra: any = {}) => {
    if (!selectedInvestment) return;

    try {
      await updateDoc(doc(db, "investments", selectedInvestment.id), {
        status,
        ...extra,
        updatedAt: new Date(),
      });

      toast.success("تم تحديث حالة الاستثمار");
      setIsApproveDialogOpen(false);
      setIsRejectDialogOpen(false);
      setRejectionReason("");
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث الحالة");
    }
  };

  const updateFinancials = async () => {
    if (!selectedInvestment) return;

    try {
      await updateDoc(doc(db, "investments", selectedInvestment.id), {
        customRate: customRate || null,
        customDuration: customDuration ? Number(customDuration) : null,
        updatedAt: new Date(),
      });

      toast.success("تم تحديث البيانات المالية");
      setIsEditDialogOpen(false);
      setCustomRate("");
      setCustomDuration("");
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error("فشل التحديث");
    }
  };

  /* =========================
     UI
  ========================= */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">الشؤون المالية</h1>
          <p className="text-muted-foreground text-lg">
            إدارة الاستثمارات والموافقات
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" /> معلقة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">
                {pendingInvestments.length}
              </div>
              <p className="text-sm mt-1">
                {totalPendingAmount.toLocaleString()} ر.س
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> معتمدة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {approvedInvestments.length}
              </div>
              <p className="text-sm mt-1">
                {totalApprovedAmount.toLocaleString()} ر.س
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> الإجمالي
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {investments.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending table */}
        <Card>
          <CardHeader>
            <CardTitle>الاستثمارات المعلقة</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center">جاري التحميل...</div>
            ) : pendingInvestments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستثمر</TableHead>
                    <TableHead>المشروع</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvestments.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell>{getUserName(inv.userId)}</TableCell>
                      <TableCell>{getProjectName(inv.projectId)}</TableCell>
                      <TableCell className="font-bold">
                        {Number(inv.amount).toLocaleString()} ر.س
                      </TableCell>
                      <TableCell>
                        {toDate(inv.createdAt).toLocaleDateString("ar-SA")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedInvestment(inv);
                              setIsApproveDialogOpen(true);
                            }}
                          >
                            اعتماد
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setSelectedInvestment(inv);
                              setIsRejectDialogOpen(true);
                            }}
                          >
                            رفض
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedInvestment(inv);
                              setCustomRate(inv.customRate || "");
                              setCustomDuration(inv.customDuration?.toString() || "");
                              setIsEditDialogOpen(true);
                            }}
                          >
                            تعديل
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center">لا توجد استثمارات معلقة</div>
            )}
          </CardContent>
        </Card>

        {/* All */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> جميع الاستثمارات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {investments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستثمر</TableHead>
                    <TableHead>المشروع</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell>{getUserName(inv.userId)}</TableCell>
                      <TableCell>{getProjectName(inv.projectId)}</TableCell>
                      <TableCell className="font-bold">
                        {Number(inv.amount).toLocaleString()} ر.س
                      </TableCell>
                      <TableCell>{getStatusBadge(inv.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center">لا توجد استثمارات</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approve */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اعتماد الاستثمار</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => updateStatus("approved")}>
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض الاستثمار</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="سبب الرفض"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason}
              onClick={() =>
                updateStatus("rejected", { rejectionReason })
              }
            >
              رفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل البيانات المالية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>نسبة مخصصة (%)</Label>
              <Input
                value={customRate}
                onChange={(e) => setCustomRate(e.target.value)}
              />
            </div>
            <div>
              <Label>مدة مخصصة (شهر)</Label>
              <Input
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={updateFinancials}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
