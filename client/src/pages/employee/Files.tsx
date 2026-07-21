import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
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
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  fetchActiveEmployeeCoworkers,
  type EmployeeCoworkerOption,
} from "@/lib/employeeCoworkers";
import { resolveEmployeeAvatarUrl } from "@/lib/defaultEmployeeAvatars";
import { uploadDocumentToCloudflare } from "@/lib/documentUploadService";
import {
  buildEmployeeFileParticipants,
  EMPLOYEE_FILE_CATEGORY,
  EMPLOYEE_FILE_TYPE_OPTIONS,
  filterIncomingEmployeeFiles,
  filterSentEmployeeFiles,
  normalizeEmployeeFileRecord,
  sortEmployeeFiles,
  type EmployeeFileRecord,
} from "@/lib/employeeFiles";
import { formatDateTimeEN, formatFileSizeEN } from "@/lib/formatters";
import {
  createHrCoreEmployeeFile,
  listHrCoreEmployeeFiles,
  markHrCoreEmployeeFileRead,
} from "@/lib/hrCoreApi";
import { createInAppNotification } from "@/lib/inAppNotifications";
import { languageDir, tr } from "@/lib/i18n";
import {
  initialsFromName,
  MessagesStat,
  RecipientPicker,
} from "@/pages/employee/messages/ConversationUi";
import { cn } from "@/lib/utils";
import { type EmployeeFileDoc } from "@shared/employee";
import type { Language } from "@/contexts/LanguageContext";

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

