import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { CalendarCheck2, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { workforceApi, WorkforceApiError, type WorkforceLeave } from "./workforceClient";

type LeaveWithUsage = WorkforceLeave & {
  annual_used_days?: number | null;
  annual_reversal_days?: number | null;
};

type Props = {
  employeeId: string;
  onChanged?: () => void | Promise<void>;
};

const leaveLabels: Record<WorkforceLeave["leave_type"], { ar: string; en: string }> = {
  annual: { ar: "سنوية", en: "Annual" },
  sick: { ar: "مرضية", en: "Sick" },
  emergency: { ar: "طارئة", en: "Emergency" },
  unpaid: { ar: "بدون راتب", en: "Unpaid" },
  rest: { ar: "راحة معتمدة", en: "Approved Rest" },
  weekly_rest_substitute: { ar: "بديل راحة أسبوعية", en: "Weekly Rest Substitute" },
  other: { ar: "أخرى", en: "Other" },
};

function friendlyError(error: unknown, language: "ar" | "en") {
  const code = error instanceof WorkforceApiError ? error.code : String((error as { message?: unknown })?.message || "");
  const messages: Record<string, string> = {
    workforce_leave_not_found: tr(language, "لم يتم العثور على الإجازة.", "Leave record was not found."),
    workforce_leave_not_cancellable: tr(language, "حالة الإجازة الحالية لا تسمح بالإلغاء.", "The current leave status cannot be cancelled."),
    workforce_annual_leave_schedule_not_ready: tr(language, "تعذر احتساب الإجازة السنوية لأن جدول الدوام غير جاهز لكل الأيام.", "Annual leave cannot be calculated because the schedule is not ready for every day."),
    workforce_annual_leave_insufficient_balance: tr(language, "رصيد الإجازة السنوية غير كافٍ.", "Annual leave balance is insufficient."),
    workforce_annual_leave_no_chargeable_workday: tr(language, "الفترة لا تحتوي يوم عمل قابل للخصم.", "The period contains no chargeable work day."),
  };
  return messages[code] || code || tr(language, "تعذر إكمال العملية.", "Unable to complete the operation.");
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

export default function WorkforceLeaveLifecyclePanel({ employeeId, onChanged }: Props) {
  const { language } = useLanguage();
  const [leaves, setLeaves] = useState<LeaveWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await workforceApi<{ ok: true; leaves: LeaveWithUsage[] }>(
        `employees/${encodeURIComponent(employeeId)}/leaves`
      );
      setLeaves(payload.leaves || []);
    } catch (caught) {
      setError(friendlyError(caught, language));
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { void load(); }, [load]);

  async function cancelLeave(leave: LeaveWithUsage) {
    if (workingId) return;
    setWorkingId(leave.id);
    setError("");
    setMessage("");
    try {
      await workforceApi(`employees/${encodeURIComponent(employeeId)}/leaves/${encodeURIComponent(leave.id)}`, {
        method: "DELETE",
      });
      setMessage(leave.leave_type === "annual"
        ? tr(language, "تم إلغاء الإجازة وإرجاع الخصم السنوي المرتبط بها إن وجد.", "Leave cancelled and its annual balance deduction was reversed when applicable.")
        : tr(language, "تم إلغاء الإجازة.", "Leave cancelled."));
      await load();
      await onChanged?.();
    } catch (caught) {
      setError(friendlyError(caught, language));
    } finally {
      setWorkingId("");
    }
  }

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <CalendarCheck2 className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-black">{tr(language, "دورة الإجازة والخصم من الرصيد", "Leave Lifecycle & Balance Deduction")}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              {tr(language, "الإجازة السنوية المعتمدة تخصم فقط أيام العمل التي يحسمها Schedule Resolver. أيام الراحة الأسبوعية والإيقاف الاستثنائي لا تخصم من الرصيد، وإلغاء الإجازة ينشئ حركة عكسية قابلة للتدقيق بدل حذف الحركة القديمة.", "Approved annual leave deducts only the work days determined by the Schedule Resolver. Weekly rest and exceptional off days do not reduce the balance, and cancelling leave creates an auditable reversal instead of deleting the original transaction.")}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" /> {tr(language, "تحديث", "Refresh")}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="rounded-full"><ShieldCheck className="ml-1 h-3.5 w-3.5" /> {tr(language, "LEAVE_USED غير قابل للحذف", "LEAVE_USED cannot be deleted")}</Badge>
        <Badge variant="outline" className="rounded-full"><RotateCcw className="ml-1 h-3.5 w-3.5" /> {tr(language, "الإلغاء = LEAVE_REVERSAL", "Cancellation = LEAVE_REVERSAL")}</Badge>
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

      <div className="mt-5 overflow-x-auto">
        <Table className="min-w-[780px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{tr(language, "النوع", "Type")}</TableHead>
              <TableHead className="text-start">{tr(language, "الفترة", "Period")}</TableHead>
              <TableHead className="text-start">{tr(language, "الحالة", "Status")}</TableHead>
              <TableHead className="text-start">{tr(language, "خصم الرصيد", "Balance Deduction")}</TableHead>
              <TableHead className="text-start">{tr(language, "العكس", "Reversal")}</TableHead>
              <TableHead className="text-start">{tr(language, "الإجراء", "Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaves.map(leave => {
              const used = Math.abs(Number(leave.annual_used_days || 0));
              const reversed = Number(leave.annual_reversal_days || 0);
              return (
                <TableRow key={leave.id}>
                  <TableCell className="font-bold">{language === "ar" ? leaveLabels[leave.leave_type].ar : leaveLabels[leave.leave_type].en}</TableCell>
                  <TableCell>{dateText(leave.start_date)}{leave.end_date !== leave.start_date ? ` — ${dateText(leave.end_date)}` : ""}</TableCell>
                  <TableCell><Badge variant="outline" className="rounded-full">{leave.status === "approved" ? tr(language, "معتمدة", "Approved") : leave.status === "cancelled" ? tr(language, "ملغاة", "Cancelled") : leave.status}</Badge></TableCell>
                  <TableCell>{leave.leave_type === "annual" ? `${used.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tr(language, "يوم", "day")}` : "—"}</TableCell>
                  <TableCell>{leave.leave_type === "annual" && reversed > 0 ? `${reversed.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tr(language, "يوم", "day")}` : "—"}</TableCell>
                  <TableCell>
                    {leave.status === "approved" ? (
                      <Button type="button" variant="outline" className="rounded-xl" disabled={Boolean(workingId)} onClick={() => void cancelLeave(leave)}>
                        <RotateCcw className="h-4 w-4" /> {workingId === leave.id ? tr(language, "جارٍ الإلغاء...", "Cancelling...") : tr(language, "إلغاء", "Cancel")}
                      </Button>
                    ) : <span className="text-xs text-slate-400">{tr(language, "لا يوجد إجراء", "No Action")}</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!loading && !leaves.length ? <p className="py-8 text-center text-sm text-slate-500">{tr(language, "لا توجد إجازات مسجلة.", "No leave records.")}</p> : null}
      </div>
    </section>
  );
}
