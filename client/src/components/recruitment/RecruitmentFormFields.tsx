import { FileText, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getRecruitmentFieldHint,
  sanitizeRecruitmentFieldValue,
  type RecruitmentFormFileMap,
} from "@/lib/recruitment";
import type {
  RecruitmentFieldDefinition,
  RecruitmentFormValues,
} from "@shared/recruitment";

const FILE_INPUT_ACCEPT =
  ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,.txt,.zip";

type RecruitmentFormFieldsProps = {
  fields: RecruitmentFieldDefinition[];
  values: RecruitmentFormValues;
  files?: RecruitmentFormFileMap;
  errors?: Record<string, string>;
  onValueChange: (fieldId: string, value: string) => void;
  onFileChange?: (fieldId: string, file: File | null) => void;
  disabled?: boolean;
  idPrefix?: string;
};

function isLtrField(field: RecruitmentFieldDefinition) {
  return field.type === "number" || field.type === "date";
}

function isWideField(field: RecruitmentFieldDefinition) {
  return field.type === "file";
}

export function RecruitmentFormFields({
  fields,
  values,
  files = {},
  errors = {},
  onValueChange,
  onFileChange,
  disabled = false,
  idPrefix = "recruitment-field",
}: RecruitmentFormFieldsProps) {
  const renderControl = (field: RecruitmentFieldDefinition) => {
    const valueKey = field.id;
    const controlId = `${idPrefix}-${valueKey}`;
    const error = errors[valueKey];
    const fieldValue = values[valueKey] ?? "";
    const selectedFile = files[valueKey] ?? null;
    const dir = isLtrField(field) ? "ltr" : "rtl";

    if (field.type === "select") {
      return (
        <Select
          disabled={disabled}
          value={fieldValue || undefined}
          onValueChange={value => onValueChange(valueKey, value)}
        >
          <SelectTrigger
            id={controlId}
            dir={dir}
            className="h-12 rounded-2xl border-slate-200 bg-white px-4 text-sm shadow-none focus:ring-slate-300"
          >
            <SelectValue placeholder={field.placeholder || "اختر من القائمة"} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map(option => (
              <SelectItem key={option.id} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (field.type === "file") {
      return (
        <div className="space-y-3">
          <Input
            key={`${controlId}-${selectedFile?.name || "empty"}`}
            id={controlId}
            type="file"
            dir="ltr"
            accept={FILE_INPUT_ACCEPT}
            disabled={disabled || !onFileChange}
            aria-invalid={Boolean(error)}
            onChange={event =>
              onFileChange?.(valueKey, event.target.files?.[0] ?? null)
            }
            className="h-auto min-h-12 cursor-pointer rounded-2xl border-slate-200 bg-white px-4 py-3 text-sm shadow-none file:ml-4 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800 focus-visible:ring-slate-300"
          />

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-slate-700">
                {selectedFile ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </span>
              <div>
                <div className="font-medium text-slate-900">
                  {selectedFile
                    ? selectedFile.name
                    : onFileChange
                      ? "لم يتم اختيار ملف بعد"
                      : "معاينة لحقل رفع ملف"}
                </div>
                <div className="text-xs text-slate-500">
                  {selectedFile
                    ? "سيتم رفع الملف مع إرسال الطلب."
                    : "يدعم المستندات والصور الشائعة حتى 10MB."}
                </div>
              </div>
            </div>

            {selectedFile && onFileChange ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onFileChange(valueKey, null)}
              >
                <X className="ml-2 h-4 w-4" />
                إزالة الملف
              </Button>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <Input
        id={controlId}
        dir={dir}
        disabled={disabled}
        value={fieldValue}
        type={field.type === "date" ? "date" : "text"}
        inputMode={field.type === "number" ? "numeric" : undefined}
        placeholder={field.placeholder || undefined}
        aria-invalid={Boolean(error)}
        onChange={event =>
          onValueChange(
            valueKey,
            sanitizeRecruitmentFieldValue(field, event.target.value)
          )
        }
        className="h-12 rounded-2xl border-slate-200 bg-white px-4 text-sm shadow-none focus-visible:ring-slate-300"
      />
    );
  };

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {fields.map(field => {
        const valueKey = field.id;
        const error = errors[valueKey];
        const helperText = error || getRecruitmentFieldHint(field);
        const isFullWidth = isWideField(field);

        return (
          <div
            key={field.id}
            className={isFullWidth ? "space-y-3 md:col-span-2" : "space-y-3"}
          >
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-semibold text-slate-900">
                {field.label}
                {field.required ? (
                  <span className="mr-1 text-rose-500">*</span>
                ) : null}
              </Label>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                {field.required ? "مطلوب" : "اختياري"}
              </span>
            </div>

            {renderControl(field)}

            <p
              className={`text-xs leading-6 ${
                error ? "text-rose-600" : "text-slate-500"
              }`}
            >
              {helperText}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default RecruitmentFormFields;
