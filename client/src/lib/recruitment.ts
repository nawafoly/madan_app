import type { UploadDocumentResult } from "@/lib/documentUploadService";
import {
  DEFAULT_RECRUITMENT_SETTINGS,
  RECRUITMENT_DEFAULT_FILE_FOLDER,
  RECRUITMENT_FIELD_TYPES,
  RECRUITMENT_FILE_CATEGORY,
  RECRUITMENT_NUMBER_MODES,
  type RecruitmentApplicationAnswer,
  type RecruitmentApplicationAttachment,
  type RecruitmentFieldDefinition,
  type RecruitmentFieldOption,
  type RecruitmentFieldType,
  type RecruitmentFormValues,
  type RecruitmentNumberMode,
  type RecruitmentSettingsDoc,
} from "@shared/recruitment";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FILE_FOLDER_REGEX = /^[a-z0-9_-]+$/;

export type RecruitmentFormFileMap = Record<string, File | null>;

function buildId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeOptionValue(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  return normalized || buildId("option");
}

export function sanitizeRecruitmentFileFolder(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");

  return normalized || RECRUITMENT_DEFAULT_FILE_FOLDER;
}

function isRecruitmentFieldType(value: unknown): value is RecruitmentFieldType {
  return (RECRUITMENT_FIELD_TYPES as readonly string[]).includes(String(value));
}

function isRecruitmentNumberMode(
  value: unknown
): value is RecruitmentNumberMode {
  return (RECRUITMENT_NUMBER_MODES as readonly string[]).includes(String(value));
}

export function getDefaultRecruitmentFieldLabel(type: RecruitmentFieldType) {
  switch (type) {
    case "email":
      return "البريد الإلكتروني";
    case "number":
      return "حقل رقمي";
    case "date":
      return "حقل تاريخ";
    case "select":
      return "قائمة خيارات";
    case "textarea":
      return "نبذة مختصرة";
    case "file":
      return "رفع ملف";
    case "text":
    default:
      return "حقل نصي";
  }
}

export function getDefaultRecruitmentPlaceholder(type: RecruitmentFieldType) {
  switch (type) {
    case "email":
      return "name@example.com";
    case "number":
      return "أدخل رقمًا";
    case "date":
      return "";
    case "select":
      return "اختر من القائمة";
    case "textarea":
      return "اكتب هنا";
    case "file":
      return "";
    case "text":
    default:
      return "اكتب الإجابة";
  }
}

export function createRecruitmentOption(
  partial: Partial<RecruitmentFieldOption> = {}
): RecruitmentFieldOption {
  const label =
    typeof partial.label === "string" ? partial.label : "خيار جديد";
  const fallbackValueSource = label.trim() || "option";

  return {
    id: String(partial.id || buildId("option")).trim(),
    label,
    value:
      typeof partial.value === "string"
        ? partial.value.trim()
        : sanitizeOptionValue(fallbackValueSource),
  };
}

export function createRecruitmentField(
  type: RecruitmentFieldType = "text"
): RecruitmentFieldDefinition {
  const baseField: RecruitmentFieldDefinition = {
    id: buildId("field"),
    label: getDefaultRecruitmentFieldLabel(type),
    type,
    required: false,
    placeholder: getDefaultRecruitmentPlaceholder(type),
  };

  if (type === "number") {
    return {
      ...baseField,
      numberMode: "default",
    };
  }

  if (type === "select") {
    return {
      ...baseField,
      options: [
        createRecruitmentOption({ label: "الخيار الأول", value: "option_1" }),
        createRecruitmentOption({ label: "الخيار الثاني", value: "option_2" }),
      ],
    };
  }

  if (type === "file") {
    return {
      ...baseField,
      fileFolder: RECRUITMENT_DEFAULT_FILE_FOLDER,
    };
  }

  return baseField;
}

