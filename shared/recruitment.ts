export const RECRUITMENT_SETTINGS_DOC_ID = "recruitment";
export const JOB_APPLICATIONS_COLLECTION = "job_applications";
export const RECRUITMENT_FILE_CATEGORY = "career_attachment";
export const RECRUITMENT_DEFAULT_FILE_FOLDER = "attachments";

export const RECRUITMENT_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "select",
  "file",
] as const;

export const RECRUITMENT_NUMBER_MODES = ["default", "phone"] as const;

export type RecruitmentFieldType =
  (typeof RECRUITMENT_FIELD_TYPES)[number];
export type RecruitmentNumberMode =
  (typeof RECRUITMENT_NUMBER_MODES)[number];

export type RecruitmentFieldOption = {
  id: string;
  label: string;
  value: string;
};

export type RecruitmentFieldInputDefinition = {
  id: string;
  type: RecruitmentFieldType;
  required: boolean;
  placeholder?: string;
  options?: RecruitmentFieldOption[];
  numberMode?: RecruitmentNumberMode;
  fileFolder?: string;
};

export type RecruitmentFieldItemDefinition = RecruitmentFieldInputDefinition;

export type RecruitmentFieldDefinition = RecruitmentFieldInputDefinition & {
  label: string;
  /**
   * Legacy only: older experiments stored multiple inputs inside one field.
   * The current builder normalizes these into standalone fields and does not
   * edit or create `items` anymore.
   */
  items?: RecruitmentFieldItemDefinition[];
};

export type RecruitmentSettingsDoc = {
  isPublished: boolean;
  fields: RecruitmentFieldDefinition[];
  updatedAt?: unknown;
};

export type RecruitmentFormValues = Record<string, string>;

export type RecruitmentApplicationStatus = "submitted";

export type RecruitmentApplicationAnswer = {
  fieldId: string;
  itemId?: string;
  label: string;
  fieldLabel?: string;
  itemLabel?: string;
  type: RecruitmentFieldType;
  value: string;
  valueLabel?: string;
  order: number;
};

export type RecruitmentApplicationAttachment = {
  fieldId: string;
  itemId?: string;
  label: string;
  fieldLabel?: string;
  itemLabel?: string;
  fileId: string;
  category: typeof RECRUITMENT_FILE_CATEGORY;
  storageFolder: string;
  fileName: string;
  filePath: string;
  fileUrl: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
  order: number;
};

export type RecruitmentApplicationDoc = {
  formId: typeof RECRUITMENT_SETTINGS_DOC_ID;
  status: RecruitmentApplicationStatus;
  source: "public_careers_page";
  fieldsSnapshot: RecruitmentFieldDefinition[];
  answers: RecruitmentApplicationAnswer[];
  attachments?: RecruitmentApplicationAttachment[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export const DEFAULT_RECRUITMENT_SETTINGS: RecruitmentSettingsDoc = {
  isPublished: true,
  fields: [
    {
      id: "full_name",
      label: "الاسم",
      type: "text",
      required: true,
      placeholder: "اكتب الاسم الكامل",
    },
    {
      id: "phone_number",
      label: "الجوال",
      type: "number",
      required: true,
      placeholder: "05XXXXXXXX",
      numberMode: "phone",
    },
    {
      id: "age",
      label: "العمر",
      type: "number",
      required: true,
      placeholder: "مثال: 28",
      numberMode: "default",
    },
    {
      id: "birth_date",
      label: "تاريخ الميلاد",
      type: "date",
      required: true,
    },
    {
      id: "education_type",
      label: "نوع التعليم",
      type: "select",
      required: true,
      placeholder: "اختر نوع التعليم",
      options: [
        {
          id: "education_diploma",
          label: "دبلوم",
          value: "diploma",
        },
        {
          id: "education_bachelor",
          label: "بكالوريوس",
          value: "bachelor",
        },
      ],
    },
  ],
};
