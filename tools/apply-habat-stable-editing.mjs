import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceOnce(source, anchor, replacement, label) {
  if (!source.includes(anchor)) {
    throw new Error(`Missing patch anchor: ${label}`);
  }
  return source.replace(anchor, replacement);
}

// 1) Numeric editing: keep a local text draft while the field is focused.
// This prevents parent numeric coercion/clamping from moving the caret or
// rewriting the value after every keystroke.
const numberInputPath = "client/src/pages/habat/HabatNumberInput.tsx";
write(numberInputPath, `import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

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
    next = next.slice(0, dotIndex + 1) + next.slice(dotIndex + 1).replace(/\./g, "");
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
      className={\`h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 \\${language === "ar" ? "text-right" : "text-left"} \\${className}\`}
    />
  );
}
`);

// 2) Realtime: never refresh the current screen for the same browser tab's
// own mutation. Other devices/tabs still receive realtime updates normally.
const realtimePath = "client/src/pages/habat/habatRealtimeClient.ts";
let realtime = read(realtimePath);
realtime = replaceOnce(
  realtime,
  `    const unsubscribe = subscribeHabatRealtime(() => {\n      if (running) {`,
  `    const unsubscribe = subscribeHabatRealtime(event => {\n      const ownClientId = getHabatRealtimeClientId();\n      if (event.sourceClientId && event.sourceClientId === ownClientId) {\n        return;\n      }\n\n      if (running) {`,
  "ignore same-client realtime mutation"
);
write(realtimePath, realtime);

// 3) Realtime updates must not remount the active page. Remounting was what
// made every save look like a full page refresh and discarded transient UI state.
const appPath = "client/src/pages/habat/HabatAttendanceAppV4.tsx";
let app = read(appPath);
app = replaceOnce(
  app,
  `  const dir = languageDir(language);\n  const [realtimeRevision, setRealtimeRevision] = useState(0);\n\n  const refreshFromRealtime = useCallback(async () => {\n    await onContextRefresh();\n    setRealtimeRevision(value => value + 1);\n  }, [onContextRefresh]);\n\n  useHabatRealtimeRefresh(refreshFromRealtime);`,
  `  const dir = languageDir(language);\n\n  useHabatRealtimeRefresh(onContextRefresh);`,
  "remove forced realtime remount"
);
app = replaceOnce(
  app,
  `<div key={realtimeRevision} className="min-w-0">{content}</div>`,
  `<div className="min-w-0">{content}</div>`,
  "remove realtime revision key"
);
write(appPath, app);

console.log("Applied stable Habat editing: no self-refresh, no realtime remount, stable numeric typing.");
