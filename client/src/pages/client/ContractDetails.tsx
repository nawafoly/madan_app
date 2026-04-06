// client/src/pages/client/ContractDetails.tsx
import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";

import ClientLayout from "@/components/ClientLayout";
import InvestmentRequestStepper, {
  findTimelineDateByTypes,
  resolveInvestmentRequestStepKey,
  shouldShowInvestmentRequestStepper,
} from "@/components/InvestmentRequestStepper";
import {
  getClientContractStatusMeta,
  getClientInvestmentStatusMeta,
} from "@/lib/workflowStatusMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { useAuth } from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";
import { AUDIT_ACTIONS, auditedSetDoc, buildAuditSource } from "@/lib/auditLog";
import { formatCurrencyEN, formatDateEN } from "@/lib/formatters";
import { getOwnerRoleLabel } from "@/lib/ownerAccounts";
import { extractProjectId, getProjectDisplayTitle } from "@/lib/projectDisplay";
import {
  findInterestRequestForInvestor,
  findInvestmentForInvestor,
  normalizeLinkId,
  pickLinkId,
} from "@/lib/requestInvestmentLink";

import {
  doc,
  getDoc,
  onSnapshot,
  collection,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  Clock3,
  MessageSquare,
  Phone,
  Mail,
  MessageCircle,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  CLIENT_WORKFLOW_COPY,
  getInvestorActivationMessage,
  isInvestmentActivatedStatus,
} from "@shared/investmentLifecycle";

/* =========================
  إعدادات التواصل (عدّلها مرة وحدة)
  CTRL+F: CONTACT_
========================= */
const CONTACT_PHONE = "+966500000000"; // رقم خدمة العملاء
const CONTACT_EMAIL = "support@maedin.sa"; // البريد
const CONTACT_WHATSAPP = "966500000000"; // الواتس +

/* =========================
  helpers
========================= */
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

