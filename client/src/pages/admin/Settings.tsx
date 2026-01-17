// client/src/pages/admin/Settings.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Bell,
  Shield,
  Database,
  Users,
  KeyRound,
  Tags,
  Plus,
  Pencil,
  Trash2,
  SlidersHorizontal,
  FileDown,
  FileUp,
  Type,
} from "lucide-react";

import { db } from "@/_core/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

/* =========================
   Types
========================= */

type AppSettings = {
  name: string;
  email: string;
  phone: string;
  address: string;
  minInvestment: string;
  maxInvestment: string;
  defaultReturn: string;
};

type NotificationSettings = {
  email: boolean;
  sms: boolean;
  investments: boolean;
  messages: boolean;
};

type SecuritySettings = {
  twoFactor: boolean;
};

type RoleDoc = {
  key: string; // roleKey unique
  nameAr: string;
  nameEn?: string;
  description?: string;
  permissions: string[];
  isActive: boolean;
  isSystem?: boolean;
  createdAt?: any;
  updatedAt?: any;
};

type AdminUserDoc = {
  id: string;
  displayName: string;
  email: string;
  roleKey: string;
  title?: string;
  isActive: boolean;
  notes?: string;

  // ✅ Flexible per-user overrides
  permissionsAllow?: string[];
  permissionsDeny?: string[];

  createdAt?: any;
  updatedAt?: any;
};

// ✅ NEW: invite/promote by email (no UID)
type RoleInviteDoc = {
  id: string; // doc id = email lower
  email: string;
  roleKey: string; // owner/admin/accountant/staff/client
  isActive: boolean;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  createdByUid?: string;
};

type LabelsSettings = {
  projectTypes: Record<string, { ar: string; en?: string }>;
  projectStatuses: Record<string, { ar: string; en?: string }>;
  investmentStatuses: Record<string, { ar: string; en?: string }>;
  uiRoles: Record<string, { ar: string; en?: string }>;
};

type FlagsSettings = {
  disableInvestments: boolean;
  disableMessages: boolean;
  vipOnlyMode: boolean;
  hideVipProjects: boolean;
  maintenanceMode: boolean;
};

type ContentSettings = {
  heroTitleAr: string;
  heroTitleEn: string;
  heroSubtitleAr: string;
  heroSubtitleEn: string;

  footerAboutAr: string;
  footerAboutEn: string;

  contactEmail: string;
  contactPhone: string;
};

/* =========================
   Permissions Catalog
========================= */

const DEFAULT_PERMISSIONS: Array<{ key: string; label: string }> = [
  { key: "dashboard.view", label: "عرض لوحة التحكم" },
  { key: "projects.view", label: "عرض المشاريع" },
  { key: "projects.manage", label: "إدارة المشاريع (إنشاء/تعديل/نشر)" },
  { key: "projects.publish", label: "نشر المشاريع (Publish)" },
  { key: "investments.view", label: "عرض الاستثمارات" },
  { key: "investments.manage", label: "إدارة الاستثمارات (موافقة/رفض/تحديث)" },
  { key: "users.view", label: "عرض العملاء" },
  { key: "users.manage", label: "إدارة العملاء (VIP/ملاحظات)" },
  { key: "messages.view", label: "عرض الرسائل" },
  { key: "messages.manage", label: "إدارة الرسائل" },
  { key: "reports.view", label: "عرض التقارير" },
  { key: "financial.view", label: "عرض المالية" },
  { key: "financial.edit", label: "تعديل المالية" },
  { key: "settings.manage", label: "إدارة الإعدادات" },
];

// ✅ ruols
const SYSTEM_ROLE_KEYS = [
  "owner",
  "admin",
  "accountant",
  "staff",
  "client",
  "guest",
];

type AppRoleKey =
  | "owner"
  | "admin"
  | "accountant"
  | "staff"
  | "client"
  | "guest";

/* =========================
   JSON Export Shape
========================= */
type SettingsExport = {
  exportedAt: string;
  settings: {
    app: AppSettings;
    notifications: NotificationSettings;
    security: SecuritySettings;
    roles: RoleDoc[];
    labels: LabelsSettings;
    flags: FlagsSettings;
    content: ContentSettings;
  };
};