export function normalizeRecruitmentField(
  input: unknown,
  index = 0
): RecruitmentFieldDefinition {
  const raw =
    input && typeof input === "object"
      ? (input as Partial<RecruitmentFieldDefinition>)
      : {};

  const type = isRecruitmentFieldType(raw.type) ? raw.type : "text";
  const hasExplicitLabel = typeof raw.label === "string";
  const field: RecruitmentFieldDefinition = {
    id: String(raw.id || `field_${index + 1}`).trim() || `field_${index + 1}`,
    label: hasExplicitLabel
      ? String(raw.label)
      : getDefaultRecruitmentFieldLabel(type),
    type,
    required: Boolean(raw.required),
  };

  const placeholder = String(raw.placeholder || "").trim();
  if (placeholder) {
    field.placeholder = placeholder;
  } else if (type !== "date" && type !== "file") {
    field.placeholder = getDefaultRecruitmentPlaceholder(type);
  }

  if (type === "number") {
    field.numberMode = isRecruitmentNumberMode(raw.numberMode)
      ? raw.numberMode
      : "default";
  }

  if (type === "select") {
    const options = Array.isArray(raw.options)
      ? raw.options.map((option) => createRecruitmentOption(option))
      : [];

    field.options = options.length
      ? options
      : [
          createRecruitmentOption({
            label: "الخيار الأول",
            value: "option_1",
          }),
        ];
  }

  if (type === "file") {
    field.fileFolder = sanitizeRecruitmentFileFolder(raw.fileFolder);
  }

  return field;
}

function cloneDefaultRecruitmentSettings(): RecruitmentSettingsDoc {
  return {
    isPublished: DEFAULT_RECRUITMENT_SETTINGS.isPublished,
    fields: DEFAULT_RECRUITMENT_SETTINGS.fields.map((field, index) =>
      normalizeRecruitmentField(field, index)
    ),
  };
}

export function normalizeRecruitmentSettings(
  input: unknown
): RecruitmentSettingsDoc {
  if (!input || typeof input !== "object") {
    return cloneDefaultRecruitmentSettings();
  }

  const raw = input as Partial<RecruitmentSettingsDoc>;
  const defaults = cloneDefaultRecruitmentSettings();
  const fields = Array.isArray(raw.fields)
    ? raw.fields.map((field, index) => normalizeRecruitmentField(field, index))
    : defaults.fields;

  return {
    isPublished:
      typeof raw.isPublished === "boolean"
        ? raw.isPublished
        : defaults.isPublished,
    fields,
  };
}

export function getRecruitmentFieldTypeLabel(type: RecruitmentFieldType) {
  switch (type) {
    case "email":
      return "بريد إلكتروني";
    case "number":
      return "رقمي";
    case "date":
      return "تاريخ";
    case "select":
      return "قائمة";
    case "textarea":
      return "نص طويل";
    case "file":
      return "ملف";
    case "text":
    default:
      return "نصي";
  }
}

export function getRecruitmentNumberModeLabel(mode: RecruitmentNumberMode) {
  return mode === "phone" ? "جوال" : "رقم";
}

export function getRecruitmentFieldHint(field: RecruitmentFieldDefinition) {
  switch (field.type) {
    case "email":
      return "يتحقق من صحة البريد الإلكتروني.";
    case "number":
      return field.numberMode === "phone"
        ? "هذا الحقل يقبل أرقام الجوال فقط."
        : "هذا الحقل يقبل الأرقام فقط.";
    case "date":
      return "يظهر كحقل تاريخ مع منتقي تاريخ واضح.";
    case "select":
      return "تظهر الخيارات كقائمة منسدلة مرتبة.";
    case "textarea":
      return "مناسب للنصوص الطويلة أو النبذة المختصرة.";
    case "file":
      return "يسمح للمتقدم برفع ملف حتى 10MB، ويُحفظ في مسار مستقل داخل careers/.";
    case "text":
    default:
      return "حقل نصي بسيط للإجابات الحرة.";
  }
}

export function sanitizeRecruitmentFieldValue(
  field: RecruitmentFieldDefinition,
  rawValue: unknown
) {
  const value = String(rawValue ?? "");

  if (field.type === "number") {
    return value.replace(/\D+/g, "");
  }

  if (field.type === "date" || field.type === "select") {
    return value.trim();
  }

  if (field.type === "file") {
    return "";
  }

  return value;
}

export function syncRecruitmentValuesWithFields(
  fields: RecruitmentFieldDefinition[],
  currentValues: RecruitmentFormValues = {}
) {
  return fields.reduce<RecruitmentFormValues>((acc, field) => {
    const nextValue = sanitizeRecruitmentFieldValue(
      field,
      currentValues[field.id] ?? ""
    );

    if (
      field.type === "select" &&
      nextValue &&
      !field.options?.some((option) => option.value === nextValue)
    ) {
      acc[field.id] = "";
      return acc;
    }

    acc[field.id] = nextValue;
    return acc;
  }, {});
}

export function syncRecruitmentFilesWithFields(
  fields: RecruitmentFieldDefinition[],
  currentFiles: RecruitmentFormFileMap = {}
) {
  return fields.reduce<RecruitmentFormFileMap>((acc, field) => {
    if (field.type !== "file") return acc;
    acc[field.id] = currentFiles[field.id] ?? null;
    return acc;
  }, {});
}

