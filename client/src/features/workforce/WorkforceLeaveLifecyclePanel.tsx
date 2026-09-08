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

const leaveLabels: Record<WorkforceLeave["leave_type"], string> = {
  annual: "سنوية",
  sick: "مرضية",
  emergency: "طارئة",
  unpaid: "بدون راتب",
  rest: "راحة معتمدة",
  weekly_rest_substitute: "بديل راحة أسبوعية",
  other: "أخرى",
};

function friendlyError(error: unknown) {
  const code = error instanceof WorkforceApiError ? error.code : String((error as { message?: unknown })?.message || "");
  const messages: Record<string, string> = {
    workforce_leave_not_found: "لم يتم العثور على الإجازة.",
    workforce_leave_not_cancellable: "حالة الإجازة الحالية لا تسمح بالإلغاء.",
    workforce_annual_leave_schedule_not_ready: "تعذر احتساب الإجازة السنوية لأن جدول الدوام غير جاهز لكل الأيام.",
    workforce_annual_leave_insufficient_balance: "رصيد الإجازة السنوية غير كافٍ.",
    workforce_annual_leave_no_chargeable_workday: "الفترة لا تحتوي يوم عمل قابل للخصم.",
  };
  return messages[code] || code || "تعذر إكمال العملية.";
}

function dateText(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

export default function WorkforceLeaveLifecyclePanel({ employeeId, onChanged }: Props) {
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
      setError(friendlyError(caught));
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
        ? "تم إلغاء الإجازة وإرجاع الخصم السنوي المرتبط بها إن وجد."
        : "تم إلغاء الإجازة.");
      await load();
      await onChanged?.();
    } catch (caught) {
      setError(friendlyError(caught));
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
            <h3 className="font-black">دورة الإجازة والخصم من الرصيد</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              الإجازة السنوية المعتمدة تخصم فقط أيام العمل التي يحسمها Schedule Resolver. أيام الراحة الأسبوعية والإيقاف الاستثنائي لا تخصم من الرصيد، وإلغاء الإجازة ينشئ حركة عكسية قابلة للتدقيق بدل حذف الحركة القديمة.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" /> تحديث
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="rounded-full"><ShieldCheck className="ml-1 h-3.5 w-3.5" /> LEAVE_USED غير قابل للحذف</Badge>
        <Badge variant="outline" className="rounded-full"><RotateCcw className="ml-1 h-3.5 w-3.5" /> الإلغاء = LEAVE_REVERSAL</Badge>
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}

      <div className="mt-5 overflow-x-auto">
        <Table className="min-w-[780px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">النوع</TableHead>
              <TableHead className="text-right">الفترة</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">خصم الرصيد</TableHead>
              <TableHead className="text-right">العكس</TableHead>
              <TableHead className="text-right">الإجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaves.map(leave => {
              const used = Math.abs(Number(leave.annual_used_days || 0));
              const reversed = Number(leave.annual_reversal_days || 0);
              return (
                <TableRow key={leave.id}>
                  <TableCell className="font-bold">{leaveLabels[leave.leave_type]}</TableCell>
                  <TableCell>{dateText(leave.start_date)}{leave.end_date !== leave.start_date ? ` — ${dateText(leave.end_date)}` : ""}</TableCell>
                  <TableCell><Badge variant="outline" className="rounded-full">{leave.status === "approved" ? "معتمدة" : leave.status === "cancelled" ? "ملغاة" : leave.status}</Badge></TableCell>
                  <TableCell>{leave.leave_type === "annual" ? `${used.toLocaleString("en-US", { maximumFractionDigits: 4 })} يوم` : "—"}</TableCell>
                  <TableCell>{leave.leave_type === "annual" && reversed > 0 ? `${reversed.toLocaleString("en-US", { maximumFractionDigits: 4 })} يوم` : "—"}</TableCell>
                  <TableCell>
                    {leave.status === "approved" ? (
                      <Button type="button" variant="outline" className="rounded-xl" disabled={Boolean(workingId)} onClick={() => void cancelLeave(leave)}>
                        <RotateCcw className="h-4 w-4" /> {workingId === leave.id ? "جارٍ الإلغاء..." : "إلغاء"}
                      </Button>
                    ) : <span className="text-xs text-slate-400">لا يوجد إجراء</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!loading && !leaves.length ? <p className="py-8 text-center text-sm text-slate-500">لا توجد إجازات مسجلة.</p> : null}
      </div>
    </section>
  );
}
