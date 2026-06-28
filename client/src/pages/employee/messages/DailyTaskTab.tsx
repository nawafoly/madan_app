import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  Camera,
  CheckCircle2,
  Clock3,
  Eye,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Save,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { db } from "@/_core/firebase";
import { hasPermission, type AppUser } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createInAppNotification } from "@/lib/inAppNotifications";
import { uploadDocumentToCloudflare } from "@/lib/documentUploadService";
import {
  WEEKLY_REPORT_MANAGER_NOTES_PERMISSION,
} from "@/lib/weeklyReportConfig";
import { WEEKLY_REPORT_RECEIVER } from "@/pages/employee/messages/WeeklyReportTab";

const DAILY_TASKS_COLLECTION = "daily_tasks";

type DailyTaskStatus = "draft" | "sent";

type DailyTaskAttachment = {
  fileId: string;
  fileName: string;
  filePath: string;
  fileUrl: string;
  contentType: string | null;
  fileSize: number | null;
};

type DailyTaskRecord = {
  id: string;
  createdByUid: string;
  createdByEmail: string;
  createdByName: string;
  jobTitle: string;
  taskDate: string;
  message: string;
  managerNotes: string;
  receiverUid: string;
  receiverEmail: string;
  receiverName: string;
  status: DailyTaskStatus;
  attachment: DailyTaskAttachment | null;
  createdAt: unknown;
  updatedAt: unknown;
  sentAt: unknown;
};

