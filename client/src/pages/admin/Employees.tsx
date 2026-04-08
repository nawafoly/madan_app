import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  collection,
  doc,
  onSnapshot,
  or,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  BriefcaseBusiness,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Mail,
  Phone,
  Save,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
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
import {
  EMPLOYEE_LEAVE_REQUESTS_COLLECTION,
  getLatestApprovedEmployeeLeaveRequest,
  formatLeaveDateRange,
  formatLeaveDaysLabel,
  getLeaveStatusMeta,
  getLeaveTypeLabel,
  normalizeEmployeeLeaveRequest,
  sortEmployeeLeaveRequests,
  type EmployeeLeaveRequestRecord,
} from "@/lib/employeeLeave";
import { formatDateEN, formatDateTimeEN, formatNumberEN, toDateSafe } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type {
  EmployeeEmploymentDoc,
  EmployeeEmploymentStatus,
  EmployeeLeaveRequestDoc,
  EmployeeLeaveRequestStatus,
} from "@shared/employee";

type EmployeeRecord = EmployeeProfileUserDoc & {
  id: string;
  linkedEmployeeId?: string | null;
  firebaseUser?: {
    photoURL?: string | null;
  } | null;
};

type EmployeeFormValues = {
  fullName: string;
  email: string;
  phone: string;
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
  const normalizedRole = String(userData.role || "").trim().toLowerCase();
  if (normalizedRole === "client" || normalizedRole === "guest") {
    return false;
  }

  const userEmployment = (userData.employeeProfile?.employment ||
    userData.employment ||
    {}) as Record<string, any>;
  const userPersonal = (userData.employeeProfile?.personal ||
    userData.personal ||
    {}) as Record<string, any>;

  return (
    !!employeeDoc ||
    normalizedRole === "staff" ||
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
    uid:
      pickText(userData.uid, employeeData?.linkedUserUid, employeeData?.uid, userId) ||
      userId,
    email:
      pickText(
        userData.email,
        employeeData?.email,
        mergedPersonal?.email,
        userEmployeeProfile.personal?.email,
        userData.personal?.email
      ) || null,
    displayName:
      pickText(
        userData.displayName,
        userData.name,
        userData.fullName,
        employeeData?.displayName,
        employeeData?.name,
        employeeData?.fullName,
        mergedPersonal?.name
      ) ||
      null,
    name:
      pickText(
        userData.name,
        userData.displayName,
        userData.fullName,
        employeeData?.name,
        employeeData?.displayName,
        employeeData?.fullName,
        mergedPersonal?.name
      ) ||
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
  const personal = (employee?.employeeProfile?.personal ||
    employee?.personal ||
    {}) as Record<string, any>;
  const employment = (employee?.employeeProfile?.employment ||
    employee?.employment ||
    {}) as Record<string, any>;

  return {
    fullName: pickText(
      employee?.displayName,
      employee?.name,
      employee?.fullName,
      personal.name
    ),
    email: pickText(employee?.email, personal.email),
    phone: pickText(personal.phone, employee?.phone, employee?.mobile, employee?.phoneNumber),
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

function LeaveStatusBadge({ status }: { status: unknown }) {
  const meta = getLeaveStatusMeta(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full shadow-none",
        meta.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : meta.tone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : meta.tone === "danger"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-slate-200 bg-slate-100 text-slate-600"
      )}
    >
      {meta.label}
    </Badge>
  );
}

function LeaveOverviewStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof UserRound;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-base font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function resolveEmploymentLeaveBalance(
  ...sources: Array<Record<string, any> | null | undefined>
) {
  for (const source of sources) {
    const employment = (source?.employeeProfile?.employment ||
      source?.employment ||
      {}) as Record<string, any>;

    const candidates = [employment.leaveBalance, source?.leaveBalance];
    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function resolveEmployeeAuthUid(employee: EmployeeRecord | null | undefined) {
  return String(employee?.uid || employee?.id || "").trim();
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
  const [leaveRequests, setLeaveRequests] = useState<EmployeeLeaveRequestRecord[]>([]);
  const [leaveRequestsLoading, setLeaveRequestsLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingLeaveRequestId, setReviewingLeaveRequestId] = useState<string | null>(
    null
  );

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
  const selectedEmployeeAuthUid = resolveEmployeeAuthUid(selectedEmployee);

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

  useEffect(() => {
    if (!selectedEmployeeAuthUid) {
      setLeaveRequests([]);
      setLeaveRequestsLoading(false);
      setReviewNotes({});
      return;
    }

    setReviewNotes({});
    setLeaveRequestsLoading(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_LEAVE_REQUESTS_COLLECTION),
        or(
          where("userId", "==", selectedEmployeeAuthUid),
          where("employeeUid", "==", selectedEmployeeAuthUid)
        )
      ),
      snapshot => {
        const rows = sortEmployeeLeaveRequests(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeLeaveRequest(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          )
        );
        setLeaveRequests(rows);
        setLeaveRequestsLoading(false);
      },
      snapshotError => {
        console.error("employee_leave_requests_admin_snapshot_error", snapshotError);
        setLeaveRequests([]);
        setLeaveRequestsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedEmployeeAuthUid]);

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
  const latestApprovedLeaveRequest = useMemo(
    () => getLatestApprovedEmployeeLeaveRequest(leaveRequests),
    [leaveRequests]
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

    const normalizedFullName = form.fullName.trim();
    const normalizedEmail = form.email.trim();
    const normalizedPhone = form.phone.trim();
    const leaveBalance = toNullableNumber(form.leaveBalance);
    if (!normalizedFullName) {
      toast.error("يجب إدخال اسم الموظف.");
      return;
    }

    if (
      !normalizedEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      toast.error("يرجى إدخال بريد إلكتروني صحيح.");
      return;
    }
    if (form.leaveBalance.trim() && leaveBalance === null) {
      toast.error("رصيد الإجازات يجب أن يكون رقمًا صالحًا.");
      return;
    }

    setSaving(true);
    try {
      const currentPersonal = (selectedEmployee.employeeProfile?.personal ||
        selectedEmployee.personal ||
        {}) as Record<string, any>;
      const currentEmployment = (selectedEmployee.employeeProfile?.employment ||
        selectedEmployee.employment ||
        {}) as EmployeeEmploymentDoc;
      const linkedUserUid =
        String(selectedEmployee.uid || selectedEmployee.id || "").trim() ||
        selectedEmployee.id;
      const nextPersonal = {
        ...currentPersonal,
        name: normalizedFullName,
        email: normalizedEmail,
        phone: normalizedPhone || null,
      };

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

      try {
        await auditedUpdateDoc({
          ref: doc(db, "users", selectedEmployee.id),
          data: {
            displayName: normalizedFullName,
            name: normalizedFullName,
            fullName: normalizedFullName,
            email: normalizedEmail,
            phone: normalizedPhone || null,
            "profile.name": normalizedFullName,
            "profile.displayName": normalizedFullName,
            "profile.email": normalizedEmail,
            "profile.phone": normalizedPhone || null,
            title: form.jobTitle.trim() || null,
            department: form.department.trim() || null,
            startDate: form.startDate || null,
            leaveBalance,
            updatedAt: serverTimestamp(),
            employment: nextEmployment,
            "employeeProfile.personal": nextPersonal,
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
            targetUserEmail: normalizedEmail,
            targetUserName: normalizedFullName,
            phone: normalizedPhone || null,
            jobTitle: nextEmployment.jobTitle || null,
            department: nextEmployment.department || null,
            employmentStatus: nextEmployment.employmentStatus || null,
            leaveBalance,
          },
        });
      } catch (error) {
        console.error("save_employee_profile_user_update_error", {
          userId: selectedEmployee.id,
          error,
        });
        throw error;
      }

      if (selectedEmployee.linkedEmployeeId) {
        try {
          await setDoc(
            doc(db, "employees", selectedEmployee.linkedEmployeeId),
            {
              uid: linkedUserUid,
              linkedUserUid: linkedUserUid,
              name: normalizedFullName,
              displayName: normalizedFullName,
              fullName: normalizedFullName,
              email: normalizedEmail,
              phone: normalizedPhone || null,
              profile: {
                name: normalizedFullName,
                displayName: normalizedFullName,
                email: normalizedEmail,
                phone: normalizedPhone || null,
              },
              title: form.jobTitle.trim() || null,
              department: form.department.trim() || null,
              startDate: form.startDate || null,
              leaveBalance,
              updatedAt: serverTimestamp(),
              employment: nextEmployment,
              employeeProfile: {
                personal: nextPersonal,
                employment: nextEmployment,
              },
            },
            { merge: true }
          );
        } catch (error) {
          console.error("save_employee_profile_employee_update_error", {
            employeeDocId: selectedEmployee.linkedEmployeeId,
            error,
          });
          throw error;
        }
      }

      toast.success("تم حفظ بيانات الموظف الوظيفية.");
    } catch {
      toast.error("تعذر حفظ بيانات الموظف الوظيفية.");
    } finally {
      setSaving(false);
    }
  };

  const handleReviewNoteChange = (requestId: string, value: string) => {
    setReviewNotes(current => ({
      ...current,
      [requestId]: value,
    }));
  };

  const handleReviewLeaveRequest = async (
    request: EmployeeLeaveRequestRecord,
    nextStatus: EmployeeLeaveRequestStatus
  ) => {
    if (!selectedEmployee || !selectedEmployeeProfile) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية مراجعة طلبات الإجازة.");
      return;
    }

    setReviewingLeaveRequestId(request.id);
    try {
      await runTransaction(db, async tx => {
        const leaveRequestRef = doc(db, EMPLOYEE_LEAVE_REQUESTS_COLLECTION, request.id);
        const leaveRequestSnap = await tx.get(leaveRequestRef);
        if (!leaveRequestSnap.exists()) {
          throw new Error("leave_request_not_found");
        }

        const currentLeaveRequest =
          leaveRequestSnap.data() as EmployeeLeaveRequestDoc;
        const currentStatus = String(currentLeaveRequest.status || "pending")
          .trim()
          .toLowerCase();
        if (currentStatus !== "pending") {
          throw new Error("leave_request_already_reviewed");
        }

        const daysCount = Number(
          currentLeaveRequest.daysCount ?? request.daysCount ?? 0
        );
        if (!Number.isFinite(daysCount) || daysCount <= 0) {
          throw new Error("leave_request_invalid_days");
        }

        const hrNote =
          String(reviewNotes[request.id] ?? request.hrNote ?? "").trim() || null;
        const userRef = doc(db, "users", selectedEmployee.id);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) {
          throw new Error("employee_user_not_found");
        }

        const userData = (userSnap.data() as Record<string, any>) || {};
        const userEmployment = (userData.employeeProfile?.employment ||
          userData.employment ||
          {}) as Record<string, any>;
        const linkedUserUid = selectedEmployeeAuthUid || selectedEmployee.id;

        const employeeDocId = String(
          selectedEmployee.linkedEmployeeId ||
            currentLeaveRequest.employeeDocId ||
            currentLeaveRequest.employeeId ||
            ""
        ).trim();
        const employeeRef = employeeDocId ? doc(db, "employees", employeeDocId) : null;
        const employeeSnap = employeeRef ? await tx.get(employeeRef) : null;
        const employeeData =
          employeeSnap?.exists() && employeeSnap.data()
            ? ((employeeSnap.data() as Record<string, any>) || {})
            : null;
        const employeeEmployment = (employeeData?.employeeProfile?.employment ||
          employeeData?.employment ||
          {}) as Record<string, any>;

        if (nextStatus === "approved") {
          const currentLeaveBalance = resolveEmploymentLeaveBalance(
            userData,
            employeeData
          );
          if (currentLeaveBalance < daysCount) {
            throw new Error("leave_balance_insufficient");
          }

          const nextLeaveBalance = currentLeaveBalance - daysCount;
          const nextUserEmployment = {
            ...userEmployment,
            leaveBalance: nextLeaveBalance,
            updatedAt: serverTimestamp(),
            updatedByUid: user?.uid || null,
            updatedByEmail: user?.email || null,
          };

          tx.set(
            userRef,
            {
              leaveBalance: nextLeaveBalance,
              updatedAt: serverTimestamp(),
              employment: nextUserEmployment,
              employeeProfile: {
                personal:
                  (userData.employeeProfile?.personal ||
                    userData.personal ||
                    null) as Record<string, any> | null,
                employment: nextUserEmployment,
              },
            },
            { merge: true }
          );

          if (employeeRef) {
            const nextEmployeeEmployment = {
              ...employeeEmployment,
              leaveBalance: nextLeaveBalance,
              updatedAt: serverTimestamp(),
              updatedByUid: user?.uid || null,
              updatedByEmail: user?.email || null,
            };

            tx.set(
              employeeRef,
              {
                uid: linkedUserUid,
                linkedUserUid: linkedUserUid,
                leaveBalance: nextLeaveBalance,
                updatedAt: serverTimestamp(),
                employment: nextEmployeeEmployment,
                employeeProfile: {
                  personal:
                    (employeeData?.employeeProfile?.personal ||
                      employeeData?.personal ||
                      null) as Record<string, any> | null,
                  employment: nextEmployeeEmployment,
                },
              },
              { merge: true }
            );
          }
        }

        tx.update(leaveRequestRef, {
          status: nextStatus,
          hrNote,
          decidedAt: serverTimestamp(),
          decidedBy: user?.uid || null,
          decidedByEmail: user?.email || null,
          decidedByName: user?.displayName || user?.email || null,
          reviewedAt: serverTimestamp(),
          reviewedBy: user?.uid || null,
          reviewedByEmail: user?.email || null,
          reviewedByName: user?.displayName || user?.email || null,
          updatedAt: serverTimestamp(),
        });
      });

      setReviewNotes(current => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });

      toast.success(
        nextStatus === "approved"
          ? "تم اعتماد طلب الإجازة وخصم الرصيد."
          : "تم رفض طلب الإجازة."
      );
    } catch (reviewError) {
      console.error("review_leave_request_error", reviewError);

      if (
        reviewError instanceof Error &&
        reviewError.message === "leave_balance_insufficient"
      ) {
        toast.error("رصيد الإجازات الحالي لا يكفي لاعتماد هذا الطلب.");
      } else if (
        reviewError instanceof Error &&
        reviewError.message === "leave_request_already_reviewed"
      ) {
        toast.error("تمت مراجعة هذا الطلب مسبقًا.");
      } else {
        toast.error("تعذر تحديث حالة طلب الإجازة.");
      }
    } finally {
      setReviewingLeaveRequestId(null);
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

                  <div className="rounded-[28px] border border-slate-200/80 bg-white/95 p-5 shadow-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                          <CalendarDays className="h-4 w-4" />
                          الإجازات
                        </div>
                        <div className="text-2xl font-semibold tracking-tight text-slate-950">
                          آخر إجازة معتمدة وسجل الطلبات
                        </div>
                        <p className="max-w-2xl text-sm leading-7 text-slate-500">
                          يتيح هذا القسم متابعة آخر إجازة معتمدة للموظف بشكل واضح، مع مراجعة
                          جميع الطلبات السابقة واعتماد الطلبات المعلقة أو رفضها.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <LeaveOverviewStat
                          icon={BadgeCheck}
                          label="الرصيد الحالي"
                          value={selectedEmployeeProfile.employment.leaveBalanceLabel}
                        />
                        <LeaveOverviewStat
                          icon={
                            latestApprovedLeaveRequest?.status === "approved"
                              ? CheckCircle2
                              : latestApprovedLeaveRequest?.status === "rejected"
                                ? XCircle
                                : Clock3
                          }
                          label="حالة آخر إجازة معتمدة"
                          value={
                            latestApprovedLeaveRequest
                              ? getLeaveStatusMeta(latestApprovedLeaveRequest.status).label
                              : "لا توجد إجازات"
                          }
                        />
                        <LeaveOverviewStat
                          icon={CalendarDays}
                          label="عدد الأيام"
                          value={
                            latestApprovedLeaveRequest
                              ? formatLeaveDaysLabel(latestApprovedLeaveRequest.daysCount)
                              : "—"
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-slate-50/75 p-5">
                      {latestApprovedLeaveRequest ? (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                            >
                              آخر إجازة معتمدة
                            </Badge>
                            <Badge variant="outline" className="rounded-full">
                              {getLeaveTypeLabel(latestApprovedLeaveRequest.leaveType)}
                            </Badge>
                            <LeaveStatusBadge status={latestApprovedLeaveRequest.status} />
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <ReadonlyMeta
                              icon={CalendarDays}
                              label="تاريخ البداية"
                              value={formatDateEN(latestApprovedLeaveRequest.startDate)}
                            />
                            <ReadonlyMeta
                              icon={CalendarDays}
                              label="تاريخ النهاية"
                              value={formatDateEN(latestApprovedLeaveRequest.endDate)}
                            />
                            <ReadonlyMeta
                              icon={CalendarDays}
                              label="عدد الأيام"
                              value={formatLeaveDaysLabel(latestApprovedLeaveRequest.daysCount)}
                            />
                            <ReadonlyMeta
                              icon={Clock3}
                              label="تاريخ الطلب"
                              value={formatDateTimeEN(latestApprovedLeaveRequest.createdAt)}
                            />
                          </div>

                          {latestApprovedLeaveRequest.employeeNote ? (
                            <div className="rounded-[20px] border border-slate-200 bg-white/90 px-4 py-3 text-sm leading-7 text-slate-700">
                              <span className="font-semibold text-slate-900">
                                ملاحظة الموظف:
                              </span>{" "}
                              {latestApprovedLeaveRequest.employeeNote}
                            </div>
                          ) : null}

                          {latestApprovedLeaveRequest.hrNote ? (
                            <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm leading-7 text-emerald-800">
                              <span className="font-semibold">ملاحظة HR:</span>{" "}
                              {latestApprovedLeaveRequest.hrNote}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/90 px-5 py-10 text-center text-sm text-slate-500">
                          لا توجد أي إجازات أو طلبات إجازة لهذا الموظف حتى الآن.
                        </div>
                      )}
                    </div>

                    <div className="mt-5 space-y-3">
                      <div className="text-sm font-semibold text-slate-900">
                        سجل الإجازات
                      </div>

                      {leaveRequestsLoading ? (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                          جاري تحميل طلبات الإجازة...
                        </div>
                      ) : leaveRequests.length ? (
                        leaveRequests.map((request, index) => {
                          const isPending = request.status === "pending";
                          const currentReviewNote =
                            reviewNotes[request.id] ?? request.hrNote ?? "";

                          return (
                            <div
                              key={request.id}
                              className={cn(
                                "rounded-[24px] border p-5 shadow-sm",
                                index === 0
                                  ? "border-[#F2B705]/35 bg-[#F2B705]/[0.08]"
                                  : "border-slate-200/80 bg-slate-50/70"
                              )}
                            >
                              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {index === 0 ? (
                                      <Badge
                                        variant="outline"
                                        className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                                      >
                                        أحدث طلب
                                      </Badge>
                                    ) : null}
                                    <Badge variant="outline" className="rounded-full">
                                      {getLeaveTypeLabel(request.leaveType)}
                                    </Badge>
                                    <LeaveStatusBadge status={request.status} />
                                  </div>

                                  <div className="grid gap-2 text-sm text-slate-600">
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        الفترة:
                                      </span>{" "}
                                      {formatLeaveDateRange(
                                        request.startDate,
                                        request.endDate
                                      )}
                                    </div>
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        عدد الأيام:
                                      </span>{" "}
                                      {formatLeaveDaysLabel(request.daysCount)}
                                    </div>
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        تاريخ الإنشاء:
                                      </span>{" "}
                                      {formatDateTimeEN(request.createdAt)}
                                    </div>
                                    {request.reviewedAt ? (
                                      <div>
                                        <span className="font-semibold text-slate-900">
                                          تمت المراجعة:
                                        </span>{" "}
                                        {formatDateTimeEN(request.reviewedAt)}
                                      </div>
                                    ) : null}
                                  </div>

                                  {request.employeeNote ? (
                                    <div className="rounded-[20px] border border-slate-200 bg-white/85 px-4 py-3 text-sm leading-7 text-slate-700">
                                      <span className="font-semibold text-slate-900">
                                        ملاحظة الموظف:
                                      </span>{" "}
                                      {request.employeeNote}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="w-full max-w-xl space-y-3">
                                  <div className="rounded-[20px] border border-slate-200 bg-white/90 px-4 py-3 text-sm leading-7 text-slate-700">
                                    <span className="font-semibold text-slate-900">
                                      ملاحظة HR:
                                    </span>{" "}
                                    {request.hrNote || "لا توجد ملاحظة حتى الآن."}
                                  </div>

                                  {isPending ? (
                                    <div className="space-y-3 rounded-[20px] border border-slate-200 bg-white/90 p-4">
                                      <Label className="text-sm font-semibold text-slate-800">
                                        ملاحظة إدارية للطلب
                                      </Label>
                                      <Textarea
                                        value={currentReviewNote}
                                        onChange={event =>
                                          handleReviewNoteChange(
                                            request.id,
                                            event.target.value
                                          )
                                        }
                                        placeholder="اكتب ملاحظة عند الاعتماد أو الرفض"
                                        className="min-h-28"
                                        disabled={
                                          !canManageEmployees ||
                                          reviewingLeaveRequestId === request.id
                                        }
                                      />

                                      <div className="flex flex-wrap gap-3">
                                        <Button
                                          type="button"
                                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                                          disabled={
                                            !canManageEmployees ||
                                            reviewingLeaveRequestId === request.id
                                          }
                                          onClick={() =>
                                            void handleReviewLeaveRequest(
                                              request,
                                              "approved"
                                            )
                                          }
                                        >
                                          {reviewingLeaveRequestId === request.id ? (
                                            <Clock3 className="ml-2 h-4 w-4 animate-pulse" />
                                          ) : (
                                            <CheckCircle2 className="ml-2 h-4 w-4" />
                                          )}
                                          اعتماد الطلب
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                          disabled={
                                            !canManageEmployees ||
                                            reviewingLeaveRequestId === request.id
                                          }
                                          onClick={() =>
                                            void handleReviewLeaveRequest(
                                              request,
                                              "rejected"
                                            )
                                          }
                                        >
                                          <XCircle className="ml-2 h-4 w-4" />
                                          رفض الطلب
                                        </Button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                          لا توجد طلبات إجازة مسجلة لهذا الموظف.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="اسم الموظف">
                      <Input
                        value={form.fullName}
                        onChange={event => handleFormChange("fullName", event.target.value)}
                        placeholder="مثال: نواف العليان"
                        disabled={!canManageEmployees || saving}
                      />
                    </Field>

                    <Field label="البريد الإلكتروني">
                      <Input
                        type="email"
                        dir="ltr"
                        value={form.email}
                        onChange={event => handleFormChange("email", event.target.value)}
                        placeholder="name@example.com"
                        disabled={!canManageEmployees || saving}
                      />
                    </Field>

                    <Field label="رقم الجوال">
                      <Input
                        dir="ltr"
                        value={form.phone}
                        onChange={event => handleFormChange("phone", event.target.value)}
                        placeholder="05xxxxxxxx"
                        disabled={!canManageEmployees || saving}
                      />
                    </Field>
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
