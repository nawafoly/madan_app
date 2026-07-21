import { useEffect, useMemo, useRef, useState } from "react";
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

import { hasPermission, type AppUser } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createInAppNotification } from "@/lib/inAppNotifications";
import {
  HR_CORE_D1_ENABLED,
  createHrCoreDailyTask,
  isHrCoreConfigured,
  listHrCoreDailyTasks,
  updateHrCoreDailyTask,
} from "@/lib/hrCoreApi";
import { uploadDocumentToCloudflare } from "@/lib/documentUploadService";
import { languageDir, tr } from "@/lib/i18n";
import {
  WEEKLY_REPORT_MANAGER_NOTES_PERMISSION,
} from "@/lib/weeklyReportConfig";
import { WEEKLY_REPORT_RECEIVER } from "@/pages/employee/messages/WeeklyReportTab";

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
  const { language } = useLanguage();
  const dir = languageDir(language);
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
  const formSectionRef = useRef<HTMLElement | null>(null);
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

  const openTask = (task: DailyTaskRecord) => {
    setForm(toForm(task));
    window.requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1279px)").matches) {
        formSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  };
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
    const defaults = {
      name: cleanText(user.displayName) || cleanText(user.email),
      title: cleanText(user.title),
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
  }, [user.displayName, user.email, user.title]);

  const loadOwnTasks = async () => {
    setLoadingOwn(true);
    try {
      if (!HR_CORE_D1_ENABLED || !isHrCoreConfigured()) {
        throw new Error("HR Core D1 is not configured.");
      }
      const result = await listHrCoreDailyTasks({
        createdByUid: user.uid,
        limit: 200,
      });
      setOwnTasks(
        result.dailyTasks.map(task =>
          normalizeTask(String(task.id), task as Record<string, unknown>)
        )
      );
    } catch (error) {
      console.error("daily_tasks_own_d1_load_failed", error);
      setOwnTasks([]);
    } finally {
      setLoadingOwn(false);
    }
  };

  const loadReceivedTasks = async () => {
    if (!canReviewDailyTasks) {
      setReceivedTasks([]);
      setLoadingReceived(false);
      return;
    }
    setLoadingReceived(true);
    try {
      if (!HR_CORE_D1_ENABLED || !isHrCoreConfigured()) {
        throw new Error("HR Core D1 is not configured.");
      }
      const result = await listHrCoreDailyTasks({ status: "sent", limit: 200 });
      setReceivedTasks(
        result.dailyTasks.map(task =>
          normalizeTask(String(task.id), task as Record<string, unknown>)
        )
      );
    } catch (error) {
      console.error("daily_tasks_received_d1_load_failed", error);
      setReceivedTasks([]);
    } finally {
      setLoadingReceived(false);
    }
  };

  useEffect(() => {
    void loadOwnTasks();
  }, [user.uid]);

  useEffect(() => {
    void loadReceivedTasks();
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
      if (!HR_CORE_D1_ENABLED || !isHrCoreConfigured()) {
        throw new Error("HR Core D1 is not configured.");
      }
      const taskId =
        form.id ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `daily-task-${Date.now()}`);
      const attachment = await uploadAttachmentIfNeeded(taskId);
      const now = new Date().toISOString();
      const payload = {
        id: taskId,
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
        updatedAt: now,
        sentAt: status === "sent" ? now : null,
        ...(form.id ? {} : { createdAt: now }),
      };

      const result = form.id
        ? await updateHrCoreDailyTask(taskId, payload)
        : await createHrCoreDailyTask(payload);
      const savedTask = normalizeTask(
        String(result.dailyTask.id),
        result.dailyTask as Record<string, unknown>
      );
      setOwnTasks(current => {
        const next = current.filter(task => task.id !== savedTask.id);
        return [savedTask, ...next];
      });
      if (canReviewDailyTasks && savedTask.status === "sent") {
        setReceivedTasks(current => {
          const next = current.filter(task => task.id !== savedTask.id);
          return [savedTask, ...next];
        });
      }
      setForm(current => ({
        ...current,
        id: savedTask.id,
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
          relatedId: taskId,
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
      if (!HR_CORE_D1_ENABLED || !isHrCoreConfigured()) {
        throw new Error("HR Core D1 is not configured.");
      }
      const now = new Date().toISOString();
      const result = await updateHrCoreDailyTask(selectedTask.id, {
        managerNotes: cleanText(form.managerNotes),
        managerNotesUpdatedAt: now,
        managerNotesUpdatedByUid: user.uid,
        managerNotesUpdatedByEmail: cleanText(user.email),
        managerNotesUpdatedByName:
          cleanText(user.displayName) || cleanText(user.email),
        updatedAt: now,
      });
      const savedTask = normalizeTask(
        String(result.dailyTask.id),
        result.dailyTask as Record<string, unknown>
      );
      setReceivedTasks(current =>
        current.map(task => (task.id === savedTask.id ? savedTask : task))
      );
      setOwnTasks(current =>
        current.map(task => (task.id === savedTask.id ? savedTask : task))
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
          <p className="text-sm text-slate-500">{tr(language, "جاري التحميل...", "Loading...")}</p>
        ) : tasks.length ? (
          tasks.map(task => {
            const isSelected = form.id === task.id;

            return (
              <button
                key={task.id}
                type="button"
                aria-pressed={isSelected}
                className={[
                  "group block w-full rounded-[20px] border p-3.5 text-start shadow-sm outline-none transition-all duration-200",
                  "hover:-translate-y-0.5 hover:border-[#F2B705] hover:bg-amber-50/35 hover:shadow-lg hover:shadow-slate-200/80",
                  "active:translate-y-0 active:scale-[0.99] focus-visible:ring-4 focus-visible:ring-[#F2B705]/25",
                  isSelected
                    ? "border-[#F2B705] bg-[#FFF8DF] shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] ring-2 ring-[#F2B705]/25"
                    : "border-slate-200 bg-white",
                ].join(" ")}
                onClick={() => openTask(task)}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950 underline-offset-4 group-hover:underline">
                      {task.createdByName || tr(language, "موظف", "Employee")}
                    </div>
                    <div className="mt-1 text-xs font-medium text-slate-500">
                      {task.taskDate || tr(language, "بدون تاريخ", "No date")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isSelected ? (
                      <Badge className="rounded-full bg-slate-950 text-white hover:bg-slate-950">
                        {tr(language, "مفتوحة", "Open")}
                      </Badge>
                    ) : null}
                    <Badge
                      className={
                        task.status === "sent"
                          ? "rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                          : "rounded-full bg-amber-100 text-amber-700 hover:bg-amber-100"
                      }
                    >
                      {task.status === "sent" ? tr(language, "مرسلة", "Sent") : tr(language, "مسودة", "Draft")}
                    </Badge>
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-xs leading-6 text-slate-600">
                  {task.message || tr(language, "بدون رسالة", "No message")}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  {task.attachment ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {tr(language, "صورة مرفقة", "Image attached")}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition group-hover:bg-slate-950 group-hover:text-white group-hover:ring-slate-950">
                    <Eye className="h-3.5 w-3.5" />
                    {isSelected
                      ? tr(language, "مفتوحة الآن", "Opened")
                      : tr(language, "فتح", "Open")}
                  </span>
                </div>
              </button>
            );
          })
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
      <div className="space-y-6" dir={dir}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">{tr(language, "إجمالي المهام المستلمة", "Total Received Tasks")}</p>
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
                <p className="text-sm text-amber-700">{tr(language, "بانتظار ملاحظتك", "Awaiting Your Note")}</p>
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
                <p className="text-sm text-emerald-700">{tr(language, "تمت مراجعتها", "Reviewed")}</p>
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
                        {tr(language, "مهمة يومية مرسلة", "Submitted Daily Task")}
                      </Badge>
                      <h2 className="mt-4 text-3xl font-semibold">
                        {activeTask.createdByName || tr(language, "موظف", "Employee")}
                      </h2>
                      <p className="mt-2 text-sm text-slate-300">
                        {activeTask.jobTitle || tr(language, "بدون مسمى", "No title")} - {activeTask.taskDate || tr(language, "بدون تاريخ", "No date")}
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
                        {tr(language, "عرض الصورة", "View Image")}
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-5 bg-slate-50/40 p-5 md:p-6">
                  <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-3">
                    <div className="border-b border-slate-200 p-4 md:border-b-0 md:border-l">
                      <span className="mb-2 block text-sm font-semibold text-slate-500">{tr(language, "الموظف", "Employee")}</span>
                      <p className="font-semibold text-slate-950">{activeTask.createdByName || "-"}</p>
                    </div>
                    <div className="border-b border-slate-200 p-4 md:border-b-0 md:border-l">
                      <span className="mb-2 block text-sm font-semibold text-slate-500">{tr(language, "المسمى الوظيفي", "Job Title")}</span>
                      <p className="font-semibold text-slate-950">{activeTask.jobTitle || "-"}</p>
                    </div>
                    <div className="p-4">
                      <span className="mb-2 block text-sm font-semibold text-slate-500">{tr(language, "التاريخ", "Date")}</span>
                      <p className="font-semibold text-slate-950">{activeTask.taskDate || "-"}</p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
                      {tr(language, "التحديث اليومي", "Daily Update")}
                    </div>
                    <p className="min-h-[160px] whitespace-pre-wrap px-4 py-4 text-start text-sm leading-8 text-slate-700">
                      {activeTask.message || tr(language, "لا توجد رسالة.", "No message.")}
                    </p>
                  </div>

                  {activeTask.attachment ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
                        {tr(language, "الصورة المرفقة", "Attached Image")}
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
                      <span className="text-sm font-semibold text-slate-950">{tr(language, "ملاحظة المدير", "Manager Note")}</span>
                      <MessageSquare className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="p-4">
                      <Textarea
                        value={form.managerNotes}
                        onChange={event =>
                          setForm(current => ({ ...current, managerNotes: event.target.value }))
                        }
                        className="min-h-[150px] resize-y rounded-2xl border-slate-200 bg-slate-50/70 text-start leading-8"
                        placeholder={tr(language, "اكتب ملاحظة قصيرة على المهمة اليومية...", "Write a short note on the daily task...")}
                        dir={dir}
                      />
                      <div className="mt-4 flex justify-end">
                        <Button
                          type="button"
                          className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800"
                          disabled={savingManagerNotes}
                          onClick={() => void saveManagerNotes()}
                        >
                          <Save className="h-4 w-4" />
                          {savingManagerNotes
                            ? tr(language, "جاري الحفظ...", "Saving...")
                            : tr(language, "حفظ ملاحظة المدير", "Save Manager Note")}
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
                  <h3 className="text-lg font-semibold text-slate-950">{tr(language, "لا توجد مهام يومية مرسلة حاليًا", "No submitted daily tasks yet")}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    {tr(language, "عند إرسال الموظفين تحديثاتهم اليومية ستظهر هنا للاستلام والمراجعة.", "When employees submit daily updates, they will appear here for review.")}
                  </p>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4 xl:col-start-1 xl:row-start-1 xl:sticky xl:top-24 xl:self-start">
            {renderTaskList(
              tr(language, "مهام تحتاج ملاحظة", "Tasks Needing Notes"),
              managerPendingTasks,
              loadingReceived,
              tr(language, "لا توجد مهام يومية بانتظار الملاحظة.", "No daily tasks are waiting for a note.")
            )}
            {renderTaskList(
              tr(language, "مهام تمت مراجعتها", "Reviewed Tasks"),
              managerReviewedTasks,
              loadingReceived,
              tr(language, "لم تتم مراجعة أي مهمة يومية بعد.", "No daily tasks have been reviewed yet.")
            )}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]" dir={dir}>
      {cameraOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-[24px] border border-white/10 bg-slate-950 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <h3 className="text-base font-semibold">
                  {tr(language, "تصوير مباشر", "Live Camera")}
                </h3>
                <p className="mt-1 text-xs text-slate-300">
                  {tr(language, "التقط الصورة من داخل التطبيق بدون الخروج من الصفحة.", "Capture a photo inside the app without leaving the page.")}
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
                {cameraStarting ? tr(language, "جاري تشغيل الكاميرا...", "Starting camera...") : cameraError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-white/20 bg-white/10 px-5 text-white hover:bg-white/20 hover:text-white"
                onClick={closeCameraCapture}
              >
                {tr(language, "إلغاء", "Cancel")}
              </Button>
              <Button
                type="button"
                className="rounded-full bg-[#F2B705] px-6 text-slate-950 hover:bg-[#e0ab00]"
                disabled={cameraStarting || Boolean(cameraError)}
                onClick={captureCameraPhoto}
              >
                <Camera className="h-4 w-4" />
                {tr(language, "التقاط الصورة", "Capture Photo")}
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
          {tr(language, "مهمة يومية جديدة", "New Daily Task")}
        </Button>

        {canReviewDailyTasks
          ? renderTaskList(
              tr(language, "المهام اليومية المستلمة", "Received Daily Tasks"),
              sentReceivedTasks,
              loadingReceived,
              tr(language, "لا توجد مهام يومية مرسلة حاليًا.", "No submitted daily tasks yet.")
            )
          : null}

        {renderTaskList(
          tr(language, "سجل مهامي اليومية", "My Daily Task Log"),
          visibleOwnTasks,
          loadingOwn,
          tr(language, "لم يتم حفظ أي مهمة يومية بعد.", "No daily task has been saved yet.")
        )}
      </aside>

      <section
        ref={formSectionRef}
        data-open-target="true"
        className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/60"
      >
        <div className="border-b border-slate-200 bg-gradient-to-l from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-[#F2B705]">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold text-white">
            {tr(language, "مهمة يومية", "Daily Task")}
          </h2>
          <p className="mt-2 text-sm text-slate-300">
            {tr(language, "رسالة بسيطة عن عمل اليوم، مع صورة عند الحاجة.", "A simple update about today's work, with an optional image.")}
          </p>
        </div>

        <div className="space-y-5 bg-slate-50/40 p-5 md:p-6">
          <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-3">
            <label className="border-b border-slate-200 p-4 md:border-b-0 md:border-l">
              <span className="mb-2 block text-sm font-semibold text-slate-900">{tr(language, "اسم الموظف", "Employee Name")}</span>
              <Input
                value={form.createdByName}
                onChange={event => setForm(current => ({ ...current, createdByName: event.target.value }))}
                disabled={isReadOnly}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/80 text-start"
                dir={dir}
              />
            </label>
            <label className="border-b border-slate-200 p-4 md:border-b-0 md:border-l">
              <span className="mb-2 block text-sm font-semibold text-slate-900">{tr(language, "المسمى الوظيفي", "Job Title")}</span>
              <Input
                value={form.jobTitle}
                onChange={event => setForm(current => ({ ...current, jobTitle: event.target.value }))}
                disabled={isReadOnly}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/80 text-start"
                dir={dir}
              />
            </label>
            <label className="p-4">
              <span className="mb-2 block text-sm font-semibold text-slate-900">{tr(language, "تاريخ اليوم", "Today's Date")}</span>
              <Input
                type="date"
                value={form.taskDate}
                onChange={event => setForm(current => ({ ...current, taskDate: event.target.value }))}
                disabled={isReadOnly}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/80 text-start"
                dir={dir}
              />
            </label>
          </div>

          <label className="block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <span className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
              {tr(language, "وش المهمة أو التحديث اليومي؟", "What is the daily task or update?")}
              <MessageSquare className="h-4 w-4 text-slate-500" />
            </span>
            <Textarea
              value={form.message}
              onChange={event => setForm(current => ({ ...current, message: event.target.value }))}
              disabled={isReadOnly}
              placeholder={tr(language, "اكتب رسالة قصيرة عن المهمة اليومية أو الشيء اللي تم إنجازه...", "Write a short update about the daily task or what was completed...")}
              className="min-h-[180px] resize-y rounded-none border-0 bg-white text-start leading-8 focus-visible:ring-0"
              dir={dir}
            />
          </label>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">{tr(language, "صورة اختيارية", "Optional Image")}</h3>
                <p className="mt-1 text-xs leading-6 text-slate-500">
                  {tr(language, "استخدم الكاميرا مباشرة أو اختر صورة من الجوال عند الحاجة.", "Use the camera directly or choose an image from your device if needed.")}
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
                    {tr(language, "تصوير", "Camera")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon className="h-4 w-4" />
                    {tr(language, "اختيار صورة", "Choose Image")}
                  </Button>
                </div>
              ) : null}
            </div>

            {form.pendingFile ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-800">
                <span>{form.pendingFile.name}</span>
                <Badge className="rounded-full bg-white text-slate-700 hover:bg-white">
                  {tr(language, "جاهزة للرفع", "Ready to Upload")}
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
                    {tr(language, "عرض الصورة", "View Image")}
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          {selectedTask?.status === "sent" || canWriteManagerNotes ? (
            <label className="block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <span className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
                {tr(language, "ملاحظة المدير", "Manager Note")}
                <CheckCircle2 className="h-4 w-4 text-slate-500" />
              </span>
              <Textarea
                value={form.managerNotes}
                onChange={event => setForm(current => ({ ...current, managerNotes: event.target.value }))}
                disabled={!canEditManagerNotes}
                placeholder={
                  canWriteManagerNotes
                    ? tr(language, "اكتب ملاحظة قصيرة على المهمة اليومية...", "Write a short note on the daily task...")
                    : tr(language, "تظهر هنا ملاحظة المدير عند إضافتها.", "The manager note will appear here once added.")
                }
                className="min-h-[120px] resize-y rounded-none border-0 bg-white text-start leading-8 focus-visible:ring-0"
                dir={dir}
              />
            </label>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Clock3 className="h-4 w-4" />
              {tr(language, "المستلم:", "Recipient:")} {WEEKLY_REPORT_RECEIVER.displayName}
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
                  {savingManagerNotes
                    ? tr(language, "جاري الحفظ...", "Saving...")
                    : tr(language, "حفظ ملاحظة المدير", "Save Manager Note")}
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
                    {tr(language, "حفظ مسودة", "Save Draft")}
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full bg-[#F2B705] px-5 text-slate-950 hover:bg-[#e0ab00]"
                    disabled={saving}
                    onClick={() => void saveTask("sent")}
                  >
                    <Send className="h-4 w-4" />
                    {tr(language, "إرسال المهمة", "Send Task")}
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
