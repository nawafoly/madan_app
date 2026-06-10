import { useEffect, useMemo, useState } from "react";
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
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  MessageSquare,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { db } from "@/_core/firebase";
import { hasPermission, type AppUser } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createInAppNotification } from "@/lib/inAppNotifications";
import {
  WEEKLY_REPORT_DIRECT_MANAGER_NAME,
  WEEKLY_REPORT_MANAGER_NOTES_PERMISSION,
} from "@/lib/weeklyReportConfig";
import { downloadWeeklyReportExcel } from "@/lib/weeklyReportExcel";
import {
  downloadWeeklyReportWord,
  type WeeklyReportTask,
  type WeeklyReportWordData,
} from "@/lib/weeklyReportWord";

export const WEEKLY_REPORT_RECEIVER = {
  uid: "7DMxQMSqKOgtNYYZYRWHMXUH2Bt2",
  email: "shahd.zaini@madanalbena.com",
  displayName: "شهد زيني",
};

const WEEKLY_REPORTS_COLLECTION = "weekly_reports";
const EMPTY_TASK: WeeklyReportTask = {
  index: 1,
  title: "",
  description: "",
  managerName: WEEKLY_REPORT_DIRECT_MANAGER_NAME,
  progress: "",
};

type WeeklyReportStatus = "draft" | "sent";

type WeeklyReportRecord = WeeklyReportWordData & {
  id: string;
  createdByUid: string;
  createdByEmail: string;
  receiverUid: string;
  receiverEmail: string;
  receiverName: string;
  status: WeeklyReportStatus;
  createdAt: unknown;
  updatedAt: unknown;
  sentAt: unknown;
};

