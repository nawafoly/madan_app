import { useEffect, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
};

type Meridiem = "AM" | "PM";

function latinDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function normalizeMinute(value: string) {
  const digits = latinDigits(value).replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  return String(Math.min(Number(digits), 59)).padStart(2, "0");
}

function normalizeHour12(value: string) {
  const digits = latinDigits(value).replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  return String(Math.min(Math.max(Number(digits), 1), 12)).padStart(2, "0");
}

export function parseHabatTime(value: string) {
  if (!value) {
    return {
      hour: "",
      minute: "",
      meridiem: "AM" as Meridiem,
    };
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  const rawHour = match ? Number(match[1]) : 0;
  const rawMinute = match ? Number(match[2]) : 0;

  const hour24 = Math.min(Math.max(rawHour, 0), 23);
  const minute = Math.min(Math.max(rawMinute, 0), 59);

  return {
    hour: String(hour24 % 12 || 12).padStart(2, "0"),
    minute: String(minute).padStart(2, "0"),
    meridiem: (hour24 >= 12 ? "PM" : "AM") as Meridiem,
  };
}

export function toHabat24HourTime(
  hour: string,
  minute: string,
  meridiem: Meridiem
) {
  const hour12 = Math.min(Math.max(Number(hour) || 12, 1), 12);
  const normalizedMinute = Math.min(Math.max(Number(minute) || 0, 0), 59);

  let hour24 = hour12 % 12;
  if (meridiem === "PM") hour24 += 12;

  return `${String(hour24).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`;
}

export function formatHabatClockTime(
  value: string | null | undefined
) {
  if (!value) return "--";

  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return value;

  const hour24 = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour24 < 0 ||
    hour24 > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return value;
  }

  const hour12 = hour24 % 12 || 12;
  const meridiem = hour24 >= 12 ? "PM" : "AM";

  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

export function formatHabatShiftRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined
) {
  if (!startTime || !endTime) return "--";

  return `${formatHabatClockTime(startTime)} — ${formatHabatClockTime(endTime)}`;
}

export default function HabatTimeInput({
  value,
  onChange,
  className = "",
  required = false,
}: Props) {
  const parsed = parseHabatTime(value);

  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [meridiem, setMeridiem] = useState<Meridiem>(parsed.meridiem);

  useEffect(() => {
    const next = parseHabatTime(value);
    setHour(next.hour);
    setMinute(next.minute);
    setMeridiem(next.meridiem);
  }, [value]);

  function commit(
    nextHour = hour,
    nextMinute = minute,
    nextMeridiem = meridiem
  ) {
    if (!required && !nextHour && !nextMinute) {
      setHour("");
      setMinute("");
      setMeridiem(nextMeridiem);
      onChange("");
      return;
    }

    const h = normalizeHour12(nextHour || "12");
    const m = normalizeMinute(nextMinute || "0");

    setHour(h);
    setMinute(m);
    setMeridiem(nextMeridiem);

    onChange(toHabat24HourTime(h, m, nextMeridiem));
  }

  return (
    <div
      dir="ltr"
      className={`flex h-11 w-full items-center rounded-2xl border border-slate-200 bg-white px-2 transition hover:border-slate-300 focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100 ${className}`}
    >
      <input
        aria-label="Hour"
        inputMode="numeric"
        lang="en-US"
        dir="ltr"
        value={hour}
        placeholder="12"
        maxLength={2}
        required={required}
        onChange={event => {
          setHour(
            latinDigits(event.target.value)
              .replace(/\D/g, "")
              .slice(0, 2)
          );
        }}
        onBlur={() => commit()}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-sm font-semibold text-slate-950 outline-none"
      />

      <span className="px-1 font-bold text-slate-400">:</span>

      <input
        aria-label="Minute"
        inputMode="numeric"
        lang="en-US"
        dir="ltr"
        value={minute}
        placeholder="00"
        maxLength={2}
        required={required}
        onChange={event => {
          setMinute(
            latinDigits(event.target.value)
              .replace(/\D/g, "")
              .slice(0, 2)
          );
        }}
        onBlur={() => commit()}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-sm font-semibold text-slate-950 outline-none"
      />

      <select
        aria-label="AM or PM"
        value={meridiem}
        onChange={event => {
          const next = event.target.value as Meridiem;
          setMeridiem(next);
          commit(hour, minute, next);
        }}
        className="h-8 rounded-lg border-0 bg-slate-100 px-2 text-xs font-black text-slate-800 outline-none"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}