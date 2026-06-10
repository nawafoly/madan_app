import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Inbox,
  Send,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useSearch } from "wouter";

import EmployeeLayout from "@/components/EmployeeLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  fetchActiveEmployeeCoworkers,
  type EmployeeCoworkerOption,
} from "@/lib/employeeCoworkers";
import { uploadDocumentToCloudflare } from "@/lib/documentUploadService";
import {
  buildEmployeeFileParticipants,
  EMPLOYEE_FILE_CATEGORY,
  EMPLOYEE_FILES_COLLECTION,
  EMPLOYEE_FILE_TYPE_OPTIONS,
  filterIncomingEmployeeFiles,
  filterSentEmployeeFiles,
  normalizeEmployeeFileRecord,
  sortEmployeeFiles,
  type EmployeeFileRecord,
} from "@/lib/employeeFiles";
import { formatDateTimeEN, formatFileSizeEN } from "@/lib/formatters";
import { createInAppNotification } from "@/lib/inAppNotifications";
import {
  initialsFromName,
  MessagesStat,
  RecipientPicker,
} from "@/pages/employee/messages/ConversationUi";
import { cn } from "@/lib/utils";
import { type EmployeeFileDoc } from "@shared/employee";

type FilesTabKey = "incoming" | "sent";

type SendFileFormState = {
  recipientUid: string;
  title: string;
  description: string;
  fileType: string;
  file: File | null;
};

function mergeFileCollections(collections: EmployeeFileRecord[][]) {
  const byId = new Map<string, EmployeeFileRecord>();
  collections.flat().forEach(file => {
    byId.set(file.id, file);
  });
  return Array.from(byId.values());
}

function getActionStatus(file: EmployeeFileRecord) {
  return file.createdAtDate || file.uploadedAtDate || file.readAtDate || null;
}

function FileMetaPill({ value }: { value: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
      {value}
    </span>
  );
}

