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
import { Download, FileText, Plus, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/_core/firebase";
import type { AppUser } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createInAppNotification } from "@/lib/inAppNotifications";
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
  managerName: "",
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
      managerName: cleanText(row.managerName),
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
  const [form, setForm] = useState<WeeklyReportFormState>(() =>
    buildInitialForm(user)
  );

  const isReceiver = user.uid === WEEKLY_REPORT_RECEIVER.uid;
  const selectedReport = useMemo(
    () =>
      [...ownReports, ...receivedReports].find(report => report.id === form.id) ||
      null,
    [form.id, ownReports, receivedReports]
  );
  const isReadOnly = selectedReport
    ? selectedReport.createdByUid !== user.uid || selectedReport.status === "sent"
    : false;
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
    if (!isReceiver) {
      setReceivedReports([]);
      setLoadingReceived(false);
      return;
    }

    setLoadingReceived(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, WEEKLY_REPORTS_COLLECTION),
        where("receiverUid", "==", user.uid),
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
  }, [isReceiver, user.uid]);

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
        managerName: cleanText(task.managerName),
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
          relatedPath: "/hr/messages",
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

  const downloadCurrentReport = async (report: WeeklyReportWordData) => {
    try {
      await downloadWeeklyReportWord(report);
    } catch (error) {
      console.error("weekly_report_word_download_failed", error);
      toast.error("تعذر تحميل ملف Word.");
    }
  };

  const renderReportList = (
    title: string,
    reports: WeeklyReportRecord[],
    loading: boolean,
    emptyText: string
  ) => (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <Badge variant="outline" className="bg-white text-slate-600">
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
              className="rounded-[16px] border border-slate-200 bg-white p-3 text-right"
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
                  onClick={() => setForm(toForm(report))}
                >
                  عرض التقرير
                </Button>
                {isReceiver && report.receiverUid === user.uid && report.status === "sent" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-slate-950 text-white hover:bg-slate-800"
                    onClick={() => void downloadCurrentReport(report)}
                  >
                    <Download className="h-4 w-4" />
                    تحميل Word
                  </Button>
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

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]" dir="rtl">
      <aside className="space-y-4">
        <Button
          type="button"
          className="h-11 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800"
          onClick={resetForm}
        >
          <Plus className="h-4 w-4" />
          تقرير جديد
        </Button>

        {isReceiver
          ? renderReportList(
              "التقارير المستلمة",
              sentReceivedReports,
              loadingReceived,
              "لا توجد تقارير مرسلة إلى شهد زيني حاليًا."
            )
          : null}

        {renderReportList(
          "سجل تقاريري",
          visibleOwnReports,
          loadingOwn,
          "لم يتم حفظ أي تقرير أسبوعي بعد."
        )}
      </aside>

      <div className="overflow-hidden rounded-[2px] border border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-300 px-5 py-4 text-center">
          <h2 className="text-2xl font-bold text-slate-950">
            نموذج تقرير عمل اسبوعي
          </h2>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid border border-slate-300 md:grid-cols-3">
            <label className="border-b border-slate-300 p-3 md:border-b-0 md:border-l">
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
                className="h-11 rounded-none border-slate-300 bg-white text-right"
              />
            </label>
            <label className="border-b border-slate-300 p-3 md:border-b-0 md:border-l">
              <span className="mb-2 block text-sm font-semibold text-slate-900">
                المسمى الوظيفي
              </span>
              <Input
                value={form.jobTitle}
                onChange={event =>
                  setForm(current => ({ ...current, jobTitle: event.target.value }))
                }
                disabled={isReadOnly}
                className="h-11 rounded-none border-slate-300 bg-white text-right"
              />
            </label>
            <label className="p-3">
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
                className="h-11 rounded-none border-slate-300 bg-white text-right"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full border-collapse text-right">
              <thead>
                <tr className="bg-slate-100 text-sm text-slate-950">
                  <th className="w-14 border border-slate-300 p-3 text-center">
                    رقم
                  </th>
                  <th className="w-48 border border-slate-300 p-3">
                    المهام اليومية
                  </th>
                  <th className="border border-slate-300 p-3">الوصف</th>
                  <th className="w-56 border border-slate-300 p-3">
                    الموظف المسؤول/المدير المباشر
                  </th>
                  <th className="w-36 border border-slate-300 p-3">
                    معدل الإنجاز
                  </th>
                  {!isReadOnly ? (
                    <th className="w-20 border border-slate-300 p-3 text-center">
                      حذف
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {form.tasks.map((task, index) => (
                  <tr key={index} className="align-top">
                    <td className="border border-slate-300 p-3 text-center font-semibold">
                      {index + 1}
                    </td>
                    <td className="border border-slate-300 p-2">
                      <Input
                        value={task.title}
                        onChange={event =>
                          updateTask(index, "title", event.target.value)
                        }
                        disabled={isReadOnly}
                        className="h-11 rounded-none border-slate-300 text-right"
                      />
                    </td>
                    <td className="border border-slate-300 p-2">
                      <Textarea
                        value={task.description}
                        onChange={event =>
                          updateTask(index, "description", event.target.value)
                        }
                        disabled={isReadOnly}
                        className="min-h-[112px] resize-y rounded-none border-slate-300 text-right leading-7"
                      />
                    </td>
                    <td className="border border-slate-300 p-2">
                      <Input
                        value={task.managerName}
                        onChange={event =>
                          updateTask(index, "managerName", event.target.value)
                        }
                        disabled={isReadOnly}
                        className="h-11 rounded-none border-slate-300 text-right"
                      />
                    </td>
                    <td className="border border-slate-300 p-2">
                      <Input
                        value={task.progress}
                        onChange={event =>
                          updateTask(index, "progress", event.target.value)
                        }
                        placeholder="85٪"
                        disabled={isReadOnly}
                        className="h-11 rounded-none border-slate-300 text-right"
                      />
                    </td>
                    {!isReadOnly ? (
                      <td className="border border-slate-300 p-2 text-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 border-rose-200 text-rose-600 hover:bg-rose-50"
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

          {!isReadOnly ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-slate-300 bg-white"
              onClick={addTask}
            >
              <Plus className="h-4 w-4" />
              إضافة مهمة
            </Button>
          ) : null}

          <label className="block">
            <span className="mb-2 block border border-slate-300 bg-slate-100 p-3 text-sm font-semibold text-slate-950">
              ملاحظات المدير المباشر
            </span>
            <Textarea
              value={form.managerNotes}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  managerNotes: event.target.value,
                }))
              }
              disabled={isReadOnly}
              className="min-h-[150px] rounded-none border-slate-300 text-right leading-8"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <FileText className="h-4 w-4" />
              المستلم الثابت: {WEEKLY_REPORT_RECEIVER.displayName}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {isReceiver && selectedReport?.receiverUid === user.uid ? (
                <Button
                  type="button"
                  className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  onClick={() => void downloadCurrentReport(form)}
                >
                  <Download className="h-4 w-4" />
                  تحميل Word
                </Button>
              ) : null}

              {!isReadOnly ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-slate-300 bg-white"
                    disabled={saving}
                    onClick={() => void saveReport("draft")}
                  >
                    <Save className="h-4 w-4" />
                    حفظ مسودة
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
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
