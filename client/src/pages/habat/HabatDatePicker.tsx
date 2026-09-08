import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type PickerMode = "date" | "month" | "datetime";

type HabatDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  mode?: PickerMode;
};

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const AR_DAYS = ["أحد", "اثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function timeKey(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseValue(value: string, mode: PickerMode) {
  if (!value) return null;

  const datePart =
    mode === "month"
      ? `${value}-01`
      : value.slice(0, 10);

  const [year, month, day] = datePart.split("-").map(Number);

  if (
    !year ||
    !month ||
    !day ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  let hour = 0;
  let minute = 0;

  if (mode === "datetime") {
    const timePart = value.includes("T") ? value.split("T")[1] || "" : "";
    const [parsedHour, parsedMinute] = timePart.split(":").map(Number);

    hour = Number.isFinite(parsedHour) ? parsedHour : 0;
    minute = Number.isFinite(parsedMinute) ? parsedMinute : 0;
  }

  return {
    year,
    month: month - 1,
    day,
    hour,
    minute,
  };
}

export default function HabatDatePicker({
  value,
  onChange,
  className = "",
  mode = "date",
}: HabatDatePickerProps) {
  const { language } = useLanguage();
  const months = language === "ar" ? AR_MONTHS : EN_MONTHS;
  const daysOfWeek = language === "ar" ? AR_DAYS : EN_DAYS;

  const selected = parseValue(value, mode);

  const initial = selected ?? (() => {
    const now = new Date();

    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
    };
  })();

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({
    top: 0,
    left: 16,
    width: 310,
  });

  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);
  const [draftDay, setDraftDay] = useState(initial.day);
  const [draftHour, setDraftHour] = useState(initial.hour);
  const [draftMinute, setDraftMinute] = useState(initial.minute);

  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const count = new Date(viewYear, viewMonth + 1, 0).getDate();

    return [
      ...Array.from({ length: firstDay }, () => null),
      ...Array.from({ length: count }, (_, index) => index + 1),
    ];
  }, [viewYear, viewMonth]);

  function updatePopoverPosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 8;
    const edge = 16;

    const width = Math.min(310, viewportWidth - edge * 2);
    const measuredHeight = popoverRef.current?.offsetHeight ?? 390;

    const spaceBelow = viewportHeight - rect.bottom - gap - edge;
    const spaceAbove = rect.top - gap - edge;

    const openAbove =
      measuredHeight > spaceBelow && spaceAbove > spaceBelow;

    const desiredTop = openAbove
      ? rect.top - gap - measuredHeight
      : rect.bottom + gap;

    const top = Math.max(
      edge,
      Math.min(desiredTop, viewportHeight - measuredHeight - edge),
    );

    const centeredLeft = rect.left + rect.width / 2 - width / 2;
    const left = Math.max(
      edge,
      Math.min(centeredLeft, viewportWidth - width - edge),
    );

    setPopoverPosition({ top, left, width });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverPosition();
  }, [open, mode, viewYear, viewMonth]);

  useEffect(() => {
    if (!open) return;

    const handleResize = () => updatePopoverPosition();
    const handleScroll = () => setOpen(false);

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  function moveMonth(amount: number) {
    const next = new Date(viewYear, viewMonth + amount, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function openPicker() {
    const current = parseValue(value, mode);

    if (current) {
      setViewYear(current.year);
      setViewMonth(current.month);
      setDraftDay(current.day);
      setDraftHour(current.hour);
      setDraftMinute(current.minute);
    } else {
      const now = new Date();
      setViewYear(now.getFullYear());
      setViewMonth(now.getMonth());
      setDraftDay(now.getDate());
      setDraftHour(now.getHours());
      setDraftMinute(now.getMinutes());
    }

    setOpen(currentOpen => !currentOpen);
  }

  function chooseDate(day: number) {
    if (mode === "datetime") {
      setDraftDay(day);
      return;
    }

    onChange(dateKey(viewYear, viewMonth, day));
    setOpen(false);
  }

  function saveDateTime() {
    const date = dateKey(viewYear, viewMonth, draftDay);
    const time = timeKey(draftHour, draftMinute);
    onChange(`${date}T${time}`);
    setOpen(false);
  }

  const displayValue = selected
    ? mode === "month"
      ? `${months[selected.month]} ${selected.year}`
      : mode === "datetime"
        ? `${selected.day} ${months[selected.month]} ${selected.year} · ${timeKey(selected.hour, selected.minute)}`
        : `${selected.day} ${months[selected.month]} ${selected.year}`
    : mode === "month"
      ? "اختر الشهر"
      : mode === "datetime"
        ? "اختر التاريخ والوقت"
        : "اختر التاريخ";

  return (
    <div className={`relative ${className}`} dir={languageDir(language)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition hover:border-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
      >
        <span>{displayValue}</span>

        {mode === "datetime" ? (
          <Clock3 className="h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
        )}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label={tr(language, "السنة السابقة", "Previous year")}
            className="fixed inset-0 z-[60] cursor-default"
            onClick={() => setOpen(false)}
          />

          <div
            ref={popoverRef}
            className="fixed z-[70] max-h-[calc(100vh-32px)] overflow-y-auto rounded-[22px] border border-slate-200 bg-white p-4 shadow-xl"
            style={{
              top: popoverPosition.top,
              left: popoverPosition.left,
              width: popoverPosition.width,
            }}
          >
            {mode === "month" ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label={tr(language, "السنة السابقة", "Previous year")}
                    onClick={() => setViewYear(year => year + 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>

                  <div className="font-black">{viewYear}</div>

                  <button
                    type="button"
                    aria-label={tr(language, "السنة السابقة", "Previous year")}
                    onClick={() => setViewYear(year => year - 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {MONTHS.map((month, index) => {
                    const key = monthKey(viewYear, index);
                    const active = key === value;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          onChange(key);
                          setViewMonth(index);
                          setOpen(false);
                        }}
                        className={`h-11 rounded-xl text-sm font-bold transition ${
                          active
                            ? "bg-black text-white"
                            : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {month}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    onChange(monthKey(now.getFullYear(), now.getMonth()));
                    setViewYear(now.getFullYear());
                    setViewMonth(now.getMonth());
                    setOpen(false);
                  }}
                  className="mt-3 h-9 w-full rounded-xl bg-slate-50 text-xs font-bold hover:bg-slate-100"
                >
                  هذا الشهر
                </button>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label={tr(language, "الشهر السابق", "Previous month")}
                    onClick={() => moveMonth(1)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>

                  <div className="font-black">
                    {months[viewMonth]} {viewYear}
                  </div>

                  <button
                    type="button"
                    aria-label={tr(language, "الشهر السابق", "Previous month")}
                    onClick={() => moveMonth(-1)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {daysOfWeek.map(day => (
                    <div
                      key={day}
                      className="py-2 text-center text-[11px] font-bold text-slate-400"
                    >
                      {day}
                    </div>
                  ))}

                  {days.map((day, index) => {
                    if (!day) return <div key={`blank-${index}`} />;

                    const key = dateKey(viewYear, viewMonth, day);

                    const active =
                      mode === "datetime"
                        ? selected?.year === viewYear &&
                          selected?.month === viewMonth &&
                          selected?.day === day
                        : key === value;

                    const draftActive =
                      mode === "datetime" &&
                      viewYear === (selected?.year ?? viewYear) &&
                      viewMonth === (selected?.month ?? viewMonth) &&
                      draftDay === day;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => chooseDate(day)}
                        className={`flex aspect-square items-center justify-center rounded-xl text-sm font-bold transition ${
                          draftActive || active
                            ? "bg-black text-white"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                {mode === "datetime" ? (
                  <>
                    <div className="my-4 h-px bg-slate-100" />

                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 shrink-0 text-slate-400" />

                      <select
                        aria-label={tr(language, "الساعة", "Hour")}
                        value={draftHour}
                        onChange={event => setDraftHour(Number(event.target.value))}
                        className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-bold outline-none focus:border-slate-400"
                      >
                        {Array.from({ length: 24 }, (_, hour) => (
                          <option key={hour} value={hour}>
                            {String(hour).padStart(2, "0")}
                          </option>
                        ))}
                      </select>

                      <span className="font-black text-slate-400">:</span>

                      <select
                        aria-label={tr(language, "الدقيقة", "Minute")}
                        value={draftMinute}
                        onChange={event => setDraftMinute(Number(event.target.value))}
                        className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm font-bold outline-none focus:border-slate-400"
                      >
                        {Array.from({ length: 60 }, (_, minute) => (
                          <option key={minute} value={minute}>
                            {String(minute).padStart(2, "0")}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={saveDateTime}
                      className="mt-3 h-10 w-full rounded-xl bg-black text-sm font-bold text-white hover:bg-slate-800"
                    >
                      اعتماد التاريخ والوقت
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      onChange(dateKey(now.getFullYear(), now.getMonth(), now.getDate()));
                      setViewYear(now.getFullYear());
                      setViewMonth(now.getMonth());
                      setOpen(false);
                    }}
                    className="mt-3 h-9 w-full rounded-xl bg-slate-50 text-xs font-bold hover:bg-slate-100"
                  >
                    اليوم
                  </button>
                )}
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
