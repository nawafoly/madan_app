// client/src/pages/client/ContractDetails.tsx
import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";

import ClientLayout from "@/components/ClientLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { useAuth } from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

import {
  FileText,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  Ban,
  CheckCircle2,
  Clock3,
  PenLine,
  Building2,
} from "lucide-react";
import { toast } from "sonner";

/* =========================
   Types (خفيفة لأنك تستخدم any كثير الآن)
========================= */
type ContractDoc = any;

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

const formatDateTimeAR = (v: any) => {
  const d = toDateSafe(v);
  return d ? d.toLocaleString("ar-SA") : "—";
};

function statusBadge(status?: string) {
  const map: Record<string, [string, string]> = {
    pending: ["قيد إعداد العقد", "bg-amber-700"],
    signing: ["مطلوب توقيعك", "bg-indigo-600"],
    signed: ["تم توقيعك", "bg-green-700"],
    cancelled: ["ملغي", "bg-gray-500"],
  };
  const [label, cls] = map[status || "pending"] || map.pending;
  return <Badge className={cls}>{label}</Badge>;
}

/* =========================
   Timeline for client view
========================= */
type StepKey = "draft" | "sent" | "signed" | "final";
const STEPS: { key: StepKey; label: string; icon: any }[] = [
  { key: "draft", label: "إعداد العقد", icon: Clock3 },
  { key: "sent", label: "مطلوب توقيعك", icon: PenLine },
  { key: "signed", label: "تم التوقيع", icon: CheckCircle2 },
  { key: "final", label: "اعتماد نهائي", icon: Building2 },
];

function getClientStep(contract: any): StepKey {
  const st = String(contract?.status || "pending");

  // ملاحظة: الاعتماد النهائي يتم عند الأونر/المحاسب ويصير في investments status=active
  // هنا في صفحة العقد ما نقدر نعرف "active" بدون جلب الاستثمار.
  // لذلك بنحسبها كالتالي:
  if (st === "signed") return "signed";
  if (st === "signing") return "sent";
  if (st === "cancelled") return "draft";
  return "draft";
}

function Timeline({ activeKey }: { activeKey: StepKey }) {
  const activeIndex = STEPS.findIndex((s) => s.key === activeKey);

  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">وين وصلت؟</div>
        <div className="text-xs text-muted-foreground">{STEPS[activeIndex]?.label}</div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          const Icon = s.icon;

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
                  "flex items-center justify-center gap-1 text-[11px] leading-tight",
                  done || active ? "text-foreground" : "text-muted-foreground",
                ].join(" ")}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="text-center">{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground leading-relaxed">
        {activeKey === "draft" ? "الإدارة تجهّز العقد. إذا جاهز بيرسلوه لك للتوقيع." : null}
        {activeKey === "sent" ? "العقد عندك الآن. تقدر توقّع أو تلغي قبل التوقيع." : null}
        {activeKey === "signed" ? "تم توقيعك. الآن يرجع للأونر/المحاسب للاعتماد النهائي." : null}
      </div>
    </div>
  );
}

