import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Shield, Search, Calendar, User } from "lucide-react";

import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/_core/firebase";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userName: string;
  userRole: string;
  changes?: string;
  createdAt: Timestamp | number;
};

export default function AuditLogPage() {
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    const baseRef = collection(db, "audit_logs");

    const q =
      entityTypeFilter === "all"
        ? query(baseRef, orderBy("createdAt", "desc"))
        : query(
            baseRef,
            where("entityType", "==", entityTypeFilter),
            orderBy("createdAt", "desc")
          );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: AuditLog[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setAuditLogs(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [entityTypeFilter]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return auditLogs.filter(
      (log) =>
        log.userName?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q)
    );
  }, [auditLogs, searchQuery]);

  const getActionBadge = (action: string) => {
    const map: Record<string, { label: string; className: string }> = {
      create: { label: "إنشاء", className: "bg-green-500" },
      update: { label: "تعديل", className: "bg-blue-500" },
      update_status: { label: "تحديث الحالة", className: "bg-orange-500" },
      update_financials: { label: "تعديل مالي", className: "bg-red-500" },
      update_vip_status: { label: "تحديث VIP", className: "bg-accent" },
      approved: { label: "موافقة", className: "bg-green-600" },
      rejected: { label: "رفض", className: "bg-red-600" },
    };
    const c = map[action] || { label: action, className: "bg-gray-500" };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const getEntityTypeBadge = (t: string) => {
    const map: Record<string, string> = {
      project: "مشروع",
      investment: "استثمار",
      user: "مستخدم",
    };
    return <Badge variant="outline">{map[t] ?? t}</Badge>;
  };

  const getRoleBadge = (r: string) => {
    const map: Record<string, string> = {
      admin: "مالك",
      accountant: "محاسب",
      staff: "موظف",
      user: "مستخدم",
    };
    return <Badge variant="outline">{map[r] ?? r}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <Shield className="w-10 h-10 text-primary" />
            سجل التعديلات
          </h1>
          <p className="text-muted-foreground text-lg">
            سجل شامل لجميع التعديلات والإجراءات
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="project">المشاريع</SelectItem>
                  <SelectItem value="investment">الاستثمارات</SelectItem>
                  <SelectItem value="user">المستخدمين</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>سجل الأحداث</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">جاري التحميل...</div>
            ) : filteredLogs.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الوقت</TableHead>
                    <TableHead>المستخدم</TableHead>
                    <TableHead>الدور</TableHead>
                    <TableHead>الإجراء</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>المعرف</TableHead>
                    <TableHead>التفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const date =
                      log.createdAt instanceof Timestamp
                        ? log.createdAt.toDate()
                        : new Date(log.createdAt);

                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="text-sm">
                            <div>{date.toLocaleDateString("ar-SA")}</div>
                            <div className="text-xs text-muted-foreground">
                              {date.toLocaleTimeString("ar-SA")}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          {log.userName}
                        </TableCell>
                        <TableCell>{getRoleBadge(log.userRole)}</TableCell>
                        <TableCell>{getActionBadge(log.action)}</TableCell>
                        <TableCell>{getEntityTypeBadge(log.entityType)}</TableCell>
                        <TableCell className="font-mono text-sm">
                          #{log.entityId}
                        </TableCell>
                        <TableCell>
                          <details>
                            <summary className="cursor-pointer text-primary">
                              عرض
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs">
                              {JSON.stringify(
                                JSON.parse(log.changes || "{}"),
                                null,
                                2
                              )}
                            </pre>
                          </details>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">لا توجد سجلات</div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
