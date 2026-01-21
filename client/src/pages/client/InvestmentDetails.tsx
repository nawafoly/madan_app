// client/src/pages/client/InvestmentDetails.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";

import ClientLayout from "@/components/ClientLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { useAuth } from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";

import {
  Building2,
  Clock3,
  FileText,
  Phone,
  Mail,
  MessageSquare,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

import {
  doc,
  onSnapshot,
  getDoc,
  Timestamp,
} from "firebase/firestore";

type TimelineEvent = {
  id?: string;
  type?: string;
  title?: string;
  note?: string | null;
  byRole?: string | null;
  byEmail?: string | null;
  at?: any;
  meta?: Record<string, any>;
  _source?: "message" | "investment" | "contract";
};

function toDateSafe(v: any) {
  try {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

function formatDateTimeAR(v: any) {
  const d = toDateSafe(v);
  return d ? d.toLocaleString("ar-SA") : "—";
}

const CONTACT = {
  whatsapp: "https://wa.me/966500000000",
  phone: "tel:0549010366",
  email: "mailto:info@maedin.sa",
};

function statusLabel(status: string) {
  const map: any = {
    pending_review: ["قيد المراجعة", "bg-blue-600"],
    pending: ["قيد المراجعة", "bg-blue-600"],
    approved: ["تمت الموافقة", "bg-green-600"],
    active: ["نشط", "bg-emerald-700"],
    rejected: ["مرفوض", "bg-red-600"],
    completed: ["مكتمل", "bg-gray-600"],
    pending_contract: ["بانتظار مستند", "bg-purple-600"],
    signing: ["بانتظار إجراء منك", "bg-indigo-600"],
    signed: ["تم الإجراء", "bg-green-700"],
  };
  return map[status] || ["قيد المراجعة", "bg-blue-600"];
}

function stageHelp(status: string) {
  // ✅ كل مرحلة فيها “وش تسوي الآن؟” + خيارات تواصل
  if (status === "signing" || status === "pending_contract") {
    return {
      title: "مطلوب إجراء منك",
      desc: "إذا احتجت مساعدة في إكمال الإجراء أو إرسال مستند، تواصل معنا مباشرة.",
      emphasis: true,
    };
  }
  if (status === "pending" || status === "pending_review") {
    return {
      title: "طلبك تحت المراجعة",
      desc: "نراجع التفاصيل وسيتم إشعارك عند أي تحديث.",
      emphasis: false,
    };
  }
  if (status === "approved") {
    return {
      title: "تمت الموافقة",
      desc: "سيتم التواصل معك لاستكمال الإجراءات، وإذا احتجت تسريع التواصل معنا.",
      emphasis: false,
    };
  }
  if (status === "active") {
    return {
      title: "استثمارك نشط",
      desc: "تابع التحديثات من هنا، وإذا عندك أي استفسار نحن جاهزين.",
      emphasis: false,
    };
  }
  if (status === "rejected") {
    return {
      title: "تم رفض الطلب",
      desc: "تقدر تتواصل معنا لمعرفة التفاصيل أو تقديم طلب جديد.",
      emphasis: true,
    };
  }
  if (status === "completed") {
    return {
      title: "تم إكمال الاستثمار",
      desc: "إذا تحتاج أي مستند أو استفسار بعد الإكمال، تواصل معنا.",
      emphasis: false,
    };
  }
  return {
    title: "تحديثات الاستثمار",
    desc: "تابع الحالة وخط السير من هنا.",
    emphasis: false,
  };
}

export default function InvestmentDetails() {
  const { user } = useAuth();
  const [, params] = useRoute("/client/investments/:id");
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [investment, setInvestment] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [messageDoc, setMessageDoc] = useState<any>(null);
  const [contractDoc, setContractDoc] = useState<any>(null);

  useEffect(() => {
    if (!user?.uid || !id) return;

    let unsubInv: null | (() => void) = null;

    const run = async () => {
      try {
        setLoading(true);

        const invRef = doc(db, "investments", id);

        unsubInv = onSnapshot(
          invRef,
          async (snap) => {
            if (!snap.exists()) {
              setInvestment(null);
              setProject(null);
              setMessageDoc(null);
              setContractDoc(null);
              setLoading(false);
              return;
            }

            const inv = { id: snap.id, ...snap.data() };
            setInvestment(inv);

            // ✅ أمنياً: نتأكد أنه يخص نفس المستثمر
            if (String(inv.investorUid || "") !== String(user.uid)) {
              setInvestment({ __forbidden: true });
              setLoading(false);
              return;
            }

            // ✅ load project (مرة واحدة كل تحديث)
            if (inv.projectId) {
              const pSnap = await getDoc(doc(db, "projects", String(inv.projectId)));
              setProject(pSnap.exists() ? { id: pSnap.id, ...pSnap.data() } : null);
            } else {
              setProject(null);
            }

            // ✅ load source message (إن وجد)
            if (inv.sourceMessageId) {
              const mSnap = await getDoc(doc(db, "messages", String(inv.sourceMessageId)));
              setMessageDoc(mSnap.exists() ? { id: mSnap.id, ...mSnap.data() } : null);
            } else {
              setMessageDoc(null);
            }

            // ✅ contract optional
            if (inv.contractId) {
              const cSnap = await getDoc(doc(db, "contracts", String(inv.contractId)));
              setContractDoc(cSnap.exists() ? { id: cSnap.id, ...cSnap.data() } : null);
            } else {
              setContractDoc(null);
            }

            setLoading(false);
          },
          (err) => {
            console.error("investment_read_error", err);
            setLoading(false);
          }
        );
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };

    run();

    return () => {
      if (unsubInv) unsubInv();
    };
  }, [user?.uid, id]);

  const mergedTimeline = useMemo(() => {
    const list: TimelineEvent[] = [];

    const pushEvents = (src: TimelineEvent["_source"], docAny: any) => {
      const evs = Array.isArray(docAny?.events) ? docAny.events : [];
      evs.forEach((ev: any) =>
        list.push({
          ...(ev || {}),
          _source: src,
          id: ev?.id || `${src}-${Math.random().toString(16).slice(2)}`,
        })
      );
    };

    pushEvents("investment", investment);
    pushEvents("message", messageDoc);
    pushEvents("contract", contractDoc);

    // sort asc
    list.sort((a, b) => {
      const ta = toDateSafe(a.at)?.getTime() ?? 0;
      const tb = toDateSafe(b.at)?.getTime() ?? 0;
      return ta - tb;
    });

    return list;
  }, [investment, messageDoc, contractDoc]);

  if (!user) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>تفاصيل الاستثمار</CardTitle>
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

  if (loading) {
    return (
      <ClientLayout className="py-12">
        <div className="py-20 text-center">جاري التحميل...</div>
      </ClientLayout>
    );
  }

  if (!investment) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>تفاصيل الاستثمار</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">لم يتم العثور على الاستثمار.</p>
            <Link href="/client/dashboard">
              <Button className="w-full">رجوع</Button>
            </Link>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  if (investment?.__forbidden) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>غير مصرح</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              لا يمكنك عرض هذا الاستثمار لأنه لا يخص حسابك.
            </p>
            <Link href="/client/dashboard">
              <Button className="w-full">رجوع</Button>
            </Link>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  const status = String(investment.status || "pending_review");
  const [stLabel, stCls] = statusLabel(status);
  const help = stageHelp(status);

  return (
    <ClientLayout className="py-12">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold">تفاصيل الاستثمار</h1>
              <Badge className={stCls}>{stLabel}</Badge>
            </div>

            <div className="mt-2 text-muted-foreground">
              {project?.titleAr || investment?.projectTitle || "—"}
            </div>
          </div>

          <Link href="/client/dashboard">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              رجوع
            </Button>
          </Link>
        </div>

        {/* Stage helper + contact */}
        <Card className={help.emphasis ? "border-primary/30" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              {help.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{help.desc}</p>

            <div className="flex flex-wrap gap-2">
              <a href={CONTACT.whatsapp} target="_blank" rel="noreferrer">
                <Button className="gap-2">
                  <MessageSquare className="w-4 h-4" />
                  واتساب
                </Button>
              </a>

              <a href={CONTACT.phone}>
                <Button variant="outline" className="gap-2">
                  <Phone className="w-4 h-4" />
                  اتصال
                </Button>
              </a>

              <a href={CONTACT.email}>
                <Button variant="outline" className="gap-2">
                  <Mail className="w-4 h-4" />
                  إيميل
                </Button>
              </a>

              <Link href="/contact">
                <Button variant="outline" className="gap-2">
                  تواصل معنا
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          {/* Left: Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="w-5 h-5" />
                خط السير (Timeline)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mergedTimeline.length ? (
                <TimelineView events={mergedTimeline} />
              ) : (
                <div className="text-sm text-muted-foreground">
                  لا توجد أحداث مسجلة بعد.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                ملخص
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="المبلغ" value={investment?.amount != null ? `${Number(investment.amount).toLocaleString()} ر.س` : "—"} />
              <InfoRow label="تاريخ الإنشاء" value={investment?.createdAt ? formatDateTimeAR(investment.createdAt) : "—"} />
              <InfoRow label="Project ID" value={investment?.projectId || "—"} />
              <InfoRow label="Investment ID" value={investment?.id || "—"} />

              <Separator />

              {/* ✅ Contract optional */}
              {investment?.contractUrl ? (
                <a href={investment.contractUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline" className="w-full gap-2">
                    <FileText className="w-4 h-4" />
                    عرض ملف العقد
                  </Button>
                </a>
              ) : investment?.contractId ? (
                <Link href={`/client/contracts/${investment.contractId}`}>
                  <Button variant="outline" className="w-full gap-2">
                    <FileText className="w-4 h-4" />
                    عرض العقد (اختياري)
                  </Button>
                </Link>
              ) : (
                <div className="text-xs text-muted-foreground">
                  العقد اختياري — الاستثمار مستقل عنه.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ClientLayout>
  );
}

/* =========================
   UI Helpers
========================= */

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="text-xs text-muted-foreground shrink-0">{label}</div>
      <div className="text-sm font-semibold text-right break-words">
        {value ?? "—"}
      </div>
    </div>
  );
}

function TimelineView({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="relative space-y-3">
      <div className="absolute right-[10px] top-2 bottom-2 w-px bg-border" />

      {events.map((ev, idx) => {
        const date = formatDateTimeAR(ev.at);
        const srcLabel =
          ev._source === "investment"
            ? "استثمار"
            : ev._source === "message"
              ? "طلب"
              : ev._source === "contract"
                ? "عقد"
                : "—";

        return (
          <div key={ev.id || idx} className="relative pr-7">
            <div className="absolute right-[6px] top-[6px] w-2.5 h-2.5 rounded-full bg-primary" />

            <div className="rounded-xl border bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{ev.title || "تحديث"}</div>
                  {ev.note ? (
                    <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                      {ev.note}
                    </div>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground shrink-0">
                  {date}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="px-2 py-0.5 rounded-full bg-muted">{srcLabel}</span>
                {ev.byRole ? (
                  <span className="px-2 py-0.5 rounded-full bg-muted">
                    {String(ev.byRole)}
                  </span>
                ) : null}
                {ev.byEmail ? (
                  <span className="px-2 py-0.5 rounded-full bg-muted break-all">
                    {String(ev.byEmail)}
                  </span>
                ) : null}
                {ev.type ? (
                  <span className="px-2 py-0.5 rounded-full bg-muted">
                    {String(ev.type)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
