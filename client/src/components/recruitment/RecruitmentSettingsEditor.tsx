import {
  ArrowDown,
  ArrowUp,
  BriefcaseBusiness,
  CircleAlert,
  Globe,
  Plus,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";

import RecruitmentFormFields from "@/components/recruitment/RecruitmentFormFields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatNumberEN } from "@/lib/formatters";
import {
  getRecruitmentFieldHint,
  getRecruitmentFieldTypeLabel,
  getRecruitmentNumberModeLabel,
} from "@/lib/recruitment";
import { cn } from "@/lib/utils";
import {
  RECRUITMENT_DEFAULT_FILE_FOLDER,
  type RecruitmentFieldDefinition,
  type RecruitmentFieldType,
  type RecruitmentFormValues,
  type RecruitmentSettingsDoc,
} from "@shared/recruitment";

type RecruitmentSettingsEditorProps = {
  recruitment: RecruitmentSettingsDoc;
  recruitmentPreviewValues: RecruitmentFormValues;
  requiredRecruitmentFieldsCount: number;
  selectRecruitmentFieldsCount: number;
  recruitmentIssuesCount: number;
  recruitmentValidation: {
    formErrors: string[];
    fieldErrors: Record<string, string[]>;
  };
  onPublishedChange: (value: boolean) => void;
  onAddField: (type: RecruitmentFieldType) => void;
  onUpdateField: (
    fieldId: string,
    patch: Partial<RecruitmentFieldDefinition>
  ) => void;
  onMoveField: (fieldId: string, direction: "up" | "down") => void;
  onRemoveField: (fieldId: string) => void;
  onAddOption: (fieldId: string) => void;
  onUpdateOption: (fieldId: string, optionId: string, label: string) => void;
  onRemoveOption: (fieldId: string, optionId: string) => void;
  onPreviewValueChange: (fieldId: string, value: string) => void;
};

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-500">{hint}</div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3 text-right">
      <div className="inline-flex items-center gap-2 rounded-full border border-[#F2B705]/25 bg-[#F2B705]/10 px-3 py-1 text-xs font-semibold text-[#8d6700]">
        <Icon className="h-3.5 w-3.5" />
        {eyebrow}
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold tracking-tight text-slate-950">
          {title}
        </h3>
        <p className="text-sm leading-7 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function RecruitmentSettingsEditor({
  recruitment,
  recruitmentPreviewValues,
  requiredRecruitmentFieldsCount,
  selectRecruitmentFieldsCount,
  recruitmentIssuesCount,
  recruitmentValidation,
  onPublishedChange,
  onAddField,
  onUpdateField,
  onMoveField,
  onRemoveField,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
  onPreviewValueChange,
}: RecruitmentSettingsEditorProps) {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_28px_72px_-52px_rgba(15,23,42,0.28)]">
        <CardHeader className="border-b border-slate-100 pb-6">
          <SectionTitle
            icon={BriefcaseBusiness}
            eyebrow="محرر النموذج"
            title="إعدادات نموذج التوظيف العام"
            description="أي تعديل تحفظه هنا ينعكس مباشرة على صفحة /careers، بما في ذلك ترتيب الحقول وأنواعها وحقول رفع الملفات."
          />
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="إجمالي الحقول"
              value={formatNumberEN(recruitment.fields.length)}
              hint="كل الحقول الحالية داخل النموذج."
            />
            <StatCard
              label="الحقول المطلوبة"
              value={formatNumberEN(requiredRecruitmentFieldsCount)}
              hint="لن يتم إرسال الطلب قبل تعبئتها."
            />
            <StatCard
              label="حقول القوائم"
              value={formatNumberEN(selectRecruitmentFieldsCount)}
              hint="الحقول التي تعرض خيارات Select."
            />
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2 text-right">
                <div className="text-lg font-semibold text-slate-950">
                  استقبال طلبات التوظيف
                </div>
                <p className="text-sm leading-7 text-slate-500">
                  عند الإيقاف ستبقى الصفحة العامة موجودة، لكن لن يستطيع الزائر
                  إرسال طلب جديد.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2">
                <span className="text-sm font-medium text-slate-700">
                  {recruitment.isPublished ? "مفعّل" : "متوقف"}
                </span>
                <Switch
                  checked={recruitment.isPublished}
                  onCheckedChange={onPublishedChange}
                />
              </div>
            </div>
          </div>

          {recruitmentValidation.formErrors.length ? (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <CircleAlert className="h-4 w-4" />
              <AlertTitle>ملاحظات عامة على النموذج</AlertTitle>
              <AlertDescription className="space-y-1 pt-2 leading-7">
                {recruitmentValidation.formErrors.map((issue) => (
                  <p key={issue}>{issue}</p>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_28px_72px_-52px_rgba(15,23,42,0.28)]">
        <CardHeader className="border-b border-slate-100 pb-6">
          <SectionTitle
            icon={Type}
            eyebrow="الحقول"
            title="محرر الحقول"
            description="أضف الحقول الأساسية وعدّل خصائصها. نفس الترتيب هنا هو الذي سيظهر للزائر في الصفحة العامة."
          />
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onAddField("text")}>
              <Plus className="ml-2 h-4 w-4" />
              حقل نصي
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onAddField("number")}
            >
              <Plus className="ml-2 h-4 w-4" />
              حقل رقمي
            </Button>
            <Button type="button" variant="outline" onClick={() => onAddField("date")}>
              <Plus className="ml-2 h-4 w-4" />
              حقل تاريخ
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onAddField("select")}
            >
              <Plus className="ml-2 h-4 w-4" />
              قائمة خيارات
            </Button>
            <Button type="button" variant="outline" onClick={() => onAddField("file")}>
              <Plus className="ml-2 h-4 w-4" />
              رفع ملف
            </Button>
          </div>

          {recruitment.fields.length ? (
            <div className="space-y-4">
              {recruitment.fields.map((field, index) => {
                const fieldIssues = recruitmentValidation.fieldErrors[field.id] || [];

                return (
                  <div
                    key={field.id}
                    className="rounded-[26px] border border-slate-200/80 bg-slate-50/70 p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.24)]"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="rounded-full">
                            الحقل {formatNumberEN(index + 1)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="rounded-full border-sky-200 bg-sky-50 text-sky-700"
                          >
                            {getRecruitmentFieldTypeLabel(field.type)}
                          </Badge>
                          {field.type === "number" ? (
                            <Badge
                              variant="outline"
                              className="rounded-full border-amber-200 bg-amber-50 text-amber-700"
                            >
                              {getRecruitmentNumberModeLabel(
                                field.numberMode || "default"
                              )}
                            </Badge>
                          ) : null}
                          {field.type === "file" ? (
                            <Badge
                              variant="outline"
                              className="rounded-full border-violet-200 bg-violet-50 text-violet-700"
                            >
                              {field.fileFolder || RECRUITMENT_DEFAULT_FILE_FOLDER}
                            </Badge>
                          ) : null}
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full",
                              field.required
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-white text-slate-500"
                            )}
                          >
                            {field.required ? "مطلوب" : "اختياري"}
                          </Badge>
                        </div>

                        <div>
                          <div className="text-lg font-semibold text-slate-950">
                            {field.label || "حقل بدون عنوان"}
                          </div>
                          <div className="mt-1 text-sm leading-7 text-slate-500">
                            {getRecruitmentFieldHint(field)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => onMoveField(field.id, "up")}
                          disabled={index === 0}
                          title="نقل للأعلى"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => onMoveField(field.id, "down")}
                          disabled={index === recruitment.fields.length - 1}
                          title="نقل للأسفل"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() => onRemoveField(field.id)}
                          title="حذف الحقل"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-5 md:grid-cols-2">
                      <div className="space-y-3">
                        <Label className="text-[13px] font-semibold text-slate-900">
                          عنوان الحقل
                        </Label>
                        <Input
                          value={field.label}
                          onChange={(event) =>
                            onUpdateField(field.id, { label: event.target.value })
                          }
                          placeholder="مثال: الاسم"
                          className="h-12 rounded-xl border-slate-200 bg-white shadow-none"
                        />
                      </div>

                      <div className="space-y-3">
                        <Label className="text-[13px] font-semibold text-slate-900">
                          نوع الحقل
                        </Label>
                        <Select
                          value={field.type}
                          onValueChange={(value) =>
                            onUpdateField(field.id, {
                              type: value as RecruitmentFieldType,
                            })
                          }
                        >
                          <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white shadow-none">
                            <SelectValue placeholder="اختر النوع" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">نصي</SelectItem>
                            <SelectItem value="email">بريد إلكتروني</SelectItem>
                            <SelectItem value="number">رقمي</SelectItem>
                            <SelectItem value="date">تاريخ</SelectItem>
                            <SelectItem value="select">قائمة</SelectItem>
                            <SelectItem value="textarea">نص طويل</SelectItem>
                            <SelectItem value="file">رفع ملف</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {field.type !== "date" && field.type !== "file" ? (
                        <div className="space-y-3">
                          <Label className="text-[13px] font-semibold text-slate-900">
                            Placeholder
                          </Label>
                          <Input
                            value={field.placeholder || ""}
                            onChange={(event) =>
                              onUpdateField(field.id, {
                                placeholder: event.target.value,
                              })
                            }
                            placeholder="مثال: اكتب الإجابة"
                            className="h-12 rounded-xl border-slate-200 bg-white shadow-none"
                          />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <Label className="text-[13px] font-semibold text-slate-900">
                            Placeholder
                          </Label>
                          <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm leading-7 text-slate-500">
                            {field.type === "date"
                              ? "حقول التاريخ تستخدم Date Picker مباشر، لذلك لا يظهر Placeholder عادة في الواجهة."
                              : "حقول رفع الملفات لا تستخدم Placeholder، بل تظهر كمنتقي ملف مع اسم الملف المختار."}
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        <Label className="text-[13px] font-semibold text-slate-900">
                          خصائص الحقل
                        </Label>
                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="space-y-1">
                              <div className="font-semibold text-slate-900">
                                هل الحقل مطلوب؟
                              </div>
                              <p className="text-sm leading-6 text-slate-500">
                                إذا كان مطلوبًا فلن يتم إرسال الطلب قبل تعبئته أو
                                رفع الملف المرتبط به.
                              </p>
                            </div>

                            <Checkbox
                              checked={field.required}
                              onCheckedChange={(checked) =>
                                onUpdateField(field.id, {
                                  required: Boolean(checked),
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {field.type === "number" ? (
                      <div className="mt-5 space-y-3">
                        <Label className="text-[13px] font-semibold text-slate-900">
                          نمط الرقم
                        </Label>
                        <Select
                          value={field.numberMode || "default"}
                          onValueChange={(value) =>
                            onUpdateField(field.id, {
                              numberMode: value as "default" | "phone",
                            })
                          }
                        >
                          <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">رقم عادي</SelectItem>
                            <SelectItem value="phone">رقم جوال</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {field.type === "file" ? (
                      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,240px)_1fr]">
                        <div className="space-y-3">
                          <Label className="text-[13px] font-semibold text-slate-900">
                            مجلد التخزين
                          </Label>
                          <Input
                            dir="ltr"
                            value={field.fileFolder || RECRUITMENT_DEFAULT_FILE_FOLDER}
                            onChange={(event) =>
                              onUpdateField(field.id, {
                                fileFolder: event.target.value,
                              })
                            }
                            placeholder="cv"
                            className="h-12 rounded-xl border-slate-200 bg-white shadow-none"
                          />
                        </div>

                        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-500">
                          يستخدم هذا الحقل نفس خدمة الرفع الحالية عبر Worker وR2
                          وD1، لكن الملفات ستُحفَظ تحت المسار:
                          <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 font-mono text-[13px] text-slate-700">
                            careers/{"{applicationId}"}/
                            {field.fileFolder || RECRUITMENT_DEFAULT_FILE_FOLDER}/...
                          </div>
                          اكتب اسمًا إنجليزيًا واضحًا مثل <span dir="ltr">cv</span>{" "}
                          أو <span dir="ltr">certificates</span> أو{" "}
                          <span dir="ltr">attachments</span>.
                        </div>
                      </div>
                    ) : null}

                    {field.type === "select" ? (
                      <div className="mt-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-950">
                              خيارات القائمة
                            </div>
                            <div className="text-sm text-slate-500">
                              هذه الخيارات ستظهر كما هي داخل القائمة المنسدلة في
                              الصفحة العامة.
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onAddOption(field.id)}
                          >
                            <Plus className="ml-2 h-4 w-4" />
                            خيار جديد
                          </Button>
                        </div>

                        <div className="space-y-3">
                          {(field.options || []).map((option, optionIndex) => (
                            <div
                              key={option.id}
                              className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                                {formatNumberEN(optionIndex + 1)}
                              </div>

                              <Input
                                value={option.label}
                                onChange={(event) =>
                                  onUpdateOption(field.id, option.id, event.target.value)
                                }
                                placeholder="اكتب اسم الخيار"
                                className="h-11 rounded-xl border-slate-200 bg-white shadow-none"
                              />

                              <Button
                                type="button"
                                variant="ghost"
                                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                onClick={() => onRemoveOption(field.id, option.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {fieldIssues.length ? (
                      <Alert className="mt-5 border-amber-200 bg-amber-50 text-amber-900">
                        <CircleAlert className="h-4 w-4" />
                        <AlertTitle>هذا الحقل يحتاج مراجعة</AlertTitle>
                        <AlertDescription className="space-y-1 pt-2 leading-7">
                          {fieldIssues.map((issue) => (
                            <p key={issue}>{issue}</p>
                          ))}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[26px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center text-slate-500">
              أضف أول حقل ليبدأ تكوين نموذج التوظيف العام.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_28px_72px_-52px_rgba(15,23,42,0.28)]">
        <CardHeader className="border-b border-slate-100 pb-6">
          <SectionTitle
            icon={Globe}
            eyebrow="المعاينة"
            title="معاينة الصفحة العامة"
            description="نفس الحقول التي ستظهر للزائر في صفحة /careers، مع الحفاظ على ترتيب النموذج الحالي."
          />
        </CardHeader>
        <CardContent className="pt-6">
          {recruitment.fields.length ? (
            <div className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_20px_52px_-40px_rgba(15,23,42,0.25)] sm:p-8">
              <div className="flex flex-col gap-2 border-b border-slate-100 pb-6 text-right">
                <div className="text-sm font-semibold text-[#8d6700]">
                  صفحة التوظيف العامة
                </div>
                <div className="text-2xl font-semibold tracking-tight text-slate-950">
                  نموذج التقديم كما سيظهر للزائر
                </div>
                <div className="text-sm leading-7 text-slate-500">
                  يمكنك اختبار ترتيب الحقول وشكلها العام من هنا قبل الحفظ.
                </div>
              </div>

              <div className="mt-8 space-y-8">
                <RecruitmentFormFields
                  idPrefix="recruitment-preview"
                  fields={recruitment.fields}
                  values={recruitmentPreviewValues}
                  onValueChange={onPreviewValueChange}
                />

                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="h-12 rounded-full bg-[#0f172a] px-8 text-sm font-semibold text-white hover:bg-[#111f38]"
                    disabled
                  >
                    إرسال الطلب
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[26px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-14 text-center text-slate-500">
              ستظهر المعاينة هنا بعد إضافة الحقول إلى النموذج.
            </div>
          )}
        </CardContent>
      </Card>

      {recruitmentIssuesCount > 0 ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>يوجد ما يحتاج مراجعة قبل الحفظ</AlertTitle>
          <AlertDescription className="leading-7">
            عدد الملاحظات الحالية: {formatNumberEN(recruitmentIssuesCount)}.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
