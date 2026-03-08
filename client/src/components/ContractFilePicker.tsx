import * as React from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ContractFilePickerProps = {
  buttonLabel: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  helperText?: string;
  className?: string;
};

export default function ContractFilePicker({
  buttonLabel,
  file,
  onFileChange,
  disabled = false,
  helperText = "يرجى رفع الملف بصيغة PDF فقط",
  className,
}: ContractFilePickerProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const fileName = String(file?.name || "").trim();

  React.useEffect(() => {
    if (!file && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [file]);

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0 space-y-1">
          <div
            className={cn(
              "truncate text-sm font-medium",
              fileName ? "text-slate-900" : "text-muted-foreground"
            )}
          >
            {fileName || "لم يتم اختيار ملف"}
          </div>
          <div className="text-xs text-muted-foreground">{helperText}</div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full shrink-0 sm:w-auto"
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.value = "";
              inputRef.current.click();
            }
          }}
          disabled={disabled}
        >
          <Upload className="w-4 h-4" />
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}
