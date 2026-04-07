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
import { Textarea } from "@/components/ui/textarea";
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
  return field.type === "email" || field.type === "number" || field.type === "date";
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
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {fields.map((field) => {
        const fieldId = `${idPrefix}-${field.id}`;
        const fieldValue = values[field.id] ?? "";
        const selectedFile = files[field.id] ?? null;
        const error = errors[field.id];
        const helperText = error || getRecruitmentFieldHint(field);
        const isFullWidth = field.type === "textarea" || field.type === "file";
        const dir = isLtrField(field) ? "ltr" : "rtl";

        return (
          <div
            key={field.id}
            className={isFullWidth ? "space-y-3 md:col-span-2" : "space-y-3"}
          >
            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor={fieldId}
                className="text-sm font-semibold text-slate-900"
              >
                {field.label}
                {field.required ? (
                  <span className="mr-1 text-rose-500">*</span>
                ) : null}
              </Label>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                {field.required ? "مطلوب" : "اختياري"}
              </span>
            </div>

            {field.type === "textarea" ? (
              <Textarea
                id={fieldId}
                dir={dir}
                rows={5}
                value={fieldValue}
                disabled={disabled}
                placeholder={field.placeholder || "اكتب هنا"}
                aria-invalid={Boolean(error)}
                onChange={(event) =>
                  onValueChange(
                    field.id,
                    sanitizeRecruitmentFieldValue(field, event.target.value)
                  )
                }
                className="min-h-[132px] rounded-2xl border-slate-200 bg-white px-4 py-3 text-sm shadow-none focus-visible:ring-slate-300"
              />
            ) : field.type === "select" ? (
              <Select
                disabled={disabled}
                value={fieldValue || undefined}
                onValueChange={(value) => onValueChange(field.id, value)}
              >
                <SelectTrigger
                  id={fieldId}
                  dir={dir}
                  className="h-12 rounded-2xl border-slate-200 bg-white px-4 text-sm shadow-none focus:ring-slate-300"
                >
                  <SelectValue
                    placeholder={field.placeholder || "اختر من القائمة"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(field.options || []).map((option) => (
                    <SelectItem key={option.id} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === "file" ? (
              <div className="space-y-3">
                <Input
                  key={`${fieldId}-${selectedFile?.name || "empty"}`}
                  id={fieldId}
                  type="file"
                  dir="ltr"
                  accept={FILE_INPUT_ACCEPT}
                  disabled={disabled || !onFileChange}
                  aria-invalid={Boolean(error)}
                  onChange={(event) =>
                    onFileChange?.(field.id, event.target.files?.[0] ?? null)
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
                      onClick={() => onFileChange(field.id, null)}
                    >
                      <X className="ml-2 h-4 w-4" />
                      إزالة الملف
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <Input
                id={fieldId}
                dir={dir}
                disabled={disabled}
                value={fieldValue}
                type={
                  field.type === "email"
                    ? "email"
                    : field.type === "date"
                    ? "date"
                    : "text"
                }
                inputMode={field.type === "number" ? "numeric" : undefined}
                placeholder={field.placeholder || undefined}
                aria-invalid={Boolean(error)}
                onChange={(event) =>
                  onValueChange(
                    field.id,
                    sanitizeRecruitmentFieldValue(field, event.target.value)
                  )
                }
                className="h-12 rounded-2xl border-slate-200 bg-white px-4 text-sm shadow-none focus-visible:ring-slate-300"
              />
            )}

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
