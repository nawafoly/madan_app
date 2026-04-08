import { useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { BriefcaseBusiness, CalendarDays, Mail, Phone, Save, Search, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { auth, db } from "@/_core/firebase";
import { hasPermission, useAuth } from "@/_core/hooks/useAuth";
import {
  AUDIT_ACTIONS,
  auditedUpdateDoc,
  buildAuditSource,
} from "@/lib/auditLog";
import {
  EMPLOYEE_EMPTY_VALUE,
  normalizeEmployeeProfile,
  type EmployeeProfileUserDoc,
} from "@/lib/employeeProfile";
import { formatDateEN, formatNumberEN, toDateSafe } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { EmployeeEmploymentDoc, EmployeeEmploymentStatus } from "@shared/employee";

type EmployeeRecord = EmployeeProfileUserDoc & {
  id: string;
  firebaseUser?: {
    photoURL?: string | null;
  } | null;
};

type EmployeeFormValues = {
  jobTitle: string;
  department: string;
  employmentStatus: string;
  startDate: string;
  leaveBalance: string;
  adminNotes: string;
};

const EMPLOYMENT_STATUS_OPTIONS: Array<{
  value: EmployeeEmploymentStatus;
  label: string;
}> = [
  { value: "active", label: "على رأس العمل" },
  { value: "probation", label: "فترة تجربة" },
  { value: "on_leave", label: "في إجازة" },
  { value: "inactive", label: "غير نشط" },
  { value: "suspended", label: "موقوف" },
  { value: "terminated", label: "منتهي الارتباط الوظيفي" },
];

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function toDateInputValue(value: unknown) {
  const date = toDateSafe(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNullableNumber(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasValuesObject(value: unknown) {
  return !!value && typeof value === "object" && Object.keys(value as Record<string, any>).length > 0;
}

function hasEmployeeProfileSignal(
  userData: Record<string, any>,
  employeeDoc?: Record<string, any> | null
) {
  const userEmployment = (userData.employeeProfile?.employment ||
    userData.employment ||
    {}) as Record<string, any>;
  const userPersonal = (userData.employeeProfile?.personal ||
    userData.personal ||
    {}) as Record<string, any>;

  return (
    !!employeeDoc ||
    String(userData.role || "").trim().toLowerCase() === "staff" ||
    !!pickText(userData.linkedEmployeeId) ||
    hasValuesObject(userEmployment) ||
    hasValuesObject(userPersonal)
  );
}

function buildMergedEmployeeRecord(input: {
  userId: string;
  userData: Record<string, any>;
  employeeDocId?: string | null;
  employeeData?: Record<string, any> | null;
}): EmployeeRecord {
  const { userId, userData, employeeDocId, employeeData } = input;

  const userEmployeeProfile = (userData.employeeProfile || {}) as Record<string, any>;
  const employeeEmployeeProfile = (employeeData?.employeeProfile || {}) as Record<
    string,
    any
  >;

  const mergedPersonal =
    (employeeEmployeeProfile.personal as Record<string, any> | undefined) ||
    (employeeData?.personal as Record<string, any> | undefined) ||
    (userEmployeeProfile.personal as Record<string, any> | undefined) ||
    (userData.personal as Record<string, any> | undefined) ||
    undefined;

  const mergedEmployment =
    (employeeEmployeeProfile.employment as Record<string, any> | undefined) ||
    (employeeData?.employment as Record<string, any> | undefined) ||
    (userEmployeeProfile.employment as Record<string, any> | undefined) ||
    (userData.employment as Record<string, any> | undefined) ||
    undefined;

  const mergedEmployeeProfile =
    mergedPersonal || mergedEmployment || hasValuesObject(employeeEmployeeProfile) || hasValuesObject(userEmployeeProfile)
      ? {
          ...userEmployeeProfile,
          ...employeeEmployeeProfile,
          ...(mergedPersonal ? { personal: mergedPersonal } : {}),
          ...(mergedEmployment ? { employment: mergedEmployment } : {}),
        }
      : undefined;

  return {
    ...(employeeData || {}),
    ...userData,
    id: userId,
    uid: pickText(userId, userData.uid, employeeData?.linkedUserUid, employeeData?.uid) || userId,
    email: pickText(userData.email, employeeData?.email) || null,
    displayName:
      pickText(userData.displayName, userData.name, employeeData?.displayName, employeeData?.name) ||
      null,
    name:
      pickText(userData.name, userData.displayName, employeeData?.name, employeeData?.displayName) ||
      null,
    title:
      pickText(
        userData.title,
        employeeData?.title,
        mergedEmployment?.title,
        mergedEmployment?.jobTitle
      ) || null,
    department:
      pickText(userData.department, employeeData?.department, mergedEmployment?.department) ||
      null,
    linkedEmployeeId: pickText(userData.linkedEmployeeId, employeeDocId) || null,
    employeeProfile: mergedEmployeeProfile,
    personal: mergedPersonal,
    employment: mergedEmployment,
    photoURL: pickText(userData.photoURL, employeeData?.photoURL) || null,
  } as EmployeeRecord;
}

function buildEmployeeFormValues(employee: EmployeeRecord | null | undefined): EmployeeFormValues {
  const employment = (employee?.employeeProfile?.employment ||
    employee?.employment ||
    {}) as Record<string, any>;

  return {
    jobTitle: pickText(employment.jobTitle, employment.title, employee?.title),
    department: pickText(employment.department, employee?.department),
    employmentStatus:
      pickText(employment.employmentStatus, employment.status) || "active",
    startDate: toDateInputValue(employment.startDate ?? employee?.startDate),
    leaveBalance:
      employment.leaveBalance === 0 || employee?.leaveBalance === 0
        ? String(employment.leaveBalance ?? employee?.leaveBalance ?? 0)
        : pickText(employment.leaveBalance, employee?.leaveBalance),
    adminNotes: pickText(employment.adminNotes),
  };
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-slate-800">{label}</Label>
      {children}
      {description ? (
        <p className="text-xs leading-5 text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

function ReadonlyMeta({
  icon: Icon,
  label,
  value,
  dir,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  dir?: "rtl" | "ltr";
}) {
  return (
    <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div dir={dir} className="mt-2 text-sm font-semibold text-slate-950">
        {value || EMPLOYEE_EMPTY_VALUE}
      </div>
    </div>
  );
}

export default function EmployeesManagementPage() {
  const { user } = useAuth();
  const canManageEmployees = hasPermission(user, "employees.manage");

  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [form, setForm] = useState<EmployeeFormValues>(() =>
    buildEmployeeFormValues(null)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError("");

    let usersReady = false;
    let employeesReady = false;
    let usersMap = new Map<string, Record<string, any>>();
    let employeesMap = new Map<string, Record<string, any>>();

    const rebuildEmployees = () => {
      if (!usersReady || !employeesReady) return;
      const employeesByLinkedUserId = new Map<
        string,
        { docId: string; data: Record<string, any> }
      >();

      employeesMap.forEach((employeeData, employeeDocId) => {
        const linkedUserId = pickText(
          employeeData.linkedUserUid,
          employeeData.uid,
          employeeData.userId
        );

        if (linkedUserId && !employeesByLinkedUserId.has(linkedUserId)) {
          employeesByLinkedUserId.set(linkedUserId, {
            docId: employeeDocId,
            data: employeeData,
          });
        }
      });

      const rows = Array.from(usersMap.entries())
        .map(([userId, userData]) => {
          const linkedEmployeeId = pickText(userData.linkedEmployeeId);
          const linkedEmployee =
            (linkedEmployeeId && employeesMap.has(linkedEmployeeId)
              ? {
                  docId: linkedEmployeeId,
                  data: employeesMap.get(linkedEmployeeId) as Record<string, any>,
                }
              : employeesByLinkedUserId.get(userId)) ||
            (employeesMap.has(userId)
              ? {
                  docId: userId,
                  data: employeesMap.get(userId) as Record<string, any>,
                }
              : null);

          if (!hasEmployeeProfileSignal(userData, linkedEmployee?.data)) {
            return null;
          }

          return buildMergedEmployeeRecord({
            userId,
            userData,
            employeeDocId: linkedEmployee?.docId ?? null,
            employeeData: linkedEmployee?.data ?? null,
          });
        })
        .filter((employee): employee is EmployeeRecord => !!employee)
        .sort((a, b) => {
          const aName = pickText(a.displayName, a.name, a.email).toLowerCase();
          const bName = pickText(b.displayName, b.name, b.email).toLowerCase();
          return aName.localeCompare(bName);
        });

      setEmployees(rows);
      setLoading(false);
    };

    const unsubscribeUsers = onSnapshot(
      collection(db, "users"),
      snapshot => {
        usersMap = new Map(
          snapshot.docs.map(docSnapshot => [
            docSnapshot.id,
            docSnapshot.data() as Record<string, any>,
          ])
        );
        usersReady = true;
        rebuildEmployees();
      },
      snapshotError => {
        console.error("employees_snapshot_error", snapshotError);
        setEmployees([]);
        setError("تعذر تحميل قائمة الموظفين.");
        setLoading(false);
      }
    );

    const unsubscribeEmployeeDirectory = onSnapshot(
      collection(db, "employees"),
      snapshot => {
        employeesMap = new Map(
          snapshot.docs.map(docSnapshot => [
            docSnapshot.id,
            docSnapshot.data() as Record<string, any>,
          ])
        );
        employeesReady = true;
        rebuildEmployees();
      },
      snapshotError => {
        console.error("employee_directory_snapshot_error", snapshotError);
        employeesMap = new Map();
        employeesReady = true;
        rebuildEmployees();
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeEmployeeDirectory();
    };
  }, []);

  useEffect(() => {
    if (!employees.length) {
      setSelectedEmployeeId("");
      return;
    }

    const selectedExists = employees.some(employee => employee.id === selectedEmployeeId);
    if (!selectedEmployeeId || !selectedExists) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  const employeeCards = useMemo(
    () =>
      employees.map(employee => {
        const profile = normalizeEmployeeProfile(employee, {
          displayName: employee.displayName,
          email: employee.email,
          photoURL:
            employee.photoURL || employee.firebaseUser?.photoURL || auth.currentUser?.photoURL,
        });

        return {
          employee,
          profile,
          searchText: [
            profile.personal.name,
            profile.personal.email,
            profile.personal.phone,
            profile.employment.title,
            profile.employment.department,
            profile.employment.employeeCode,
          ]
            .join(" ")
            .toLowerCase(),
        };
      }),
    [employees]
  );

  const filteredEmployeeCards = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return employeeCards;
    return employeeCards.filter(card => card.searchText.includes(normalizedQuery));
  }, [employeeCards, searchQuery]);

  const selectedEmployee =
    employees.find(employee => employee.id === selectedEmployeeId) ?? null;

  const selectedEmployeeProfile = useMemo(
    () =>
      selectedEmployee
        ? normalizeEmployeeProfile(selectedEmployee, {
            displayName: selectedEmployee.displayName,
            email: selectedEmployee.email,
            photoURL:
              selectedEmployee.photoURL ||
              selectedEmployee.firebaseUser?.photoURL ||
              auth.currentUser?.photoURL,
          })
        : null,
    [selectedEmployee]
  );

  const initialForm = useMemo(
    () => buildEmployeeFormValues(selectedEmployee),
    [selectedEmployee]
  );

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm, selectedEmployeeId]);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm]
  );

  const activeEmployeesCount = employeeCards.filter(
    card => card.profile.employment.statusKey === "active"
  ).length;
  const onLeaveEmployeesCount = employeeCards.filter(
    card => card.profile.employment.statusKey === "on_leave"
  ).length;
  const probationEmployeesCount = employeeCards.filter(
    card => card.profile.employment.statusKey === "probation"
  ).length;

  const handleFormChange = <K extends keyof EmployeeFormValues>(
    key: K,
    value: EmployeeFormValues[K]
  ) => {
    setForm(current => ({
      ...current,
      [key]: value,
    }));
  };

  const handleReset = () => {
    setForm(initialForm);
  };

  const handleSave = async () => {
    if (!selectedEmployee || !selectedEmployeeProfile) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية تعديل بيانات الموظفين.");
      return;
    }

    const leaveBalance = toNullableNumber(form.leaveBalance);
    if (form.leaveBalance.trim() && leaveBalance === null) {
      toast.error("رصيد الإجازات يجب أن يكون رقمًا صالحًا.");
      return;
    }

    setSaving(true);
    try {
      const currentEmployment = (selectedEmployee.employeeProfile?.employment ||
        selectedEmployee.employment ||
        {}) as EmployeeEmploymentDoc;

      const nextEmployment: EmployeeEmploymentDoc = {
        ...currentEmployment,
        title: form.jobTitle.trim() || null,
        jobTitle: form.jobTitle.trim() || null,
        department: form.department.trim() || null,
        startDate: form.startDate || null,
        leaveBalance,
        status: form.employmentStatus || "active",
        employmentStatus: form.employmentStatus || "active",
        adminNotes: form.adminNotes.trim() || null,
        updatedAt: serverTimestamp(),
        updatedByUid: user?.uid || null,
        updatedByEmail: user?.email || null,
      };

      await auditedUpdateDoc({
        ref: doc(db, "users", selectedEmployee.id),
        data: {
          title: form.jobTitle.trim() || null,
          department: form.department.trim() || null,
          startDate: form.startDate || null,
          leaveBalance,
          updatedAt: serverTimestamp(),
          employment: nextEmployment,
          "employeeProfile.employment": nextEmployment,
        } as any,
        action: AUDIT_ACTIONS.USER_UPDATED,
        category: "user",
        entityType: "user",
        source: buildAuditSource({
          area: "admin",
          page: "Employees",
          method: "update_employment_profile",
        }),
        relatedIds: { userId: selectedEmployee.id },
        message: `Updated employee employment profile for ${selectedEmployeeProfile.personal.name}`,
        meta: {
          targetUserEmail: selectedEmployee.email || null,
          targetUserName: selectedEmployeeProfile.personal.name,
          jobTitle: nextEmployment.jobTitle || null,
          department: nextEmployment.department || null,
          employmentStatus: nextEmployment.employmentStatus || null,
          leaveBalance,
        },
      });

      toast.success("تم حفظ بيانات الموظف الوظيفية.");
    } catch (saveError) {
      console.error("save_employee_profile_error", saveError);
      toast.error("تعذر حفظ بيانات الموظف الوظيفية.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-6 text-right">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-950">
            إدارة الموظفين
          </h1>
          <p className="max-w-3xl text-lg text-slate-500">
            صفحة مخصصة لإدارة البيانات الوظيفية للموظفين من جهة الإدارة والموارد البشرية،
            مع فصل واضح بين ما يشاهده الموظف في بروفايله وما يتم تعديله من داخل اللوحة.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-slate-200/80">
            <CardContent className="p-5">
              <div className="text-xs font-semibold tracking-[0.16em] text-slate-500">
                الموظفون
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {formatNumberEN(employeeCards.length)}
              </div>
              <div className="mt-2 text-sm text-slate-500">
                إجمالي السجلات الظاهرة ضمن صفحة إدارة الموظفين.
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80">
            <CardContent className="p-5">
              <div className="text-xs font-semibold tracking-[0.16em] text-slate-500">
                على رأس العمل
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {formatNumberEN(activeEmployeesCount)}
              </div>
              <div className="mt-2 text-sm text-slate-500">
                موظفون بحالة وظيفية نشطة حاليًا.
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80">
            <CardContent className="p-5">
              <div className="text-xs font-semibold tracking-[0.16em] text-slate-500">
                متابعة الحالة
              </div>
              <div className="mt-2 flex items-center gap-3 text-sm font-semibold text-slate-950">
                <span>إجازة: {formatNumberEN(onLeaveEmployeesCount)}</span>
                <span className="text-slate-300">|</span>
                <span>تجربة: {formatNumberEN(probationEmployeesCount)}</span>
              </div>
              <div className="mt-2 text-sm text-slate-500">
                قراءة سريعة لحالات الموظفين التشغيلية.
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="overflow-hidden border-slate-200/80">
            <CardHeader className="border-b border-slate-100 bg-white/90">
              <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                <BriefcaseBusiness className="h-5 w-5 text-[#030640]" />
                قائمة الموظفين
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-slate-500">
                اختر موظفًا لعرض ملفه الوظيفي وإدارة بياناته من نفس الصفحة.
              </CardDescription>

              <div className="relative mt-3">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="ابحث بالاسم أو البريد أو القسم"
                  className="h-11 pr-9"
                />
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <ScrollArea className="h-[680px]">
                <div className="space-y-3 p-4">
                  {loading ? (
                    <div className="rounded-[24px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                      جاري تحميل الموظفين...
                    </div>
                  ) : error ? (
                    <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm text-rose-700">
                      {error}
                    </div>
                  ) : filteredEmployeeCards.length ? (
                    filteredEmployeeCards.map(card => {
                      const isActive = card.employee.id === selectedEmployeeId;
                      const startDateLabel = card.profile.employment.startDate
                        ? formatDateEN(card.profile.employment.startDate)
                        : EMPLOYEE_EMPTY_VALUE;

                      return (
                        <button
                          key={card.employee.id}
                          type="button"
                          onClick={() => setSelectedEmployeeId(card.employee.id)}
                          className={cn(
                            "w-full rounded-[24px] border px-4 py-4 text-right transition-all",
                            isActive
                              ? "border-[#F2B705]/50 bg-[#F2B705]/10 shadow-[0_20px_44px_-34px_rgba(242,183,5,0.55)]"
                              : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                          )}
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-base font-semibold text-slate-950">
                                  {card.profile.personal.name}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {card.profile.personal.email}
                                </div>
                              </div>

                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full",
                                  card.profile.employment.statusTone === "success"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : card.profile.employment.statusTone === "warning"
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : "border-slate-200 bg-slate-100 text-slate-700"
                                )}
                              >
                                {card.profile.employment.statusLabel}
                              </Badge>
                            </div>

                            <div className="grid gap-2 text-sm text-slate-600">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-500">المسمى</span>
                                <span className="font-medium text-slate-900">
                                  {card.profile.employment.title}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-500">القسم</span>
                                <span className="font-medium text-slate-900">
                                  {card.profile.employment.department}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-500">بداية العمل</span>
                                <span className="font-medium text-slate-900">
                                  {startDateLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <Empty className="min-h-[360px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                      <EmptyHeader>
                        <EmptyMedia
                          variant="icon"
                          className="bg-[#F2B705]/12 text-[#030640]"
                        >
                          <UserRound className="size-5" />
                        </EmptyMedia>
                        <EmptyTitle>لا توجد نتائج مطابقة</EmptyTitle>
                        <EmptyDescription>
                          جرّب تغيير عبارة البحث أو أزل الفلتر لعرض الموظفين الحاليين.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200/80">
            <CardHeader className="border-b border-slate-100 bg-white/90">
              <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                <ShieldCheck className="h-5 w-5 text-[#030640]" />
                بيانات الموظف الوظيفية
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-slate-500">
                هذا القسم مخصص للإدارة والموارد البشرية فقط. الموظف يرى هذه البيانات في
                بروفايله بشكل للعرض فقط ولا يحررها بنفسه.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6">
              {selectedEmployee && selectedEmployeeProfile ? (
                <div className="space-y-6">
                  <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.95)_100%)] p-5 shadow-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div>
                          <div className="text-2xl font-semibold tracking-tight text-slate-950">
                            {selectedEmployeeProfile.personal.name}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {selectedEmployeeProfile.employment.title}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="rounded-full">
                            {selectedEmployeeProfile.employment.department}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full",
                              selectedEmployeeProfile.employment.statusTone === "success"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : selectedEmployeeProfile.employment.statusTone === "warning"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-slate-200 bg-slate-100 text-slate-700"
                            )}
                          >
                            {selectedEmployeeProfile.employment.statusLabel}
                          </Badge>
                          {selectedEmployeeProfile.employment.employeeCode !== EMPLOYEE_EMPTY_VALUE ? (
                            <Badge variant="outline" className="rounded-full">
                              رقم الموظف: {selectedEmployeeProfile.employment.employeeCode}
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <ReadonlyMeta
                          icon={Mail}
                          label="البريد"
                          value={selectedEmployeeProfile.personal.email}
                          dir="ltr"
                        />
                        <ReadonlyMeta
                          icon={Phone}
                          label="الجوال"
                          value={selectedEmployeeProfile.personal.phone || EMPLOYEE_EMPTY_VALUE}
                          dir="ltr"
                        />
                        <ReadonlyMeta
                          icon={CalendarDays}
                          label="بداية العمل"
                          value={
                            selectedEmployeeProfile.employment.startDate
                              ? formatDateEN(selectedEmployeeProfile.employment.startDate)
                              : EMPLOYEE_EMPTY_VALUE
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="المسمى الوظيفي">
                      <Input
                        value={form.jobTitle}
                        onChange={event => handleFormChange("jobTitle", event.target.value)}
                        placeholder="مثال: مسؤول عمليات"
                        disabled={!canManageEmployees || saving}
                      />
                    </Field>

                    <Field label="القسم / الإدارة">
                      <Input
                        value={form.department}
                        onChange={event => handleFormChange("department", event.target.value)}
                        placeholder="مثال: الموارد البشرية"
                        disabled={!canManageEmployees || saving}
                      />
                    </Field>

                    <Field label="الحالة الوظيفية">
                      <Select
                        value={form.employmentStatus}
                        onValueChange={value => handleFormChange("employmentStatus", value)}
                        disabled={!canManageEmployees || saving}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="اختر الحالة الوظيفية" />
                        </SelectTrigger>
                        <SelectContent>
                          {EMPLOYMENT_STATUS_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="تاريخ بداية العمل">
                      <Input
                        type="date"
                        value={form.startDate}
                        onChange={event => handleFormChange("startDate", event.target.value)}
                        disabled={!canManageEmployees || saving}
                      />
                    </Field>

                    <Field
                      label="رصيد الإجازات"
                      description="يُحفظ كرقم ويمكن لاحقًا ربطه بطلبات الإجازة."
                    >
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={form.leaveBalance}
                        onChange={event => handleFormChange("leaveBalance", event.target.value)}
                        placeholder="مثال: 21"
                        disabled={!canManageEmployees || saving}
                      />
                    </Field>

                    <Field
                      label="صلاحية الصفحة"
                      description={
                        canManageEmployees
                          ? "يمكنك تعديل بيانات العمل وحفظها من هذه الصفحة."
                          : "تمتلك صلاحية عرض فقط، والحفظ معطل لهذا الحساب."
                      }
                    >
                      <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        {canManageEmployees
                          ? "إدارة كاملة لبيانات الموظف الوظيفية"
                          : "عرض بيانات الموظف الوظيفية فقط"}
                      </div>
                    </Field>
                  </div>

                  <Field
                    label="ملاحظات إدارية"
                    description="ملاحظات داخلية مخصصة للإدارة والموارد البشرية."
                  >
                    <Textarea
                      value={form.adminNotes}
                      onChange={event => handleFormChange("adminNotes", event.target.value)}
                      placeholder="اكتب أي ملاحظات إدارية داخلية هنا"
                      className="min-h-36"
                      disabled={!canManageEmployees || saving}
                    />
                  </Field>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <div className="text-sm text-slate-500">
                      {isDirty
                        ? "هناك تغييرات غير محفوظة على ملف الموظف."
                        : "البيانات الوظيفية الحالية متزامنة ومحفوظة."}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleReset}
                        disabled={!isDirty || saving}
                      >
                        إعادة ضبط
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={!canManageEmployees || !isDirty || saving}
                        className="bg-[#F2B705] text-slate-950 hover:bg-[#e0ab00]"
                      >
                        <Save className="ml-2 h-4 w-4" />
                        {saving ? "جارٍ الحفظ..." : "حفظ البيانات الوظيفية"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Empty className="min-h-[560px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                  <EmptyHeader>
                    <EmptyMedia
                      variant="icon"
                      className="bg-[#F2B705]/12 text-[#030640]"
                    >
                      <BriefcaseBusiness className="size-5" />
                    </EmptyMedia>
                    <EmptyTitle>لا يوجد موظف محدد</EmptyTitle>
                    <EmptyDescription>
                      اختر موظفًا من القائمة لعرض ملفه الوظيفي وإدارة بياناته.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
