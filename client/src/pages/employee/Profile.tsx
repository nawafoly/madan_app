import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  or,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  BriefcaseBusiness,
  Clock3,
  Camera,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
  CalendarDays,
  Building2,
  BadgeCheck,
  KeyRound,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import EmployeeLayout from "@/components/EmployeeLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth, db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  EMPLOYEE_AVATAR_CATEGORY,
  EMPLOYEE_EMPTY_VALUE,
  buildEmployeeAvatarPatch,
  buildEmployeePhonePatch,
  normalizeEmployeeProfile,
  type EmployeeProfileUserDoc,
} from "@/lib/employeeProfile";
import {
  EMPLOYEE_LEAVE_REQUESTS_COLLECTION,
  EMPLOYEE_LEAVE_TYPE_OPTIONS,
  buildLeaveDateFromInput,
  buildEmployeeLeaveRequestPayload,
  calculateLeaveDaysCount,
  formatLeaveDateRange,
  formatLeaveDaysLabel,
  getLatestApprovedEmployeeLeaveRequest,
  getLeaveStatusMeta,
  getLeaveTypeLabel,
  normalizeEmployeeLeaveRequest,
  sortEmployeeLeaveRequests,
  type EmployeeLeaveRequestRecord,
} from "@/lib/employeeLeave";
import { uploadDocumentToCloudflare } from "@/lib/documentUploadService";
import { formatDateEN, formatDateTimeEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;

function initialsFromName(name: string, email: string) {
  const source = String(name || email || "").trim();
  if (!source) return "م";
  const parts = source
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  return parts
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function friendlyPasswordError(code?: string) {
  switch (String(code || "").trim()) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "كلمة المرور الحالية غير صحيحة.";
    case "auth/weak-password":
      return "كلمة المرور الجديدة ضعيفة. استخدم 6 أحرف على الأقل.";
    case "auth/requires-recent-login":
      return "لأمان الحساب، سجّل الدخول مرة أخرى ثم حاول تغيير كلمة المرور.";
    default:
      return "تعذر تغيير كلمة المرور الآن.";
  }
}

function validatePhone(value: string) {
  const normalized = String(value || "").trim();
  const digits = normalized.replace(/\D/g, "");
  return normalized.length >= 7 && digits.length >= 7;
}

function validateAvatarFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("يرجى اختيار صورة فقط.");
  }

  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    throw new Error("حجم الصورة كبير. الحد الأعلى 5MB.");
  }
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-4 py-1.5 text-xs font-semibold text-slate-600">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="text-sm leading-7 text-slate-600">{description}</p>
      </div>
    </div>
  );
}

function ReadonlyField({
  label,
  value,
  icon: Icon,
  dir,
}: {
  label: string;
  value: string;
  icon: typeof UserRound;
  dir?: "rtl" | "ltr";
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        dir={dir}
        className="mt-2 break-words text-sm font-semibold leading-7 text-slate-950"
      >
        {value || EMPLOYEE_EMPTY_VALUE}
      </div>
      <div className="mt-3">
        <Badge
          variant="outline"
          className="rounded-full border-slate-200 bg-white/80 text-slate-500 shadow-none"
        >
          عرض فقط
        </Badge>
      </div>
    </div>
  );
}

