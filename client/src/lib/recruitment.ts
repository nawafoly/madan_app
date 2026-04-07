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
  type RecruitmentFieldInputDefinition,
  type RecruitmentFieldItemDefinition,
  type RecruitmentFieldOption,
  type RecruitmentFieldType,
  type RecruitmentFormValues,
  type RecruitmentNumberMode,
  type RecruitmentSettingsDoc,
} from "@shared/recruitment";

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

function isRecruitmentFieldType(value: unknown): value is RecruitmentFieldType {
  return (RECRUITMENT_FIELD_TYPES as readonly string[]).includes(String(value));
}

function isRecruitmentNumberMode(
  value: unknown
): value is RecruitmentNumberMode {
  return (RECRUITMENT_NUMBER_MODES as readonly string[]).includes(String(value));
}

function normalizeLegacyRecruitmentFieldType(
  value: unknown,
  fallback: RecruitmentFieldType = "text"
): RecruitmentFieldType {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (isRecruitmentFieldType(normalized)) {
    return normalized;
  }

  if (normalized === "email" || normalized === "textarea") {
    return "text";
  }

  return fallback;
}

function getDefaultRecruitmentInputDefinition(
  type: RecruitmentFieldType,
  idPrefix: "field" | "item"
): RecruitmentFieldInputDefinition {
  const baseInput: RecruitmentFieldInputDefinition = {
    id: buildId(idPrefix),
    type,
    required: false,
  };

  if (type !== "date" && type !== "file") {
    baseInput.placeholder = getDefaultRecruitmentPlaceholder(type);
  }

  if (type === "number") {
    return {
      ...baseInput,
      numberMode: "default",
    };
  }

  if (type === "select") {
    return {
      ...baseInput,
      options: [
        createRecruitmentOption({
          label: "الخيار الأول",
          value: "option_1",
        }),
        createRecruitmentOption({
          label: "الخيار الثاني",
          value: "option_2",
        }),
      ],
    };
  }

  if (type === "file") {
    return {
      ...baseInput,
      fileFolder: RECRUITMENT_DEFAULT_FILE_FOLDER,
    };
  }

  return baseInput;
}

export function sanitizeRecruitmentFileFolder(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");

  return normalized || RECRUITMENT_DEFAULT_FILE_FOLDER;
}

export function getDefaultRecruitmentFieldLabel(type: RecruitmentFieldType) {
  switch (type) {
    case "number":
      return "حقل رقمي";
    case "date":
      return "حقل تاريخ";
    case "select":
      return "قائمة خيارات";
    case "file":
      return "رفع ملف";
    case "text":
    default:
      return "حقل نصي";
  }
}