function EmployeeFileCard({
  file,
  opening,
  counterpartAvatarUrl,
  onOpen,
  onDownload,
}: {
  file: EmployeeFileRecord;
  opening: boolean;
  counterpartAvatarUrl: string | null;
  onOpen: (file: EmployeeFileRecord) => Promise<void>;
  onDownload: (file: EmployeeFileRecord) => Promise<void>;
}) {
  const actionDate = getActionStatus(file);
  const counterpartLabel = file.direction === "outgoing" ? "المستلم" : "المرسل";
  const counterpartName =
    file.direction === "outgoing"
      ? file.receiverName || file.receiverEmail || "موظف"
      : file.senderName || file.senderEmail || file.uploadedByName || "HR";
  const counterpartEmail =
    file.direction === "outgoing" ? file.receiverEmail : file.senderEmail;

  return (
    <div className="rounded-[26px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_22px_60px_-44px_rgba(15,23,42,0.22)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full shadow-none",
                    file.statusTone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-100 text-slate-700"
                  )}
                >
                  {file.statusLabel}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full shadow-none",
                    file.readStatusTone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  )}
                >
                  {file.direction === "outgoing"
                    ? file.isRead
                      ? "تم فتحه"
                      : "لم يتم فتحه بعد"
                    : file.readStatusLabel}
                </Badge>
                {!file.isInternalTransfer ? (
                  <Badge
                    variant="outline"
                    className="rounded-full bg-slate-50 shadow-none"
                  >
                    {file.fileTypeLabel}
                  </Badge>
                ) : null}
                {file.isInternalTransfer ? (
                  <Badge
                    variant="outline"
                    className="rounded-full border-sky-200 bg-sky-50 text-sky-700 shadow-none"
                  >
                    ملف داخلي
                  </Badge>
                ) : null}
              </div>

              <div>
                <div className="text-lg font-semibold text-slate-950">{file.title}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {actionDate
                    ? `تاريخ الإرسال: ${formatDateTimeEN(actionDate)}`
                    : "تاريخ الإرسال غير متوفر"}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-4 text-sm text-slate-700">
                  <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                    {counterpartLabel}
                  </div>
                  <div className="mt-2 font-semibold text-slate-950">{counterpartName}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {counterpartEmail || "البريد غير متوفر"}
                  </div>
                </div>

                <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-4 text-sm leading-7 text-slate-700">
                  {file.description || "لا يوجد وصف لهذا الملف."}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <FileMetaPill value={file.fileName} />
                <FileMetaPill value={formatFileSizeEN(file.fileSize ?? null)} />
                <FileMetaPill
                  value={file.mimeType || file.contentType || "بدون نوع"}
                />
              </div>

              {file.direction === "outgoing" ? (
                <div
                  className={cn(
                    "text-xs",
                    file.isRead ? "text-emerald-700" : "text-amber-700"
                  )}
                >
                  {file.isRead && file.readAtDate
                    ? `تم فتح الملف في ${formatDateTimeEN(file.readAtDate)}`
                    : "لم يقم المستلم بفتح الملف بعد."}
                </div>
              ) : file.isRead && file.readAtDate ? (
                <div className="text-xs text-emerald-700">
                  تمت القراءة في {formatDateTimeEN(file.readAtDate)}
                </div>
              ) : (
                <div className="text-xs text-amber-700">لم يتم فتح الملف بعد.</div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => void onOpen(file)}
              >
                <Eye className="ml-2 h-4 w-4" />
                فتح الملف
              </Button>

              {file.downloadUrl ? (
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={() => void onDownload(file)}
                >
                  <Download className="ml-2 h-4 w-4" />
                  تحميل
                </Button>
              ) : null}
            </div>
          </div>

          {opening ? (
            <div className="px-2 pt-3 text-xs text-slate-500">جارٍ تنفيذ الطلب...</div>
          ) : null}
        </div>

        <Avatar className="h-14 w-14 shrink-0 border border-slate-200 bg-slate-100 shadow-sm">
          <AvatarImage
            src={counterpartAvatarUrl || undefined}
            alt={counterpartName}
            className="object-cover"
          />
          <AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">
            {initialsFromName(counterpartName, counterpartEmail)}
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}

