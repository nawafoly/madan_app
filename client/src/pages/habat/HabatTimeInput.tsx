import { useEffect, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
};

function latinDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function normalizePart(value: string, max: number) {
  const digits = latinDigits(value).replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  return String(Math.min(Number(digits), max)).padStart(2, "0");
}

function parse(value: string) {
  const [hour = "", minute = ""] = value.split(":");
  return {
    hour: hour ? normalizePart(hour, 23) : "",
    minute: minute ? normalizePart(minute, 59) : "",
  };
}

export default function HabatTimeInput({
  value,
  onChange,
  className = "",
  required = false,
}: Props) {
  const parsed = parse(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);

  useEffect(() => {
    const next = parse(value);
    setHour(next.hour);
    setMinute(next.minute);
  }, [value]);

  function commit(nextHour = hour, nextMinute = minute) {
    const h = normalizePart(nextHour || "0", 23);
    const m = normalizePart(nextMinute || "0", 59);

    setHour(h);
    setMinute(m);
    onChange(`${h}:${m}`);
  }

  return (
    <div
      dir="ltr"
      className={`flex h-11 w-full items-center rounded-2xl border border-slate-200 bg-white px-3 transition hover:border-slate-300 focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100 ${className}`}
    >
      <input
        aria-label="Hour"
        inputMode="numeric"
        lang="en-US"
        dir="ltr"
        value={hour}
        placeholder="00"
        maxLength={2}
        required={required}
        onChange={event => {
          const next = latinDigits(event.target.value)
            .replace(/\D/g, "")
            .slice(0, 2);
          setHour(next);
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
          const next = latinDigits(event.target.value)
            .replace(/\D/g, "")
            .slice(0, 2);
          setMinute(next);
        }}
        onBlur={() => commit()}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-sm font-semibold text-slate-950 outline-none"
      />
    </div>
  );
}