export function getDefaultRecruitmentPlaceholder(type: RecruitmentFieldType) {
  switch (type) {
    case "number":
      return "أدخل رقمًا";
    case "date":
      return "";
    case "select":
      return "اختر من القائمة";
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

export function createRecruitmentFieldItem(
  type: RecruitmentFieldType = "text"
): RecruitmentFieldItemDefinition {
  return getDefaultRecruitmentInputDefinition(
    normalizeLegacyRecruitmentFieldType(type),
    "item"
  );
}

export function createRecruitmentField(
  type: RecruitmentFieldType = "text"
): RecruitmentFieldDefinition {
  const nextType = normalizeLegacyRecruitmentFieldType(type);
  return {
    ...getDefaultRecruitmentInputDefinition(nextType, "field"),
    label: getDefaultRecruitmentFieldLabel(nextType),
  };
}

function normalizeRecruitmentFieldOptions(
  optionsInput: unknown
): RecruitmentFieldOption[] {
  const options = Array.isArray(optionsInput)
    ? optionsInput.map(option => createRecruitmentOption(option))
    : [];

  return options.length
    ? options
    : [
        createRecruitmentOption({
          label: "الخيار الأول",
          value: "option_1",
        }),
      ];
}

export function normalizeRecruitmentFieldItem(
  input: unknown,
  index = 0,
  fallbackType: RecruitmentFieldType = "text"
): RecruitmentFieldItemDefinition {
  const raw =
    input && typeof input === "object"
      ? (input as Partial<RecruitmentFieldInputDefinition>)
      : {};

  const type = normalizeLegacyRecruitmentFieldType(raw.type, fallbackType);
  const normalized: RecruitmentFieldItemDefinition = {
    id: String(raw.id || `item_${index + 1}`).trim() || `item_${index + 1}`,
    type,
    required: Boolean(raw.required),
  };

  const placeholder = String(raw.placeholder || "").trim();
  if (type !== "date" && type !== "file") {
    normalized.placeholder = placeholder || getDefaultRecruitmentPlaceholder(type);
  }

  if (type === "number") {
    normalized.numberMode = isRecruitmentNumberMode(raw.numberMode)
      ? raw.numberMode
      : "default";
  }

  if (type === "select") {
    normalized.options = normalizeRecruitmentFieldOptions(raw.options);
  }

  if (type === "file") {
    normalized.fileFolder = sanitizeRecruitmentFileFolder(raw.fileFolder);
  }

  return normalized;
}

function normalizeRecruitmentFieldCore(
  input: unknown,
  index = 0
): RecruitmentFieldDefinition {
  const raw =
    input && typeof input === "object"
      ? (input as Partial<RecruitmentFieldDefinition>)
      : {};

  const normalizedInput = normalizeRecruitmentFieldItem(
    raw,
    index,
    normalizeLegacyRecruitmentFieldType(raw.type)
  );
  const label = String(raw.label || "").trim();
  const field: RecruitmentFieldDefinition = {
    id: String(raw.id || `field_${index + 1}`).trim() || `field_${index + 1}`,
    label: label || getDefaultRecruitmentFieldLabel(normalizedInput.type),
    type: normalizedInput.type,
    required:
      typeof raw.required === "boolean" ? raw.required : normalizedInput.required,
  };

  if (normalizedInput.placeholder && field.type !== "date" && field.type !== "file") {
    field.placeholder = normalizedInput.placeholder;
  }

  if (field.type === "number") {
    field.numberMode = normalizedInput.numberMode || "default";
  }

  if (field.type === "select") {
    field.options = normalizeRecruitmentFieldOptions(raw.options);
  }

  if (field.type === "file") {
    field.fileFolder = sanitizeRecruitmentFileFolder(raw.fileFolder);
  }

  return field;
}

function expandLegacyRecruitmentField(
  input: unknown,
  startIndex = 0
): RecruitmentFieldDefinition[] {
  const raw =
    input && typeof input === "object"
      ? (input as Partial<RecruitmentFieldDefinition>)
      : {};
  const rawItems = Array.isArray(raw.items) ? raw.items : [];

  if (!rawItems.length) {
    return [normalizeRecruitmentFieldCore(raw, startIndex)];
  }

  const baseId =
    String(raw.id || `field_${startIndex + 1}`).trim() || `field_${startIndex + 1}`;
  const baseLabel = String(raw.label || "").trim();
  const fallbackType = normalizeLegacyRecruitmentFieldType(raw.type);

  return rawItems.map((item, itemIndex) => {
    const normalizedItem = normalizeRecruitmentFieldItem(
      {
        ...(item && typeof item === "object" ? item : {}),
        type:
          item && typeof item === "object" && "type" in item
            ? (item as RecruitmentFieldItemDefinition).type
            : raw.type,
        required:
          item && typeof item === "object" && "required" in item
            ? (item as RecruitmentFieldItemDefinition).required
            : raw.required,
        placeholder:
          item && typeof item === "object" && "placeholder" in item
            ? (item as RecruitmentFieldItemDefinition).placeholder
            : raw.placeholder,
        options:
          item && typeof item === "object" && "options" in item
            ? (item as RecruitmentFieldItemDefinition).options
            : raw.options,
        numberMode:
          item && typeof item === "object" && "numberMode" in item
            ? (item as RecruitmentFieldItemDefinition).numberMode
            : raw.numberMode,
        fileFolder:
          item && typeof item === "object" && "fileFolder" in item
            ? (item as RecruitmentFieldItemDefinition).fileFolder
            : raw.fileFolder,
      },
      itemIndex,
      fallbackType
    );

    const label =
      baseLabel || getDefaultRecruitmentFieldLabel(normalizedItem.type);

    return normalizeRecruitmentFieldCore(
      {
        id:
          rawItems.length === 1
            ? baseId
            : `${baseId}__${normalizedItem.id || itemIndex + 1}`,
        label: rawItems.length === 1 ? label : `${label} ${itemIndex + 1}`,
        type: normalizedItem.type,
        required: normalizedItem.required,
        placeholder: normalizedItem.placeholder,
        options: normalizedItem.options,
        numberMode: normalizedItem.numberMode,
        fileFolder: normalizedItem.fileFolder,
      },
      startIndex + itemIndex
    );
  });
}

function normalizeRecruitmentFields(fieldsInput: unknown[]) {
  const normalized: RecruitmentFieldDefinition[] = [];

  fieldsInput.forEach((field) => {
    expandLegacyRecruitmentField(field, normalized.length).forEach(
      (expandedField) => {
        normalized.push(
          normalizeRecruitmentFieldCore(expandedField, normalized.length)
        );
      }
    );
  });

  return normalized;
}

export function normalizeRecruitmentField(input: unknown, index = 0) {
  return (
    expandLegacyRecruitmentField(input, index)[0] ||
    normalizeRecruitmentFieldCore({}, index)
  );
}

function cloneDefaultRecruitmentSettings(): RecruitmentSettingsDoc {
  return {
    isPublished: DEFAULT_RECRUITMENT_SETTINGS.isPublished,
    fields: normalizeRecruitmentFields(DEFAULT_RECRUITMENT_SETTINGS.fields),
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
    ? normalizeRecruitmentFields(raw.fields)
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
    case "number":
      return "رقمي";
    case "date":
      return "تاريخ";
    case "select":
      return "قائمة";
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

export function getRecruitmentFieldItems(
  field: RecruitmentFieldDefinition
): RecruitmentFieldItemDefinition[] {
  return [
    normalizeRecruitmentFieldItem(
      {
        id: field.id,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder,
        options: field.options,
        numberMode: field.numberMode,
        fileFolder: field.fileFolder,
      },
      0,
      field.type
    ),
  ];
}

export function hasRecruitmentFieldItems(_field: RecruitmentFieldDefinition) {
  return false;
}

export function getRecruitmentFieldValueKey(
  field: RecruitmentFieldDefinition,
  _item?: RecruitmentFieldItemDefinition
) {
  return field.id;
}

export function getRecruitmentFieldItemTitle(index: number) {
  return `حقل ${index + 1}`;
}

export function getRecruitmentFieldItemTypeLabel(
  item: RecruitmentFieldInputDefinition
) {
  if (item.type === "number" && item.numberMode === "phone") {
    return "رقم الجوال";
  }

  return getRecruitmentFieldTypeLabel(item.type);
}

export function getRecruitmentFieldItemDisplayLabel(
  item: RecruitmentFieldInputDefinition,
  index: number
) {
  return `${getRecruitmentFieldItemTypeLabel(item)} ${index + 1}`;
}

export function hasRecruitmentFieldType(
  field: RecruitmentFieldDefinition,
  type: RecruitmentFieldType
) {
  return field.type === type;
}

export function isRecruitmentFieldRequired(field: RecruitmentFieldDefinition) {
  return Boolean(field.required);
}

export function getRecruitmentFieldItemHint(
  item: RecruitmentFieldInputDefinition
) {
  switch (item.type) {
    case "number":
      return item.numberMode === "phone"
        ? "هذا الحقل يقبل أرقام الجوال فقط."
        : "هذا الحقل يقبل الأرقام فقط.";
    case "date":
      return "يظهر كحقل تاريخ مع منتقي تاريخ واضح.";
    case "select":
      return "تظهر الخيارات كقائمة منسدلة مرتبة.";
    case "file":
      return "يسمح برفع ملف حتى 10MB ويحفظ في مسار مستقل داخل careers/.";
    case "text":
    default:
      return "حقل نصي بسيط للإجابات الحرة.";
  }
}

export function getRecruitmentFieldHint(field: RecruitmentFieldDefinition) {
  return getRecruitmentFieldItemHint(getRecruitmentFieldItems(field)[0]);
}

export function sanitizeRecruitmentFieldValue(
  field: RecruitmentFieldInputDefinition,
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
    if (field.type === "file") {
      return acc;
    }

    const nextValue = sanitizeRecruitmentFieldValue(
      field,
      currentValues[field.id] ?? ""
    );

    if (
      field.type === "select" &&
      nextValue &&
      !field.options?.some(option => option.value === nextValue)
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
    if (field.type === "file") {
      acc[field.id] = currentFiles[field.id] ?? null;
    }

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
      if (field.required && !files[field.id]) {
        acc[field.id] = "هذا الملف مطلوب.";
      }
      return acc;
    }

    const value = String(values[field.id] ?? "").trim();

    if (field.required && !value) {
      acc[field.id] = "هذا الحقل مطلوب.";
      return acc;
    }

    if (!value) {
      return acc;
    }

    if (field.type === "number" && /\D/.test(value)) {
      acc[field.id] = "هذا الحقل يقبل الأرقام فقط.";
      return acc;
    }

    if (
      field.type === "select" &&
      !field.options?.some(option => option.value === value)
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

function collectRecruitmentFieldValidationIssues(
  field: RecruitmentFieldDefinition
) {
  const issues: string[] = [];

  if (!String(field.label || "").trim()) {
    issues.push("عنوان الحقل مطلوب.");
  }

  if (field.type === "select") {
    const options = field.options || [];

    if (!options.length) {
      issues.push("أضف خيارًا واحدًا على الأقل لهذا الحقل.");
    } else if (options.some(option => !String(option.label || "").trim())) {
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

  return issues;
}

export function validateRecruitmentSettings(settings: RecruitmentSettingsDoc) {
  const formErrors: string[] = [];
  const fieldErrors: Record<string, string[]> = {};

  if (settings.isPublished && settings.fields.length === 0) {
    formErrors.push("أضف حقلًا واحدًا على الأقل قبل نشر نموذج التوظيف.");
  }

  settings.fields.forEach(field => {
    const issues = collectRecruitmentFieldValidationIssues(field);
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
  const answers: RecruitmentApplicationAnswer[] = [];
  let order = 0;

  fields.forEach(field => {
    if (field.type === "file") {
      return;
    }

    const value = String(values[field.id] ?? "").trim();
    if (!value) {
      return;
    }

    const answer: RecruitmentApplicationAnswer = {
      fieldId: field.id,
      label: field.label,
      fieldLabel: field.label,
      type: field.type,
      value,
      order,
    };

    if (field.type === "select") {
      const matchedOption = field.options?.find(option => option.value === value);
      if (matchedOption) {
        answer.valueLabel = matchedOption.label;
      }
    }

    answers.push(answer);
    order += 1;
  });

  return answers;
}

export function buildRecruitmentApplicationAttachments(
  fields: RecruitmentFieldDefinition[],
  uploadsByFieldId: Record<string, UploadDocumentResult | null | undefined>
) {
  const attachments: RecruitmentApplicationAttachment[] = [];
  let order = 0;

  fields.forEach(field => {
    if (field.type !== "file") {
      return;
    }

    const upload = uploadsByFieldId[field.id];
    if (!upload) {
      return;
    }

    attachments.push({
      fieldId: field.id,
      label: field.label,
      fieldLabel: field.label,
      fileId: upload.id,
      category: RECRUITMENT_FILE_CATEGORY,
      storageFolder: sanitizeRecruitmentFileFolder(field.fileFolder),
      fileName: upload.fileName,
      filePath: upload.filePath,
      fileUrl: upload.fileUrl,
      contentType: upload.contentType,
      fileSize: upload.fileSize,
      uploadedAt: upload.uploadedAt,
      order,
    });

    order += 1;
  });

  return attachments;
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
