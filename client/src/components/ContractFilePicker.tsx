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
  panelClassName?: string;
  buttonClassName?: string;
  fileNameClassName?: string;
  helperTextClassName?: string;
};

export default function ContractFilePicker({
  buttonLabel,
  file,
  onFileChange,
  disabled = false,
  helperText = "يرجى رفع الملف بصيغة PDF فقط",
  className,
  panelClassName,
  buttonClassName,
  fileNameClassName,
  helperTextClassName,
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
        onChange={e => onFileChange(e.target.files?.[0] ?? null)}
      />

      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4",
          panelClassName
        )}
      >
        <div className="min-w-0 space-y-1">
          <div
            className={cn(
              "truncate text-sm font-medium",
              fileName ? "text-slate-900" : "text-muted-foreground",
              fileNameClassName
            )}
          >
            {fileName || "لم يتم اختيار ملف"}
          </div>
          <div
            className={cn("text-xs text-muted-foreground", helperTextClassName)}
          >
            {helperText}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className={cn("w-full shrink-0 sm:w-auto", buttonClassName)}
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
