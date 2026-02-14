import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/_core/firebase";
import { recomputeInvestorAggregates } from "@/_core/recomputeInvestorAggregates";

type UserDoc = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  vipStatus?: "regular" | "vip";
  vipTier?: string;
  internalNotes?: string;
  createdAt?: any;

  // ✅ إذا كانت recomputeInvestorAggregates تحفظ أرقام داخل user
  totalInvested?: number;
  expectedProfitTotal?: number;
  profitToDate?: number;
  aggregatesUpdatedAt?: any;
};

type InvestmentDoc = {
  id: string;
  userId?: string;
  investorUid?: string;
  projectId?: string;
  amount?: number;
  approvedAmount?: number;
  estimatedReturn?: number;
  expectedProfit?: number;
  status?: string;
  createdAt?: any;
  startAt?: any;
  plannedEndAt?: any;
};

function toDateSafe(v: any): Date | null {
  try {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate();
    if (typeof v?.toDate === "function") return v.toDate();
    if (typeof v === "number") return new Date(v);
    if (typeof v === "string") return new Date(v);
    return null;
  } catch {
    return null;
  }
}

export default function ClientProfile() {
  const userId = new URLSearchParams(window.location.search).get("id") || "";

  const [user, setUser] = useState<UserDoc | null>(null);
  const [investments, setInvestments] = useState<InvestmentDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userId) {
      toast.error("معرف العميل غير موجود");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // ✅ تحديث حسابات العميل أول ما تفتح ملفه
      await recomputeInvestorAggregates(userId);

      const uSnap = await getDoc(doc(db, "users", userId));
      const u = uSnap.exists()
        ? ({ id: uSnap.id, ...(uSnap.data() as any) } as UserDoc)
        : null;

      const invRef = collection(db, "investments");

      // دعم userId أو investorUid (حسب مشروعك)
      const s1 = await getDocs(query(invRef, where("userId", "==", userId)));
      let invDocs = s1.docs;

      if (invDocs.length === 0) {
        const s2 = await getDocs(
          query(invRef, where("investorUid", "==", userId))
        );
        invDocs = s2.docs;
      }

      const invRows = invDocs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      setUser(u);
      setInvestments(invRows);
      setLoading(false);
    } catch (e) {
      console.error(e);
      toast.error("تعذر تحميل ملف العميل");
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const totalInvested = useMemo(() => {
    if (typeof user?.totalInvested === "number") return user.totalInvested;
    return investments.reduce(
      (s, i) => s + Number(i.approvedAmount ?? i.amount ?? 0),
      0
    );
  }, [user?.totalInvested, investments]);

  const expectedProfitTotal = useMemo(() => {
    if (typeof user?.expectedProfitTotal === "number") return user.expectedProfitTotal;
    return investments.reduce(
      (s, i) => s + Number(i.expectedProfit ?? i.estimatedReturn ?? 0),
      0
    );
  }, [user?.expectedProfitTotal, investments]);

  const profitToDate = useMemo(() => {
    if (typeof user?.profitToDate === "number") return user.profitToDate;
    return 0;
  }, [user?.profitToDate]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowRight className="w-4 h-4 ml-1" />
              رجوع
            </Button>

            <div>
              <h1 className="text-3xl font-bold">ملف العميل</h1>
              <p className="text-muted-foreground">
                عرض الهيستوري والملخص المالي
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 ml-1" />
            تحديث
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">جاري التحميل...</div>
        ) : !user ? (
          <div className="text-center py-12 text-muted-foreground">
            العميل غير موجود
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">الاسم</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-bold">{user.name || "—"}</div>
                  <div className="text-sm text-muted-foreground">
                    {user.email || "—"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">الحالة</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline">{user.role || "—"}</Badge>
                  <div className="mt-2">
                    {user.vipStatus === "vip" ? (
                      <Badge className="bg-accent">
                        VIP {user.vipTier ? `- ${user.vipTier}` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="outline">عادي</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">إجمالي الاستثمار</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {Number(totalInvested).toLocaleString()} ر.س
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">الربح حتى اليوم</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(Number(profitToDate)).toLocaleString()} ر.س
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    العائد المتوقع:{" "}
                    {Math.round(Number(expectedProfitTotal)).toLocaleString()} ر.س
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Investments */}
            <Card>
              <CardHeader>
                <CardTitle>هيستوري الاستثمارات</CardTitle>
              </CardHeader>
              <CardContent>
                {investments.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    لا توجد استثمارات لهذا العميل
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الحالة</TableHead>
                        <TableHead>المبلغ</TableHead>
                        <TableHead>العائد المتوقع</TableHead>
                        <TableHead>تاريخ البداية</TableHead>
                        <TableHead>تاريخ النهاية</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {investments.map((inv) => {
                        const start = toDateSafe(inv.startAt);
                        const end = toDateSafe(inv.plannedEndAt);
                        const amount = Number(inv.approvedAmount ?? inv.amount ?? 0);
                        const exp = Number(inv.expectedProfit ?? inv.estimatedReturn ?? 0);

                        return (
                          <TableRow key={inv.id}>
                            <TableCell>
                              <Badge variant="outline">
                                {String(inv.status || "—")}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-bold">
                              {amount.toLocaleString()} ر.س
                            </TableCell>
                            <TableCell>
                              {exp.toLocaleString()} ر.س
                            </TableCell>
                            <TableCell>
                              {start ? start.toLocaleDateString("ar-SA") : "-"}
                            </TableCell>
                            <TableCell>
                              {end ? end.toLocaleDateString("ar-SA") : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
