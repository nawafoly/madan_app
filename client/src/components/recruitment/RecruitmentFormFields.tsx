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
import { useLanguage } from "@/contexts/LanguageContext";
import {
  hasArabicText,
  languageDir,
  safeEnglishText,
  tr,
} from "@/lib/i18n";
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

function fallbackPlaceholder(field: RecruitmentFieldDefinition, index: number) {
  switch (field.type) {
    case "number":
      return `Enter number ${index + 1}`;
    case "date":
      return "Select a date";
    case "select":
      return "Choose from the list";
    case "file":
      return "Upload a file";
    default:
      return `Enter field ${index + 1}`;
  }
}

function fallbackHint(field: RecruitmentFieldDefinition) {
  switch (field.type) {
    case "number":
      return "This field accepts numbers only.";
    case "date":
      return "Use a valid date.";
    case "select":
      return "Choose one of the available options.";
    case "file":
      return "Upload a supported document or image file.";
    default:
      return "Complete this field before submitting.";
  }
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
  const { language } = useLanguage();

  const renderControl = (field: RecruitmentFieldDefinition, index: number) => {
    const valueKey = field.id;
    const controlId = `${idPrefix}-${valueKey}`;
    const error = errors[valueKey];
    const fieldValue = values[valueKey] ?? "";
    const selectedFile = files[valueKey] ?? null;
    const dir = isLtrField(field) ? "ltr" : languageDir(language);
    const placeholder =
      language === "ar"
        ? field.placeholder || "اختر من القائمة"
        : safeEnglishText(field.placeholder, fallbackPlaceholder(field, index));

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
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((option, optionIndex) => (
              <SelectItem key={option.id} value={option.value}>
                {language === "ar"
                  ? option.label
                  : safeEnglishText(option.label, `Option ${optionIndex + 1}`)}
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
                      ? tr(language, "لم يتم اختيار ملف بعد", "No file selected yet")
                      : tr(language, "معاينة لحقل رفع ملف", "File upload preview")}
                </div>
                <div className="text-xs text-slate-500">
                  {selectedFile
                    ? tr(
                        language,
                        "سيتم رفع الملف مع إرسال الطلب.",
                        "The file will be uploaded with your application."
                      )
                    : tr(
                        language,
                        "يدعم المستندات والصور الشائعة حتى 10MB.",
                        "Supports common documents and images up to 10MB."
                      )}
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
                {tr(language, "إزالة الملف", "Remove File")}
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
        placeholder={placeholder}
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
      {fields.map((field, index) => {
        const valueKey = field.id;
        const rawError = errors[valueKey];
        const error =
          language === "en" && hasArabicText(rawError)
            ? fallbackHint(field)
            : rawError;
        const rawHelperText = error || getRecruitmentFieldHint(field);
        const helperText =
          language === "ar"
            ? rawHelperText
            : safeEnglishText(rawHelperText, fallbackHint(field));
        const isFullWidth = isWideField(field);
        const fieldLabel =
          language === "ar"
            ? field.label
            : safeEnglishText(field.label, `Field ${index + 1}`);

        return (
          <div
            key={field.id}
            className={isFullWidth ? "space-y-3 md:col-span-2" : "space-y-3"}
          >
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-semibold text-slate-900">
                {fieldLabel}
                {field.required ? (
                  <span className="mr-1 text-rose-500">*</span>
                ) : null}
              </Label>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                {field.required
                  ? tr(language, "مطلوب", "Required")
                  : tr(language, "اختياري", "Optional")}
              </span>
            </div>

            {renderControl(field, index)}

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