type WeeklyReportFormState = {
  id: string | null;
  createdByName: string;
  jobTitle: string;
  reportDate: string;
  tasks: WeeklyReportTask[];
  managerNotes: string;
  status: WeeklyReportStatus;
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function formatDateLabel(value: unknown) {
  const raw = cleanText(value);
  if (raw) return raw;
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toLocaleDateString("ar-SA");
  }
  return "بدون تاريخ";
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

function normalizeTasks(tasks: unknown): WeeklyReportTask[] {
  if (!Array.isArray(tasks) || tasks.length === 0) return [{ ...EMPTY_TASK }];
  return tasks.map((task, index) => {
    const row = (task || {}) as Record<string, unknown>;
    return {
      index: index + 1,
      title: cleanText(row.title),
      description: cleanText(row.description),
      managerName: WEEKLY_REPORT_DIRECT_MANAGER_NAME,
      progress: cleanText(row.progress),
    };
  });
}

function normalizeReport(id: string, data: Record<string, unknown>): WeeklyReportRecord {
  return {
    id,
    createdByUid: cleanText(data.createdByUid),
    createdByEmail: cleanText(data.createdByEmail),
    createdByName: cleanText(data.createdByName),
    jobTitle: cleanText(data.jobTitle),
    reportDate: cleanText(data.reportDate),
    receiverUid: cleanText(data.receiverUid),
    receiverEmail: cleanText(data.receiverEmail),
    receiverName: cleanText(data.receiverName),
    tasks: normalizeTasks(data.tasks),
    managerNotes: cleanText(data.managerNotes),
    status: cleanText(data.status) === "sent" ? "sent" : "draft",
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
    reportDate: todayInputValue(),
    tasks: [{ ...EMPTY_TASK }],
    managerNotes: "",
    status: "draft" as WeeklyReportStatus,
  };
}

function toForm(report: WeeklyReportRecord): WeeklyReportFormState {
  return {
    id: report.id,
    createdByName: report.createdByName,
    jobTitle: report.jobTitle,
    reportDate: report.reportDate,
    tasks: normalizeTasks(report.tasks),
    managerNotes: report.managerNotes,
    status: report.status,
  };
}

export function WeeklyReportTab({ user }: { user: AppUser }) {
  const [profileDefaults, setProfileDefaults] = useState({ name: "", title: "" });
  const [ownReports, setOwnReports] = useState<WeeklyReportRecord[]>([]);
  const [receivedReports, setReceivedReports] = useState<WeeklyReportRecord[]>([]);
  const [loadingOwn, setLoadingOwn] = useState(true);
  const [loadingReceived, setLoadingReceived] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingManagerNotes, setSavingManagerNotes] = useState(false);
  const [form, setForm] = useState<WeeklyReportFormState>(() =>
    buildInitialForm(user)
  );

  const isReceiver = user.uid === WEEKLY_REPORT_RECEIVER.uid;
  const canWriteManagerNotes = hasPermission(
    user,
    WEEKLY_REPORT_MANAGER_NOTES_PERMISSION
  );
  const canReviewWeeklyReports = isReceiver || canWriteManagerNotes;
  const selectedReport = useMemo(
    () =>
      [...ownReports, ...receivedReports].find(report => report.id === form.id) ||
      null,
    [form.id, ownReports, receivedReports]
  );
  const isReadOnly = selectedReport
    ? selectedReport.createdByUid !== user.uid || selectedReport.status === "sent"
    : false;
  const canEditSelectedManagerNotes =
    Boolean(selectedReport?.id) &&
    selectedReport?.status === "sent" &&
    canWriteManagerNotes;
  const sentReceivedReports = useMemo(
    () =>
      receivedReports
        .filter(report => report.status === "sent")
        .slice()
        .sort((left, right) => timestampMillis(right.sentAt) - timestampMillis(left.sentAt)),
    [receivedReports]
  );
  const visibleOwnReports = useMemo(
    () =>
      ownReports
        .slice()
        .sort((left, right) => timestampMillis(right.updatedAt) - timestampMillis(left.updatedAt)),
    [ownReports]
  );
  const managerPendingReports = useMemo(
    () =>
      sentReceivedReports.filter(report => !cleanText(report.managerNotes)),
    [sentReceivedReports]
  );
  const managerReviewedReports = useMemo(
    () =>
      sentReceivedReports.filter(report => cleanText(report.managerNotes)),
    [sentReceivedReports]
  );
  const managerActiveReport = useMemo(
    () =>
      selectedReport &&
      sentReceivedReports.some(report => report.id === selectedReport.id)
        ? selectedReport
        : sentReceivedReports[0] || null,
    [selectedReport, sentReceivedReports]
  );

  useEffect(() => {
    if (!canWriteManagerNotes) return;

    const currentReportStillVisible =
      Boolean(form.id) &&
      sentReceivedReports.some(report => report.id === form.id);
    if (currentReportStillVisible) return;

    const nextReport = managerPendingReports[0] || sentReceivedReports[0] || null;
    if (nextReport) {
      setForm(toForm(nextReport));
    }
  }, [
    canWriteManagerNotes,
    form.id,
    managerPendingReports,
    sentReceivedReports,
  ]);

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
        console.error("weekly_report_profile_defaults_failed", error);
      });

    return () => {
      cancelled = true;
    };
  }, [user.displayName, user.title, user.uid]);

  useEffect(() => {
    setLoadingOwn(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, WEEKLY_REPORTS_COLLECTION),
        where("createdByUid", "==", user.uid)
      ),
      snapshot => {
        setOwnReports(
          snapshot.docs.map(docSnapshot =>
            normalizeReport(docSnapshot.id, docSnapshot.data())
          )
        );
        setLoadingOwn(false);
      },
      error => {
        console.error("weekly_reports_own_snapshot_failed", error);
        setOwnReports([]);
        setLoadingOwn(false);
      }
    );
    return unsubscribe;
  }, [user.uid]);

  useEffect(() => {
    if (!canReviewWeeklyReports) {
      setReceivedReports([]);
      setLoadingReceived(false);
      return;
    }

    setLoadingReceived(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, WEEKLY_REPORTS_COLLECTION),
        where("status", "==", "sent")
      ),
      snapshot => {
        setReceivedReports(
          snapshot.docs.map(docSnapshot =>
            normalizeReport(docSnapshot.id, docSnapshot.data())
          )
        );
        setLoadingReceived(false);
      },
      error => {
        console.error("weekly_reports_received_snapshot_failed", error);
        setReceivedReports([]);
        setLoadingReceived(false);
      }
    );
    return unsubscribe;
  }, [canReviewWeeklyReports]);

  const resetForm = () => {
    setForm(buildInitialForm(user, profileDefaults));
  };

  const updateTask = (
    rowIndex: number,
    key: keyof Omit<WeeklyReportTask, "index">,
    value: string
  ) => {
    setForm(current => ({
      ...current,
      tasks: current.tasks.map((task, index) =>
        index === rowIndex ? { ...task, [key]: value } : task
      ),
    }));
  };

  const addTask = () => {
    setForm(current => ({
      ...current,
      tasks: [
        ...current.tasks,
        { ...EMPTY_TASK, index: current.tasks.length + 1 },
      ],
    }));
  };

  const removeTask = (rowIndex: number) => {
    setForm(current => ({
      ...current,
      tasks:
        current.tasks.length === 1
          ? [{ ...EMPTY_TASK }]
          : current.tasks
              .filter((_, index) => index !== rowIndex)
              .map((task, index) => ({ ...task, index: index + 1 })),
    }));
  };

  const saveReport = async (status: WeeklyReportStatus) => {
    if (isReadOnly) return;
    if (!cleanText(form.createdByName)) {
      toast.error("اسم الموظف مطلوب قبل الحفظ.");
      return;
    }

    setSaving(true);
    try {
      const reportRef = form.id
        ? doc(db, WEEKLY_REPORTS_COLLECTION, form.id)
        : doc(collection(db, WEEKLY_REPORTS_COLLECTION));
      const normalizedTasks = form.tasks.map((task, index) => ({
        index: index + 1,
        title: cleanText(task.title),
        description: cleanText(task.description),
        managerName: WEEKLY_REPORT_DIRECT_MANAGER_NAME,
        progress: cleanText(task.progress),
      }));

      const payload = {
        createdByUid: user.uid,
        createdByEmail: cleanText(user.email),
        createdByName: cleanText(form.createdByName),
        jobTitle: cleanText(form.jobTitle),
        reportDate: cleanText(form.reportDate),
        receiverUid: WEEKLY_REPORT_RECEIVER.uid,
        receiverEmail: WEEKLY_REPORT_RECEIVER.email,
        receiverName: WEEKLY_REPORT_RECEIVER.displayName,
        tasks: normalizedTasks,
        managerNotes: cleanText(form.managerNotes),
        status,
        updatedAt: serverTimestamp(),
        sentAt: status === "sent" ? serverTimestamp() : null,
        ...(form.id ? {} : { createdAt: serverTimestamp() }),
      };

      await setDoc(reportRef, payload, { merge: true });

      setForm(current => ({ ...current, id: reportRef.id, status }));

      if (status === "sent") {
        await createInAppNotification({
          userId: WEEKLY_REPORT_RECEIVER.uid,
          title: "تقرير عمل أسبوعي جديد",
          body: `تم إرسال تقرير عمل أسبوعي من ${cleanText(form.createdByName) || cleanText(user.email)}.`,
          type: "message",
          relatedId: reportRef.id,
          relatedTo: "weekly_report",
          relatedPath: "/hr/weekly-reports",
        }).catch(error => {
          console.error("weekly_report_notification_failed", error);
        });
      }

      toast.success(status === "sent" ? "تم إرسال التقرير إلى شهد زيني." : "تم حفظ المسودة.");
    } catch (error) {
      console.error("weekly_report_save_failed", error);
      toast.error(status === "sent" ? "تعذر إرسال التقرير." : "تعذر حفظ المسودة.");
    } finally {
      setSaving(false);
    }
  };

  const saveManagerNotes = async () => {
    if (!selectedReport?.id || !canEditSelectedManagerNotes) return;

    setSavingManagerNotes(true);
    try {
      await setDoc(
        doc(db, WEEKLY_REPORTS_COLLECTION, selectedReport.id),
        {
          managerNotes: cleanText(form.managerNotes),
          managerNotesUpdatedAt: serverTimestamp(),
          managerNotesUpdatedByUid: user.uid,
          managerNotesUpdatedByEmail: cleanText(user.email),
          managerNotesUpdatedByName:
            cleanText(user.displayName) || cleanText(user.email),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (selectedReport.createdByUid && selectedReport.createdByUid !== user.uid) {
        await createInAppNotification({
          userId: selectedReport.createdByUid,
          title: "ملاحظة جديدة على تقريرك الأسبوعي",
          body: `تمت إضافة ملاحظة المدير على تقرير ${cleanText(selectedReport.reportDate) || "العمل الأسبوعي"}.`,
          type: "message",
          relatedId: selectedReport.id,
          relatedTo: "weekly_report",
          relatedPath: "/hr/weekly-reports",
        }).catch(error => {
          console.error("weekly_report_manager_note_notification_failed", error);
        });
      }

      toast.success("تم حفظ ملاحظات المدير المباشر.");
    } catch (error) {
      console.error("weekly_report_manager_notes_save_failed", error);
      toast.error("تعذر حفظ ملاحظات المدير المباشر.");
    } finally {
      setSavingManagerNotes(false);
    }
  };

  const downloadCurrentReport = async (report: WeeklyReportWordData) => {
    try {
      await downloadWeeklyReportWord(report);
    } catch (error) {
      console.error("weekly_report_word_download_failed", error);
      toast.error("تعذر تحميل ملف Word.");
    }
  };

  const downloadCurrentReportExcel = async (report: WeeklyReportWordData) => {
    try {
      await downloadWeeklyReportExcel(report);
    } catch (error) {
      console.error("weekly_report_excel_download_failed", error);
      toast.error("تعذر تحميل ملف Excel.");
    }
  };

  const renderReportList = (
    title: string,
    reports: WeeklyReportRecord[],
    loading: boolean,
    emptyText: string
  ) => (
    <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <Badge variant="outline" className="rounded-full bg-slate-50 px-3 text-slate-600">
          {reports.length}
        </Badge>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-slate-500">جاري تحميل التقارير...</p>
        ) : reports.length ? (
          reports.map(report => (
            <div
              key={report.id}
              className="rounded-[18px] border border-slate-200 bg-white p-3 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-[#F2B705]/50 hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-950">
                    {report.createdByName || "موظف"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDateLabel(report.reportDate)}
                  </div>
                </div>
                <Badge
                  className={
                    report.status === "sent"
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                      : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                  }
                >
                  {report.status === "sent" ? "مرسل" : "مسودة"}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full border-slate-200 bg-white px-4"
                  onClick={() => setForm(toForm(report))}
                >
                  عرض التقرير
                </Button>
                {canReviewWeeklyReports && report.status === "sent" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full bg-slate-950 px-4 text-white hover:bg-slate-800"
                      onClick={() => void downloadCurrentReport(report)}
                    >
                      <Download className="h-4 w-4" />
                      Word
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full bg-emerald-600 px-4 text-white hover:bg-emerald-700"
                      onClick={() => void downloadCurrentReportExcel(report)}
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      Excel
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm leading-7 text-slate-500">{emptyText}</p>
        )}
      </div>
    </div>
  );

  if (canWriteManagerNotes) {
    const exportData: WeeklyReportWordData = {
      createdByName: form.createdByName,
      jobTitle: form.jobTitle,
      reportDate: form.reportDate,
      tasks: form.tasks,
      managerNotes: form.managerNotes,
    };
    const activeTasks = managerActiveReport
      ? normalizeTasks(managerActiveReport.tasks)
      : [];

    const renderManagerReportCards = (
      reports: WeeklyReportRecord[],
      emptyText: string
    ) => (
      <div className="space-y-3">
        {loadingReceived ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
            جاري تحميل التقارير...
          </div>
        ) : reports.length ? (
          reports.map(report => {
            const isActive = managerActiveReport?.id === report.id;
            return (
              <button
                key={report.id}
                type="button"
                onClick={() => setForm(toForm(report))}
                className={[
                  "w-full rounded-[22px] border p-4 text-right transition-all",
                  isActive
                    ? "border-[#F2B705]/80 bg-amber-50/60 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.38)]"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {report.createdByName || "موظف"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {report.jobTitle || "المسمى غير محدد"}
                    </div>
                  </div>
                  <Badge
                    className={
                      cleanText(report.managerNotes)
                        ? "shrink-0 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        : "shrink-0 rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#F2B705]"
                    }
                  >
                    {cleanText(report.managerNotes) ? "تمت المراجعة" : "بانتظار ملاحظة"}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    التاريخ: {formatDateLabel(report.reportDate)}
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2">
                    المهام: {normalizeTasks(report.tasks).length}
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm leading-7 text-slate-500">
            {emptyText}
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-6" dir="rtl">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-500">
                  إجمالي التقارير المستلمة
                </div>
                <div className="mt-3 text-3xl font-semibold text-slate-950">
                  {sentReceivedReports.length}
                </div>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-[#F2B705]">
                <FileText className="h-5 w-5" />
              </span>
            </div>
          </div>

          <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-amber-700">
                  بانتظار ملاحظتك
                </div>
                <div className="mt-3 text-3xl font-semibold text-slate-950">
                  {managerPendingReports.length}
                </div>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
                <Clock3 className="h-5 w-5" />
              </span>
            </div>
          </div>

          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-emerald-700">
                  تمت مراجعتها
                </div>
                <div className="mt-3 text-3xl font-semibold text-slate-950">
                  {managerReviewedReports.length}
                </div>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                <CheckCircle2 className="h-5 w-5" />
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[410px_minmax(0,1fr)]">
          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_-54px_rgba(15,23,42,0.32)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">
                    تقارير تحتاج ملاحظة
                  </h3>
                  <p className="mt-1 text-xs leading-6 text-slate-500">
                    تظهر هنا التقارير المرسلة ولم تضف عليها ملاحظة المدير بعد.
                  </p>
                </div>
                <Badge className="rounded-full bg-[#F2B705] text-slate-950 hover:bg-[#F2B705]">
                  {managerPendingReports.length}
                </Badge>
              </div>
              {renderManagerReportCards(
                managerPendingReports,
                "لا توجد تقارير بانتظار الملاحظة الآن."
              )}
            </div>

            <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">
                    تقارير تمت مراجعتها
                  </h3>
                  <p className="mt-1 text-xs leading-6 text-slate-500">
                    تقارير أضفت عليها ملاحظة ويمكن الرجوع لها أو تعديلها.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full bg-slate-50 text-slate-600"
                >
                  {managerReviewedReports.length}
                </Badge>
              </div>
              {renderManagerReportCards(
                managerReviewedReports,
                "لا توجد تقارير مراجعة محفوظة بعد."
              )}
            </div>
          </aside>

          <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_28px_80px_-58px_rgba(15,23,42,0.34)]">
            {managerActiveReport ? (
              <>
                <div className="border-b border-slate-200 bg-gradient-to-l from-slate-950 via-slate-900 to-slate-800 px-6 py-6 text-white">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <Badge className="mb-3 rounded-full bg-white/10 text-white shadow-none hover:bg-white/10">
                        تقرير مرسل للمراجعة
                      </Badge>
                      <h2 className="text-2xl font-semibold tracking-tight">
                        {managerActiveReport.createdByName || "تقرير موظف"}
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-white/62">
                        {managerActiveReport.jobTitle || "المسمى غير محدد"} -{" "}
                        {formatDateLabel(managerActiveReport.reportDate)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="rounded-full bg-white text-slate-950 hover:bg-slate-100"
                        onClick={() => void downloadCurrentReport(exportData)}
                      >
                        <Download className="h-4 w-4" />
                        Word
                      </Button>
                      <Button
                        type="button"
                        className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => void downloadCurrentReportExcel(exportData)}
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        Excel
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6 bg-slate-50/50 p-5 md:p-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="text-xs font-semibold text-slate-500">
                        الموظف
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-950">
                        {managerActiveReport.createdByName || "غير محدد"}
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="text-xs font-semibold text-slate-500">
                        المسمى الوظيفي
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-950">
                        {managerActiveReport.jobTitle || "غير محدد"}
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="text-xs font-semibold text-slate-500">
                        تاريخ التقرير
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-950">
                        {formatDateLabel(managerActiveReport.reportDate)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950">
                          مهام التقرير
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          قراءة مرتبة للمهام والوصف ونسبة الإنجاز.
                        </p>
                      </div>
                      <Badge variant="outline" className="rounded-full bg-slate-50">
                        {activeTasks.length} مهمة
                      </Badge>
                    </div>

                    <div className="grid gap-3">
                      {activeTasks.map(task => (
                        <div
                          key={task.index}
                          className="rounded-[22px] border border-slate-200 bg-slate-50/60 p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                                  {task.index}
                                </span>
                                <div className="font-semibold text-slate-950">
                                  {task.title || "مهمة بدون عنوان"}
                                </div>
                              </div>
                              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">
                                {task.description || "لا يوجد وصف مرفق لهذه المهمة."}
                              </p>
                            </div>
                            <Badge className="w-fit shrink-0 rounded-full bg-white px-3 py-1.5 text-slate-700 shadow-none ring-1 ring-slate-200 hover:bg-white">
                              الإنجاز: {task.progress || "-"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950">
                          ملاحظات المدير
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          عند الحفظ سيصل تنبيه للموظف بوجود ملاحظة جديدة.
                        </p>
                      </div>
                      <MessageSquare className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="p-5">
                      <Textarea
                        value={form.managerNotes}
                        onChange={event =>
                          setForm(current => ({
                            ...current,
                            managerNotes: event.target.value,
                          }))
                        }
                        className="min-h-[180px] resize-y rounded-[20px] border-slate-200 bg-slate-50/70 text-right leading-8 focus-visible:ring-[#F2B705]/30"
                        placeholder="اكتب ملاحظة المدير على التقرير المحدد..."
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
                            ? "جاري حفظ الملاحظة..."
                            : "حفظ ملاحظة المدير"}
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
                    <FileText className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    لا توجد تقارير مرسلة حاليًا
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    عند إرسال الموظفين تقاريرهم الأسبوعية ستظهر هنا للمراجعة وكتابة ملاحظات المدير.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]" dir="rtl">
      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Button
          type="button"
          className="h-12 w-full rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/15 hover:bg-slate-800"
          onClick={resetForm}
        >
          <Plus className="h-4 w-4" />
          تقرير جديد
        </Button>

        {canReviewWeeklyReports
          ? renderReportList(
              canWriteManagerNotes
                ? "تقارير بانتظار ملاحظات المدير"
                : "التقارير المستلمة",
              sentReceivedReports,
              loadingReceived,
              "لا توجد تقارير أسبوعية مرسلة حاليًا."
            )
          : null}

        {renderReportList(
          "سجل تقاريري",
          visibleOwnReports,
          loadingOwn,
          "لم يتم حفظ أي تقرير أسبوعي بعد."
        )}
      </aside>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
        <div className="border-b border-slate-200 bg-gradient-to-l from-slate-950 via-slate-900 to-slate-800 px-6 py-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-[#F2B705]">
            <FileText className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            نموذج تقرير عمل اسبوعي
          </h2>
        </div>

        <div className="space-y-6 bg-slate-50/40 p-5 md:p-6">
          <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-3">
            <label className="border-b border-slate-200 p-4 md:border-b-0 md:border-l">
              <span className="mb-2 block text-sm font-semibold text-slate-900">
                اسم الموظف
              </span>
              <Input
                value={form.createdByName}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    createdByName: event.target.value,
                  }))
                }
                disabled={isReadOnly}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/80 text-right shadow-inner shadow-slate-100/70 focus-visible:ring-[#F2B705]/35"
              />
            </label>
            <label className="border-b border-slate-200 p-4 md:border-b-0 md:border-l">
              <span className="mb-2 block text-sm font-semibold text-slate-900">
                المسمى الوظيفي
              </span>
              <Input
                value={form.jobTitle}
                onChange={event =>
                  setForm(current => ({ ...current, jobTitle: event.target.value }))
                }
                disabled={isReadOnly}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/80 text-right shadow-inner shadow-slate-100/70 focus-visible:ring-[#F2B705]/35"
              />
            </label>
            <label className="p-4">
              <span className="mb-2 block text-sm font-semibold text-slate-900">
                التاريخ
              </span>
              <Input
                type="date"
                value={form.reportDate}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    reportDate: event.target.value,
                  }))
                }
                disabled={isReadOnly}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/80 text-right shadow-inner shadow-slate-100/70 focus-visible:ring-[#F2B705]/35"
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-right">
                <thead>
                  <tr className="bg-slate-950 text-sm text-white">
                    <th className="w-14 border border-slate-800 p-3 text-center">
                      رقم
                    </th>
                    <th className="w-48 border border-slate-800 p-3">
                      المهام اليومية
                    </th>
                    <th className="border border-slate-800 p-3">الوصف</th>
                    <th className="w-56 border border-slate-800 p-3">
                      الموظف المسؤول/المدير المباشر
                    </th>
                    <th className="w-36 border border-slate-800 p-3">
                      معدل الإنجاز
                    </th>
                    {!isReadOnly ? (
                      <th className="w-20 border border-slate-800 p-3 text-center">
                        حذف
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {form.tasks.map((task, index) => (
                    <tr
                      key={index}
                      className="align-top transition hover:bg-slate-50"
                    >
                      <td className="border border-slate-200 bg-slate-50/70 p-3 text-center font-semibold text-slate-700">
                        {index + 1}
                      </td>
                      <td className="border border-slate-200 p-2">
                        <Input
                          value={task.title}
                          onChange={event =>
                            updateTask(index, "title", event.target.value)
                          }
                          disabled={isReadOnly}
                          className="h-11 rounded-xl border-slate-200 bg-slate-50/70 text-right focus-visible:ring-[#F2B705]/35"
                        />
                      </td>
                      <td className="border border-slate-200 p-2">
                        <Textarea
                          value={task.description}
                          onChange={event =>
                            updateTask(index, "description", event.target.value)
                          }
                          disabled={isReadOnly}
                          className="min-h-[112px] resize-y rounded-xl border-slate-200 bg-slate-50/70 text-right leading-7 focus-visible:ring-[#F2B705]/35"
                        />
                      </td>
                      <td className="border border-slate-200 p-2">
                        <div className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-center text-sm font-semibold text-slate-800">
                          {WEEKLY_REPORT_DIRECT_MANAGER_NAME}
                        </div>
                      </td>
                      <td className="border border-slate-200 p-2">
                        <Input
                          value={task.progress}
                          onChange={event =>
                            updateTask(index, "progress", event.target.value)
                          }
                          placeholder="85٪"
                          disabled={isReadOnly}
                          className="h-11 rounded-xl border-slate-200 bg-slate-50/70 text-center focus-visible:ring-[#F2B705]/35"
                        />
                      </td>
                      {!isReadOnly ? (
                        <td className="border border-slate-200 p-2 text-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-full border-rose-200 bg-white text-rose-600 shadow-sm hover:bg-rose-50"
                            onClick={() => removeTask(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!isReadOnly ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-slate-200 bg-white px-5 shadow-sm hover:border-[#F2B705]/70 hover:bg-amber-50/60"
              onClick={addTask}
            >
              <Plus className="h-4 w-4" />
              إضافة مهمة
            </Button>
          ) : null}

          <label className="block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <span className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950">
              ملاحظات المدير المباشر
              <FileText className="h-4 w-4 text-slate-500" />
            </span>
            <Textarea
              value={form.managerNotes}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  managerNotes: event.target.value,
                }))
              }
              disabled={!canEditSelectedManagerNotes}
              placeholder={
                canWriteManagerNotes
                  ? "اكتب ملاحظة المدير المباشر على التقرير المحدد."
                  : "هذه الخانة مخصصة للمدير المباشر فقط."
              }
              className="min-h-[160px] resize-y rounded-none border-0 bg-white text-right leading-8 focus-visible:ring-0"
            />
            {!canWriteManagerNotes ? (
              <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                ملاحظات المدير لا يمكن تعديلها إلا من حساب يملك صلاحية كتابة
                ملاحظات التقرير الأسبوعي.
              </div>
            ) : !selectedReport?.id ? (
              <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                اختر تقريرًا مرسلًا من القائمة حتى تتمكن من كتابة ملاحظة المدير.
              </div>
            ) : null}
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <FileText className="h-4 w-4" />
              المستلم الثابت: {WEEKLY_REPORT_RECEIVER.displayName}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canReviewWeeklyReports && selectedReport?.status === "sent" ? (
                <>
                  <Button
                    type="button"
                    className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800"
                    onClick={() => void downloadCurrentReport(form)}
                  >
                    <Download className="h-4 w-4" />
                    تحميل Word
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full bg-emerald-600 px-5 text-white hover:bg-emerald-700"
                    onClick={() => void downloadCurrentReportExcel(form)}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    تحميل Excel
                  </Button>
                </>
              ) : null}
              {canEditSelectedManagerNotes ? (
                <Button
                  type="button"
                  className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800"
                  disabled={savingManagerNotes}
                  onClick={() => void saveManagerNotes()}
                >
                  <Save className="h-4 w-4" />
                  {savingManagerNotes
                    ? "جارٍ حفظ الملاحظة..."
                    : "حفظ ملاحظة المدير"}
                </Button>
              ) : null}
              {!(canReviewWeeklyReports && selectedReport?.status === "sent") ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-emerald-200 bg-emerald-50 px-5 text-emerald-700 shadow-sm hover:bg-emerald-100"
                  onClick={() => void downloadCurrentReportExcel(form)}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  تصدير Excel
                </Button>
              ) : null}

              {!isReadOnly ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white px-5 shadow-sm hover:bg-slate-50"
                    disabled={saving}
                    onClick={() => void saveReport("draft")}
                  >
                    <Save className="h-4 w-4" />
                    حفظ مسودة
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full bg-[#F2B705] px-5 text-slate-950 shadow-sm hover:bg-[#e0ab00]"
                    disabled={saving}
                    onClick={() => void saveReport("sent")}
                  >
                    <Send className="h-4 w-4" />
                    إرسال التقرير
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