export default function ContractDetails() {
  const { user } = useAuth();
  const [match, params] = useRoute("/client/contracts/:id");
  const contractId = params?.id;

  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<ContractDoc | null>(null);

  const [busySign, setBusySign] = useState(false);
  const [busyCancel, setBusyCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const isClient = user?.role === "client";

  const canView = useMemo(() => {
    if (!user?.uid) return false;
    if (!contract) return false;
    return contract?.investorUid === user.uid;
  }, [user?.uid, contract]);

  const load = async () => {
    if (!contractId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const ref = doc(db, "contracts", contractId);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setContract(null);
        return;
      }

      setContract({ id: snap.id, ...snap.data() });
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل العقد");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  // ✅ helper: update message by investmentId (fallback)
  const updateMessageByInvestmentId = async (investmentId: string, data: any) => {
    try {
      const snap = await getDocs(
        query(collection(db, "messages"), where("investmentId", "==", investmentId))
      );
      if (snap.empty) return;
      const m = snap.docs[0];
      await updateDoc(doc(db, "messages", m.id), data);
    } catch (e) {
      console.warn("updateMessageByInvestmentId failed", e);
    }
  };

  /* =========================
     ✅ SIGN (client)
     - allowed ONLY when contract.status === "signing"
     - after sign: contract.status = signed
     - investment.contractStatus = signed
     - message.stageRole يعود للإدارة (owner/accountant) للاعتماد النهائي
  ========================= */
  const handleSign = async () => {
    if (!user?.uid || !contractId || !contract) return;

    if (contract?.investorUid !== user.uid) {
      toast.error("ليس لديك صلاحية لتوقيع هذا العقد");
      return;
    }

    const st = String(contract?.status || "pending");
    if (st !== "signing") {
      toast.warning("التوقيع غير متاح الآن — انتظر إرسال الإدارة للتوقيع");
      return;
    }

    try {
      setBusySign(true);

      // 1) contract => signed
      await updateDoc(doc(db, "contracts", contractId), {
        status: "signed",
        signedAt: serverTimestamp(),
        signedByUid: user.uid,
        signedByEmail: user.email || null,
        updatedAt: serverTimestamp(),

        lastActionByRole: "client",
        lastActionByUid: user.uid,
        lastActionByEmail: user.email || null,
        lastActionAt: serverTimestamp(),
      });

      // 2) investment + message
      const invId = contract?.investmentId || null;
      if (invId) {
        await updateDoc(doc(db, "investments", invId), {
          contractStatus: "signed",
          signedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),

          // نخليها "signing" (مرحلة ما قبل الاعتماد النهائي)
          status: "signing",

          lastActionByRole: "client",
          lastActionByUid: user.uid,
          lastActionByEmail: user.email || null,
          lastActionAt: serverTimestamp(),
        });

        // يرجع عند الأونر (أو المحاسب إذا تبغى تغيّرها)
        await updateMessageByInvestmentId(invId, {
          contractStatus: "signed",
          stageRole: "owner",

          updatedAt: serverTimestamp(),
          updatedByUid: user.uid,
          updatedByEmail: user.email || null,

          lastActionByRole: "client",
          lastActionByUid: user.uid,
          lastActionByEmail: user.email || null,
          lastActionAt: serverTimestamp(),
        });
      }

      toast.success("تم توقيع العقد ✅ الآن رجع للإدارة للاعتماد النهائي");
      await load();
    } catch (e) {
      console.error(e);
      toast.error("فشل توقيع العقد");
    } finally {
      setBusySign(false);
    }
  };

  /* =========================
     ✅ CANCEL (client)
     - allowed when status === "signing" ONLY (لأنه فعلياً وصل للعميل)
     - contract => cancelled
     - investment => contractStatus cancelled + back to pending_contract
     - message => يرجع للمراجع staff
  ========================= */
  const handleCancel = async () => {
    if (!user?.uid || !contractId || !contract) return;

    if (contract?.investorUid !== user.uid) {
      toast.error("ليس لديك صلاحية لإلغاء هذا العقد");
      return;
    }

    const st = String(contract?.status || "pending");
    if (st !== "signing") {
      toast.warning("الإلغاء غير متاح الآن — ما وصل لك العقد للتوقيع أصلاً");
      return;
    }

    try {
      setBusyCancel(true);

      const reason = String(cancelReason || "").trim() || "تم الإلغاء من العميل";

      // 1) contract => cancelled
      await updateDoc(doc(db, "contracts", contractId), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        cancelledByUid: user.uid,
        cancelledByEmail: user.email || null,
        cancelReason: reason,
        updatedAt: serverTimestamp(),

        lastActionByRole: "client",
        lastActionByUid: user.uid,
        lastActionByEmail: user.email || null,
        lastActionAt: serverTimestamp(),
      });

      // 2) investment + message
      const invId = contract?.investmentId || null;
      if (invId) {
        await updateDoc(doc(db, "investments", invId), {
          contractStatus: "cancelled",
          status: "pending_contract",
          cancelReason: reason,
          cancelledAt: serverTimestamp(),
          updatedAt: serverTimestamp(),

          lastActionByRole: "client",
          lastActionByUid: user.uid,
          lastActionByEmail: user.email || null,
          lastActionAt: serverTimestamp(),
        });

        await updateMessageByInvestmentId(invId, {
          contractStatus: "cancelled",
          status: "in_progress",
          stageRole: "staff",
          internalNotes: reason,

          updatedAt: serverTimestamp(),
          updatedByUid: user.uid,
          updatedByEmail: user.email || null,

          lastActionByRole: "client",
          lastActionByUid: user.uid,
          lastActionByEmail: user.email || null,
          lastActionAt: serverTimestamp(),
        });
      }

      toast.success("تم إلغاء العقد — رجع للإدارة للمراجعة");
      setCancelReason("");
      await load();
    } catch (e) {
      console.error(e);
      toast.error("فشل إلغاء العقد");
    } finally {
      setBusyCancel(false);
    }
  };

  /* =========================
     Views
  ========================= */
  if (!user) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>العقد</CardTitle>
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

  if (!match || !contractId) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>العقد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">رابط العقد غير صحيح.</p>
            <Link href="/client/investments">
              <Button className="w-full" variant="outline">
                العودة إلى استثماراتي
              </Button>
            </Link>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  if (loading) {
    return (
      <ClientLayout className="py-12">
        <div className="py-20 text-center">
          <Loader2 className="w-6 h-6 animate-spin inline-block ml-2" />
          جاري تحميل العقد...
        </div>
      </ClientLayout>
    );
  }

  if (!contract) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>العقد غير موجود</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">لم يتم العثور على هذا العقد.</p>
            <Link href="/client/investments">
              <Button className="w-full" variant="outline">
                العودة إلى استثماراتي
              </Button>
            </Link>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  if (!canView) {
    return (
      <ClientLayout className="py-12">
        <Card className="max-w-xl mx-auto">
          <CardHeader>
            <CardTitle>لا تملك صلاحية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">هذا العقد غير مرتبط بحسابك.</p>
            <Link href="/client/investments">
              <Button className="w-full" variant="outline">
                العودة إلى استثماراتي
              </Button>
            </Link>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  const st = String(contract?.status || "pending");
  const step = getClientStep(contract);

  // ✅ هنا أهم تغيير: التوقيع/الإلغاء فقط في signing
  const canSign = st === "signing";
  const canCancel = st === "signing";

  return (
    <ClientLayout className="py-12">
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold">العقد</h1>
              <div className="text-sm text-muted-foreground truncate">
                رقم العقد: <span className="font-mono">{contractId}</span>
              </div>
            </div>
          </div>

          <Link href="/client/investments">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 ml-2" />
              رجوع
            </Button>
          </Link>
        </div>

        {/* Timeline */}
        <Timeline activeKey={step} />

        {/* Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">ملخص</CardTitle>
            {statusBadge(contract?.status)}
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl border p-4">
                <div className="text-xs text-muted-foreground mb-1">المستثمر</div>
                <div className="font-semibold">
                  {contract?.investorName || user.displayName || "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {contract?.investorEmail || user.email || "—"}
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="text-xs text-muted-foreground mb-1">الاستثمار</div>
                <div className="font-semibold">
                  {contract?.investmentId ? `#${contract.investmentId}` : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  المشروع: {contract?.projectTitle || "—"}
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="rounded-xl border p-4">
                <div className="text-xs text-muted-foreground mb-1">المبلغ</div>
                <div className="font-semibold">
                  {contract?.amount != null ? `${Number(contract.amount).toLocaleString()} ${contract?.currency || "SAR"}` : "—"}
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="text-xs text-muted-foreground mb-1">آخر تحديث</div>
                <div className="font-semibold">
                  {formatDateTimeAR(contract?.updatedAt || contract?.createdAt)}
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="text-xs text-muted-foreground mb-1">حالة التوقيع</div>
                <div className="font-semibold">{statusBadge(contract?.status)}</div>
              </div>
            </div>

            <Separator />

            {/* Contract body */}
            <div className="rounded-2xl border p-5 bg-muted/30">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4" />
                <div className="font-semibold">نص العقد</div>
              </div>

              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {contract?.body ||
                  contract?.content ||
                  "نص العقد غير متوفر حالياً. سيتم إضافته من الإدارة."}
              </div>
            </div>

            {/* Cancel reason */}
            {canCancel && (
              <div className="space-y-2 rounded-2xl border p-5">
                <Label>سبب الإلغاء (اختياري)</Label>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="اكتب سبب الإلغاء…"
                  className="min-h-[90px]"
                />
                <div className="text-xs text-muted-foreground">
                  الإلغاء يرجّع الطلب للإدارة للمراجعة.
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              {!canSign ? (
                <Button disabled variant="outline">
                  التوقيع غير متاح الآن
                </Button>
              ) : (
                <Button onClick={handleSign} disabled={busySign || busyCancel}>
                  {busySign ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin ml-2" />
                      جاري التوقيع...
                    </>
                  ) : (
                    "توقيع العقد"
                  )}
                </Button>
              )}

              {canCancel && (
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={busySign || busyCancel}
                >
                  {busyCancel ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin ml-2" />
                      جاري الإلغاء...
                    </>
                  ) : (
                    <>
                      <Ban className="w-4 h-4 ml-2" />
                      إلغاء
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Hint */}
            <div className="text-xs text-muted-foreground">
              ملاحظة: التوقيع هنا تجريبي حالياً. لاحقاً نضيف OTP/هوية/توقيع إلكتروني رسمي.
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientLayout>
  );
}