export default function Settings() {
  const [loading, setLoading] = useState(true);

  // Existing docs
  const [app, setApp] = useState<AppSettings>({
    name: "",
    email: "",
    phone: "",
    address: "",
    minInvestment: "",
    maxInvestment: "",
    defaultReturn: "",
  });

  const [notifications, setNotifications] = useState<NotificationSettings>({
    email: true,
    sms: false,
    investments: true,
    messages: true,
  });

  const [security, setSecurity] = useState<SecuritySettings>({
    twoFactor: false,
  });

  // NEW: roles / admin users / labels / flags / content
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserDoc[]>([]);

  // ✅ NEW: role invites
  const [roleInvites, setRoleInvites] = useState<RoleInviteDoc[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleKey, setInviteRoleKey] =
    useState<AppRoleKey>("accountant");
  const [inviteNotes, setInviteNotes] = useState("");

  const [labels, setLabels] = useState<LabelsSettings>({
    projectTypes: {
      sukuk: { ar: "صكوك", en: "Sukuk" },
      land_development: { ar: "تطوير أراضي", en: "Land Development" },
      vip_exclusive: { ar: "VIP حصري", en: "VIP Exclusive" },
    },
    projectStatuses: {
      draft: { ar: "مسودة", en: "Draft" },
      published: { ar: "منشور", en: "Published" },
      closed: { ar: "مغلق", en: "Closed" },
      completed: { ar: "مكتمل", en: "Completed" },
    },
    investmentStatuses: {
      pending: { ar: "معلق", en: "Pending" },
      approved: { ar: "معتمد", en: "Approved" },
      active: { ar: "نشط", en: "Active" },
      completed: { ar: "مكتمل", en: "Completed" },
      rejected: { ar: "مرفوض", en: "Rejected" },
    },
    uiRoles: {
      owner: { ar: "أونر", en: "Owner" },
      admin: { ar: "أدمن", en: "Admin" },
      accountant: { ar: "محاسب", en: "Accountant" },
      staff: { ar: "موظف", en: "Staff" },
      client: { ar: "عميل", en: "Client" },
      guest: { ar: "زائر", en: "Guest" },
    },
  });

  const [flags, setFlags] = useState<FlagsSettings>({
    disableInvestments: false,
    disableMessages: false,
    vipOnlyMode: false,
    hideVipProjects: false,
    maintenanceMode: false,
  });

  const [content, setContent] = useState<ContentSettings>({
    heroTitleAr: "منصة معدن البناء",
    heroTitleEn: "MAEDIN Platform",
    heroSubtitleAr: "استثمر بثقة مع فرص مدروسة",
    heroSubtitleEn: "Invest with confidence in curated opportunities",
    footerAboutAr: "معدن البناء منصة لإتاحة فرص استثمارية بشكل احترافي.",
    footerAboutEn: "MAEDIN is a platform for curated investment opportunities.",
    contactEmail: "",
    contactPhone: "",
  });

  const [error, setError] = useState<string>("");

  /* =========================
     Dialogs state
  ========================= */

  // Role dialog
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [editingRoleKey, setEditingRoleKey] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<RoleDoc>({
    key: "",
    nameAr: "",
    nameEn: "",
    description: "",
    permissions: [],
    isActive: true,
    isSystem: false,
  });

  // Admin user dialog
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [adminForm, setAdminForm] = useState<Omit<AdminUserDoc, "id">>({
    displayName: "",
    email: "",
    roleKey: "staff",
    title: "",
    isActive: true,
    notes: "",
    permissionsAllow: [],
    permissionsDeny: [],
  });

  // Import JSON
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  /* =========================
     Load settings (Firestore)
  ========================= */

  const loadSettingsOnce = async () => {
    try {
      const [
        appSnap,
        notifSnap,
        secSnap,
        labelsSnap,
        rolesSnap,
        flagsSnap,
        contentSnap,
      ] = await Promise.all([
        getDoc(doc(db, "settings", "app")),
        getDoc(doc(db, "settings", "notifications")),
        getDoc(doc(db, "settings", "security")),
        getDoc(doc(db, "settings", "labels")),
        getDoc(doc(db, "settings", "roles")),
        getDoc(doc(db, "settings", "flags")),
        getDoc(doc(db, "settings", "content")),
      ]);

      if (appSnap.exists()) setApp(appSnap.data() as any);
      if (notifSnap.exists()) setNotifications(notifSnap.data() as any);
      if (secSnap.exists()) setSecurity(secSnap.data() as any);

      if (labelsSnap.exists()) {
        const d = labelsSnap.data() as any;
        setLabels((prev) => ({
          ...prev,
          ...(d || {}),
          projectTypes: d?.projectTypes ?? prev.projectTypes,
          projectStatuses: d?.projectStatuses ?? prev.projectStatuses,
          investmentStatuses: d?.investmentStatuses ?? prev.investmentStatuses,
          uiRoles: d?.uiRoles ?? prev.uiRoles,
        }));
      }

      if (rolesSnap.exists()) {
        const d = rolesSnap.data() as any;
        if (Array.isArray(d?.roles)) setRoles(d.roles);
      }

      if (flagsSnap.exists()) {
        const d = flagsSnap.data() as any;
        setFlags((prev) => ({
          ...prev,
          ...d,
        }));
      }

      if (contentSnap.exists()) {
        const d = contentSnap.data() as any;
        setContent((prev) => ({
          ...prev,
          ...d,
        }));
      }
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل الإعدادات");
    }
  };

  useEffect(() => {
    setLoading(true);
    setError("");

    loadSettingsOnce()
      .catch(() => null)
      .finally(() => setLoading(false));

    // Realtime: admin_users
    const unsubAdmins = onSnapshot(
      collection(db, "admin_users"),
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as AdminUserDoc[];
        setAdminUsers(rows);
      },
      (err) => {
        console.error("admin_users snapshot error:", err);
        setError("تعذر تحميل بيانات حسابات الإدارة (صلاحيات/اتصال).");
      }
    );

    // Realtime: role_invites
    const unsubInvites = onSnapshot(
      collection(db, "role_invites"),
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as RoleInviteDoc[];
        rows.sort((a, b) =>
          String(a.email || "").localeCompare(String(b.email || ""))
        );
        setRoleInvites(rows);
      },
      (err) => {
        console.error("role_invites snapshot error:", err);
      }
    );

    return () => {
      unsubAdmins();
      unsubInvites();
    };
  }, []);

  /* =========================
     Save handlers
  ========================= */

  const saveApp = async () => {
    try {
      await setDoc(doc(db, "settings", "app"), {
        ...app,
        updatedAt: serverTimestamp(),
      });
      toast.success("تم حفظ الإعدادات العامة");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ الإعدادات العامة");
    }
  };

  const saveNotifications = async () => {
    try {
      await setDoc(doc(db, "settings", "notifications"), {
        ...notifications,
        updatedAt: serverTimestamp(),
      });
      toast.success("تم حفظ إعدادات الإشعارات");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ إعدادات الإشعارات");
    }
  };

  const saveSecurity = async () => {
    try {
      await setDoc(doc(db, "settings", "security"), {
        ...security,
        updatedAt: serverTimestamp(),
      });
      toast.success("تم حفظ إعدادات الأمان");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ إعدادات الأمان");
    }
  };

  const saveLabels = async () => {
    try {
      await setDoc(doc(db, "settings", "labels"), {
        ...labels,
        updatedAt: serverTimestamp(),
      });
      toast.success("تم حفظ المسميات");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ المسميات");
    }
  };

  const saveFlags = async () => {
    try {
      await setDoc(doc(db, "settings", "flags"), {
        ...flags,
        updatedAt: serverTimestamp(),
      });
      toast.success("تم حفظ Feature Flags");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ Feature Flags");
    }
  };

  const saveContent = async () => {
    try {
      await setDoc(doc(db, "settings", "content"), {
        ...content,
        updatedAt: serverTimestamp(),
      });
      toast.success("تم حفظ محتوى الموقع");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ محتوى الموقع");
    }
  };

  /* =========================
     Roles
  ========================= */

  const saveRolesDoc = async (nextRoles: RoleDoc[]) => {
    await setDoc(doc(db, "settings", "roles"), {
      roles: nextRoles,
      updatedAt: serverTimestamp(),
    });
  };

  const openCreateRole = () => {
    setEditingRoleKey(null);
    setRoleForm({
      key: "",
      nameAr: "",
      nameEn: "",
      description: "",
      permissions: [],
      isActive: true,
      isSystem: false,
    });
    setIsRoleDialogOpen(true);
  };

  const openEditRole = (r: RoleDoc) => {
    setEditingRoleKey(r.key);
    setRoleForm({ ...r });
    setIsRoleDialogOpen(true);
  };

  const togglePermission = (perm: string) => {
    setRoleForm((p) => {
      const exists = p.permissions.includes(perm);
      return {
        ...p,
        permissions: exists
          ? p.permissions.filter((x) => x !== perm)
          : [...p.permissions, perm],
      };
    });
  };

  const handleSaveRole = async () => {
    const key = roleForm.key.trim();
    const nameAr = roleForm.nameAr.trim();

    if (!key) return toast.error("Role Key مطلوب");
    if (!/^[a-z0-9_]+$/i.test(key))
      return toast.error("Role Key يجب أن يكون حروف/أرقام/_ فقط");
    if (!nameAr) return toast.error("اسم الدور (عربي) مطلوب");

    try {
      const exists = roles.some((r) => r.key === key);
      if (!editingRoleKey && exists) return toast.error("Role Key موجود مسبقًا");

      const nowRole: RoleDoc = {
        ...roleForm,
        key,
        nameAr,
        nameEn: roleForm.nameEn?.trim() || "",
        description: roleForm.description?.trim() || "",
        updatedAt: serverTimestamp(),
        createdAt: roleForm.createdAt ?? serverTimestamp(),
      };

      const next =
        editingRoleKey && editingRoleKey !== key
          ? roles.filter((r) => r.key !== editingRoleKey).concat(nowRole)
          : roles.filter((r) => r.key !== key).concat(nowRole);

      next.sort((a, b) => a.key.localeCompare(b.key));

      await saveRolesDoc(next);
      setRoles(next);

      // Optional: keep uiRoles labels in sync
      setLabels((prev) => ({
        ...prev,
        uiRoles: {
          ...prev.uiRoles,
          [key]: {
            ar: nowRole.nameAr,
            en: nowRole.nameEn || "",
          },
        },
      }));

      toast.success("تم حفظ الدور");
      setIsRoleDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ الدور");
    }
  };

  const handleDeleteRole = async (roleKey: string) => {
    if (SYSTEM_ROLE_KEYS.includes(roleKey)) {
      return toast.error("لا يمكن حذف Role أساسي");
    }
    try {
      const next = roles.filter((r) => r.key !== roleKey);
      await saveRolesDoc(next);
      setRoles(next);
      toast.success("تم حذف الدور");
    } catch (e) {
      console.error(e);
      toast.error("فشل حذف الدور");
    }
  };

  /* =========================
     Admin Users (Firestore only)
  ========================= */

  const roleOptions = useMemo(() => {
    const active = roles.filter((r) => r.isActive);
    if (active.length) return active;
    return [
      { key: "owner", nameAr: "أونر" },
      { key: "admin", nameAr: "أدمن" },
      { key: "accountant", nameAr: "محاسب" },
      { key: "staff", nameAr: "موظف" },
      { key: "client", nameAr: "عميل" },
      { key: "guest", nameAr: "زائر" },
    ] as any[];
  }, [roles]);

  const openCreateAdmin = () => {
    setEditingAdminId(null);
    setAdminForm({
      displayName: "",
      email: "",
      roleKey: "staff",
      title: "",
      isActive: true,
      notes: "",
      permissionsAllow: [],
      permissionsDeny: [],
    });
    setIsAdminDialogOpen(true);
  };

  const openEditAdmin = (u: AdminUserDoc) => {
    setEditingAdminId(u.id);
    setAdminForm({
      displayName: u.displayName || "",
      email: u.email || "",
      roleKey: u.roleKey || "staff",
      title: u.title || "",
      isActive: !!u.isActive,
      notes: u.notes || "",
      permissionsAllow: u.permissionsAllow || [],
      permissionsDeny: u.permissionsDeny || [],
    });
    setIsAdminDialogOpen(true);
  };

  const handleSaveAdminUser = async () => {
    const displayName = adminForm.displayName.trim();
    const email = adminForm.email.trim().toLowerCase();
    const roleKey = adminForm.roleKey;

    if (!displayName) return toast.error("اسم الحساب مطلوب");
    if (!email || !email.includes("@")) return toast.error("البريد غير صحيح");
    if (!roleKey) return toast.error("اختر Role");

    // ✅ sanitize arrays
    const permissionsAllow = Array.from(
      new Set(adminForm.permissionsAllow || [])
    );
    const permissionsDeny = Array.from(new Set(adminForm.permissionsDeny || []));

    try {
      if (editingAdminId) {
        await updateDoc(doc(db, "admin_users", editingAdminId), {
          ...adminForm,
          displayName,
          email,
          permissionsAllow,
          permissionsDeny,
          updatedAt: serverTimestamp(),
        });
        toast.success("تم تحديث حساب الإدارة");
      } else {
        await addDoc(collection(db, "admin_users"), {
          ...adminForm,
          displayName,
          email,
          permissionsAllow,
          permissionsDeny,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success("تم إنشاء حساب إدارة جديد");
      }

      setIsAdminDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ حساب الإدارة");
    }
  };

  const handleToggleAdminActive = async (u: AdminUserDoc) => {
    try {
      await updateDoc(doc(db, "admin_users", u.id), {
        isActive: !u.isActive,
        updatedAt: serverTimestamp(),
      });
      toast.success(u.isActive ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث حالة الحساب");
    }
  };

  const handleDeleteAdmin = async (id: string) => {
    try {
      await deleteDoc(doc(db, "admin_users", id));
      toast.success("تم حذف الحساب");
    } catch (e) {
      console.error(e);
      toast.error("فشل حذف الحساب");
    }
  };

  /* =========================
     Role Invites (Promote by Email)
  ========================= */

  const upsertRoleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    const roleKey = inviteRoleKey;

    if (!email || !email.includes("@")) return toast.error("البريد غير صحيح");
    if (!roleKey) return toast.error("اختر Role");

    try {
      await setDoc(
        doc(db, "role_invites", email),
        {
          email,
          roleKey,
          isActive: true,
          notes: inviteNotes.trim(),
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      toast.success("تم حفظ الدعوة — سيتم تطبيق الدور عند أول تسجيل دخول");
      setInviteEmail("");
      setInviteRoleKey("accountant");
      setInviteNotes("");
    } catch (e) {
      console.error(e);
      toast.error("فشل حفظ الدعوة");
    }
  };

  const toggleInviteActive = async (inv: RoleInviteDoc) => {
    try {
      await updateDoc(doc(db, "role_invites", inv.id), {
        isActive: !inv.isActive,
        updatedAt: serverTimestamp(),
      });
      toast.success(inv.isActive ? "تم تعطيل الدعوة" : "تم تفعيل الدعوة");
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث الدعوة");
    }
  };

  const deleteInvite = async (id: string) => {
    try {
      await deleteDoc(doc(db, "role_invites", id));
      toast.success("تم حذف الدعوة");
    } catch (e) {
      console.error(e);
      toast.error("فشل حذف الدعوة");
    }
  };

  /* =========================
     Export / Import JSON
  ========================= */

  const buildExportJson = (): SettingsExport => ({
    exportedAt: new Date().toISOString(),
    settings: {
      app,
      notifications,
      security,
      roles,
      labels,
      flags,
      content,
    },
  });

  const downloadJson = (obj: any, filename: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const payload = buildExportJson();
    downloadJson(payload, `maedin-settings-${Date.now()}.json`);
    toast.success("تم تصدير ملف الإعدادات JSON");
  };

  const applyImport = async (payload: SettingsExport) => {
    const s = payload.settings;

    await Promise.all([
      setDoc(doc(db, "settings", "app"), {
        ...s.app,
        importedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "settings", "notifications"), {
        ...s.notifications,
        importedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "settings", "security"), {
        ...s.security,
        importedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "settings", "roles"), {
        roles: s.roles,
        importedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "settings", "labels"), {
        ...s.labels,
        importedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "settings", "flags"), {
        ...s.flags,
        importedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, "settings", "content"), {
        ...s.content,
        importedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    ]);

    setApp(s.app);
    setNotifications(s.notifications);
    setSecurity(s.security);
    setRoles(s.roles);
    setLabels(s.labels);
    setFlags(s.flags);
    setContent(s.content);
  };

  const handlePickImportFile = () => fileInputRef.current?.click();

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setImporting(true);
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);

      if (!parsed?.settings?.app || !parsed?.settings?.labels) {
        toast.error("ملف غير صالح");
        return;
      }

      await applyImport(parsed as SettingsExport);
      toast.success("تم استيراد الإعدادات بنجاح");
    } catch (err) {
      console.error(err);
      toast.error("فشل استيراد الملف");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  /* =========================
     UI
  ========================= */

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-10 text-center">جاري التحميل...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">الإعدادات</h1>
          <p className="text-muted-foreground">
            مركز التحكم الأساسي للمنصة (Firebase)
          </p>
          {error ? <p className="text-red-600 mt-2 text-sm">{error}</p> : null}
        </div>

        <Tabs defaultValue="general">
          {/* ✅ Mobile: horizontal scroll بدل wrap عشان ما ينقص شيء */}
          <TabsList className="w-full h-auto justify-start gap-2 overflow-x-auto flex-nowrap whitespace-nowrap">
            <TabsTrigger value="general" className="shrink-0 whitespace-nowrap">
              <SettingsIcon className="w-4 h-4 ml-2" /> عام
            </TabsTrigger>

            <TabsTrigger value="notifications" className="shrink-0 whitespace-nowrap">
              <Bell className="w-4 h-4 ml-2" /> الإشعارات
            </TabsTrigger>

            <TabsTrigger value="security" className="shrink-0 whitespace-nowrap">
              <Shield className="w-4 h-4 ml-2" /> الأمان
            </TabsTrigger>

            <TabsTrigger value="roles" className="shrink-0 whitespace-nowrap">
              <KeyRound className="w-4 h-4 ml-2" /> الأدوار والصلاحيات
            </TabsTrigger>

            <TabsTrigger value="admins" className="shrink-0 whitespace-nowrap">
              <Users className="w-4 h-4 ml-2" /> حسابات الإدارة
            </TabsTrigger>

            <TabsTrigger value="labels" className="shrink-0 whitespace-nowrap">
              <Tags className="w-4 h-4 ml-2" /> المسميات
            </TabsTrigger>

            <TabsTrigger value="flags" className="shrink-0 whitespace-nowrap">
              <SlidersHorizontal className="w-4 h-4 ml-2" /> Feature Flags
            </TabsTrigger>

            <TabsTrigger value="content" className="shrink-0 whitespace-nowrap">
              <Type className="w-4 h-4 ml-2" /> محتوى الموقع
            </TabsTrigger>

            <TabsTrigger value="backup" className="shrink-0 whitespace-nowrap">
              <FileDown className="w-4 h-4 ml-2" /> Backup
            </TabsTrigger>

            <TabsTrigger value="database" className="shrink-0 whitespace-nowrap">
              <Database className="w-4 h-4 ml-2" /> قاعدة البيانات
            </TabsTrigger>
          </TabsList>

          {/* =========================
              General
          ========================= */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>معلومات المنصة</CardTitle>
                <CardDescription>بيانات التواصل والضبط العام</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field
                  label="اسم المنصة"
                  value={app.name}
                  onChange={(v: string) => setApp({ ...app, name: v })}
                />
                <Field
                  label="البريد الإلكتروني"
                  value={app.email}
                  onChange={(v: string) => setApp({ ...app, email: v })}
                />
                <Field
                  label="رقم الهاتف"
                  value={app.phone}
                  onChange={(v: string) => setApp({ ...app, phone: v })}
                />
                <Field
                  label="العنوان"
                  value={app.address}
                  onChange={(v: string) => setApp({ ...app, address: v })}
                />

                <div className="grid md:grid-cols-3 gap-4">
                  <Field
                    label="الحد الأدنى للاستثمار"
                    value={app.minInvestment}
                    onChange={(v: string) =>
                      setApp({ ...app, minInvestment: v })
                    }
                  />
                  <Field
                    label="الحد الأعلى للاستثمار"
                    value={app.maxInvestment}
                    onChange={(v: string) =>
                      setApp({ ...app, maxInvestment: v })
                    }
                  />
                  <Field
                    label="العائد الافتراضي %"
                    value={app.defaultReturn}
                    onChange={(v: string) =>
                      setApp({ ...app, defaultReturn: v })
                    }
                  />
                </div>

                <Button className="bg-[#F2B705]" onClick={saveApp}>
                  حفظ
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Notifications
          ========================= */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>الإشعارات</CardTitle>
                <CardDescription>تحكم في إشعارات النظام</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Toggle
                  label="إشعارات البريد"
                  value={notifications.email}
                  onChange={(v: boolean) =>
                    setNotifications({ ...notifications, email: v })
                  }
                />
                <Toggle
                  label="إشعارات SMS"
                  value={notifications.sms}
                  onChange={(v: boolean) =>
                    setNotifications({ ...notifications, sms: v })
                  }
                />
                <Toggle
                  label="استثمارات جديدة"
                  value={notifications.investments}
                  onChange={(v: boolean) =>
                    setNotifications({ ...notifications, investments: v })
                  }
                />
                <Toggle
                  label="رسائل جديدة"
                  value={notifications.messages}
                  onChange={(v: boolean) =>
                    setNotifications({ ...notifications, messages: v })
                  }
                />

                <Button className="bg-[#F2B705]" onClick={saveNotifications}>
                  حفظ
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Security
          ========================= */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>الأمان</CardTitle>
                <CardDescription>إعدادات أمان عامة</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Toggle
                  label="المصادقة الثنائية"
                  value={security.twoFactor}
                  onChange={(v: boolean) => setSecurity({ twoFactor: v })}
                />
                <Button className="bg-[#F2B705]" onClick={saveSecurity}>
                  حفظ
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Roles & Permissions
          ========================= */}
          <TabsContent value="roles">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>الأدوار والصلاحيات</CardTitle>
                  <CardDescription>
                    أنشئ Role لأي تخصص، وحدد صلاحياته — وهذا اللي بنبني عليه
                    Rules لاحقًا
                  </CardDescription>
                </div>
                <Button onClick={openCreateRole} className="bg-[#F2B705]">
                  <Plus className="w-4 h-4 ml-2" /> Role جديد
                </Button>
              </CardHeader>

              <CardContent className="space-y-3">
                {roles.length ? (
                  <div className="grid gap-3">
                    {roles
                      .slice()
                      .sort((a, b) => a.key.localeCompare(b.key))
                      .map((r) => (
                        <div
                          key={r.key}
                          className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border rounded-lg p-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{r.key}</Badge>
                              <span className="font-bold">{r.nameAr}</span>
                              {!r.isActive ? (
                                <Badge variant="secondary">موقوف</Badge>
                              ) : null}
                              {SYSTEM_ROLE_KEYS.includes(r.key) ? (
                                <Badge>أساسي</Badge>
                              ) : null}
                            </div>

                            {r.description ? (
                              <p className="text-sm text-muted-foreground">
                                {r.description}
                              </p>
                            ) : null}

                            <div className="flex flex-wrap gap-2 mt-2">
                              {r.permissions?.length ? (
                                r.permissions.slice(0, 10).map((p) => (
                                  <Badge key={p} variant="secondary">
                                    {p}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  لا توجد صلاحيات
                                </span>
                              )}
                              {r.permissions?.length > 10 ? (
                                <Badge variant="secondary">
                                  +{r.permissions.length - 10}
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => openEditRole(r)}
                            >
                              <Pencil className="w-4 h-4 ml-2" /> تعديل
                            </Button>
                            <Button
                              variant="outline"
                              onClick={async () => {
                                const next = roles.map((x) =>
                                  x.key === r.key
                                    ? { ...x, isActive: !x.isActive }
                                    : x
                                );
                                try {
                                  await saveRolesDoc(next);
                                  setRoles(next);
                                  toast.success(
                                    r.isActive
                                      ? "تم إيقاف الدور"
                                      : "تم تفعيل الدور"
                                  );
                                } catch (e) {
                                  console.error(e);
                                  toast.error("فشل تحديث الدور");
                                }
                              }}
                            >
                              {r.isActive ? "إيقاف" : "تفعيل"}
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleDeleteRole(r.key)}
                              disabled={SYSTEM_ROLE_KEYS.includes(r.key)}
                            >
                              <Trash2 className="w-4 h-4 ml-2" /> حذف
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    لا توجد Roles محفوظة بعد. اضغط “Role جديد”.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Admin Accounts
          ========================= */}
          <TabsContent value="admins">
            {/* ✅ NEW: Promote by email (no UID needed) */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>ترقية دور حسب الإيميل (بدون UID)</CardTitle>
                <CardDescription>
                  اكتب الإيميل وحدد الدور — أول ما يسوي Login/Signup يتم تعيين role
                  تلقائيًا في users/{"{uid}"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <Label>الإيميل</Label>
                    <Input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="accountant@example.com"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>الدور</Label>
                    <Select
                      value={inviteRoleKey}
                      onValueChange={(v: any) =>
                        setInviteRoleKey(v as AppRoleKey)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accountant">
                          محاسب (accountant)
                        </SelectItem>
                        <SelectItem value="staff">موظف (staff)</SelectItem>
                        <SelectItem value="admin">أدمن (admin)</SelectItem>
                        <SelectItem value="owner">أونر (owner)</SelectItem>
                        <SelectItem value="client">عميل (client)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>ملاحظات (اختياري)</Label>
                  <Textarea
                    rows={2}
                    value={inviteNotes}
                    onChange={(e) => setInviteNotes(e.target.value)}
                    placeholder="مثال: محاسب رسمي"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button className="bg-[#F2B705]" onClick={upsertRoleInvite}>
                    حفظ الدعوة
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold">الدعوات الحالية</div>
                    <Badge variant="outline">{roleInvites.length}</Badge>
                  </div>

                  {roleInvites.length ? (
                    <div className="grid gap-3">
                      {roleInvites.map((inv) => (
                        <div
                          key={inv.id}
                          className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{inv.email}</Badge>
                              <Badge variant="secondary">
                                Role: {inv.roleKey}
                              </Badge>
                              {inv.isActive ? (
                                <Badge>مفعّلة</Badge>
                              ) : (
                                <Badge variant="secondary">موقوفة</Badge>
                              )}
                            </div>
                            {inv.notes ? (
                              <div className="text-sm text-muted-foreground">
                                {inv.notes}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => toggleInviteActive(inv)}
                            >
                              {inv.isActive ? "تعطيل" : "تفعيل"}
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => deleteInvite(inv.id)}
                            >
                              حذف
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      لا توجد دعوات بعد.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Existing admin_users card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>حسابات الإدارة</CardTitle>
                  <CardDescription>
                    إنشاء/تعديل/تفعيل/تعطيل حسابات الإدارة (Firestore فقط)
                  </CardDescription>
                </div>
                <Button onClick={openCreateAdmin} className="bg-[#F2B705]">
                  <Plus className="w-4 h-4 ml-2" /> حساب إداري جديد
                </Button>
              </CardHeader>

              <CardContent className="space-y-3">
                {adminUsers.length ? (
                  <div className="grid gap-3">
                    {adminUsers
                      .slice()
                      .sort((a, b) =>
                        String(a.email || "").localeCompare(
                          String(b.email || "")
                        )
                      )
                      .map((u) => (
                        <div
                          key={u.id}
                          className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">ID: {u.id}</Badge>
                              <span className="font-bold">{u.displayName}</span>
                              {u.isActive ? (
                                <Badge>مفعّل</Badge>
                              ) : (
                                <Badge variant="secondary">معطّل</Badge>
                              )}
                              <Badge variant="secondary">
                                Role: {u.roleKey}
                              </Badge>
                              {u.title ? (
                                <Badge variant="outline">{u.title}</Badge>
                              ) : null}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {u.email}
                            </div>

                            {u.permissionsAllow?.length ||
                              u.permissionsDeny?.length ? (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {(u.permissionsAllow || [])
                                  .slice(0, 6)
                                  .map((p) => (
                                    <Badge
                                      key={`a-${u.id}-${p}`}
                                      variant="secondary"
                                    >
                                      + {p}
                                    </Badge>
                                  ))}
                                {(u.permissionsDeny || [])
                                  .slice(0, 6)
                                  .map((p) => (
                                    <Badge
                                      key={`d-${u.id}-${p}`}
                                      variant="outline"
                                    >
                                      - {p}
                                    </Badge>
                                  ))}
                              </div>
                            ) : null}

                            {u.notes ? (
                              <div className="text-sm text-muted-foreground line-clamp-2">
                                {u.notes}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => openEditAdmin(u)}
                            >
                              <Pencil className="w-4 h-4 ml-2" /> تعديل
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleToggleAdminActive(u)}
                            >
                              {u.isActive ? "تعطيل" : "تفعيل"}
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleDeleteAdmin(u.id)}
                            >
                              <Trash2 className="w-4 h-4 ml-2" /> حذف
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    لا توجد حسابات إدارة بعد.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Labels
          ========================= */}
          <TabsContent value="labels">
            <Card>
              <CardHeader>
                <CardTitle>المسميات</CardTitle>
                <CardDescription>
                  تغيير كل المسميات اللي تظهر في النظام (أنواع/حالات/أدوار) بدون
                  تعديل كود
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <LabelsEditor
                  title="مسميات أنواع المشاريع (Project Types)"
                  data={labels.projectTypes}
                  onChange={(next) =>
                    setLabels((p) => ({ ...p, projectTypes: next }))
                  }
                />

                <LabelsEditor
                  title="مسميات حالات المشاريع (Project Statuses)"
                  data={labels.projectStatuses}
                  onChange={(next) =>
                    setLabels((p) => ({ ...p, projectStatuses: next }))
                  }
                />

                <LabelsEditor
                  title="مسميات حالات الاستثمارات (Investment Statuses)"
                  data={labels.investmentStatuses}
                  onChange={(next) =>
                    setLabels((p) => ({ ...p, investmentStatuses: next }))
                  }
                />

                <LabelsEditor
                  title="مسميات الأدوار للعرض (UI Roles Labels)"
                  data={labels.uiRoles}
                  onChange={(next) =>
                    setLabels((p) => ({ ...p, uiRoles: next }))
                  }
                />

                <Button className="bg-[#F2B705]" onClick={saveLabels}>
                  حفظ المسميات
                </Button>

                <p className="text-sm text-muted-foreground">
                  * لاحقًا نربط صفحات العرض بحيث تستخدم المسميات من settings/labels
                  بدل النصوص الثابتة.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Flags
          ========================= */}
          <TabsContent value="flags">
            <Card>
              <CardHeader>
                <CardTitle>Feature Flags</CardTitle>
                <CardDescription>
                  تشغيل/إيقاف أجزاء من الموقع فورًا (بدون كود إضافي)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Toggle
                  label="Maintenance Mode (إيقاف الموقع/وضع صيانة)"
                  value={flags.maintenanceMode}
                  onChange={(v: boolean) =>
                    setFlags((p) => ({ ...p, maintenanceMode: v }))
                  }
                />
                <Toggle
                  label="تعطيل الاستثمارات (منع إنشاء استثمار جديد)"
                  value={flags.disableInvestments}
                  onChange={(v: boolean) =>
                    setFlags((p) => ({ ...p, disableInvestments: v }))
                  }
                />
                <Toggle
                  label="تعطيل الرسائل (إخفاء نموذج/صفحة الرسائل)"
                  value={flags.disableMessages}
                  onChange={(v: boolean) =>
                    setFlags((p) => ({ ...p, disableMessages: v }))
                  }
                />
                <Toggle
                  label="VIP Only Mode (عرض محتوى VIP فقط)"
                  value={flags.vipOnlyMode}
                  onChange={(v: boolean) =>
                    setFlags((p) => ({ ...p, vipOnlyMode: v }))
                  }
                />
                <Toggle
                  label="إخفاء مشاريع VIP من العامة"
                  value={flags.hideVipProjects}
                  onChange={(v: boolean) =>
                    setFlags((p) => ({ ...p, hideVipProjects: v }))
                  }
                />

                <Button className="bg-[#F2B705]" onClick={saveFlags}>
                  حفظ Flags
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Content CMS
          ========================= */}
          <TabsContent value="content">
            <Card>
              <CardHeader>
                <CardTitle>محتوى الموقع (CMS)</CardTitle>
                <CardDescription>تحكم بالنصوص العامة للواجهة</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Hero Title (عربي)</Label>
                    <Input
                      value={content.heroTitleAr}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          heroTitleAr: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Hero Title (English)</Label>
                    <Input
                      value={content.heroTitleEn}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          heroTitleEn: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Hero Subtitle (عربي)</Label>
                    <Textarea
                      rows={3}
                      value={content.heroSubtitleAr}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          heroSubtitleAr: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Hero Subtitle (English)</Label>
                    <Textarea
                      rows={3}
                      value={content.heroSubtitleEn}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          heroSubtitleEn: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Footer About (عربي)</Label>
                    <Textarea
                      rows={3}
                      value={content.footerAboutAr}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          footerAboutAr: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Footer About (English)</Label>
                    <Textarea
                      rows={3}
                      value={content.footerAboutEn}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          footerAboutEn: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Contact Email</Label>
                    <Input
                      value={content.contactEmail}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          contactEmail: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Contact Phone</Label>
                    <Input
                      value={content.contactPhone}
                      onChange={(e) =>
                        setContent((p) => ({
                          ...p,
                          contactPhone: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <Button className="bg-[#F2B705]" onClick={saveContent}>
                  حفظ المحتوى
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Backup
          ========================= */}
          <TabsContent value="backup">
            <Card>
              <CardHeader>
                <CardTitle>Backup / Restore</CardTitle>
                <CardDescription>
                  تصدير واستيراد إعدادات المنصة بسرعة
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleExport}>
                    <FileDown className="w-4 h-4 ml-2" /> Export JSON
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handlePickImportFile}
                    disabled={importing}
                  >
                    <FileUp className="w-4 h-4 ml-2" />
                    {importing ? "جاري الاستيراد..." : "Import JSON"}
                  </Button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={handleImportFileChange}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* =========================
              Database
          ========================= */}
          <TabsContent value="database">
            <Card>
              <CardHeader>
                <CardTitle>قاعدة البيانات</CardTitle>
                <CardDescription>
                  النسخ الاحتياطي يتم عبر Firebase
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  النسخ الاحتياطي والإستعادة تتم عبر Firebase Console.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* =========================
          Role Dialog
      ========================= */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRoleKey ? "تعديل Role" : "إنشاء Role جديد"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Role Key (unique)</Label>
                <Input
                  value={roleForm.key}
                  onChange={(e) =>
                    setRoleForm((p) => ({ ...p, key: e.target.value }))
                  }
                  placeholder="مثال: manager / support / auditor"
                  disabled={
                    !!editingRoleKey && SYSTEM_ROLE_KEYS.includes(editingRoleKey)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  حروف/أرقام/_ فقط — ويُستخدم لاحقًا في الـ Rules
                </p>
              </div>

              <div className="space-y-1">
                <Label>اسم الدور (عربي)</Label>
                <Input
                  value={roleForm.nameAr}
                  onChange={(e) =>
                    setRoleForm((p) => ({ ...p, nameAr: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>اسم الدور (إنجليزي)</Label>
                <Input
                  value={roleForm.nameEn || ""}
                  onChange={(e) =>
                    setRoleForm((p) => ({ ...p, nameEn: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>الحالة</Label>
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">
                    {roleForm.isActive ? "مفعّل" : "موقوف"}
                  </span>
                  <Switch
                    checked={roleForm.isActive}
                    onCheckedChange={(v) =>
                      setRoleForm((p) => ({ ...p, isActive: v }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>وصف (اختياري)</Label>
              <Textarea
                rows={3}
                value={roleForm.description || ""}
                onChange={(e) =>
                  setRoleForm((p) => ({ ...p, description: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>الصلاحيات</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {DEFAULT_PERMISSIONS.map((perm) => {
                  const checked = roleForm.permissions.includes(perm.key);
                  return (
                    <div
                      key={perm.key}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 bg-background/60 hover:bg-background transition"
                    >
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">{perm.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {perm.key}
                        </div>
                      </div>

                      <Switch
                        checked={checked}
                        onCheckedChange={() => togglePermission(perm.key)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setIsRoleDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button className="bg-[#F2B705]" onClick={handleSaveRole}>
                {editingRoleKey ? "حفظ التعديل" : "إنشاء الدور"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* =========================
        Admin User Dialog
    ========================= */}
      <Dialog open={isAdminDialogOpen} onOpenChange={setIsAdminDialogOpen}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAdminId ? "تعديل حساب إداري" : "إنشاء حساب إداري"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>الاسم</Label>
                <Input
                  value={adminForm.displayName}
                  onChange={(e) =>
                    setAdminForm((p) => ({ ...p, displayName: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>البريد</Label>
                <Input
                  value={adminForm.email}
                  onChange={(e) =>
                    setAdminForm((p) => ({ ...p, email: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>الدور</Label>
                <Select
                  value={adminForm.roleKey}
                  onValueChange={(v: any) =>
                    setAdminForm((p) => ({ ...p, roleKey: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.nameAr} ({r.key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>المنصب/العنوان (اختياري)</Label>
                <Input
                  value={adminForm.title || ""}
                  onChange={(e) =>
                    setAdminForm((p) => ({ ...p, title: e.target.value }))
                  }
                  placeholder="مثال: مدير مالي"
                />
              </div>

              <div className="space-y-1">
                <Label>الحالة</Label>
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span className="text-sm">
                    {adminForm.isActive ? "مفعّل" : "معطّل"}
                  </span>
                  <Switch
                    checked={adminForm.isActive}
                    onCheckedChange={(v) =>
                      setAdminForm((p) => ({ ...p, isActive: v }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>ملاحظات (اختياري)</Label>
              <Textarea
                rows={3}
                value={adminForm.notes || ""}
                onChange={(e) =>
                  setAdminForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>

            {/* Permissions overrides */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Permissions Allow (اختياري)</Label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_PERMISSIONS.map((perm) => {
                    const checked = (adminForm.permissionsAllow || []).includes(
                      perm.key
                    );
                    return (
                      <Button
                        key={`allow-${perm.key}`}
                        type="button"
                        variant={checked ? "default" : "outline"}
                        className={checked ? "bg-[#F2B705] text-black" : ""}
                        onClick={() => {
                          setAdminForm((p) => {
                            const cur = new Set(p.permissionsAllow || []);
                            if (cur.has(perm.key)) cur.delete(perm.key);
                            else cur.add(perm.key);
                            return {
                              ...p,
                              permissionsAllow: Array.from(cur),
                            };
                          });
                        }}
                      >
                        + {perm.key}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  هذه الصلاحيات تُضاف فوق صلاحيات الـ Role.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Permissions Deny (اختياري)</Label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_PERMISSIONS.map((perm) => {
                    const checked = (adminForm.permissionsDeny || []).includes(
                      perm.key
                    );
                    return (
                      <Button
                        key={`deny-${perm.key}`}
                        type="button"
                        variant={checked ? "destructive" : "outline"}
                        onClick={() => {
                          setAdminForm((p) => {
                            const cur = new Set(p.permissionsDeny || []);
                            if (cur.has(perm.key)) cur.delete(perm.key);
                            else cur.add(perm.key);
                            return {
                              ...p,
                              permissionsDeny: Array.from(cur),
                            };
                          });
                        }}
                      >
                        - {perm.key}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  هذه الصلاحيات تمنع المستخدم حتى لو كانت موجودة في الـ Role.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setIsAdminDialogOpen(false)}
              >
                إلغاء
              </Button>
              <Button className="bg-[#F2B705]" onClick={handleSaveAdminUser}>
                {editingAdminId ? "حفظ التعديل" : "إنشاء"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

/* =========================
 Small UI helpers
========================= */

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border rounded-md px-4 py-3">
      <span className="font-medium">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function LabelsEditor({
  title,
  data,
  onChange,
}: {
  title: string;
  data: Record<string, { ar: string; en?: string }>;
  onChange: (next: Record<string, { ar: string; en?: string }>) => void;
}) {
  const rows = Object.entries(data || {});

  const addRow = () => {
    const key = `new_${Date.now()}`;
    onChange({
      ...data,
      [key]: { ar: "جديد", en: "New" },
    });
  };

  const removeRow = (k: string) => {
    const next = { ...data };
    delete next[k];
    onChange(next);
  };

  const updateRow = (k: string, field: "ar" | "en", v: string) => {
    onChange({
      ...data,
      [k]: {
        ...data[k],
        [field]: v,
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{title}</h3>
        <Button variant="outline" onClick={addRow}>
          <Plus className="w-4 h-4 ml-2" /> إضافة
        </Button>
      </div>

      <div className="grid gap-3">
        {rows.map(([k, val]) => (
          <div
            key={k}
            className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          >
            <div className="w-full md:w-44">
              <Label>Key</Label>
              <Input value={k} readOnly />
            </div>

            <div className="grid md:grid-cols-2 gap-3 w-full">
              <div className="space-y-1">
                <Label>عربي</Label>
                <Input
                  value={val.ar || ""}
                  onChange={(e) => updateRow(k, "ar", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>English</Label>
                <Input
                  value={val.en || ""}
                  onChange={(e) => updateRow(k, "en", e.target.value)}
                />
              </div>
            </div>

            <Button
              variant="destructive"
              onClick={() => removeRow(k)}
              className="md:self-end"
            >
              <Trash2 className="w-4 h-4 ml-2" /> حذف
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
