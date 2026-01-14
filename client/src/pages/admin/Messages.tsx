// client/src/pages/admin/MessagesManagement.tsx
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

import {
  MessageSquare,
  Mail,
  Phone,
  Calendar,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

/* =========================
   helpers
========================= */
const toDate = (v: any) =>
  v instanceof Timestamp ? v.toDate() : new Date(v);

export default function MessagesManagement() {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);

  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [status, setStatus] = useState<
    "new" | "in_progress" | "resolved" | "closed"
  >("new");
  const [internalNotes, setInternalNotes] = useState("");

  /* =========================
     Load messages
  ========================= */
  const loadMessages = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, "messages"));
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل الرسائل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  /* =========================
     Stats
  ========================= */
  const stats = useMemo(() => ({
    new: messages.filter(m => m.status === "new").length,
    in_progress: messages.filter(m => m.status === "in_progress").length,
    resolved: messages.filter(m => m.status === "resolved").length,
    total: messages.length,
  }), [messages]);

  /* =========================
     Badges
  ========================= */
  const getMessageTypeBadge = (type: string) => {
    const map: any = {
      investment_request: { label: "طلب استثمار", cls: "bg-blue-500" },
      land_development: { label: "تطوير أراضي", cls: "bg-green-500" },
      general_inquiry: { label: "استفسار عام", cls: "bg-gray-500" },
      vip_request: { label: "طلب VIP", cls: "bg-accent" },
    };
    const c = map[type] || map.general_inquiry;
    return <Badge className={c.cls}>{c.label}</Badge>;
  };

  const getStatusBadge = (s: string) => {
    const map: any = {
      new: { label: "جديد", cls: "bg-orange-500" },
      in_progress: { label: "قيد المعالجة", cls: "bg-blue-500" },
      resolved: { label: "تم الحل", cls: "bg-green-500" },
      closed: { label: "مغلق", cls: "bg-gray-500" },
    };
    const c = map[s] || map.new;
    return <Badge className={c.cls}>{c.label}</Badge>;
  };

  /* =========================
     Update
  ========================= */
  const handleUpdateStatus = async () => {
    if (!selectedMessage) return;

    try {
      await updateDoc(doc(db, "messages", selectedMessage.id), {
        status,
        internalNotes: internalNotes || null,
        updatedAt: new Date(),
      });

      toast.success("تم تحديث حالة الرسالة");
      setIsDetailDialogOpen(false);
      loadMessages();
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث الرسالة");
    }
  };

  /* =========================
     UI
  ========================= */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold mb-2">صندوق الرسائل</h1>
          <p className="text-muted-foreground text-lg">
            إدارة الرسائل والاستفسارات الواردة
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="رسائل جديدة" value={stats.new} color="text-orange-600" />
          <StatCard title="قيد المعالجة" value={stats.in_progress} color="text-blue-600" />
          <StatCard title="تم الحل" value={stats.resolved} color="text-green-600" />
          <StatCard title="الإجمالي" value={stats.total} />
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              جميع الرسائل
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center">جاري التحميل...</div>
            ) : messages.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>النوع</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>التواصل</TableHead>
                    <TableHead>الموضوع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map(m => (
                    <TableRow key={m.id}>
                      <TableCell>{getMessageTypeBadge(m.type)}</TableCell>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <Mail className="w-3 h-3" /> {m.email}
                          </div>
                          {m.phone && (
                            <div className="flex items-center gap-2 opacity-70">
                              <Phone className="w-3 h-3" /> {m.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {m.subject || "—"}
                      </TableCell>
                      <TableCell>{getStatusBadge(m.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-3 h-3" />
                          {toDate(m.createdAt).toLocaleDateString("ar-SA")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedMessage(m);
                            setStatus(m.status);
                            setInternalNotes(m.internalNotes || "");
                            setIsDetailDialogOpen(true);
                          }}
                        >
                          <Eye className="w-4 h-4 ml-1" />
                          عرض
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center">لا توجد رسائل</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل الرسالة</DialogTitle>
          </DialogHeader>

          {selectedMessage && (
            <div className="space-y-6">
              <div>
                <Label>الرسالة</Label>
                <div className="mt-2 p-4 bg-muted rounded-lg whitespace-pre-wrap">
                  {selectedMessage.message}
                </div>
              </div>

              <div>
                <Label>تحديث الحالة</Label>
                <Select value={status} onValueChange={v => setStatus(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">جديد</SelectItem>
                    <SelectItem value="in_progress">قيد المعالجة</SelectItem>
                    <SelectItem value="resolved">تم الحل</SelectItem>
                    <SelectItem value="closed">مغلق</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>ملاحظات داخلية</Label>
                <Textarea
                  value={internalNotes}
                  onChange={e => setInternalNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              إغلاق
            </Button>
            <Button onClick={handleUpdateStatus}>
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

/* =========================
   Small component
========================= */
function StatCard({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${color || ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
