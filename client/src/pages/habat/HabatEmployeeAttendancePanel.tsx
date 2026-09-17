import { Edit3, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { tr } from "@/lib/i18n";

import HabatDatePicker from "./HabatDatePicker";
import HabatTimeInput from "./HabatTimeInput";
import {
  friendlyHabatError,
  fromRiyadhDateTimeLocal,
  habatApi,
  statusLabel,
  todayRiyadhKey,
  type HabatAccessAccount,
  type HabatRecord,
} from "./habatAttendanceClient";
import { useHabatRealtimeRefresh } from "./habatRealtimeClient";

type MonthWorkspace = {
  ok: true;
  month: string;
  records: HabatRecord[];
  workforceReady?: boolean;
};

type PunchMode = "both" | "check_in" | "check_out";

type EditorState = {
  mode: "create" | "edit";
  record: HabatRecord | null;
  date: string;
  punchMode: PunchMode;
  checkIn: string;
  checkOut: string;
  reason: string;
};

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(year, monthNumber, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function timeValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function errorText(error: unknown, language: "ar" | "en") {
  const code = String((error as { code?: unknown; message?: unknown })?.code || (error as { message?: unknown })?.message || "");
  if (code === "habat_attendance_record_already_exists") {
    return tr(language, "يوجد سجل حضور لهذا اليوم بالفعل.", "An attendance record already exists for this day.");
  }
  if (code === "habat_attendance_punch_required") {
    return tr(language, "حدد حضورًا أو انصرافًا واحدًا على الأقل.", "Provide at least one attendance punch.");
  }
  return friendlyHabatError(error);
}

export default function HabatEmployeeAttendancePanel({ access }: { access: HabatAccessAccount }) {
  const { language } = useLanguage();
  const today = todayRiyadhKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [records, setRecords] = useState<HabatRecord[]>([]);
  const [workforceReady, setWorkforceReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ month, accessId: access.id });
      const payload = await habatApi<MonthWorkspace>(`v3/month?${params.toString()}`);
      setRecords(payload.records || []);
      setWorkforceReady(payload.workforceReady !== false);
    } catch (caught) {
      setError(errorText(caught, language));
    } finally {
      setLoading(false);
    }
  }, [access.id, language, month]);

  useEffect(() => { void refresh(); }, [refresh]);
  useHabatRealtimeRefresh(refresh);

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate)),
    [records]
  );

  function openCreate() {
    const range = monthRange(month);
    const date = today >= range.from && today <= range.to ? today : range.from;
    setEditor({
      mode: "create",
      record: null,
      date,
      punchMode: "both",
      checkIn: "",
      checkOut: "",
      reason: "",
    });
  }

  function openEdit(record: HabatRecord) {
    setEditor({
      mode: "edit",
      record,
      date: record.attendanceDate,
      punchMode: "both",
      checkIn: timeValue(record.checkInAt),
      checkOut: timeValue(record.checkOutAt),
      reason: "",
    });
  }

  async function saveEditor(event: FormEvent) {
    event.preventDefault();
    if (!editor || saving) return;
    const checkInAt = editor.punchMode === "check_out" || !editor.checkIn
      ? null
      : fromRiyadhDateTimeLocal(`${editor.date}T${editor.checkIn}`);
    const checkOutAt = editor.punchMode === "check_in" || !editor.checkOut
      ? null
      : fromRiyadhDateTimeLocal(`${editor.date}T${editor.checkOut}`);
    if (!checkInAt && !checkOutAt) {
      setError(tr(language, "حدد حضورًا أو انصرافًا واحدًا على الأقل.", "Provide at least one attendance punch."));
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (editor.mode === "create") {
        await habatApi("v3/records/manual", {
          method: "POST",
          body: JSON.stringify({
            accessId: access.id,
            date: editor.date,
            checkInAt,
            checkOutAt,
            reason: editor.reason,
          }),
        });
      } else if (editor.record) {
        await habatApi(`v3/records/${encodeURIComponent(editor.record.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ checkInAt, checkOutAt, reason: editor.reason }),
        });
      }
      setEditor(null);
      await refresh();
    } catch (caught) {
      setError(errorText(caught, language));
    } finally {
      setSaving(false);
    }
  }

  async function remove(record: HabatRecord) {
    if (!window.confirm(tr(language, `مسح بصمة ${formatDate(record.attendanceDate)}؟`, `Delete attendance for ${formatDate(record.attendanceDate)}?`))) return;
    setError("");
    try {
      await habatApi(`v3/records/${encodeURIComponent(record.id)}`, { method: "DELETE" });
      await refresh();
    } catch (caught) {
      setError(errorText(caught, language));
    }
  }

  return (
    <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-lg font-black">{tr(language, "سجل الحضور والانصراف", "Attendance Records")}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {tr(language, "هذه البيانات من Attendance Core نفسه ويمكن تعديلها من ملف الموظف أو سجل الحضور.", "These records come from the same Attendance Core and can be edited here or from Attendance Records.")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44 space-y-1.5">
            <Label>{tr(language, "الشهر", "Month")}</Label>
            <HabatDatePicker mode="month" value={month} onChange={setMonth} />
          </div>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {tr(language, "تحديث", "Refresh")}
          </Button>
          <Button type="button" className="rounded-xl bg-black" onClick={openCreate}>
            <Plus className="h-4 w-4" /> {tr(language, "إضافة بصمة", "Add Attendance")}
          </Button>
        </div>
      </div>

      {!workforceReady ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {tr(language, "سجلات البصمة ظاهرة، لكن ربط Workforce Day State لهذا الموظف يحتاج مراجعة.", "Attendance records are visible, but this employee's Workforce Day State link needs review.")}
        </p>
      ) : null}

      {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <Table className="min-w-[760px]">
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-start">{tr(language, "التاريخ", "Date")}</TableHead>
              <TableHead className="text-start">{tr(language, "الحالة", "Status")}</TableHead>
              <TableHead className="text-start">{tr(language, "الحضور", "Clock In")}</TableHead>
              <TableHead className="text-start">{tr(language, "الانصراف", "Clock Out")}</TableHead>
              <TableHead className="text-start">{tr(language, "الإجراءات", "Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRecords.map(record => (
              <TableRow key={record.id}>
                <TableCell className="font-bold">{formatDate(record.attendanceDate)}</TableCell>
                <TableCell><Badge variant="outline" className="rounded-full">{statusLabel(record.attendanceStatus)}</Badge></TableCell>
                <TableCell>{formatTime(record.checkInAt)}</TableCell>
                <TableCell>{formatTime(record.checkOutAt)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => openEdit(record)}>
                      <Edit3 className="h-4 w-4" /> {tr(language, "تعديل", "Edit")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-lg text-red-700" onClick={() => void remove(record)}>
                      <Trash2 className="h-4 w-4" /> {tr(language, "حذف", "Delete")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && !sortedRecords.length ? (
          <p className="py-10 text-center text-sm text-slate-500">{tr(language, "لا توجد بصمات لهذا الشهر.", "No attendance records for this month.")}</p>
        ) : null}
      </div>

      <Dialog open={Boolean(editor)} onOpenChange={open => !open && setEditor(null)}>
        <DialogContent className={language === "ar" ? "rounded-[28px] text-right sm:max-w-lg" : "rounded-[28px] text-left sm:max-w-lg"}>
          <DialogHeader className={language === "ar" ? "text-right" : "text-left"}>
            <DialogTitle>{editor?.mode === "create" ? tr(language, "إضافة بصمة", "Add Attendance") : tr(language, "تعديل البصمة", "Edit Attendance")}</DialogTitle>
            <DialogDescription>{access.displayName || access.email}</DialogDescription>
          </DialogHeader>
          {editor ? (
            <form onSubmit={saveEditor} className="space-y-4">
              {editor.mode === "create" ? (
                <>
                  <div className="space-y-2"><Label>{tr(language, "التاريخ", "Date")}</Label><HabatDatePicker value={editor.date} onChange={date => setEditor(current => current ? { ...current, date } : current)} /></div>
                  <div className="space-y-2">
                    <Label>{tr(language, "نوع البصمة", "Punch Type")}</Label>
                    <Select value={editor.punchMode} onValueChange={value => setEditor(current => current ? { ...current, punchMode: value as PunchMode } : current)}>
                      <SelectTrigger className="h-11 w-full rounded-2xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">{tr(language, "حضور وانصراف", "Clock In & Out")}</SelectItem>
                        <SelectItem value="check_in">{tr(language, "حضور فقط", "Clock In Only")}</SelectItem>
                        <SelectItem value="check_out">{tr(language, "انصراف فقط", "Clock Out Only")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
              {(editor.mode === "edit" || editor.punchMode !== "check_out") ? (
                <div className="space-y-2"><Label>{tr(language, "وقت الحضور", "Clock-in Time")}</Label><HabatTimeInput value={editor.checkIn} onChange={checkIn => setEditor(current => current ? { ...current, checkIn } : current)} className="h-11 rounded-2xl" /></div>
              ) : null}
              {(editor.mode === "edit" || editor.punchMode !== "check_in") ? (
                <div className="space-y-2"><Label>{tr(language, "وقت الانصراف", "Clock-out Time")}</Label><HabatTimeInput value={editor.checkOut} onChange={checkOut => setEditor(current => current ? { ...current, checkOut } : current)} className="h-11 rounded-2xl" /></div>
              ) : null}
              <div className="space-y-2"><Label>{tr(language, "سبب التعديل", "Reason")}</Label><Textarea value={editor.reason} onChange={event => setEditor(current => current ? { ...current, reason: event.target.value } : current)} className="min-h-20 rounded-2xl" required /></div>
              <DialogFooter className="gap-2 sm:justify-start">
                <Button type="submit" disabled={saving || editor.reason.trim().length < 3} className="rounded-xl bg-black"><Save className="h-4 w-4" /> {tr(language, "حفظ", "Save")}</Button>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditor(null)}>{tr(language, "إلغاء", "Cancel")}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