export function validateRecruitmentForm(
  fields: RecruitmentFieldDefinition[],
  values: RecruitmentFormValues,
  files: RecruitmentFormFileMap = {}
) {
  return fields.reduce<Record<string, string>>((acc, field) => {
    if (field.type === "file") {
      const selectedFile = files[field.id] ?? null;
      if (field.required && !selectedFile) {
        acc[field.id] = "هذا الملف مطلوب.";
      }
      return acc;
    }

    const rawValue = values[field.id] ?? "";
    const value = rawValue.trim();

    if (field.required && !value) {
      acc[field.id] = "هذا الحقل مطلوب.";
      return acc;
    }

    if (!value) {
      return acc;
    }

    if (field.type === "email" && !EMAIL_REGEX.test(value)) {
      acc[field.id] = "أدخل بريدًا إلكترونيًا صحيحًا.";
      return acc;
    }

    if (field.type === "number" && /\D/.test(value)) {
      acc[field.id] = "هذا الحقل يقبل الأرقام فقط.";
      return acc;
    }

    if (
      field.type === "select" &&
      !field.options?.some((option) => option.value === value)
    ) {
      acc[field.id] = "اختر قيمة صحيحة من القائمة.";
      return acc;
    }

    if (field.type === "date") {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        acc[field.id] = "اختر تاريخًا صحيحًا.";
      }
    }

    return acc;
  }, {});
}

export function validateRecruitmentSettings(settings: RecruitmentSettingsDoc) {
  const formErrors: string[] = [];
  const fieldErrors: Record<string, string[]> = {};

  if (settings.isPublished && settings.fields.length === 0) {
    formErrors.push("أضف حقلًا واحدًا على الأقل قبل نشر نموذج التوظيف.");
  }

  settings.fields.forEach((field) => {
    const issues: string[] = [];

    if (!String(field.label || "").trim()) {
      issues.push("عنوان الحقل مطلوب.");
    }

    if (field.type === "select") {
      const options = field.options || [];

      if (!options.length) {
        issues.push("أضف خيارًا واحدًا على الأقل لهذا الحقل.");
      } else if (
        options.some((option) => !String(option.label || "").trim())
      ) {
        issues.push("جميع خيارات القائمة يجب أن تحتوي على عنوان واضح.");
      }
    }

    if (field.type === "file") {
      const folder = String(field.fileFolder || "").trim();
      if (!folder) {
        issues.push("مجلد تخزين الملف مطلوب.");
      } else if (!FILE_FOLDER_REGEX.test(folder)) {
        issues.push("مجلد التخزين يجب أن يحتوي على a-z و0-9 و- و_ فقط.");
      }
    }

    if (issues.length) {
      fieldErrors[field.id] = issues;
    }
  });

  return {
    formErrors,
    fieldErrors,
  };
}

export function buildRecruitmentApplicationAnswers(
  fields: RecruitmentFieldDefinition[],
  values: RecruitmentFormValues
) {
  return fields.reduce<RecruitmentApplicationAnswer[]>((acc, field, index) => {
    if (field.type === "file") return acc;

    const value = String(values[field.id] ?? "").trim();
    if (!value) return acc;

    const answer: RecruitmentApplicationAnswer = {
      fieldId: field.id,
      label: field.label,
      type: field.type,
      value,
      order: index,
    };

    if (field.type === "select") {
      const matchedOption = field.options?.find((option) => option.value === value);
      if (matchedOption) {
        answer.valueLabel = matchedOption.label;
      }
    }

    acc.push(answer);
    return acc;
  }, []);
}

export function buildRecruitmentApplicationAttachments(
  fields: RecruitmentFieldDefinition[],
  uploadsByFieldId: Record<string, UploadDocumentResult | null | undefined>
) {
  return fields.reduce<RecruitmentApplicationAttachment[]>((acc, field, index) => {
    if (field.type !== "file") return acc;

    const upload = uploadsByFieldId[field.id];
    if (!upload) return acc;

    acc.push({
      fieldId: field.id,
      label: field.label,
      fileId: upload.id,
      category: RECRUITMENT_FILE_CATEGORY,
      storageFolder: sanitizeRecruitmentFileFolder(field.fileFolder),
      fileName: upload.fileName,
      filePath: upload.filePath,
      fileUrl: upload.fileUrl,
      contentType: upload.contentType,
      fileSize: upload.fileSize,
      uploadedAt: upload.uploadedAt,
      order: index,
    });

    return acc;
  }, []);
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}