function formatFileDateTime(value: Date | null, language: Language) {
  if (!value) return "";
  if (language === "ar") return formatDateTimeEN(value);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function getFileTypeLabel(file: EmployeeFileRecord, language: Language) {
  if (language === "ar") return file.fileTypeLabel;
  const normalized = String(file.fileType || "general").toLowerCase();
  const labels: Record<string, string> = {
    general: "General",
    contract: "Contract",
    warning: "Warning",
    letter: "Letter",
    cv: "CV",
    education_certificate: "Certificates",
    approval: "Approval",
  };
  return labels[normalized] || normalized || "General";
}

function getFileStatusLabel(file: EmployeeFileRecord, language: Language) {
  if (language === "ar") return file.statusLabel;
  return file.active ? "Current Version" : "Replaced";
}

function getReadStatusLabel(file: EmployeeFileRecord, language: Language) {
  if (language === "ar") {
    return file.direction === "outgoing"
      ? file.isRead
        ? "تم فتحه"
        : "لم يتم فتحه بعد"
      : file.readStatusLabel;
  }
  if (file.direction === "outgoing") {
    return file.isRead ? "Opened" : "Not Opened Yet";
  }
  return file.isRead ? "Read" : "New";
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
  language,
  opening,
  counterpartAvatarUrl,
  onOpen,
  onDownload,
}: {
  file: EmployeeFileRecord;
  language: Language;
  opening: boolean;
  counterpartAvatarUrl: string | null;
  onOpen: (file: EmployeeFileRecord) => Promise<void>;
  onDownload: (file: EmployeeFileRecord) => Promise<void>;
}) {
  const actionDate = getActionStatus(file);
  const counterpartLabel =
    file.direction === "outgoing"
      ? tr(language, "المستلم", "Recipient")
      : tr(language, "المرسل", "Sender");
  const counterpartName =
    file.direction === "outgoing"
      ? file.receiverName || file.receiverEmail || tr(language, "موظف", "Employee")
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
                  {getFileStatusLabel(file, language)}
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
                  {getReadStatusLabel(file, language)}
                </Badge>
                {!file.isInternalTransfer ? (
                  <Badge
                    variant="outline"
                    className="rounded-full bg-slate-50 shadow-none"
                  >
                    {getFileTypeLabel(file, language)}
                  </Badge>
                ) : null}
                {file.isInternalTransfer ? (
                  <Badge
                    variant="outline"
                    className="rounded-full border-sky-200 bg-sky-50 text-sky-700 shadow-none"
                  >
                    {tr(language, "ملف داخلي", "Internal File")}
                  </Badge>
                ) : null}
              </div>

              <div>
                <div className="text-lg font-semibold text-slate-950">{file.title}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {actionDate
                    ? `${tr(language, "تاريخ الإرسال:", "Sent:")} ${formatFileDateTime(actionDate, language)}`
                    : tr(language, "تاريخ الإرسال غير متوفر", "Sent date unavailable")}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-4 text-sm text-slate-700">
                  <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
                    {counterpartLabel}
                  </div>
                  <div className="mt-2 font-semibold text-slate-950">{counterpartName}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {counterpartEmail || tr(language, "البريد غير متوفر", "Email unavailable")}
                  </div>
                </div>

                <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-4 text-sm leading-7 text-slate-700">
                  {file.description || tr(language, "لا يوجد وصف لهذا الملف.", "No description for this file.")}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <FileMetaPill value={file.fileName} />
                <FileMetaPill value={formatFileSizeEN(file.fileSize ?? null)} />
                <FileMetaPill
                  value={file.mimeType || file.contentType || tr(language, "بدون نوع", "No type")}
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
                    ? `${tr(language, "تم فتح الملف في", "Opened on")} ${formatFileDateTime(file.readAtDate, language)}`
                    : tr(language, "لم يقم المستلم بفتح الملف بعد.", "The recipient has not opened the file yet.")}
                </div>
              ) : file.isRead && file.readAtDate ? (
                <div className="text-xs text-emerald-700">
                  {tr(language, "تمت القراءة في", "Read on")} {formatFileDateTime(file.readAtDate, language)}
                </div>
              ) : (
                <div className="text-xs text-amber-700">
                  {tr(language, "لم يتم فتح الملف بعد.", "File has not been opened yet.")}
                </div>
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
                {tr(language, "فتح الملف", "Open File")}
              </Button>

              {file.downloadUrl ? (
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={() => void onDownload(file)}
                >
                  <Download className="ml-2 h-4 w-4" />
                  {tr(language, "تحميل", "Download")}
                </Button>
              ) : null}
            </div>
          </div>

          {opening ? (
            <div className="px-2 pt-3 text-xs text-slate-500">
              {tr(language, "جارٍ تنفيذ الطلب...", "Processing request...")}
            </div>
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
  const { language } = useLanguage();
  const dir = languageDir(language);
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

    let cancelled = false;
    setLegacyLoading(true);
    setParticipantLoading(true);

    void listHrCoreEmployeeFiles({ participantUid: user.uid, limit: 200 })
      .then(response => {
        if (cancelled) return;
        const rows = response.employeeFiles.map(file =>
          normalizeEmployeeFileRecord(
            file.id,
            file as Record<string, unknown>,
            user.uid
          )
        );
        setLegacyFiles(rows);
        setParticipantFiles([]);
      })
      .catch(error => {
        console.error("employee_files_hr_core_load_failed", error);
        if (!cancelled) {
          setLegacyFiles([]);
          setParticipantFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLegacyLoading(false);
          setParticipantLoading(false);
        }
      });

    return () => {
      cancelled = true;
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
      displayName?: string | null;
      email?: string | null;
      gender?: string | null;
    } | null;
    return resolveEmployeeAvatarUrl(
      currentUser?.avatarUrl ||
        currentUser?.photoURL ||
        currentUser?.firebaseUser?.photoURL,
      {
        uid: user?.uid,
        name: currentUser?.displayName || currentUser?.email,
        email: currentUser?.email,
        gender: currentUser?.gender,
      }
    );
  }, [user]);
  const currentUserDisplayName = useMemo(
    () => user?.displayName || user?.email || tr(language, "أنت", "You"),
    [language, user?.displayName, user?.email]
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
      (!file.isInternalTransfer ||
        file.receiverUid === user.uid ||
        file.employeeUid === user.uid);

    if (!canMarkRead) return;

    const response = await markHrCoreEmployeeFileRead(file.id);
    const updated = normalizeEmployeeFileRecord(
      response.employeeFile.id,
      response.employeeFile as Record<string, unknown>,
      user.uid
    );
    setLegacyFiles(current =>
      current.map(item => (item.id === updated.id ? updated : item))
    );
    setParticipantFiles(current =>
      current.map(item => (item.id === updated.id ? updated : item))
    );
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
      const fileRecordId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const uploaded = await uploadDocumentToCloudflare({
        entityType: "employee_file_transfer",
        entityId: fileRecordId,
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
        createdAt: nowIso,
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
        updatedAt: nowIso,
      };

      const response = await createHrCoreEmployeeFile({
        id: fileRecordId,
        ...fileDoc,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      const created = normalizeEmployeeFileRecord(
        response.employeeFile.id,
        response.employeeFile as Record<string, unknown>,
        user.uid
      );
      setLegacyFiles(current => [
        created,
        ...current.filter(item => item.id !== created.id),
      ]);

      await createInAppNotification({
        userId: selectedRecipient.uid,
        title: `ملف داخلي جديد من ${currentUserDisplayName}`,
        body: sendForm.title.trim(),
        type: "file",
        relatedId: fileRecordId,
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
      title={tr(language, "ملفاتي", "My Files")}
      description={tr(
        language,
        "هنا تظهر الملفات الرسمية القديمة والملفات الداخلية بين الموظفين. يمكنك استقبال الملفات وإرسالها، ويفترض النظام حالة الفتح والقراءة تلقائيًا.",
        "Official files and internal employee transfers appear here. You can receive and send files, with read and open status tracked automatically."
      )}
    >
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <MessagesStat
            label={tr(language, "إجمالي الملفات الواردة", "Total Incoming Files")}
            value={String(incomingFiles.length)}
          />
          <MessagesStat
            label={tr(language, "ملفات جديدة غير مقروءة", "New Unread Files")}
            value={String(incomingUnreadCount)}
            tone="warning"
          />
          <MessagesStat
            label={tr(language, "ملفات مقروءة", "Read Files")}
            value={String(incomingReadCount)}
            tone="success"
          />
          <MessagesStat
            label={tr(language, "الملفات المرسلة", "Sent Files")}
            value={String(sentFiles.length)}
          />
        </div>

        <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_28px_80px_-52px_rgba(15,23,42,0.28)]">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                  <FileText className="h-4 w-4" />
                  {tr(language, "الملفات الداخلية", "Internal Files")}
                </div>
                <div>
                  <CardTitle className="text-xl font-semibold text-slate-950">
                    {tr(language, "الملفات الواردة والمرسلة", "Incoming and Sent Files")}
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm leading-7 text-slate-600">
                    {tr(
                      language,
                      "احتفظنا بعرض الملفات الرسمية كما هو، وأضاف النظام الآن طبقة إرسال داخلي بين الموظفين بنفس أسلوب الرسائل.",
                      "Official files stay visible here, with an internal file-sending layer between employees."
                    )}
                  </CardDescription>
                </div>
              </div>

              <Button
                type="button"
                className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
                onClick={() => setSendDialogOpen(true)}
              >
                <Send className="ml-2 h-4 w-4" />
                {tr(language, "إرسال ملف", "Send File")}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {incomingArchivedCount > 0 ? (
              <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-5 py-4 text-sm text-slate-600">
                {tr(language, "يتم عرض النسخة الحالية فقط لكل ملف. تم إخفاء", "Only current versions are shown.")}
                {" "}
                {incomingArchivedCount}
                {" "}
                {tr(language, "من النسخ المستبدلة من قائمة الوارد.", "replaced versions are hidden from incoming files.")}
              </div>
            ) : null}

            <Tabs
              value={activeTab}
              onValueChange={value => setActiveTab(value as FilesTabKey)}
              dir={dir}
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
                          {tr(language, "الملفات الواردة", "Incoming Files")}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          {tr(language, "ملفات وصلت لك وتحتاج مراجعة", "Files received for your review")}
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
                          {tr(language, "الملفات المرسلة", "Sent Files")}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          {tr(language, "ملفات أرسلتها للزملاء", "Files you sent to coworkers")}
                        </span>
                      </span>
                    </span>
                  </span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="incoming" className="mt-0 space-y-4">
                {loading ? (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                    {tr(language, "جارٍ تحميل الملفات...", "Loading files...")}
                  </div>
                ) : incomingFiles.length ? (
                  incomingFiles.map(file => (
                    <EmployeeFileCard
                      key={file.id}
                      file={file}
                      language={language}
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
                      <EmptyTitle>{tr(language, "لا توجد ملفات واردة حاليًا", "No incoming files")}</EmptyTitle>
                      <EmptyDescription>
                        {tr(
                          language,
                          "عندما يرسل HR أو أحد الموظفين ملفًا إليك سيظهر هنا مع حالة الفتح والقراءة.",
                          "When HR or another employee sends you a file, it will appear here with open and read status."
                        )}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </TabsContent>

              <TabsContent value="sent" className="mt-0 space-y-4">
                {loading ? (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                    {tr(language, "جارٍ تحميل الملفات المرسلة...", "Loading sent files...")}
                  </div>
                ) : sentFiles.length ? (
                  sentFiles.map(file => (
                    <EmployeeFileCard
                      key={file.id}
                      file={file}
                      language={language}
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
                      <EmptyTitle>{tr(language, "لا توجد ملفات مرسلة بعد", "No sent files yet")}</EmptyTitle>
                      <EmptyDescription>
                        {tr(
                          language,
                          "ابدأ بإرسال ملف إلى أحد زملائك وسيظهر هنا مع حالة فتح المستلم للملف.",
                          "Send a file to a coworker and it will appear here with the recipient open status."
                        )}
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
            {tr(language, "حالة القراءة", "Read Status")}
          </div>
          <p className="mt-3">
            {tr(
              language,
              'الملفات الواردة التي لم تفتحها بعد تظهر بحالة "جديد"، وعند فتحها أو تحميلها يتم تحديث حالة القراءة. أما في الملفات المرسلة فسترى هل فتح المستلم الملف أم لا.',
              'Incoming files you have not opened appear as "New". Opening or downloading a file updates its read status. Sent files show whether the recipient opened the file.'
            )}
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
          dir={dir}
        >
          <DialogHeader>
            <DialogTitle>{tr(language, "إرسال ملف", "Send File")}</DialogTitle>
            <DialogDescription>
              {tr(
                language,
                "اختر الموظف المستلم، ثم أرفق الملف المراد إرساله داخل البوابة.",
                "Choose the recipient, then attach the file you want to send inside the portal."
              )}
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
                <div className="text-sm font-semibold text-slate-900">
                  {tr(language, "عنوان الملف", "File Title")}
                </div>
                <Input
                  value={sendForm.title}
                  onChange={event =>
                    setSendForm(current => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder={tr(language, "مثال: عرض سعر محدث", "Example: Updated quotation")}
                  disabled={sendingFile}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">
                  {tr(language, "نوع الملف", "File Type")}
                </div>
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
                    <SelectValue placeholder={tr(language, "اختر نوع الملف", "Choose file type")} />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_FILE_TYPE_OPTIONS.filter(
                      option => !["cv", "education_certificate"].includes(option.value)
                    ).map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {language === "ar"
                          ? option.label
                          : getFileTypeLabel({ fileType: option.value, fileTypeLabel: option.label } as EmployeeFileRecord, language)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-900">
                {tr(language, "وصف الملف (اختياري)", "File Description (Optional)")}
              </div>
              <Textarea
                value={sendForm.description}
                onChange={event =>
                  setSendForm(current => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder={tr(
                  language,
                  "أضف وصفًا مختصرًا يساعد المستلم على فهم الملف",
                  "Add a short description to help the recipient understand the file"
                )}
                className="min-h-28"
                disabled={sendingFile}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-900">
                {tr(language, "ملف الإرسال", "File Attachment")}
              </div>
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
                    <div>{tr(language, "الحجم:", "Size:")} {formatFileSizeEN(sendForm.file.size)}</div>
                    <div>{tr(language, "النوع:", "Type:")} {sendForm.file.type || tr(language, "غير محدد", "Not specified")}</div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900">
                      {tr(language, "اسحب الملف هنا أو انقر للاختيار", "Drop the file here or click to choose")}
                    </div>
                    <div>
                      {tr(
                        language,
                        "سيتم إرفاق الملف وإرساله إلى الموظف المحدد.",
                        "The file will be attached and sent to the selected employee."
                      )}
                    </div>
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
                    {tr(language, "جارٍ إرسال الملف...", "Sending file...")}
                  </>
                ) : (
                  <>
                    <Send className="ml-2 h-4 w-4" />
                    {tr(language, "إرسال", "Send")}
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
