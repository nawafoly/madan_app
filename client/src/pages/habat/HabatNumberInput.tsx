import { useLanguage } from "@/contexts/LanguageContext";
import type { InputHTMLAttributes } from "react";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: string | number;
  onValueChange: (value: string) => void;
};

function latinDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

export default function HabatNumberInput({
  value,
  onValueChange,
  className = "",
  inputMode = "decimal",
  ...props
}: Props) {
  const { language } = useLanguage();
  return (
    <input
      {...props}
      type="text"
      inputMode={inputMode}
      lang="en-US"
      dir="ltr"
      value={String(value ?? "")}
      onChange={event => {
        let next = latinDigits(event.target.value);

        next = next.replace(/[^0-9.+-]/g, "");

        const minus = next.startsWith("-");
        next = next.replace(/-/g, "");
        if (minus) next = `-${next}`;

        const parts = next.split(".");
        if (parts.length > 1) {
          next = `${parts.shift()}.${parts.join("")}`;
        }

        onValueChange(next);
      }}
      className={`h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 ${language === "ar" ? "text-right" : "text-left"} ${className}`}
    />
  );
}