function formatDateAR(v: any) {
  return formatDateEN(toDateSafe(v));
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

/* =========================
  Types
========================= */
type TimelineEvent = {
  id?: string;
  type?: string;
  title?: string;
  note?: string | null;
  byRole?: string | null;
  byUid?: string | null;
  byEmail?: string | null;
  at?: any;
  meta?: Record<string, any>;
};

type AnyDoc = Record<string, any> & { id: string };

/* =========================
  UI helpers
========================= */
function statusBadge(status: string) {
  const s = safeStr(status);
  const map: Record<string, { label: string; cls: string }> = {
    new: { label: "جديد", cls: "bg-orange-600" },
    in_progress: { label: "قيد المعالجة", cls: "bg-blue-600" },
    needs_account: { label: "يتطلب حساب", cls: "bg-yellow-600" },
    pending_review: { label: "قيد المراجعة", cls: "bg-blue-600" },
    pending_contract: getClientInvestmentStatusMeta("pending_contract"),
    signing: getClientInvestmentStatusMeta("signing"),
    signed: getClientInvestmentStatusMeta("signed"),
    draft: getClientContractStatusMeta("draft"),
    sent: getClientContractStatusMeta("sent"),
    pending_signature: getClientContractStatusMeta("pending_signature"),
    under_review: getClientContractStatusMeta("under_review"),
    approved: getClientContractStatusMeta("approved"),
    active: getClientInvestmentStatusMeta("active"),
    stopped: getClientInvestmentStatusMeta("stopped"),
    resolved: { label: "مكتمل", cls: "bg-gray-700" },
    rejected: { label: "مرفوض", cls: "bg-red-700" },
    closed: { label: "مكتمل", cls: "bg-gray-700" },
  };

  const v = map[s] || { label: s || "—", cls: "bg-slate-600" };
  return <Badge className={v.cls}>{v.label}</Badge>;
}

function stageBadge(stage: string) {
  const s = safeStr(stage);
  const map: Record<string, { label: string; cls: string }> = {
    staff: { label: "عند المراجع", cls: "bg-slate-600" },
    owner: { label: `عند ${getOwnerRoleLabel()}`, cls: "bg-amber-700" },
    accountant: { label: "عند المحاسب", cls: "bg-emerald-700" },
    client: { label: "عندك", cls: "bg-indigo-700" },
    completed: { label: "مكتمل", cls: "bg-gray-700" },
    system: { label: "مقفل", cls: "bg-gray-600" },
  };

  const v = map[s] || { label: s || "—", cls: "bg-slate-600" };
  return <Badge className={v.cls}>{v.label}</Badge>;
}

/* =========================
  Page
========================= */
export default function ClientContractDetails() {
  const { user } = useAuth();
  const [match, params] = useRoute("/client/contracts/:id");
  const id = params?.id;

  const [loading, setLoading] = useState(true);

  // ممكن يكون id عقد أو استثمار أو رسالة
  const [requestDoc, setRequestDoc] = useState<AnyDoc | null>(null);
  const [messageDoc, setMessageDoc] = useState<AnyDoc | null>(null);
  const [investmentDoc, setInvestmentDoc] = useState<AnyDoc | null>(null);
  const [contractDoc, setContractDoc] = useState<AnyDoc | null>(null);
  const [projectDoc, setProjectDoc] = useState<AnyDoc | null>(null);

  const [followupText, setFollowupText] = useState("");
  const [sendingFollowup, setSendingFollowup] = useState(false);

  // ✅ helper: حمل وثيقة وتأكد موجودة
  const tryGet = async (colName: string, docId: string) => {
    try {
      const ref = doc(db, colName, docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return { id: snap.id, ...(snap.data() as any) } as AnyDoc;
    } catch (error) {
      const code = String((error as any)?.code || "").toLowerCase();
      if (!code.includes("permission-denied")) {
        console.error(`${colName}_read_error`, error);
      }
      return null;
    }
  };

  const logSnapshotError = (scope: string, error: unknown) => {
    const code = String((error as any)?.code || "").toLowerCase();
    if (code.includes("permission-denied")) return;
    console.error(`${scope}_error`, error);
  };

  // ✅ Realtime subscriptions
  useEffect(() => {
    if (!match || !id) return;

    let unsubReq: (() => void) | null = null;
    let unsubMsg: (() => void) | null = null;
    let unsubInv: (() => void) | null = null;
    let unsubCon: (() => void) | null = null;

    const attachRequestSnapshot = (requestId: string, expectedInvestmentId = "") => {
      const normalizedRequestId = normalizeLinkId(requestId);
      if (!normalizedRequestId) return;

      unsubReq = onSnapshot(
        doc(db, "interest_requests", normalizedRequestId),
        (snap) => {
          if (!snap.exists()) {
            setRequestDoc(null);
            return;
          }

          const data = snap.data() as Record<string, any>;
          const ownerId = normalizeLinkId(data?.investorUid || data?.userId || data?.createdByUid);
          const linkedInvestmentId = normalizeLinkId(data?.investmentId);
          const currentUserId = normalizeLinkId(user?.uid);

          if (currentUserId && ownerId && ownerId !== currentUserId) {
            setRequestDoc(null);
            return;
          }

          if (expectedInvestmentId && linkedInvestmentId && linkedInvestmentId !== expectedInvestmentId) {
            setRequestDoc(null);
            return;
          }

          setRequestDoc({ id: snap.id, ...(data as any) });
        },
        (error) => logSnapshotError("interest_request_snapshot", error)
      );
    };

    const run = async () => {
      setLoading(true);
      setRequestDoc(null);
      setMessageDoc(null);
      setInvestmentDoc(null);
      setContractDoc(null);
      setProjectDoc(null);

      try {
        // 1) جرّب: contracts/{id}
        const c = await tryGet("contracts", id);
        if (c) {
          setContractDoc(c);

          // ممكن العقد فيه messageId / investmentId
          const invId = safeStr(c.investmentId);
          const requestId = pickLinkId(
            c.requestId,
            c.sourceRequestId,
            c.messageId,
            c.sourceMessageId
          );
          let linkedRequest: AnyDoc | null = null;

          if (user?.uid) {
            linkedRequest = (await findInterestRequestForInvestor({
              investorUid: user.uid,
              requestIds: [requestId],
              investmentIds: [invId],
            })) as AnyDoc | null;

            if (linkedRequest) {
              setRequestDoc(linkedRequest);
              attachRequestSnapshot(linkedRequest.id, invId);
            }
          }

          if (invId) {
            const ref = doc(db, "investments", invId);
            unsubInv = onSnapshot(
              ref,
              (s) => {
                if (s.exists()) setInvestmentDoc({ id: s.id, ...(s.data() as any) });
              },
              (e) => logSnapshotError("investment_snapshot", e)
            );
          }

          const cref = doc(db, "contracts", id);
          unsubCon = onSnapshot(
            cref,
            (s) => {
              if (s.exists()) setContractDoc({ id: s.id, ...(s.data() as any) });
            },
            (e) => logSnapshotError("contract_snapshot", e)
          );

          setLoading(false);
          return;
        }

        // 2) جرّب: investments/{id}
        const inv = await tryGet("investments", id);
        if (inv) {
          setInvestmentDoc(inv);

          const contractId = safeStr(inv.contractId);
          const requestId = pickLinkId(inv.requestId, inv.sourceRequestId, inv.sourceMessageId);
          let linkedRequest: AnyDoc | null = null;

          if (user?.uid) {
            linkedRequest = (await findInterestRequestForInvestor({
              investorUid: user.uid,
              requestIds: [requestId],
              investmentIds: [inv.id],
            })) as AnyDoc | null;

            if (linkedRequest) {
              setRequestDoc(linkedRequest);
              attachRequestSnapshot(linkedRequest.id, inv.id);
            }
          }

          if (contractId) {
            const contract = await tryGet("contracts", contractId);
            if (contract) setContractDoc(contract);

            const cref = doc(db, "contracts", contractId);
            unsubCon = onSnapshot(
              cref,
              (s) => {
                if (s.exists()) setContractDoc({ id: s.id, ...(s.data() as any) });
              },
              (e) => logSnapshotError("contract_snapshot", e)
            );
          }

          const iref = doc(db, "investments", id);
          unsubInv = onSnapshot(
            iref,
            (s) => {
              if (s.exists()) setInvestmentDoc({ id: s.id, ...(s.data() as any) });
            },
            (e) => logSnapshotError("investment_snapshot", e)
          );

          setLoading(false);
          return;
        }

        // 3) جرّب: messages/{id}
        if (user?.uid) {
          const request = await findInterestRequestForInvestor({
            investorUid: user.uid,
            requestIds: [id],
          });

          if (request) {
            setRequestDoc(request as AnyDoc);
            attachRequestSnapshot(request.id, normalizeLinkId(request?.investmentId));

            const linkedInvestment = await findInvestmentForInvestor({
              investorUid: user.uid,
              investmentIds: [request?.investmentId],
              requestIds: [request.id],
            });

            if (linkedInvestment) {
              setInvestmentDoc(linkedInvestment as AnyDoc);

              const iref = doc(db, "investments", linkedInvestment.id);
              unsubInv = onSnapshot(
                iref,
                (s) => {
                  if (s.exists()) setInvestmentDoc({ id: s.id, ...(s.data() as any) });
                },
                (e) => logSnapshotError("investment_snapshot", e)
              );

              const contractId = safeStr(linkedInvestment?.contractId);
              if (contractId) {
                const contract = await tryGet("contracts", contractId);
                if (contract) setContractDoc(contract);

                const cref = doc(db, "contracts", contractId);
                unsubCon = onSnapshot(
                  cref,
                  (s) => {
                    if (s.exists()) setContractDoc({ id: s.id, ...(s.data() as any) });
                  },
                  (e) => logSnapshotError("contract_snapshot", e)
                );
              }
            }

            setLoading(false);
            return;
          }
        }

        const msg = await tryGet("messages", id);
        if (msg) {
          setMessageDoc(msg);

          const invId = safeStr(msg.investmentId);
          const requestId = pickLinkId(msg.parentRequestId, msg.requestId);

          if (user?.uid && requestId) {
            const linkedRequest = (await findInterestRequestForInvestor({
              investorUid: user.uid,
              requestIds: [requestId],
              investmentIds: [invId],
            })) as AnyDoc | null;

            if (linkedRequest) {
              setRequestDoc(linkedRequest);
              attachRequestSnapshot(linkedRequest.id, invId);
            }
          }

          if (invId) {
            const ref = doc(db, "investments", invId);
            unsubInv = onSnapshot(
              ref,
              (s) => {
                if (s.exists()) setInvestmentDoc({ id: s.id, ...(s.data() as any) });
              },
              (e) => logSnapshotError("investment_snapshot", e)
            );
          }

          const mref = doc(db, "messages", id);
          unsubMsg = onSnapshot(
            mref,
            (s) => {
              if (s.exists()) setMessageDoc({ id: s.id, ...(s.data() as any) });
            },
            (e) => logSnapshotError("message_snapshot", e)
          );

          setLoading(false);
          return;
        }

        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };

    run();

    return () => {
      try {
        unsubReq?.();
        unsubMsg?.();
        unsubInv?.();
        unsubCon?.();
      } catch {}
    };
  }, [match, id, user?.uid]);

  useEffect(() => {
    const projectId =
      extractProjectId(investmentDoc) ||
      extractProjectId(requestDoc) ||
      extractProjectId(messageDoc) ||
      extractProjectId(contractDoc);

    if (!projectId) {
      setProjectDoc(null);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "projects", projectId),
      (snap) => {
        setProjectDoc(snap.exists() ? { id: snap.id, ...(snap.data() as any) } : null);
      },
      (error) => {
        logSnapshotError("project_snapshot", error);
        setProjectDoc(null);
      }
    );

    return () => {
      unsub();
    };
  }, [investmentDoc, requestDoc, messageDoc, contractDoc]);

  // ✅ لقط الحالة والمرحلة “بأفضل مصدر”
  const requestStateDoc = requestDoc || messageDoc;

  const current = useMemo(() => {
    const invStatus = safeStr(investmentDoc?.status);
    const msgStatus = safeStr(requestStateDoc?.status);
    const conStatus =
      safeStr(contractDoc?.status) ||
      safeStr(investmentDoc?.contractStatus) ||
      safeStr(requestStateDoc?.contractStatus);
    const status = isInvestmentActivatedStatus(invStatus)
      ? invStatus
      : conStatus || invStatus || msgStatus || "—";
    const stageRole =
      safeStr(requestDoc?.stageRole) ||
      safeStr(messageDoc?.stageRole) ||
      safeStr(investmentDoc?.stageRole) ||
      "—";

    const projectTitle =
      safeStr(investmentDoc?.projectTitle) ||
      safeStr(requestStateDoc?.projectTitle) ||
      "—";

    const currentProjectTitle =
      getProjectDisplayTitle(projectDoc, investmentDoc?.projectTitle, requestStateDoc?.projectTitle) ||
      projectTitle ||
      "—";

    const amount =
      investmentDoc?.amount ??
      requestStateDoc?.approvedAmount ??
      requestStateDoc?.estimatedAmount ??
      null;

    return {
      status,
      investmentStatus: invStatus,
      contractStatus: conStatus,
      stageRole,
      projectTitle: currentProjectTitle,
      amount,
      createdAt: investmentDoc?.createdAt || requestStateDoc?.createdAt || contractDoc?.createdAt,
    };
  }, [requestStateDoc, requestDoc, messageDoc, investmentDoc, contractDoc, projectDoc]);

  // ✅ Timeline: دمج events من message + investment + contract
  const timeline = useMemo(() => {
    const list: TimelineEvent[] = [];

    const push = (src: any, scope: string) => {
      const evs: TimelineEvent[] = Array.isArray(src?.events) ? src.events : [];
      evs.forEach((e) => {
        list.push({
          ...e,
          title: e?.title ? `${e.title}` : "تحديث",
          meta: { ...(e?.meta || {}), scope },
        });
      });
    };

    push(requestStateDoc, "request");
    push(investmentDoc, "investment");
    push(contractDoc, "contract");

    // لو ما فيه أحداث: نسوي حدث تأسيسي بسيط
    if (!list.length) {
      const baseCreatedAt = current.createdAt;
      if (baseCreatedAt) {
        list.push({
          id: "base-created",
          type: "created",
          title: "تم إنشاء الطلب",
          note: "تم استقبال طلبك وسيتم العمل عليه.",
          at: baseCreatedAt,
        });
      }
    }

    const sorted = [...list].sort((a, b) => {
      const da = toDateSafe(a?.at)?.getTime() ?? 0;
      const dbb = toDateSafe(b?.at)?.getTime() ?? 0;
      return da - dbb;
    });

    return sorted;
  }, [requestStateDoc, investmentDoc, contractDoc, current.createdAt]);
  const showInvestmentRequestStepper = shouldShowInvestmentRequestStepper(current.status);
  const investmentRequestCurrentStep = useMemo(
    () =>
      resolveInvestmentRequestStepKey({
        status: current.status,
        contractStatus: current.contractStatus,
        hasInvestment: Boolean(investmentDoc?.id || investmentDoc?.createdAt),
        hasContractUploaded:
          Boolean(contractDoc?.createdAt) ||
          Boolean(
            findTimelineDateByTypes(
              timeline,
              "contract_uploaded",
              "contract_prepared",
              "original_contract_uploaded"
            )
          ),
        hasContractSigned: Boolean(
          findTimelineDateByTypes(timeline, "contract_signed", "signed_uploaded")
        ),
        hasContractVerified: Boolean(findTimelineDateByTypes(timeline, "contract_verified")),
      }),
    [
      contractDoc?.createdAt,
      current.contractStatus,
      current.status,
      investmentDoc?.createdAt,
      investmentDoc?.id,
      timeline,
    ]
  );
  const investmentRequestStepDates = useMemo(
    () => ({
      request_created:
        findTimelineDateByTypes(
          timeline,
          "interest_request_created",
          "request_created",
          "request_submitted"
        ) ||
        requestStateDoc?.createdAt ||
        current.createdAt,
      investment_created:
        findTimelineDateByTypes(timeline, "investment_created") || investmentDoc?.createdAt,
      contract_preparing:
        findTimelineDateByTypes(timeline, "investment_created") || investmentDoc?.createdAt,
      awaiting_signature:
        findTimelineDateByTypes(
          timeline,
          "contract_uploaded",
          "contract_prepared",
          "original_contract_uploaded"
        ) || contractDoc?.createdAt,
      contract_under_review:
        findTimelineDateByTypes(timeline, "contract_signed", "signed_uploaded"),
      contract_verified:
        findTimelineDateByTypes(timeline, "contract_verified"),
    }),
    [
      contractDoc?.createdAt,
      current.createdAt,
      investmentDoc?.createdAt,
      requestStateDoc?.createdAt,
      timeline,
    ]
  );

  // ✅ “مساعد المرحلة”: نص إرشادي + زر تواصل مناسب
  const stageHelp = useMemo(() => {
    const s = safeStr(current.status);
    const stage = safeStr(current.stageRole);

    // حالات رفض / إغلاق
    if (s === "rejected") {
      return {
        title: "تم رفض الطلب",
        desc: "إذا تبي تفاصيل أكثر أو عندك تعديل في البيانات، تواصل معنا.",
        cta: "تواصل معنا",
      };
    }

    if (s === "active") {
      return {
        title: CLIENT_WORKFLOW_COPY.investmentStarted,
        desc: "بدأ الاستثمار بالفعل، ويمكنك متابعة التفاصيل أو التواصل معنا عند الحاجة.",
        cta: "استفسار",
      };
    }

    if (s === "resolved" || stage === "completed") {
      return {
        title: "تم اعتماد الطلب",
        desc: "طلبك مكتمل. إذا عندك استفسار عن التفاصيل أو التقارير، تواصل معنا.",
        cta: "استفسار",
      };
    }

    if (s === "needs_account") {
      return {
        title: "يلزم تسجيل الدخول",
        desc: "لا نقدر نكمل الطلب بدون حساب. سجّل دخولك ثم أعد إرسال الطلب.",
        cta: "تسجيل الدخول",
      };
    }

    if (s === "new") {
      return {
        title: "تم استلام الطلب",
        desc: "طلبك جديد وسيتم مراجعته قريبًا. لو عندك تفاصيل إضافية أرسلها لنا.",
        cta: "إرسال متابعة",
      };
    }

    if (s === "in_progress" || s === "pending_review") {
      return {
        title: "طلبك قيد المعالجة",
        desc: "نعمل الآن على طلبك. يمكنك إرسال أي معلومات إضافية لتسريع الإجراء.",
        cta: "إرسال متابعة",
      };
    }

    if (current.investmentStatus || current.contractStatus) {
      const activationMessage = getInvestorActivationMessage(
        current.investmentStatus,
        current.contractStatus
      );
      return {
        title: activationMessage.title,
        desc: activationMessage.description,
        cta: "إرسال متابعة",
      };
    }

    if (stage === "client") {
      return {
        title: "مطلوب منك إجراء بسيط",
        desc: "الطلب عندك الآن. لو تحتاج توضيح أو دعم، تواصل معنا.",
        cta: "تواصل معنا",
      };
    }

    return {
      title: "متابعة الطلب",
      desc: "تابع خط السير بالأسفل، ولو تحتاج مساعدة تواصل معنا.",
      cta: "تواصل معنا",
    };
  }, [current.contractStatus, current.investmentStatus, current.stageRole, current.status]);

  // ✅ إرسال متابعة داخل المنصة (رسالة جديدة مرتبطة بالطلب)
  const sendFollowup = async () => {
    if (!user?.uid) {
      toast.error("سجّل دخولك أولاً لإرسال متابعة");
      return;
    }

    const text = safeStr(followupText);
    if (!text) return toast.error("اكتب رسالتك أولاً");

    const parentRequestId =
      pickLinkId(
        requestDoc?.id,
        messageDoc?.parentRequestId,
        messageDoc?.requestId,
        investmentDoc?.requestId,
        investmentDoc?.sourceRequestId,
        contractDoc?.requestId,
        contractDoc?.sourceRequestId
      ) || null;
    const parentMessageId =
      pickLinkId(
        messageDoc?.id,
        investmentDoc?.sourceMessageId,
        contractDoc?.messageId,
        contractDoc?.sourceMessageId
      ) || null;

    if (!parentRequestId) {
      toast.error("لا يمكن ربط المتابعة بالطلب حالياً");
      return;
    }

    try {
      setSendingFollowup(true);
      const messageRef = doc(collection(db, "messages"));
      const payload = {
        type: "client_followup",
        parentMessageId: parentMessageId || null,
        parentRequestId: parentRequestId || null,
        requestId: parentRequestId || null,
        message: text,

        createdByUid: user.uid,
        email: user.email || null,
        name: (user as any)?.displayName || null,

        createdAt: serverTimestamp(),
        status: "new",
        stageRole: "staff",

        meta: {
          from: "client_contract_details",
          refId: id,
          investmentId: investmentDoc?.id || null,
          contractId: contractDoc?.id || null,
        },
      };
      await auditedSetDoc({
        ref: messageRef,
        data: payload,
        action: AUDIT_ACTIONS.MESSAGE_CREATED,
        category: "message",
        entityType: "message",
        source: buildAuditSource({
          area: "client",
          page: "ContractDetails",
          method: "create_followup",
        }),
        relatedIds: {
          requestId: parentRequestId || undefined,
          investmentId: investmentDoc?.id || undefined,
          contractId: contractDoc?.id || undefined,
          userId: user.uid,
        },
        message: `Created follow-up message ${messageRef.id}`,
        meta: {
          requestCode: parentRequestId || null,
          investmentCode: investmentDoc?.id || null,
          fileName: null,
        },
        ignoreFields: ["createdAt"],
      });

      toast.success("تم إرسال المتابعة ✅");
      setFollowupText("");
    } catch (e) {
      console.error(e);
      toast.error("فشل إرسال المتابعة");
    } finally {
      setSendingFollowup(false);
    }
  };

  if (!match) return null;

  return (
    <ClientLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-muted-foreground">تفاصيل الطلب</div>
            <h1 className="text-2xl md:text-3xl font-bold mt-1">متابعة حالة الطلب</h1>
          </div>

          <Link href="/client/dashboard">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              رجوع
            </Button>
          </Link>
        </div>

        {/* Auth hint */}
        {!user?.uid ? (
          <Card className="rsg-card">
            <CardContent className="py-5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold">أنت غير مسجل دخول</div>
                <div className="text-sm text-muted-foreground mt-1">
                  تقدر تشوف جزء من الحالة، لكن إرسال المتابعة يحتاج تسجيل دخول.
                </div>
                <div className="mt-3">
                  <Link href="/login">
                    <Button className="gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      تسجيل الدخول
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Main summary */}
        <Card className="rsg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              ملخص الطلب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin inline-block ml-2" />
                جاري التحميل...
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {statusBadge(current.status)}
                  {stageBadge(current.stageRole)}
                  <Badge variant="outline" className="border-primary/20">
                    تاريخ الطلب: {formatDateAR(current.createdAt)}
                  </Badge>
                </div>

                <Separator />

                <div className="grid gap-3 md:grid-cols-2 text-sm">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">المشروع</div>
                    <div className="font-semibold mt-1">{current.projectTitle}</div>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">المبلغ</div>
                    <div className="font-semibold mt-1">
                      {current.amount != null
                        ? formatCurrencyEN(current.amount, { currencyLabel: "SAR" })
                        : "—"}
                    </div>
                  </div>
                </div>

                {/* Stage help */}
                <div className="rounded-2xl border bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock3 className="w-5 h-5" />
                    </div>

                    <div className="min-w-0">
                      <div className="font-bold">{stageHelp.title}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {stageHelp.desc}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {/* CTA حسب المرحلة */}
                        {stageHelp.cta === "تسجيل الدخول" ? (
                          <Link href="/login">
                            <Button className="gap-2">
                              <ShieldCheck className="w-4 h-4" />
                              تسجيل الدخول
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            className="gap-2"
                            onClick={() => {
                              // سكرول على منطقة المتابعة
                              const el = document.getElementById("followup-box");
                              el?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                          >
                            <MessageSquare className="w-4 h-4" />
                            {stageHelp.cta}
                          </Button>
                        )}

                        {/* تواصل مباشر */}
                        <a href={`https://wa.me/${CONTACT_WHATSAPP}`} target="_blank" rel="noreferrer">
                          <Button variant="outline" className="gap-2">
                          <MessageCircle className="w-4 h-4" />
                          واتساب
                          </Button>
                        </a>

                        <a href={`tel:${CONTACT_PHONE}`}>
                          <Button variant="outline" className="gap-2">
                            <Phone className="w-4 h-4" />
                            اتصال
                          </Button>
                        </a>

                        <a href={`mailto:${CONTACT_EMAIL}`}>
                          <Button variant="outline" className="gap-2">
                            <Mail className="w-4 h-4" />
                            إيميل
                          </Button>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Follow-up box */}
        <Card className="rsg-card" id="followup-box">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              إرسال متابعة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              اكتب أي تفاصيل إضافية تساعدنا (مثل: وقت مناسب للاتصال، رقم بديل، ملاحظات…)
            </div>

            <div className="space-y-2">
              <Label>رسالتك</Label>
              <Textarea
                value={followupText}
                onChange={(e) => setFollowupText(e.target.value)}
                placeholder="اكتب هنا..."
                className="min-h-[120px]"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={sendFollowup} disabled={sendingFollowup}>
                {sendingFollowup ? (
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                )}
                إرسال المتابعة
              </Button>

              <a href={`https://wa.me/${CONTACT_WHATSAPP}`} target="_blank" rel="noreferrer">
                <Button variant="outline" className="gap-2">
                <MessageCircle className="w-4 h-4" />
                تواصل واتساب مباشرة
                </Button>
              </a>
            </div>

            <div className="text-[11px] text-muted-foreground">
              ملاحظة: إذا كان عندك “Rules” تمنع كتابة messages للعميل، قلّي وأعطيك rules جاهزة.
            </div>
          </CardContent>
        </Card>

        {showInvestmentRequestStepper ? (
          <Card className="rsg-card overflow-hidden border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-slate-100/70 shadow-sm">
            <CardHeader className="border-b border-slate-200/70 bg-white/70 pb-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <CardTitle className="text-xl font-semibold tracking-tight text-slate-950">
                    مراحل الطلب الاستثماري
                  </CardTitle>
                  <p className="text-sm leading-6 text-muted-foreground">
                    يعرض هذا المسار المراحل الحالية قبل تفعيل الاستثمار بشكل أوضح وأسهل للمتابعة.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <InvestmentRequestStepper
                currentStep={investmentRequestCurrentStep}
                dates={investmentRequestStepDates}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </ClientLayout>
  );
}
