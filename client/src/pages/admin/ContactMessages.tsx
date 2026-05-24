import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Archive,
  CalendarDays,
  Mail,
  MessageSquare,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { db } from "@/_core/firebase";
import { hasPermission, useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTimeEN, formatNumberEN, toDateSafe } from "@/lib/formatters";

type ContactMessageRecord = {
  id: string;
  requestNumber?: string;
  contactName?: string;
  name?: string;
  contactEmail?: string;
  email?: string;
  message?: string;
  note?: string;
  status?: string;
  adminSeenAt?: unknown;
  adminHandledAt?: unknown;
  createdAt?: unknown;
};

function isContactMessageRecord(record: any) {
  const type = String(record?.type || "").trim().toLowerCase();
  const requestType = String(record?.requestType || "").trim().toLowerCase();
  const source = String(record?.source || "").trim().toLowerCase();
  return (
    requestType === "contact_message" ||
    type === "contact_message" ||
    source === "site_contact_form"
  );
}

function getDisplayName(message: ContactMessageRecord) {
  return String(message.contactName || message.name || "زائر").trim();
}

function getDisplayEmail(message: ContactMessageRecord) {
  return String(message.contactEmail || message.email || "").trim();
}

function getBody(message: ContactMessageRecord) {
  return String(message.message || message.note || "").trim();
}

function isArchived(message: ContactMessageRecord) {
  const status = String(message.status || "").trim().toLowerCase();
  return Boolean(message.adminHandledAt) || ["completed", "closed", "archived"].includes(status);
}

export default function ContactMessages() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "messages.manage");
  const [messages, setMessages] = useState<ContactMessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const messagesQuery = query(
      collection(db, "interest_requests"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      snapshot => {
        setMessages(
          snapshot.docs
            .map(docSnapshot => ({
              id: docSnapshot.id,
              ...(docSnapshot.data() as Record<string, unknown>),
            }))
            .filter(isContactMessageRecord) as ContactMessageRecord[]
        );
        setLoading(false);
      },
      error => {
        console.error("contact_messages_snapshot_error", error);
        toast.error("تعذر تحميل رسائل التواصل.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const activeMessages = useMemo(
    () => messages.filter(message => !isArchived(message)),
    [messages]
  );
  const archivedMessages = useMemo(
    () => messages.filter(isArchived),
    [messages]
  );

  const markHandled = async (message: ContactMessageRecord) => {
    if (!canManage) {
      toast.error("لا تملك صلاحية إدارة الرسائل.");
      return;
    }

    try {
      setBusyId(message.id);
      await updateDoc(doc(db, "interest_requests", message.id), {
        status: "completed",
        adminSeenAt: message.adminSeenAt || serverTimestamp(),
        adminHandledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("تم نقل الرسالة إلى الأرشيف.");
    } catch (error) {
      console.error("contact_message_archive_failed", error);
      toast.error("تعذر أرشفة الرسالة.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout>
      <div dir="rtl" className="min-h-screen space-y-8 bg-[#F8F9FA] px-1 py-2">
        <Card className="rounded-3xl border border-slate-100 bg-white shadow-sm">
          <CardContent className="px-6 py-7 sm:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-1.5 text-xs font-semibold text-sky-700">
                  <MessageSquare className="h-4 w-4" />
                  رسائل التواصل
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                  صندوق رسائل التواصل
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                  رسائل نموذج "تواصل معنا" تظهر هنا بشكل مستقل عن طلبات الاستثمار
                  لأنها لا تحتاج مراحل مالية أو اعتماد عقود.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
                <Summary label="الإجمالي" value={messages.length} />
                <Summary label="الجديدة" value={activeMessages.length} />
                <Summary label="الأرشيف" value={archivedMessages.length} />
              </div>
            </div>
          </CardContent>
        </Card>

        <MessageSection
          title="الرسائل الجديدة"
          description="رسائل تحتاج قراءة أو متابعة بسيطة."
          messages={activeMessages}
          loading={loading}
          canManage={canManage}
          busyId={busyId}
          onArchive={markHandled}
        />

        <MessageSection
          title="الأرشيف"
          description="رسائل تم التعامل معها."
          messages={archivedMessages}
          loading={loading}
          canManage={canManage}
          busyId={busyId}
          onArchive={markHandled}
          archived
        />
      </div>
    </DashboardLayout>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-950">
        {formatNumberEN(value)}
      </div>
    </div>
  );
}

function MessageSection({
  title,
  description,
  messages,
  loading,
  canManage,
  busyId,
  onArchive,
  archived = false,
}: {
  title: string;
  description: string;
  messages: ContactMessageRecord[];
  loading: boolean;
  canManage: boolean;
  busyId: string | null;
  onArchive: (message: ContactMessageRecord) => void;
  archived?: boolean;
}) {
  return (
    <Card className="rounded-3xl border border-slate-100 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-2">{description}</CardDescription>
          </div>
          <Badge variant="outline" className="rounded-full bg-slate-50">
            {formatNumberEN(messages.length)} سجل
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-48 rounded-3xl bg-slate-100" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-500">
            لا توجد رسائل في هذا القسم.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {messages.map(message => (
              <ContactMessageCard
                key={message.id}
                message={message}
                canManage={canManage}
                busy={busyId === message.id}
                onArchive={onArchive}
                archived={archived}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContactMessageCard({
  message,
  canManage,
  busy,
  onArchive,
  archived,
}: {
  message: ContactMessageRecord;
  canManage: boolean;
  busy: boolean;
  onArchive: (message: ContactMessageRecord) => void;
  archived: boolean;
}) {
  const createdAt = toDateSafe(message.createdAt);
  const email = getDisplayEmail(message);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <User className="h-5 w-5 text-slate-400" />
            {getDisplayName(message)}
          </div>
          {email ? (
            <a
              href={`mailto:${email}`}
              className="mt-2 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-950"
            >
              <Mail className="h-4 w-4" />
              <span dir="ltr">{email}</span>
            </a>
          ) : null}
        </div>

        <Badge
          variant="outline"
          className={
            archived
              ? "rounded-full border-slate-200 bg-slate-100 text-slate-600"
              : "rounded-full border-sky-200 bg-sky-50 text-sky-700"
          }
        >
          {archived ? "مؤرشف" : "جديد"}
        </Badge>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">
        {getBody(message) || "لا توجد رسالة مكتوبة."}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          {createdAt ? formatDateTimeEN(createdAt) : "بدون تاريخ"}
        </div>
        <span dir="ltr">{message.requestNumber || message.id.slice(0, 8)}</span>
      </div>

      {!archived ? (
        <Button
          type="button"
          className="mt-5 w-full rounded-full"
          variant="outline"
          disabled={!canManage || busy}
          onClick={() => onArchive(message)}
        >
          <Archive className="ml-2 h-4 w-4" />
          {busy ? "جارٍ الأرشفة..." : "أرشفة الرسالة"}
        </Button>
      ) : null}
    </div>
  );
}