export default function EmployeeFilesPage() {
  const { user } = useAuth();
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const initialTab = searchParams.get("tab") === "sent" ? "sent" : "incoming";
  const sendFileInputRef = useRef<HTMLInputElement | null>(null);

  const [legacyFiles, setLegacyFiles] = useState<EmployeeFileRecord[]>([]);
  const [participantFiles, setParticipantFiles] = useState<EmployeeFileRecord[]>([]);
  const [legacyLoading, setLegacyLoading] = useState(true);
  const [participantLoading, setParticipantLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilesTabKey>(initialTab);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendingFile, setSendingFile] = useState(false);
  const [coworkers, setCoworkers] = useState<EmployeeCoworkerOption[]>([]);
  const [coworkersLoading, setCoworkersLoading] = useState(true);
  const [sendForm, setSendForm] = useState<SendFileFormState>({
    recipientUid: "",
    title: "",
    description: "",
    fileType: "general",
    file: null,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!user?.uid) {
      setLegacyFiles([]);
      setParticipantFiles([]);
      setLegacyLoading(false);
      setParticipantLoading(false);
      return;
    }

    setLegacyLoading(true);
    setParticipantLoading(true);

    const unsubscribeLegacy = onSnapshot(
      query(collection(db, EMPLOYEE_FILES_COLLECTION), where("employeeUid", "==", user.uid)),
      snapshot => {
        setLegacyFiles(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeFileRecord(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, unknown>) || {},
              user.uid
            )
          )
        );
        setLegacyLoading(false);
      },
      error => {
        console.error("employee_files_legacy_snapshot_error", error);
        setLegacyFiles([]);
        setLegacyLoading(false);
      }
    );

    const unsubscribeParticipants = onSnapshot(
      query(
        collection(db, EMPLOYEE_FILES_COLLECTION),
        where("participantUids", "array-contains", user.uid)
      ),
      snapshot => {
        setParticipantFiles(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeFileRecord(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, unknown>) || {},
              user.uid
            )
          )
        );
        setParticipantLoading(false);
      },
      error => {
        console.error("employee_files_participants_snapshot_error", error);
        setParticipantFiles([]);
        setParticipantLoading(false);
      }
    );

    return () => {
      unsubscribeLegacy();
      unsubscribeParticipants();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setCoworkers([]);
      setCoworkersLoading(false);
      return;
    }

    let cancelled = false;
    setCoworkersLoading(true);

    void fetchActiveEmployeeCoworkers()
      .then(rows => {
        if (cancelled) return;
        setCoworkers(
          rows
            .filter(row => row.uid !== user.uid)
            .sort((left, right) =>
              left.name.localeCompare(right.name, "ar", { sensitivity: "base" })
            )
        );
        setCoworkersLoading(false);
      })
      .catch(error => {
        if (cancelled) return;
        console.error("employee_file_coworkers_fetch_failed", error);
        setCoworkers([]);
        setCoworkersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const loading = legacyLoading || participantLoading;
  const files = useMemo(
    () => sortEmployeeFiles(mergeFileCollections([legacyFiles, participantFiles])),
    [legacyFiles, participantFiles]
  );
  const incomingFiles = useMemo(
    () => filterIncomingEmployeeFiles(files, user?.uid),
    [files, user?.uid]
  );
  const sentFiles = useMemo(
    () => filterSentEmployeeFiles(files, user?.uid),
    [files, user?.uid]
  );
  const incomingUnreadCount = useMemo(
    () => incomingFiles.filter(file => !file.isRead).length,
    [incomingFiles]
  );
  const incomingReadCount = incomingFiles.length - incomingUnreadCount;
  const incomingArchivedCount = useMemo(() => {
    const allIncoming = files.filter(file =>
      file.isInternalTransfer
        ? file.receiverUid === user?.uid
        : file.employeeUid === user?.uid
    );
    return allIncoming.length - incomingFiles.length;
  }, [files, incomingFiles.length, user?.uid]);
  const selectedRecipient = useMemo(
    () => coworkers.find(coworker => coworker.uid === sendForm.recipientUid) || null,
    [coworkers, sendForm.recipientUid]
  );
  const coworkersByUid = useMemo(
    () => new Map(coworkers.map(coworker => [coworker.uid, coworker])),
    [coworkers]
  );
  const currentUserAvatarUrl = useMemo(() => {
    const currentUser = user as {
      photoURL?: string | null;
      avatarUrl?: string | null;
      firebaseUser?: { photoURL?: string | null } | null;
    } | null;
    return (
      currentUser?.avatarUrl ||
      currentUser?.photoURL ||
      currentUser?.firebaseUser?.photoURL ||
      null
    );
  }, [user]);
  const currentUserDisplayName = useMemo(
    () => user?.displayName || user?.email || "أنت",
    [user?.displayName, user?.email]
  );

  const resetSendForm = () => {
    setSendForm({
      recipientUid: "",
      title: "",
      description: "",
      fileType: "general",
      file: null,
    });
    if (sendFileInputRef.current) {
      sendFileInputRef.current.value = "";
    }
  };

  const handleSendFileDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (sendingFile) return;

    const file = event.dataTransfer.files?.[0] || null;
    if (!file) return;

    setSendForm(current => ({
      ...current,
      file,
    }));

    if (sendFileInputRef.current) {
      sendFileInputRef.current.value = "";
    }
  };

  const markFileAsReadIfNeeded = async (file: EmployeeFileRecord) => {
    if (!user?.uid) return;
    const canMarkRead =
      !file.isRead &&
      file.direction === "incoming" &&
      (!file.isInternalTransfer || file.receiverUid === user.uid || file.employeeUid === user.uid);

    if (!canMarkRead) return;

    await updateDoc(doc(db, EMPLOYEE_FILES_COLLECTION, file.id), {
      isRead: true,
      readAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const openFileUrl = (url: string) => {
    const opened = window.open("", "_blank", "noopener,noreferrer");
    if (!opened) {
      toast.error("تعذر فتح الملف في تبويب جديد. تحقق من إعدادات حظر النوافذ المنبثقة.");
      return null;
    }

    opened.location.href = url;
    return opened;
  };

  const getCounterpartAvatarUrl = (file: EmployeeFileRecord) => {
    if (file.direction === "outgoing") {
      return (
        coworkersByUid.get(file.receiverUid || "")?.avatarUrl ||
        file.receiverPhoto ||
        null
      );
    }

    if (file.senderUid && file.senderUid === user?.uid) {
      return currentUserAvatarUrl || file.senderPhoto || null;
    }

    return (
      coworkersByUid.get(file.senderUid || "")?.avatarUrl ||
      file.senderPhoto ||
      null
    );
  };

  const downloadFileUrl = (url: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "attachment";
    link.rel = "noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileAction = async (
    file: EmployeeFileRecord,
    action: "open" | "download"
  ) => {
    const targetUrl = action === "open" ? file.viewUrl || file.downloadUrl : file.downloadUrl || file.viewUrl;
    if (!targetUrl) {
      toast.error("تعذر العثور على رابط الملف.");
      return;
    }

    if (action === "open") {
      const opened = openFileUrl(targetUrl);
      if (!opened) return;
    }

    setOpeningFileId(file.id);
    try {
      await markFileAsReadIfNeeded(file);
    } catch (error) {
      console.error("employee_file_mark_read_failed", error);
      toast.error("تعذر تحديث حالة القراءة، وسيتم متابعة فتح الملف.");
    } finally {
      setOpeningFileId(current => (current === file.id ? null : current));
    }

    if (action === "open") return;
    downloadFileUrl(targetUrl, file.fileName);
  };

  const handleSendFile = async () => {
    if (!user?.uid) return;
    if (!selectedRecipient) {
      toast.error("اختر موظفًا مستلمًا أولًا.");
      return;
    }
    if (selectedRecipient.uid === user.uid) {
      toast.error("لا يمكن إرسال ملف إلى نفسك.");
      return;
    }
    if (!user.email) {
      toast.error("البريد الإلكتروني لحسابك غير متوفر.");
      return;
    }
    if (!sendForm.title.trim()) {
      toast.error("أدخل عنوان الملف.");
      return;
    }
    if (!sendForm.file) {
      toast.error("اختر ملفًا للرفع.");
      return;
    }

    setSendingFile(true);
    try {
      const fileRef = doc(collection(db, EMPLOYEE_FILES_COLLECTION));
      const uploaded = await uploadDocumentToCloudflare({
        entityType: "employee_file_transfer",
        entityId: fileRef.id,
        category: EMPLOYEE_FILE_CATEGORY,
        file: sendForm.file,
        kind: "attachment",
        uploadedBy: user.uid,
        storageFolder: "internal_files",
      });

      const fileDoc: EmployeeFileDoc = {
        employeeId: selectedRecipient.uid,
        employeeUid: selectedRecipient.uid,
        userId: selectedRecipient.uid,
        employeeName: selectedRecipient.name,
        senderUid: user.uid,
        senderName: currentUserDisplayName,
        senderEmail: user.email,
        senderPhoto: currentUserAvatarUrl,
        receiverUid: selectedRecipient.uid,
        receiverName: selectedRecipient.name,
        receiverEmail: selectedRecipient.email || null,
        receiverPhoto: selectedRecipient.avatarUrl || null,
        participantUids: buildEmployeeFileParticipants(user.uid, selectedRecipient.uid),
        title: sendForm.title.trim(),
        description: sendForm.description.trim() || null,
        fileType: sendForm.fileType,
        fileId: uploaded.id,
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        fileUrl: uploaded.fileUrl,
        storageKey: uploaded.filePath,
        contentType: uploaded.contentType || null,
        mimeType: uploaded.contentType || null,
        fileSize: uploaded.fileSize,
        category: uploaded.category || EMPLOYEE_FILE_CATEGORY,
        uploadedBy: user.uid,
        uploadedByName: currentUserDisplayName,
        createdAt: serverTimestamp(),
        uploadedAt: uploaded.uploadedAt,
        status: "active",
        active: true,
        replacedAt: null,
        replacedBy: null,
        replacedByName: null,
        replacedByFileId: null,
        replacesFileId: null,
        isRead: false,
        readAt: null,
        updatedAt: serverTimestamp(),
      };

      await setDoc(fileRef, fileDoc);

      await createInAppNotification({
        userId: selectedRecipient.uid,
        title: `ملف داخلي جديد من ${currentUserDisplayName}`,
        body: sendForm.title.trim(),
        type: "file",
        relatedId: fileRef.id,
        relatedTo: "employee_file",
        relatedPath: "/hr/files?tab=incoming",
      }).catch(error => {
        console.error("employee_file_notification_failed", error);
      });

      resetSendForm();
      setSendDialogOpen(false);
      setActiveTab("sent");
      toast.success("تم إرسال الملف بنجاح.");
    } catch (error) {
      console.error("employee_internal_file_send_failed", error);
      toast.error("تعذر إرسال الملف الآن.");
    } finally {
      setSendingFile(false);
    }
  };

  if (!user) return null;

  return (
    <EmployeeLayout
      title="ملفاتي"
      description="هنا تظهر الملفات الرسمية القديمة والملفات الداخلية بين الموظفين. يمكنك استقبال الملفات وإرسالها، ويفترض النظام حالة الفتح والقراءة تلقائيًا."
    >
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <MessagesStat label="إجمالي الملفات الواردة" value={String(incomingFiles.length)} />
          <MessagesStat
            label="ملفات جديدة غير مقروءة"
            value={String(incomingUnreadCount)}
            tone="warning"
          />
          <MessagesStat
            label="ملفات مقروءة"
            value={String(incomingReadCount)}
            tone="success"
          />
          <MessagesStat label="الملفات المرسلة" value={String(sentFiles.length)} />
        </div>

        <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_28px_80px_-52px_rgba(15,23,42,0.28)]">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                  <FileText className="h-4 w-4" />
                  الملفات الداخلية
                </div>
                <div>
                  <CardTitle className="text-xl font-semibold text-slate-950">
                    الملفات الواردة والمرسلة
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm leading-7 text-slate-600">
                    احتفظنا بعرض الملفات الرسمية كما هو، وأضاف النظام الآن طبقة إرسال داخلي بين الموظفين بنفس أسلوب الرسائل.
                  </CardDescription>
                </div>
              </div>

              <Button
                type="button"
                className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
                onClick={() => setSendDialogOpen(true)}
              >
                <Send className="ml-2 h-4 w-4" />
                إرسال ملف
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {incomingArchivedCount > 0 ? (
              <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-5 py-4 text-sm text-slate-600">
                يتم عرض النسخة الحالية فقط لكل ملف. تم إخفاء {incomingArchivedCount} من النسخ المستبدلة من قائمة الوارد.
              </div>
            ) : null}

            <Tabs
              value={activeTab}
              onValueChange={value => setActiveTab(value as FilesTabKey)}
              dir="rtl"
              className="space-y-6"
            >
              <TabsList className="grid h-auto w-full grid-cols-1 gap-3 rounded-none bg-transparent p-0 md:grid-cols-2">
                <TabsTrigger
                  value="incoming"
                  className="group h-auto justify-start rounded-[24px] border border-slate-200/80 bg-slate-50/70 px-4 py-4 text-start shadow-none transition-all data-[state=active]:border-[#F2B705]/70 data-[state=active]:bg-white data-[state=active]:shadow-[0_18px_45px_-34px_rgba(15,23,42,0.34)]"
                >
                  <span className="flex w-full items-center justify-between gap-4">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition group-data-[state=active]:bg-[#030640] group-data-[state=active]:text-[#F2B705] group-data-[state=active]:ring-[#030640]">
                        <Inbox className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 text-start">
                        <span className="block text-sm font-semibold text-slate-950">
                          الملفات الواردة
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          ملفات وصلت لك وتحتاج مراجعة
                        </span>
                      </span>
                    </span>
                    {incomingUnreadCount > 0 ? (
                      <Badge className="shrink-0 rounded-full bg-[#F2B705] px-2.5 text-slate-950 hover:bg-[#F2B705]">
                        {incomingUnreadCount}
                      </Badge>
                    ) : null}
                  </span>
                </TabsTrigger>

                <TabsTrigger
                  value="sent"
                  className="group h-auto justify-start rounded-[24px] border border-slate-200/80 bg-slate-50/70 px-4 py-4 text-start shadow-none transition-all data-[state=active]:border-sky-200 data-[state=active]:bg-white data-[state=active]:shadow-[0_18px_45px_-34px_rgba(15,23,42,0.34)]"
                >
                  <span className="flex w-full items-center justify-between gap-4">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition group-data-[state=active]:bg-sky-700 group-data-[state=active]:text-white group-data-[state=active]:ring-sky-700">
                        <Send className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 text-start">
                        <span className="block text-sm font-semibold text-slate-950">
                          الملفات المرسلة
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          ملفات أرسلتها للزملاء
                        </span>
                      </span>
                    </span>
                  </span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="incoming" className="mt-0 space-y-4">
                {loading ? (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                    جارٍ تحميل الملفات...
                  </div>
                ) : incomingFiles.length ? (
                  incomingFiles.map(file => (
                    <EmployeeFileCard
                      key={file.id}
                      file={file}
                      opening={openingFileId === file.id}
                      counterpartAvatarUrl={getCounterpartAvatarUrl(file)}
                      onOpen={async currentFile => handleFileAction(currentFile, "open")}
                      onDownload={async currentFile => handleFileAction(currentFile, "download")}
                    />
                  ))
                ) : (
                  <Empty className="min-h-[320px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                    <EmptyHeader>
                      <EmptyMedia
                        variant="icon"
                        className="bg-[#F2B705]/12 text-[#030640]"
                      >
                        <Inbox className="size-5" />
                      </EmptyMedia>
                      <EmptyTitle>لا توجد ملفات واردة حاليًا</EmptyTitle>
                      <EmptyDescription>
                        عندما يرسل HR أو أحد الموظفين ملفًا إليك سيظهر هنا مع حالة الفتح والقراءة.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </TabsContent>

              <TabsContent value="sent" className="mt-0 space-y-4">
                {loading ? (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                    جارٍ تحميل الملفات المرسلة...
                  </div>
                ) : sentFiles.length ? (
                  sentFiles.map(file => (
                    <EmployeeFileCard
                      key={file.id}
                      file={file}
                      opening={openingFileId === file.id}
                      counterpartAvatarUrl={getCounterpartAvatarUrl(file)}
                      onOpen={async currentFile => handleFileAction(currentFile, "open")}
                      onDownload={async currentFile => handleFileAction(currentFile, "download")}
                    />
                  ))
                ) : (
                  <Empty className="min-h-[320px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                    <EmptyHeader>
                      <EmptyMedia variant="icon" className="bg-sky-100 text-sky-700">
                        <Send className="size-5" />
                      </EmptyMedia>
                      <EmptyTitle>لا توجد ملفات مرسلة بعد</EmptyTitle>
                      <EmptyDescription>
                        ابدأ بإرسال ملف إلى أحد زملائك وسيظهر هنا مع حالة فتح المستلم للملف.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5 text-sm leading-7 text-slate-600 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            {incomingUnreadCount > 0 ? (
              <Clock3 className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            حالة القراءة
          </div>
          <p className="mt-3">
            الملفات الواردة التي لم تفتحها بعد تظهر بحالة "جديد"، وعند فتحها أو تحميلها يتم تحديث `readAt`. أما في الملفات المرسلة فسترى هل فتح المستلم الملف أم لا.
          </p>
        </div>
      </section>

      <Dialog open={sendDialogOpen} onOpenChange={open => {
        setSendDialogOpen(open);
        if (!open && !sendingFile) {
          resetSendForm();
        }
      }}>
        <DialogContent
          className="w-[min(96vw,48rem)] max-w-3xl overflow-hidden"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle>إرسال ملف</DialogTitle>
            <DialogDescription>
              اختر الموظف المستلم، ثم أرفق الملف المراد إرساله داخل البوابة.
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-5 overflow-hidden">
            <RecipientPicker
              options={coworkers}
              selectedRecipient={selectedRecipient}
              loading={coworkersLoading}
              disabled={sendingFile}
              open={sendDialogOpen}
              onOpenChange={() => undefined}
              onSelect={uid =>
                setSendForm(current => ({
                  ...current,
                  recipientUid: uid,
                }))
              }
            />

            <div className="grid items-start gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">عنوان الملف</div>
                <Input
                  value={sendForm.title}
                  onChange={event =>
                    setSendForm(current => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="مثال: عرض سعر محدث"
                  disabled={sendingFile}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">نوع الملف</div>
                <Select
                  value={sendForm.fileType}
                  onValueChange={value =>
                    setSendForm(current => ({
                      ...current,
                      fileType: value,
                    }))
                  }
                  disabled={sendingFile}
                >
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue placeholder="اختر نوع الملف" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_FILE_TYPE_OPTIONS.filter(
                      option => !["cv", "education_certificate"].includes(option.value)
                    ).map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-900">وصف الملف (اختياري)</div>
              <Textarea
                value={sendForm.description}
                onChange={event =>
                  setSendForm(current => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="أضف وصفًا مختصرًا يساعد المستلم على فهم الملف"
                className="min-h-28"
                disabled={sendingFile}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-900">ملف الإرسال</div>
              <Input
                id="employee-send-file-input"
                ref={sendFileInputRef}
                type="file"
                className="sr-only"
                onChange={event =>
                  setSendForm(current => ({
                    ...current,
                    file: event.target.files?.[0] ?? null,
                  }))
                }
                disabled={sendingFile}
              />
              <div
                role="button"
                tabIndex={sendingFile ? -1 : 0}
                onClick={() => sendFileInputRef.current?.click()}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    sendFileInputRef.current?.click();
                  }
                }}
                onDragOver={event => event.preventDefault()}
                onDrop={handleSendFileDrop}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600 transition hover:border-[#F2B705] hover:bg-[#F2B705]/5",
                  sendingFile && "pointer-events-none cursor-not-allowed opacity-60"
                )}
              >
                <Upload className="h-6 w-6 text-slate-500" />
                {sendForm.file ? (
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900">{sendForm.file.name}</div>
                    <div>الحجم: {formatFileSizeEN(sendForm.file.size)}</div>
                    <div>النوع: {sendForm.file.type || "غير محدد"}</div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900">
                      اسحب الملف هنا أو انقر للاختيار
                    </div>
                    <div>سيتم إرفاق الملف وإرساله إلى الموظف المحدد.</div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
                onClick={() => void handleSendFile()}
                disabled={sendingFile}
              >
                {sendingFile ? (
                  <>
                    <Upload className="ml-2 h-4 w-4" />
                    جارٍ إرسال الملف...
                  </>
                ) : (
                  <>
                    <Send className="ml-2 h-4 w-4" />
                    إرسال
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </EmployeeLayout>
  );
}