function EmploymentTile({
  label,
  value,
  icon: Icon,
  valueClassName,
  badge,
}: {
  label: string;
  value: string;
  icon: typeof UserRound;
  valueClassName?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/95 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={cn(
          "mt-3 break-words text-lg font-semibold text-slate-950",
          valueClassName
        )}
      >
        {value}
      </div>
      {badge ? <div className="mt-3">{badge}</div> : null}
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

function LeaveSummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof UserRound;
  accent?: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/95 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
        <Icon className={cn("h-3.5 w-3.5", accent)} />
        {label}
      </div>
      <div className="mt-3 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

export default function EmployeeProfilePage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [userDoc, setUserDoc] = useState<EmployeeProfileUserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState<EmployeeLeaveRequestRecord[]>([]);
  const [leaveRequestsLoading, setLeaveRequestsLoading] = useState(true);
  const [leaveForm, setLeaveForm] = useState({
    leaveType: "annual",
    startDate: "",
    endDate: "",
    employeeNote: "",
  });
  const [submittingLeaveRequest, setSubmittingLeaveRequest] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [employeeProfileSource, setEmployeeProfileSource] = useState<{
    collectionName: "employees" | "users";
    docId: string;
    entityId: string;
  } | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setEmployeeProfileSource(null);
      return;
    }

    let cancelled = false;

    const resolveSource = async () => {
      const linkedEmployeeId = String(user.linkedEmployeeId || "").trim();
      const candidateEmployeeDocIds = Array.from(
        new Set([linkedEmployeeId, user.uid].filter(Boolean))
      );

      for (const docId of candidateEmployeeDocIds) {
        try {
          const employeeSnapshot = await getDoc(doc(db, "employees", docId));
          if (employeeSnapshot.exists()) {
            if (!cancelled) {
              setEmployeeProfileSource({
                collectionName: "employees",
                docId,
                entityId: docId,
              });
            }
            return;
          }
        } catch (error) {
          console.error("employee_profile_source_lookup_failed", error);
        }
      }

      if (!cancelled) {
        setEmployeeProfileSource({
          collectionName: "users",
          docId: user.uid,
          entityId: user.uid,
        });
      }
    };

    void resolveSource();

    return () => {
      cancelled = true;
    };
  }, [user?.employeeProfileEnabled, user?.linkedEmployeeId, user?.role, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setUserDoc(null);
      setLoading(false);
      return;
    }

    if (!employeeProfileSource) {
      setLoading(true);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(
        db,
        employeeProfileSource.collectionName,
        employeeProfileSource.docId
      ),
      (snapshot) => {
        const snapshotData = snapshot.data() as EmployeeProfileUserDoc | undefined;
        setUserDoc(
          snapshot.exists()
            ? ({
                ...(snapshotData || {}),
                uid:
                  String(snapshotData?.uid || user.uid || snapshot.id).trim() ||
                  snapshot.id,
              } as EmployeeProfileUserDoc)
            : null
        );
        setLoading(false);
      },
      (error) => {
        console.error("employee_profile_snapshot_error", error);
        setUserDoc(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [employeeProfileSource, user?.uid]);

  const profile = useMemo(
    () =>
      normalizeEmployeeProfile(userDoc, {
        displayName: user?.displayName,
        email: user?.email,
        photoURL: user?.firebaseUser?.photoURL || auth.currentUser?.photoURL,
      }),
    [user?.displayName, user?.email, user?.firebaseUser?.photoURL, userDoc]
  );

  useEffect(() => {
    if (!user?.uid) {
      setLeaveRequests([]);
      setLeaveRequestsLoading(false);
      return;
    }

    setLeaveRequestsLoading(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_LEAVE_REQUESTS_COLLECTION),
        or(where("userId", "==", user.uid), where("employeeUid", "==", user.uid))
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
      error => {
        console.error("employee_leave_requests_snapshot_error", error);
        setLeaveRequests([]);
        setLeaveRequestsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    setPhoneInput(profile.personal.phone || "");
  }, [profile.personal.phone]);

  const phoneDirty = phoneInput.trim() !== profile.personal.phone.trim();
  const phoneValid = validatePhone(phoneInput);
  const requestedLeaveDays = useMemo(
    () => calculateLeaveDaysCount(leaveForm.startDate, leaveForm.endDate),
    [leaveForm.endDate, leaveForm.startDate]
  );
  const latestApprovedLeaveRequest = useMemo(
    () => getLatestApprovedEmployeeLeaveRequest(leaveRequests),
    [leaveRequests]
  );

  const handleSavePhone = async () => {
    const normalizedPhone = phoneInput.trim();
    if (!user?.uid || !employeeProfileSource) return;
    if (!validatePhone(normalizedPhone)) {
      toast.error("رقم الجوال غير صالح.");
      return;
    }

    setSavingPhone(true);
    try {
      await setDoc(
        doc(
          db,
          employeeProfileSource.collectionName,
          employeeProfileSource.docId
        ),
        {
          ...buildEmployeePhonePatch(normalizedPhone),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      toast.success("تم تحديث رقم الجوال.");
    } catch (error) {
      console.error("employee_phone_update_failed", error);
      toast.error("تعذر تحديث رقم الجوال.");
    } finally {
      setSavingPhone(false);
    }
  };

  const handleAvatarButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !user?.uid || !employeeProfileSource) return;

    try {
      validateAvatarFile(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ملف الصورة غير صالح.");
      event.target.value = "";
      return;
    }

    setUploadingAvatar(true);
    try {
      const uploaded = await uploadDocumentToCloudflare({
        entityType: "employee",
        entityId: employeeProfileSource.entityId,
        category: EMPLOYEE_AVATAR_CATEGORY,
        file,
        kind: "attachment",
        uploadedBy: user.uid,
        storageFolder: "profile_avatar",
      });

      const avatarPayload = {
        id: uploaded.id,
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        fileUrl: uploaded.fileUrl,
        contentType: uploaded.contentType,
        fileSize: uploaded.fileSize,
        uploadedAt: uploaded.uploadedAt,
      };

      await setDoc(
        doc(
          db,
          employeeProfileSource.collectionName,
          employeeProfileSource.docId
        ),
        {
          ...buildEmployeeAvatarPatch(avatarPayload),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          photoURL: uploaded.fileUrl,
        });
      }

      toast.success("تم تحديث الصورة الشخصية.");
    } catch (error) {
      console.error("employee_avatar_upload_failed", error);
      toast.error("تعذر رفع الصورة الشخصية.");
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  };

  const handleLeaveFormChange = (
    key: keyof typeof leaveForm,
    value: string
  ) => {
    setLeaveForm(current => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSubmitLeaveRequest = async () => {
    if (!user?.uid || !employeeProfileSource) {
      toast.error("تعذر تحديد ملف الموظف الحالي.");
      return;
    }

    const startDate = buildLeaveDateFromInput(leaveForm.startDate);
    const endDate = buildLeaveDateFromInput(leaveForm.endDate);
    const daysCount = calculateLeaveDaysCount(
      leaveForm.startDate,
      leaveForm.endDate
    );

    if (!leaveForm.leaveType) {
      toast.error("اختر نوع الإجازة.");
      return;
    }

    if (!startDate || !endDate || !daysCount) {
      toast.error("أدخل تاريخ بداية ونهاية صالحين للإجازة.");
      return;
    }

    setSubmittingLeaveRequest(true);
    try {
      const employeeDocId =
        (employeeProfileSource.collectionName === "employees"
          ? employeeProfileSource.docId
          : String(user.linkedEmployeeId || "").trim()) || null;

      await addDoc(collection(db, EMPLOYEE_LEAVE_REQUESTS_COLLECTION), {
        ...buildEmployeeLeaveRequestPayload({
          authUid: user.uid,
          employeeDocId,
          employeeName:
            profile.personal.name !== EMPLOYEE_EMPTY_VALUE
              ? profile.personal.name
              : user.displayName || user.email || "موظف",
          employeeEmail:
            profile.personal.email !== EMPLOYEE_EMPTY_VALUE
              ? profile.personal.email
              : user.email || null,
          leaveType: leaveForm.leaveType,
          startDate,
          endDate,
          daysCount,
          employeeNote: leaveForm.employeeNote,
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setLeaveForm({
        leaveType: "annual",
        startDate: "",
        endDate: "",
        employeeNote: "",
      });
      toast.success("تم رفع طلب الإجازة بنجاح.");
    } catch (error) {
      console.error("employee_leave_request_create_failed", error);
      toast.error("تعذر رفع طلب الإجازة الآن.");
    } finally {
      setSubmittingLeaveRequest(false);
    }
  };

  const handleChangePassword = async () => {
    const currentUser = auth.currentUser;
    const email = String(currentUser?.email || user?.email || "").trim();

    if (!currentUser || !email) {
      toast.error("تعذر الوصول إلى حسابك الآن.");
      return;
    }

    if (!currentPassword.trim()) {
      toast.error("اكتب كلمة المرور الحالية.");
      return;
    }

    if (newPassword.trim().length < 6) {
      toast.error("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("كلمة المرور الجديدة وتأكيدها غير متطابقين.");
      return;
    }

    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(
        email,
        currentPassword
      );
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("تم تغيير كلمة المرور.");
    } catch (error: any) {
      console.error("employee_password_change_failed", error);
      toast.error(friendlyPasswordError(error?.code));
    } finally {
      setChangingPassword(false);
    }
  };

  const statusBadgeClass =
    profile.employment.statusTone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : profile.employment.statusTone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-100 text-slate-600";

  return (
    <EmployeeLayout
      title="بروفايل الموظف"
      description="هذه المساحة مخصصة لمتابعة بياناتك الشخصية والوظيفية، مع صلاحيات محددة لتعديل الجوال والصورة الشخصية وتغيير كلمة المرور فقط."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="space-y-6">
          <SectionHeading
            icon={UserRound}
            title="البيانات الشخصية"
            description="يعرض هذا القسم بياناتك الأساسية. يمكنك تعديل رقم الجوال والصورة الشخصية فقط، بينما الاسم والبريد للعرض فقط في هذه المرحلة."
          />

          <Card className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.28)]">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="size-24 border border-slate-200 bg-slate-100 shadow-sm">
                    <AvatarImage
                      src={profile.personal.avatarUrl || undefined}
                      alt={profile.personal.name}
                    />
                    <AvatarFallback className="bg-slate-900 text-lg font-semibold text-white">
                      {initialsFromName(
                        profile.personal.name,
                        profile.personal.email
                      )}
                    </AvatarFallback>
                  </Avatar>

                  <div className="space-y-2">
                    <div className="text-2xl font-semibold tracking-tight text-slate-950">
                      {profile.personal.name}
                    </div>
                    <div className="text-sm text-slate-500">
                      {profile.personal.email}
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                    >
                      موظف
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl border-slate-200 bg-white/90"
                    onClick={handleAvatarButtonClick}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="ml-2 h-4 w-4" />
                    )}
                    {profile.personal.avatarUrl ? "تغيير الصورة" : "رفع الصورة"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ReadonlyField
                  label="الاسم"
                  value={profile.personal.name}
                  icon={UserRound}
                />
                <ReadonlyField
                  label="البريد الإلكتروني"
                  value={profile.personal.email}
                  icon={Mail}
                  dir="ltr"
                />
              </div>

              <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/75 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                      <Phone className="h-3.5 w-3.5" />
                      رقم الجوال
                    </div>
                    <p className="text-sm leading-7 text-slate-600">
                      يمكنك تحديث رقم الجوال المرتبط بحسابك لاستخدامه في التواصل.
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none"
                  >
                    قابل للتعديل
                  </Badge>
                </div>

                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                  <Input
                    dir="ltr"
                    value={phoneInput}
                    onChange={(event) => setPhoneInput(event.target.value)}
                    placeholder="05xxxxxxxx"
                    className="h-12 rounded-2xl border-slate-200 bg-white text-left shadow-none"
                  />
                  <Button
                    type="button"
                    className="h-12 rounded-2xl bg-slate-950 px-6 text-white hover:bg-[#15233c]"
                    disabled={savingPhone || !phoneDirty || !phoneValid}
                    onClick={handleSavePhone}
                  >
                    {savingPhone ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : null}
                    حفظ رقم الجوال
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                <KeyRound className="h-4 w-4" />
                أمان الحساب
              </div>
              <CardTitle className="text-xl font-semibold text-slate-950">
                تغيير كلمة المرور
              </CardTitle>
              <CardDescription className="text-sm leading-7 text-slate-600">
                يمكنك تغيير كلمة المرور الخاصة بحسابك فقط. لن يؤثر ذلك على أي إعدادات إدارية أخرى.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="كلمة المرور الحالية"
                className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
              />
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="كلمة المرور الجديدة"
                className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
              />
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="تأكيد كلمة المرور الجديدة"
                className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
              />
              <div className="flex justify-start">
                <Button
                  type="button"
                  className="h-12 rounded-2xl bg-[#F2B705] px-6 text-slate-950 hover:bg-[#dfaa00]"
                  disabled={changingPassword}
                  onClick={handleChangePassword}
                >
                  {changingPassword ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : null}
                  تغيير كلمة المرور
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-6">
          <SectionHeading
            icon={BriefcaseBusiness}
            title="بيانات العمل"
            description="هذه البيانات مرتبطة بوظيفتك داخل الشركة، وهي للعرض فقط في هذه المرحلة. تعديلها سيكون لاحقًا من جهة الإدارة أو الموارد البشرية."
          />

          <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
            <CardContent className="space-y-5 p-6 sm:p-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <EmploymentTile
                  label="المسمى الوظيفي"
                  value={profile.employment.title}
                  icon={BriefcaseBusiness}
                />
                <EmploymentTile
                  label="القسم / الإدارة"
                  value={profile.employment.department}
                  icon={Building2}
                />
                <EmploymentTile
                  label="تاريخ بداية العمل"
                  value={
                    profile.employment.startDate
                      ? formatDateEN(profile.employment.startDate)
                      : EMPLOYEE_EMPTY_VALUE
                  }
                  icon={CalendarDays}
                />
                <EmploymentTile
                  label="رصيد الإجازات"
                  value={profile.employment.leaveBalanceLabel}
                  icon={BadgeCheck}
                />
                <EmploymentTile
                  label="الحالة الوظيفية"
                  value={profile.employment.statusLabel}
                  icon={ShieldCheck}
                  badge={
                    <Badge
                      variant="outline"
                      className={cn("rounded-full shadow-none", statusBadgeClass)}
                    >
                      {profile.employment.statusLabel}
                    </Badge>
                  }
                />
                {profile.employment.employeeCode !== EMPLOYEE_EMPTY_VALUE ? (
                  <EmploymentTile
                    label="الرقم الوظيفي"
                    value={profile.employment.employeeCode}
                    icon={UserRound}
                  />
                ) : null}
              </div>

              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm leading-7 text-slate-600">
                بيانات العمل هنا للعرض فقط. لا يمكنك تعديل المسمى الوظيفي أو رصيد الإجازات أو الحالة الوظيفية بنفسك من هذه الصفحة.
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      <section className="mt-8 space-y-6">
        <SectionHeading
          icon={CalendarDays}
          title="الإجازات"
          description="هنا يمكنك متابعة رصيد الإجازات ورفع طلب جديد والاطلاع على آخر إجازة وسجل الطلبات السابقة."
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                <Clock3 className="h-4 w-4" />
                آخر إجازة معتمدة
              </div>
              <CardTitle className="text-xl font-semibold text-slate-950">
                ملخص الإجازات الحالية
              </CardTitle>
              <CardDescription className="text-sm leading-7 text-slate-600">
                الرصيد الحالي وآخر إجازة معتمدة يظهران هنا بشكل مباشر وسريع.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <LeaveSummaryCard
                  label="الرصيد الحالي"
                  value={profile.employment.leaveBalanceLabel}
                  icon={BadgeCheck}
                  accent="text-[#B98500]"
                />
                <LeaveSummaryCard
                  label="حالة آخر إجازة معتمدة"
                  value={
                    latestApprovedLeaveRequest
                      ? getLeaveStatusMeta(latestApprovedLeaveRequest.status).label
                      : "لا توجد إجازات"
                  }
                  icon={
                    latestApprovedLeaveRequest?.status === "approved"
                      ? CheckCircle2
                      : latestApprovedLeaveRequest?.status === "rejected"
                        ? XCircle
                        : Clock3
                  }
                />
                <LeaveSummaryCard
                  label="عدد الأيام"
                  value={
                    latestApprovedLeaveRequest
                      ? formatLeaveDaysLabel(latestApprovedLeaveRequest.daysCount)
                      : "—"
                  }
                  icon={CalendarDays}
                />
              </div>

              {latestApprovedLeaveRequest ? (
                <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/75 p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="rounded-full border-[#F2B705]/35 bg-[#F2B705]/10 text-[#8b6700] shadow-none"
                        >
                          {getLeaveTypeLabel(latestApprovedLeaveRequest.leaveType)}
                        </Badge>
                        <LeaveStatusBadge status={latestApprovedLeaveRequest.status} />
                      </div>

                      <div className="grid gap-2 text-sm text-slate-600">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">الفترة:</span>
                          <span>
                            {formatLeaveDateRange(
                              latestApprovedLeaveRequest.startDate,
                              latestApprovedLeaveRequest.endDate
                            )}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">تاريخ الطلب:</span>
                          <span>{formatDateTimeEN(latestApprovedLeaveRequest.createdAt)}</span>
                        </div>
                        {latestApprovedLeaveRequest.employeeNote ? (
                          <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 leading-7 text-slate-600">
                            <span className="font-semibold text-slate-900">
                              ملاحظتك:
                            </span>{" "}
                            {latestApprovedLeaveRequest.employeeNote}
                          </div>
                        ) : null}
                        {latestApprovedLeaveRequest.hrNote ? (
                          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 leading-7 text-emerald-800">
                            <span className="font-semibold">ملاحظة HR:</span>{" "}
                            {latestApprovedLeaveRequest.hrNote}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-center">
                      <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                        آخر إجازة معتمدة
                      </div>
                      <div className="mt-2 text-lg font-semibold text-slate-950">
                        {formatLeaveDaysLabel(latestApprovedLeaveRequest.daysCount)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                  لا توجد أي إجازات مسجلة لك حتى الآن.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                <Send className="h-4 w-4" />
                طلب جديد
              </div>
              <CardTitle className="text-xl font-semibold text-slate-950">
                رفع طلب إجازة
              </CardTitle>
              <CardDescription className="text-sm leading-7 text-slate-600">
                أدخل تفاصيل الإجازة المطلوبة، وسيصل الطلب للموارد البشرية للمراجعة والاعتماد أو الرفض.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-800">
                    نوع الإجازة
                  </Label>
                  <Select
                    value={leaveForm.leaveType}
                    onValueChange={value =>
                      handleLeaveFormChange("leaveType", value)
                    }
                    disabled={submittingLeaveRequest}
                  >
                    <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-slate-50/80">
                      <SelectValue placeholder="اختر نوع الإجازة" />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYEE_LEAVE_TYPE_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-800">
                    عدد الأيام
                  </Label>
                  <div className="flex h-12 items-center rounded-2xl border border-slate-200 bg-slate-50/80 px-4 text-sm font-semibold text-slate-900">
                    {requestedLeaveDays
                      ? formatLeaveDaysLabel(requestedLeaveDays)
                      : "حدّد تاريخ البداية والنهاية"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-800">
                    تاريخ البداية
                  </Label>
                  <Input
                    type="date"
                    value={leaveForm.startDate}
                    onChange={event =>
                      handleLeaveFormChange("startDate", event.target.value)
                    }
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                    disabled={submittingLeaveRequest}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-800">
                    تاريخ النهاية
                  </Label>
                  <Input
                    type="date"
                    value={leaveForm.endDate}
                    onChange={event =>
                      handleLeaveFormChange("endDate", event.target.value)
                    }
                    className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 shadow-none"
                    disabled={submittingLeaveRequest}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-800">
                  ملاحظة / سبب الطلب
                </Label>
                <Textarea
                  value={leaveForm.employeeNote}
                  onChange={event =>
                    handleLeaveFormChange("employeeNote", event.target.value)
                  }
                  placeholder="اكتب ملاحظة توضح سبب الإجازة إذا رغبت"
                  className="min-h-32 rounded-[22px] border-slate-200 bg-slate-50/80 shadow-none"
                  disabled={submittingLeaveRequest}
                />
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-500">
                    لن يتم خصم الرصيد إلا بعد اعتماد الطلب من الموارد البشرية.
                  </div>
                  <Button
                    type="button"
                    className="h-11 rounded-2xl bg-slate-950 px-5 text-white hover:bg-[#15233c]"
                    disabled={
                      submittingLeaveRequest ||
                      !leaveForm.leaveType ||
                      !leaveForm.startDate ||
                      !leaveForm.endDate ||
                      !requestedLeaveDays
                    }
                    onClick={() => void handleSubmitLeaveRequest()}
                  >
                    {submittingLeaveRequest ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="ml-2 h-4 w-4" />
                    )}
                    رفع طلب الإجازة
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.22)]">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              <CalendarDays className="h-4 w-4" />
              سجل الإجازات
            </div>
            <CardTitle className="text-xl font-semibold text-slate-950">
              الطلبات السابقة
            </CardTitle>
            <CardDescription className="text-sm leading-7 text-slate-600">
              جميع طلبات الإجازة السابقة تظهر هنا مع حالتها وتواريخها وأي ملاحظات مضافة.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {leaveRequestsLoading ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                جاري تحميل طلبات الإجازة...
              </div>
            ) : leaveRequests.length ? (
              leaveRequests.map((request, index) => (
                <div
                  key={request.id}
                  className={cn(
                    "rounded-[24px] border p-5 shadow-sm",
                    index === 0
                      ? "border-[#F2B705]/35 bg-[#F2B705]/[0.08]"
                      : "border-slate-200/80 bg-slate-50/70"
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
                          {formatLeaveDateRange(request.startDate, request.endDate)}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900">
                            عدد الأيام:
                          </span>{" "}
                          {formatLeaveDaysLabel(request.daysCount)}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900">
                            تاريخ الطلب:
                          </span>{" "}
                          {formatDateTimeEN(request.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div className="min-w-[220px] space-y-2 text-sm text-slate-600">
                      {request.employeeNote ? (
                        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 leading-7">
                          <span className="font-semibold text-slate-900">
                            ملاحظتك:
                          </span>{" "}
                          {request.employeeNote}
                        </div>
                      ) : null}

                      {request.hrNote ? (
                        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 leading-7 text-emerald-800">
                          <span className="font-semibold">ملاحظة HR:</span>{" "}
                          {request.hrNote}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                لم يتم رفع أي طلب إجازة حتى الآن.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {loading ? (
        <div className="pointer-events-none fixed inset-0 z-40 bg-white/45 backdrop-blur-[1px]">
          <div className="flex h-full items-center justify-center">
            <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-lg">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري تحميل بروفايل الموظف...
            </div>
          </div>
        </div>
      ) : null}
    </EmployeeLayout>
  );
}
