import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

import { useLanguage } from "@/contexts/LanguageContext";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: string | number;
  onValueChange: (value: string) => void;
};

function normalizeNumericDraft(value: string) {
  let next = value
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٫,]/g, ".")
    .replace(/٬/g, "")
    .replace(/[^0-9.+-]/g, "");

  const sign = next.startsWith("-") ? "-" : next.startsWith("+") ? "+" : "";
  next = next.replace(/[+-]/g, "");

  const dotIndex = next.indexOf(".");
  if (dotIndex >= 0) {
    next = next.slice(0, dotIndex + 1) + next.slice(dotIndex + 1).replace(/./g, "");
  }

  return sign + next;
}

function isIncompleteNumber(value: string) {
  return value === "-" || value === "+" || value === "." || value === "-." || value === "+.";
}

export default function HabatNumberInput({
  value,
  onValueChange,
  className = "",
  inputMode = "decimal",
  onFocus,
  onBlur,
  ...props
}: Props) {
  const { language } = useLanguage();
  const externalValue = String(value ?? "");
  const [draft, setDraft] = useState(externalValue);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(externalValue === "NaN" ? "" : externalValue);
    }
  }, [externalValue]);

  return (
    <input
      {...props}
      type="text"
      inputMode={inputMode}
      lang="en-US"
      dir="ltr"
      value={draft}
      onFocus={event => {
        focusedRef.current = true;
        setDraft(externalValue === "NaN" ? "" : externalValue);
        onFocus?.(event);
      }}
      onChange={event => {
        const next = normalizeNumericDraft(event.target.value);
        setDraft(next);
        onValueChange(next);
      }}
      onBlur={event => {
        focusedRef.current = false;
        if (isIncompleteNumber(draft)) {
          setDraft("");
          onValueChange("");
        } else {
          onValueChange(draft);
        }
        onBlur?.(event);
      }}
      className={"h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 " + (language === "ar" ? "text-right" : "text-left") + " " + className}
    />
  );
}