type DailyTaskFormState = {
  id: string | null;
  createdByName: string;
  jobTitle: string;
  taskDate: string;
  message: string;
  managerNotes: string;
  status: DailyTaskStatus;
  attachment: DailyTaskAttachment | null;
  pendingFile: File | null;
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function timestampMillis(value: unknown) {
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = Date.parse(cleanText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatFileSize(value: number | null | undefined) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function normalizeAttachment(value: unknown): DailyTaskAttachment | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const fileUrl = cleanText(raw.fileUrl);
  if (!fileUrl) return null;
  return {
    fileId: cleanText(raw.fileId),
    fileName: cleanText(raw.fileName) || "daily-task-photo",
    filePath: cleanText(raw.filePath),
    fileUrl,
    contentType: cleanText(raw.contentType) || null,
    fileSize: Number.isFinite(Number(raw.fileSize)) ? Number(raw.fileSize) : null,
  };
}

function normalizeTask(id: string, data: Record<string, unknown>): DailyTaskRecord {
  return {
    id,
    createdByUid: cleanText(data.createdByUid),
    createdByEmail: cleanText(data.createdByEmail),
    createdByName: cleanText(data.createdByName),
    jobTitle: cleanText(data.jobTitle),
    taskDate: cleanText(data.taskDate),
    message: cleanText(data.message),
    managerNotes: cleanText(data.managerNotes),
    receiverUid: cleanText(data.receiverUid),
    receiverEmail: cleanText(data.receiverEmail),
    receiverName: cleanText(data.receiverName),
    status: cleanText(data.status) === "sent" ? "sent" : "draft",
    attachment: normalizeAttachment(data.attachment),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    sentAt: data.sentAt ?? null,
  };
}

function buildInitialForm(user: AppUser, profile?: { name?: string; title?: string }) {
  return {
    id: null,
    createdByName: cleanText(profile?.name) || cleanText(user.displayName) || cleanText(user.email),
    jobTitle: cleanText(profile?.title) || cleanText(user.title),
    taskDate: todayInputValue(),
    message: "",
    managerNotes: "",
    status: "draft" as DailyTaskStatus,
    attachment: null,
    pendingFile: null,
  };
}

function toForm(task: DailyTaskRecord): DailyTaskFormState {
  return {
    id: task.id,
    createdByName: task.createdByName,
    jobTitle: task.jobTitle,
    taskDate: task.taskDate,
    message: task.message,
    managerNotes: task.managerNotes,
    status: task.status,
    attachment: task.attachment,
    pendingFile: null,
  };
}

export function DailyTaskTab({
  user,
  mode = "employee",
}: {
  user: AppUser;
  mode?: "employee" | "admin";
}) {
  const [profileDefaults, setProfileDefaults] = useState({ name: "", title: "" });
  const [ownTasks, setOwnTasks] = useState<DailyTaskRecord[]>([]);
  const [receivedTasks, setReceivedTasks] = useState<DailyTaskRecord[]>([]);
  const [loadingOwn, setLoadingOwn] = useState(true);
  const [loadingReceived, setLoadingReceived] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingManagerNotes, setSavingManagerNotes] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [form, setForm] = useState<DailyTaskFormState>(() => buildInitialForm(user));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const isAdminMode = mode === "admin";
  const canWriteManagerNotes =
    isAdminMode && hasPermission(user, WEEKLY_REPORT_MANAGER_NOTES_PERMISSION);
  const canReviewDailyTasks = isAdminMode && (user.uid === WEEKLY_REPORT_RECEIVER.uid || canWriteManagerNotes);
  const selectedTask = useMemo(
    () => [...ownTasks, ...receivedTasks].find(task => task.id === form.id) || null,
    [form.id, ownTasks, receivedTasks]
  );
  const isReadOnly = selectedTask
    ? selectedTask.createdByUid !== user.uid || selectedTask.status === "sent"
    : false;
  const canEditManagerNotes =
    Boolean(selectedTask?.id) && selectedTask?.status === "sent" && canWriteManagerNotes;
  const sentReceivedTasks = useMemo(
    () =>
      receivedTasks
        .filter(task => task.status === "sent")
        .slice()
        .sort((left, right) => timestampMillis(right.sentAt) - timestampMillis(left.sentAt)),
    [receivedTasks]
  );
  const managerPendingTasks = useMemo(
    () => sentReceivedTasks.filter(task => !cleanText(task.managerNotes)),
    [sentReceivedTasks]
  );
  const managerReviewedTasks = useMemo(
    () => sentReceivedTasks.filter(task => cleanText(task.managerNotes)),
    [sentReceivedTasks]
  );
  const managerActiveTask = useMemo(
    () =>
      selectedTask && sentReceivedTasks.some(task => task.id === selectedTask.id)
        ? selectedTask
        : managerPendingTasks[0] || sentReceivedTasks[0] || null,
    [managerPendingTasks, selectedTask, sentReceivedTasks]
  );
  const visibleOwnTasks = useMemo(
    () =>
      ownTasks
        .slice()
        .sort((left, right) => timestampMillis(right.updatedAt) - timestampMillis(left.updatedAt)),
    [ownTasks]
  );

  useEffect(() => {
    if (!canWriteManagerNotes) return;

    const currentTaskStillVisible =
      Boolean(form.id) && sentReceivedTasks.some(task => task.id === form.id);
    if (currentTaskStillVisible) return;

    const nextTask = managerPendingTasks[0] || sentReceivedTasks[0] || null;
    if (nextTask) {
      setForm(toForm(nextTask));
    }
  }, [canWriteManagerNotes, form.id, managerPendingTasks, sentReceivedTasks]);

  const stopCameraStream = () => {
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!cameraOpen) {
      stopCameraStream();
      return;
    }

    let cancelled = false;
    setCameraStarting(true);
    setCameraError("");

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("الكاميرا غير مدعومة داخل هذا المتصفح. اختر صورة من الجهاز.");
        setCameraStarting(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (error) {
        console.error("daily_task_camera_start_failed", error);
        setCameraError("تعذر تشغيل الكاميرا. تأكد من السماح للتطبيق باستخدام الكاميرا.");
      } finally {
        if (!cancelled) setCameraStarting(false);
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [cameraOpen]);

  useEffect(() => {
    let cancelled = false;
    void getDoc(doc(db, "users", user.uid))
      .then(snapshot => {
        if (cancelled || !snapshot.exists()) return;
        const data = snapshot.data() as Record<string, any>;
        const employeeProfile = data.employeeProfile || {};
        const personal = employeeProfile.personal || data.personal || {};
        const employment = employeeProfile.employment || data.employment || {};
        const defaults = {
          name:
            cleanText(data.displayName) ||
            cleanText(data.name) ||
            cleanText(personal.name) ||
            cleanText(user.displayName),
          title:
            cleanText(employment.title) ||
            cleanText(data.title) ||
            cleanText(employment.jobTitle) ||
            cleanText(user.title),
        };
        setProfileDefaults(defaults);
        setForm(current =>
          current.id
            ? current
            : {
                ...current,
                createdByName: current.createdByName || defaults.name,
                jobTitle: current.jobTitle || defaults.title,
              }
        );
      })
      .catch(error => {
        console.error("daily_task_profile_defaults_failed", error);
      });

    return () => {
      cancelled = true;
    };
  }, [user.displayName, user.title, user.uid]);

  useEffect(() => {
    setLoadingOwn(true);
    const unsubscribe = onSnapshot(
      query(collection(db, DAILY_TASKS_COLLECTION), where("createdByUid", "==", user.uid)),
      snapshot => {
        setOwnTasks(snapshot.docs.map(docSnapshot => normalizeTask(docSnapshot.id, docSnapshot.data())));
        setLoadingOwn(false);
      },
      error => {
        console.error("daily_tasks_own_snapshot_failed", error);
        setOwnTasks([]);
        setLoadingOwn(false);
      }
    );
    return unsubscribe;
  }, [user.uid]);

  useEffect(() => {
    if (!canReviewDailyTasks) {
      setReceivedTasks([]);
      setLoadingReceived(false);
      return;
    }

    setLoadingReceived(true);
    const unsubscribe = onSnapshot(
      query(collection(db, DAILY_TASKS_COLLECTION), where("status", "==", "sent")),
      snapshot => {
        setReceivedTasks(snapshot.docs.map(docSnapshot => normalizeTask(docSnapshot.id, docSnapshot.data())));
        setLoadingReceived(false);
      },
      error => {
        console.error("daily_tasks_received_snapshot_failed", error);
        setReceivedTasks([]);
        setLoadingReceived(false);
      }
    );
    return unsubscribe;
  }, [canReviewDailyTasks]);

  const resetForm = () => {
    setForm(buildInitialForm(user, profileDefaults));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelected = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختر صورة فقط.");
      return;
    }
    setForm(current => ({ ...current, pendingFile: file }));
  };

  const openCameraCapture = () => {
    setCameraOpen(true);
  };

  const closeCameraCapture = () => {
    setCameraOpen(false);
    stopCameraStream();
  };

  const captureCameraPhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error("الكاميرا غير جاهزة، حاول مرة أخرى.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      toast.error("تعذر تجهيز الصورة.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      blob => {
        if (!blob) {
          toast.error("تعذر التقاط الصورة.");
          return;
        }

        const file = new File([blob], `daily-task-photo-${Date.now()}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        setForm(current => ({ ...current, pendingFile: file }));
        closeCameraCapture();
        toast.success("تم إرفاق الصورة.");
      },
      "image/jpeg",
      0.9
    );
  };

  const uploadAttachmentIfNeeded = async (taskId: string) => {
    if (!form.pendingFile) return form.attachment;
    const uploaded = await uploadDocumentToCloudflare({
      entityType: "daily_task",
      entityId: taskId,
      category: "daily_task_attachment",
      file: form.pendingFile,
      kind: "attachment",
      uploadedBy: user.uid,
      storageFolder: "daily_tasks",
    });

    return {
      fileId: uploaded.id,
      fileName: uploaded.fileName,
      filePath: uploaded.filePath,
      fileUrl: uploaded.fileUrl,
      contentType: uploaded.contentType || null,
      fileSize: uploaded.fileSize || null,
    };
  };

  const saveTask = async (status: DailyTaskStatus) => {
    if (isReadOnly) return;
    if (!cleanText(form.createdByName)) {
      toast.error("اسم الموظف مطلوب.");
      return;
    }
    if (!cleanText(form.message)) {
      toast.error("اكتب المهمة اليومية أو الرسالة قبل الإرسال.");
      return;
    }

    setSaving(true);
    try {
      const taskRef = form.id
        ? doc(db, DAILY_TASKS_COLLECTION, form.id)
        : doc(collection(db, DAILY_TASKS_COLLECTION));
      const attachment = await uploadAttachmentIfNeeded(taskRef.id);
      const payload = {
        createdByUid: user.uid,
        createdByEmail: cleanText(user.email),
        createdByName: cleanText(form.createdByName),
        jobTitle: cleanText(form.jobTitle),
        taskDate: cleanText(form.taskDate),
        message: cleanText(form.message),
        managerNotes: cleanText(form.managerNotes),
        receiverUid: WEEKLY_REPORT_RECEIVER.uid,
        receiverEmail: WEEKLY_REPORT_RECEIVER.email,
        receiverName: WEEKLY_REPORT_RECEIVER.displayName,
        status,
        attachment,
        updatedAt: serverTimestamp(),
        sentAt: status === "sent" ? serverTimestamp() : null,
        ...(form.id ? {} : { createdAt: serverTimestamp() }),
      };

      await setDoc(taskRef, payload, { merge: true });
      setForm(current => ({
        ...current,
        id: taskRef.id,
        status,
        attachment,
        pendingFile: null,
      }));
      if (fileInputRef.current) fileInputRef.current.value = "";

      if (status === "sent") {
        await createInAppNotification({
          userId: WEEKLY_REPORT_RECEIVER.uid,
          title: "مهمة يومية جديدة",
          body: `تم إرسال مهمة يومية من ${cleanText(form.createdByName) || cleanText(user.email)}.`,
          type: "message",
          relatedId: taskRef.id,
          relatedTo: "daily_task",
          relatedPath: "/hr/daily-tasks",
        }).catch(error => {
          console.error("daily_task_notification_failed", error);
        });
      }

      toast.success(status === "sent" ? "تم إرسال المهمة اليومية." : "تم حفظ المسودة.");
    } catch (error) {
      console.error("daily_task_save_failed", error);
      toast.error(status === "sent" ? "تعذر إرسال المهمة اليومية." : "تعذر حفظ المسودة.");
    } finally {
      setSaving(false);
    }
  };

  const saveManagerNotes = async () => {
    if (!selectedTask?.id || !canEditManagerNotes) return;
    setSavingManagerNotes(true);
    try {
      await setDoc(
        doc(db, DAILY_TASKS_COLLECTION, selectedTask.id),
        {
          managerNotes: cleanText(form.managerNotes),
          managerNotesUpdatedAt: serverTimestamp(),
          managerNotesUpdatedByUid: user.uid,
          managerNotesUpdatedByEmail: cleanText(user.email),
          managerNotesUpdatedByName: cleanText(user.displayName) || cleanText(user.email),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (selectedTask.createdByUid && selectedTask.createdByUid !== user.uid) {
        await createInAppNotification({
          userId: selectedTask.createdByUid,
          title: "ملاحظة جديدة على مهمتك اليومية",
          body: `تمت إضافة ملاحظة على مهمة ${cleanText(selectedTask.taskDate) || "اليوم"}.`,
          type: "message",
          relatedId: selectedTask.id,
          relatedTo: "daily_task",
          relatedPath: "/employee/daily-tasks",
        }).catch(error => {
          console.error("daily_task_manager_note_notification_failed", error);
        });
      }

      toast.success("تم حفظ ملاحظة المدير.");
    } catch (error) {
      console.error("daily_task_manager_notes_save_failed", error);
      toast.error("تعذر حفظ ملاحظة المدير.");
    } finally {
      setSavingManagerNotes(false);
    }
  };

  const renderTaskList = (
    title: string,
    tasks: DailyTaskRecord[],
    loading: boolean,
    emptyText: string
  ) => (
    <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <Badge variant="outline" className="rounded-full bg-slate-50 px-3 text-slate-600">
          {tasks.length}
        </Badge>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-slate-500">جاري التحميل...</p>
        ) : tasks.length ? (
          tasks.map(task => (
            <button
              key={task.id}
              type="button"
              className="block w-full rounded-[18px] border border-slate-200 bg-white p-3 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-[#F2B705]/50 hover:shadow-md"
              onClick={() => setForm(toForm(task))}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">
                    {task.createdByName || "موظف"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{task.taskDate || "بدون تاريخ"}</div>
                </div>
                <Badge
                  className={
                    task.status === "sent"
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                  }
                >
                  {task.status === "sent" ? "مرسلة" : "مسودة"}
                </Badge>
              </div>
              <p className="mt-3 line-clamp-2 text-xs leading-6 text-slate-500">
                {task.message || "بدون رسالة"}
              </p>
              {task.attachment ? (
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                  <ImageIcon className="h-3.5 w-3.5" />
                  صورة مرفقة
                </span>
              ) : null}
            </button>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-500">
            {emptyText}
          </p>
        )}
      </div>
    </div>
  );

  if (canReviewDailyTasks) {
    const activeTask = managerActiveTask;

    return (
      <div className="space-y-6" dir="rtl">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">إجمالي المهام المستلمة</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">
                  {sentReceivedTasks.length}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-[#F2B705]">
                <MessageSquare className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-amber-700">بانتظار ملاحظتك</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">
                  {managerPendingTasks.length}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
                <Clock3 className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-emerald-700">تمت مراجعتها</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">
                  {managerReviewedTasks.length}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/60 xl:col-start-2 xl:row-start-1">
            {activeTask ? (
              <>
                <div className="bg-slate-950 px-6 py-6 text-white">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Badge className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#F2B705]">
                        مهمة يومية مرسلة
                      </Badge>
                      <h2 className="mt-4 text-3xl font-semibold">
                        {activeTask.createdByName || "موظف"}
                      </h2>
                      <p className="mt-2 text-sm text-slate-300">
                        {activeTask.jobTitle || "بدون مسمى"} - {activeTask.taskDate || "بدون تاريخ"}
                      </p>
                    </div>
                    {activeTask.attachment ? (
                      <a
                        href={activeTask.attachment.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-slate-100"
                      >
                        <Eye className="h-4 w-4" />
                        عرض الصورة
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-5 bg-slate-50/40 p-5 md:p-6">
                  <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-3">
                    <div className="border-b border-slate-200 p-4 md:border-b-0 md:border-l">
                      <span className="mb-2 block text-sm font-semibold text-slate-500">الموظف</span>
                      <p className="font-semibold text-slate-950">{activeTask.createdByName || "-"}</p>
                    </div>
                    <div className="border-b border-slate-200 p-4 md:border-b-0 md:border-l">
                      <span className="mb-2 block text-sm font-semibold text-slate-500">المسمى الوظيفي</span>
                      <p className="font-semibold text-slate-950">{activeTask.jobTitle || "-"}</p>
                    </div>
                    <div className="p-4">
                      <span className="mb-2 block text-sm font-semibold text-slate-500">التاريخ</span>
                      <p className="font-semibold text-slate-950">{activeTask.taskDate || "-"}</p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
                      التحديث اليومي
                    </div>
                    <p className="min-h-[160px] whitespace-pre-wrap px-4 py-4 text-right text-sm leading-8 text-slate-700">
                      {activeTask.message || "لا توجد رسالة."}
                    </p>
                  </div>

                  {activeTask.attachment ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
                        الصورة المرفقة
                      </div>
                      <a href={activeTask.attachment.fileUrl} target="_blank" rel="noreferrer">
                        <img
                          src={activeTask.attachment.fileUrl}
                          alt={activeTask.attachment.fileName}
                          className="max-h-[420px] w-full object-contain bg-slate-950"
                        />
                      </a>
                    </div>
                  ) : null}

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-sm font-semibold text-slate-950">ملاحظة المدير</span>
                      <MessageSquare className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="p-4">
                      <Textarea
                        value={form.managerNotes}
                        onChange={event =>
                          setForm(current => ({ ...current, managerNotes: event.target.value }))
                        }
                        className="min-h-[150px] resize-y rounded-2xl border-slate-200 bg-slate-50/70 text-right leading-8"
                        placeholder="اكتب ملاحظة قصيرة على المهمة اليومية..."
                      />
                      <div className="mt-4 flex justify-end">
                        <Button
                          type="button"
                          className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800"
                          disabled={savingManagerNotes}
                          onClick={() => void saveManagerNotes()}
                        >
                          <Save className="h-4 w-4" />
                          {savingManagerNotes ? "جاري الحفظ..." : "حفظ ملاحظة المدير"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center bg-slate-50/70 p-6">
                <div className="max-w-md rounded-[28px] border border-dashed border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-[#F2B705]">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-950">لا توجد مهام يومية مرسلة حاليًا</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    عند إرسال الموظفين تحديثاتهم اليومية ستظهر هنا للاستلام والمراجعة.
                  </p>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4 xl:col-start-1 xl:row-start-1 xl:sticky xl:top-24 xl:self-start">
            {renderTaskList(
              "مهام تحتاج ملاحظة",
              managerPendingTasks,
              loadingReceived,
              "لا توجد مهام يومية بانتظار الملاحظة."
            )}
            {renderTaskList(
              "مهام تمت مراجعتها",
              managerReviewedTasks,
              loadingReceived,
              "لم تتم مراجعة أي مهمة يومية بعد."
            )}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]" dir="rtl">
      {cameraOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-[24px] border border-white/10 bg-slate-950 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <h3 className="text-base font-semibold">تصوير مباشر</h3>
                <p className="mt-1 text-xs text-slate-300">
                  التقط الصورة من داخل التطبيق بدون الخروج من الصفحة.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-white hover:bg-white/10 hover:text-white"
                onClick={closeCameraCapture}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="bg-black">
              <video
                ref={videoRef}
                className="aspect-[3/4] max-h-[70vh] w-full bg-black object-contain"
                playsInline
                muted
                autoPlay
              />
            </div>

            {cameraStarting || cameraError ? (
              <div className="px-4 pt-3 text-center text-sm text-slate-200">
                {cameraStarting ? "جاري تشغيل الكاميرا..." : cameraError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-white/20 bg-white/10 px-5 text-white hover:bg-white/20 hover:text-white"
                onClick={closeCameraCapture}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                className="rounded-full bg-[#F2B705] px-6 text-slate-950 hover:bg-[#e0ab00]"
                disabled={cameraStarting || Boolean(cameraError)}
                onClick={captureCameraPhoto}
              >
                <Camera className="h-4 w-4" />
                التقاط الصورة
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Button
          type="button"
          className="h-12 w-full rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/15 hover:bg-slate-800"
          onClick={resetForm}
        >
          <Plus className="h-4 w-4" />
          مهمة يومية جديدة
        </Button>

        {canReviewDailyTasks
          ? renderTaskList(
              "المهام اليومية المستلمة",
              sentReceivedTasks,
              loadingReceived,
              "لا توجد مهام يومية مرسلة حاليًا."
            )
          : null}

        {renderTaskList(
          "سجل مهامي اليومية",
          visibleOwnTasks,
          loadingOwn,
          "لم يتم حفظ أي مهمة يومية بعد."
        )}
      </aside>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
        <div className="border-b border-slate-200 bg-gradient-to-l from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-[#F2B705]">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold text-white">مهمة يومية</h2>
          <p className="mt-2 text-sm text-slate-300">
            رسالة بسيطة عن عمل اليوم، مع صورة عند الحاجة.
          </p>
        </div>

        <div className="space-y-5 bg-slate-50/40 p-5 md:p-6">
          <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-3">
            <label className="border-b border-slate-200 p-4 md:border-b-0 md:border-l">
              <span className="mb-2 block text-sm font-semibold text-slate-900">اسم الموظف</span>
              <Input
                value={form.createdByName}
                onChange={event => setForm(current => ({ ...current, createdByName: event.target.value }))}
                disabled={isReadOnly}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/80 text-right"
              />
            </label>
            <label className="border-b border-slate-200 p-4 md:border-b-0 md:border-l">
              <span className="mb-2 block text-sm font-semibold text-slate-900">المسمى الوظيفي</span>
              <Input
                value={form.jobTitle}
                onChange={event => setForm(current => ({ ...current, jobTitle: event.target.value }))}
                disabled={isReadOnly}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/80 text-right"
              />
            </label>
            <label className="p-4">
              <span className="mb-2 block text-sm font-semibold text-slate-900">تاريخ اليوم</span>
              <Input
                type="date"
                value={form.taskDate}
                onChange={event => setForm(current => ({ ...current, taskDate: event.target.value }))}
                disabled={isReadOnly}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/80 text-right"
              />
            </label>
          </div>

          <label className="block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <span className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
              وش المهمة أو التحديث اليومي؟
              <MessageSquare className="h-4 w-4 text-slate-500" />
            </span>
            <Textarea
              value={form.message}
              onChange={event => setForm(current => ({ ...current, message: event.target.value }))}
              disabled={isReadOnly}
              placeholder="اكتب رسالة قصيرة عن المهمة اليومية أو الشيء اللي تم إنجازه..."
              className="min-h-[180px] resize-y rounded-none border-0 bg-white text-right leading-8 focus-visible:ring-0"
            />
          </label>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">صورة اختيارية</h3>
                <p className="mt-1 text-xs leading-6 text-slate-500">
                  استخدم الكاميرا مباشرة أو اختر صورة من الجوال عند الحاجة.
                </p>
              </div>
              {!isReadOnly ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={event => handleFileSelected(event.target.files?.[0] || null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white"
                    onClick={openCameraCapture}
                  >
                    <Camera className="h-4 w-4" />
                    تصوير
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon className="h-4 w-4" />
                    اختيار صورة
                  </Button>
                </div>
              ) : null}
            </div>

            {form.pendingFile ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-800">
                <span>{form.pendingFile.name}</span>
                <Badge className="rounded-full bg-white text-slate-700 hover:bg-white">
                  جاهزة للرفع
                </Badge>
              </div>
            ) : form.attachment ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {form.attachment.fileName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatFileSize(form.attachment.fileSize)}
                    </p>
                  </div>
                  <a
                    href={form.attachment.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="h-4 w-4" />
                    عرض الصورة
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          {selectedTask?.status === "sent" || canWriteManagerNotes ? (
            <label className="block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <span className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
                ملاحظة المدير
                <CheckCircle2 className="h-4 w-4 text-slate-500" />
              </span>
              <Textarea
                value={form.managerNotes}
                onChange={event => setForm(current => ({ ...current, managerNotes: event.target.value }))}
                disabled={!canEditManagerNotes}
                placeholder={
                  canWriteManagerNotes
                    ? "اكتب ملاحظة قصيرة على المهمة اليومية..."
                    : "تظهر هنا ملاحظة المدير عند إضافتها."
                }
                className="min-h-[120px] resize-y rounded-none border-0 bg-white text-right leading-8 focus-visible:ring-0"
              />
            </label>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Clock3 className="h-4 w-4" />
              المستلم: {WEEKLY_REPORT_RECEIVER.displayName}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canEditManagerNotes ? (
                <Button
                  type="button"
                  className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800"
                  disabled={savingManagerNotes}
                  onClick={() => void saveManagerNotes()}
                >
                  <Save className="h-4 w-4" />
                  {savingManagerNotes ? "جاري الحفظ..." : "حفظ ملاحظة المدير"}
                </Button>
              ) : null}

              {!isReadOnly ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white px-5"
                    disabled={saving}
                    onClick={() => void saveTask("draft")}
                  >
                    <Save className="h-4 w-4" />
                    حفظ مسودة
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full bg-[#F2B705] px-5 text-slate-950 hover:bg-[#e0ab00]"
                    disabled={saving}
                    onClick={() => void saveTask("sent")}
                  >
                    <Send className="h-4 w-4" />
                    إرسال المهمة
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
