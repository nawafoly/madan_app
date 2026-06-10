import {
  hasPermission,
  isOpsRole,
  useAuth,
  type Permission,
} from "@/_core/hooks/useAuth";
import { auth, db } from "@/_core/firebase";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  User,
  Users,
  Building2,
  DollarSign,
  Mail,
  MessageSquare,
  FileText,
  Settings,
  Crown,
  BarChart3,
  Home,
  BriefcaseBusiness,
  UserPlus,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { safeEnglishText, tr } from "@/lib/i18n";
import {
  normalizeEmployeeProfile,
  type EmployeeProfileUserDoc,
} from "@/lib/employeeProfile";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

type RoleKey = "owner" | "admin" | "accountant" | "hr";

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  allow: RoleKey[]; // الأدوار المسموح بها
  permission: Permission;
};

const adminMenuItems: MenuItem[] = [
  {
    icon: LayoutDashboard,
    label: "لوحة التحكم",
    path: "/dashboard",
    allow: ["owner", "admin", "accountant"],
    permission: "dashboard.view",
  },

  {
    icon: Building2,
    label: "المشاريع",
    path: "/admin/projects",
    allow: ["owner", "admin"],
    permission: "projects.manage",
  },

  {
    icon: DollarSign,
    label: "الشؤون المالية",
    path: "/admin/financial",
    allow: ["owner", "accountant"],
    permission: "financial.view",
  },

  {
    icon: Users,
    label: "العملاء",
    path: "/admin/clients",
    allow: ["owner", "admin"],
    permission: "users.view",
  },

  {
    icon: Crown,
    label: "إدارة VIP",
    path: "/admin/vip",
    allow: ["owner", "admin"],
    permission: "users.manage",
  },

  {
    icon: MessageSquare,
    label: "طلبات الاستثمار",
    path: "/admin/messages",
    allow: ["owner", "admin"],
    permission: "messages.view",
  },

  {
    icon: Mail,
    label: "رسائل التواصل",
    path: "/admin/contact-messages",
    allow: ["owner", "admin"],
    permission: "messages.view",
  },

  {
    icon: FileText,
    label: "سجل التعديلات",
    path: "/admin/audit-log",
    allow: ["owner", "admin"],
    permission: "settings.manage",
  },

  {
    icon: BarChart3,
    label: "التقارير",
    path: "/admin/reports",
    allow: ["owner", "admin", "accountant"],
    permission: "reports.view",
  },

  {
    icon: Settings,
    label: "إعدادات الاستثمار",
    path: "/admin/settings",
    allow: ["owner"],
    permission: "settings.manage",
  },
];

const hrMenuItems: MenuItem[] = [
  {
    icon: BriefcaseBusiness,
    label: "طلبات التوظيف",
    path: "/hr/recruitment",
    allow: ["owner", "admin", "hr"],
    permission: "recruitment.view",
  },
  {
    icon: Users,
    label: "إدارة الموظفين",
    path: "/hr/employees",
    allow: ["owner", "admin", "hr"],
    permission: "employees.view",
  },
  {
    icon: UserPlus,
    label: "إنشاء حساب موظف",
    path: "/hr/create-staff",
    allow: ["owner", "admin", "hr"],
    permission: "employees.view",
  },
  {
    icon: Settings,
    label: "إعدادات الإدارة",
    path: "/hr/settings",
    allow: ["owner", "admin"],
    permission: "settings.manage",
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const SIDEBAR_OPEN_KEY = "dashboard_sidebar_open";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
type DashboardArea = "admin" | "hr";

const EMPLOYEE_PROFILE_PATH = "/hr/profile";
const EMPLOYEE_PROFILE_LABEL = "بروفايل الموظف";
const HR_MENU_LABELS: Record<string, { ar: string; en: string }> = {
  "/hr/recruitment": { ar: "طلبات التوظيف", en: "Recruitment" },
  "/hr/employees": { ar: "إدارة الموظفين", en: "Employees" },
  "/hr/create-staff": { ar: "إنشاء حساب موظف", en: "Create Staff" },
  "/hr/settings": { ar: "إعدادات الإدارة", en: "Settings" },
};

function readStoredSidebarOpen() {
  try {
    const saved = localStorage.getItem(SIDEBAR_OPEN_KEY);
    return saved ? JSON.parse(saved) : true;
  } catch {
    return true;
  }
}

/* =========================
   Name + Role helpers
========================= */

function hasArabic(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

function splitLocalPart(local: string) {
  // naf_aliyan.123 -> ["naf","aliyan"]
  const cleaned = local
    .replace(/\+/g, " ")
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // دعم camelCase
  const camel = cleaned.replace(/([a-z])([A-Z])/g, "$1 $2");

  return camel
    .split(" ")
    .map(w => w.trim())
    .filter(Boolean)
    .slice(0, 4); // لا نطوّل
}

function titleCaseLatin(w: string) {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "-" && text !== "undefined" && text !== "null") {
      return text;
    }
  }

  return "";
}

// تحويل تقريبي من اللاتيني إلى العربي. ليس دقيقًا 100% لكنه يعطي اسمًا مقروءًا.
function latinToArabicApprox(word: string) {
  const w = word.toLowerCase();

  // بعض التركيبات الشائعة أولًا
  const digraphs: Array<[RegExp, string]> = [
    [/sh/g, "ش"],
    [/ch/g, "تش"],
    [/kh/g, "خ"],
    [/th/g, "ث"],
    [/dh/g, "ذ"],
    [/gh/g, "غ"],
    [/ph/g, "ف"],
    [/aa/g, "ا"],
    [/ee/g, "ي"],
    [/oo/g, "و"],
    [/ou/g, "و"],
    [/aw/g, "و"],
    [/ai/g, "اي"],
    [/ei/g, "اي"],
  ];

  let s = w;
  for (const [re, ar] of digraphs) s = s.replace(re, ar);

  // تحويل حرف بحرف
  const map: Record<string, string> = {
    a: "ا",
    b: "ب",
    c: "ك",
    d: "د",
    e: "ي",
    f: "ف",
    g: "ج",
    h: "ه",
    i: "ي",
    j: "ج",
    k: "ك",
    l: "ل",
    m: "م",
    n: "ن",
    o: "و",
    p: "ب",
    q: "ق",
    r: "ر",
    s: "س",
    t: "ت",
    u: "و",
    v: "ف",
    w: "و",
    x: "كس",
    y: "ي",
    z: "ز",
  };

  let out = "";
  for (const ch of s) {
    if (map[ch]) out += map[ch];
    else if (ch === " ") out += " ";
    else if (/[\u0600-\u06FF]/.test(ch)) out += ch;
  }

  // تنظيف المسافات
  out = out.replace(/\s+/g, " ").trim();
  return out || word;
}

function nameFromEmail(email?: string) {
  if (!email) return "مستخدم";
  const local = email.split("@")[0] ?? "";
  if (!local) return "مستخدم";

  // لو كان الاسم عربيًا أصلًا
  if (hasArabic(local)) {
    const parts = splitLocalPart(local);
    return parts.length ? parts.join(" ") : local;
  }

  const parts = splitLocalPart(local);
  if (!parts.length) return "مستخدم";

  // قرّب الاسم إلى العربية
  const arParts = parts.map(p => latinToArabicApprox(p));
  const arName = arParts.join(" ").trim();

  // إذا كانت النتيجة ضعيفة، ارجع إلى الاسم اللاتيني المنسق
  if (!arName || arName.length < 2) {
    return parts.map(titleCaseLatin).join(" ");
  }

  return arName;
}

type DashboardLayoutProps = {
  children: React.ReactNode;
  area?: DashboardArea;
};

export default function DashboardLayout({
  children,
  area = "admin",
}: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(readStoredSidebarOpen);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });

  const { loading, user } = useAuth();
  const { language } = useLanguage();
  const layoutDir: "rtl" | "ltr" =
    typeof document !== "undefined" && document.documentElement.dir === "rtl"
      ? "rtl"
      : language === "ar"
        ? "rtl"
        : "ltr";

  const sidebarSide = layoutDir === "rtl" ? "right" : "left";

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_OPEN_KEY, JSON.stringify(isSidebarOpen));
  }, [isSidebarOpen]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              تسجيل الدخول للمتابعة
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              يتطلب الوصول إلى لوحة التحكم تسجيل الدخول. تابع لبدء عملية
              تسجيل الدخول.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            تسجيل الدخول
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      open={isSidebarOpen}
      onOpenChange={setIsSidebarOpen}
      dir={layoutDir}
      className="min-h-screen max-w-full flex-row items-stretch overflow-x-hidden"
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent
        area={area}
        setSidebarWidth={setSidebarWidth}
        sidebarSide={sidebarSide}
      >
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  area: DashboardArea;
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
  sidebarSide: "left" | "right";
};

function DashboardLayoutContent({
  area,
  children,
  setSidebarWidth,
  sidebarSide,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const { language } = useLanguage();
  const [location, setLocation] = useLocation();
  const { state, setOpen, setOpenMobile } = useSidebar();

  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarProfileSource, setSidebarProfileSource] = useState<{
    collectionName: "employees" | "users";
    docId: string;
  } | null>(null);
  const [sidebarProfileDoc, setSidebarProfileDoc] =
    useState<EmployeeProfileUserDoc | null>(null);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const isMobile = useIsMobile();
  const isRight = sidebarSide === "right";
  const handleSidebarToggle = () => {
    if (isMobile) {
      setOpenMobile(prev => !prev);
      return;
    }

    setOpen(prev => !prev);
  };

  // الدور
  const role = user?.role;

  // عناصر القائمة المسموحة
  const visibleMenuItems = useMemo(() => {
    if (!role || !isOpsRole(role)) return [];
    const menuItems = area === "hr" ? hrMenuItems : adminMenuItems;
    return menuItems.filter(item => hasPermission(user, item.permission));
  }, [area, role, user]);

  const getMenuLabel = (item: MenuItem) => {
    if (area === "hr") {
      const localized = HR_MENU_LABELS[item.path];
      if (localized) return localized[language];
    }

    return language === "ar"
      ? item.label
      : safeEnglishText(
          item.label,
          item.path.replace(/^\/+/, "").replace(/\//g, " / ")
        );
  };

  const employeeProfileLabel = tr(
    language,
    EMPLOYEE_PROFILE_LABEL,
    "Employee Profile"
  );

  // العنصر النشط
  const isEmployeeProfileActive =
    area === "hr" &&
    (location === EMPLOYEE_PROFILE_PATH ||
      location === "/hr/files" ||
      location === "/hr/messages");
  const activeMenuItem = visibleMenuItems.find(item => item.path === location);
  const activeMenuLabel = isEmployeeProfileActive
    ? employeeProfileLabel
    : (activeMenuItem
      ? getMenuLabel(activeMenuItem)
      : area === "hr"
        ? tr(language, "منصة الموارد البشرية", "Human Resources")
        : tr(language, "لوحة التحكم", "Dashboard"));
  const layoutBrandLabel =
    area === "hr"
      ? tr(language, "منصة الموارد البشرية", "Human Resources")
      : tr(language, "معدن", "MAEDIN");
  const homeTargetPath = area === "hr" ? "/hr" : "/";

  // اسم العرض: يفضل displayName ثم name ثم الإيميل
  const displayName = useMemo(() => {
    const dn = String((user as any)?.displayName ?? "").trim();
    if (dn && dn !== "-" && dn.length >= 2) {
      return language === "en"
        ? safeEnglishText(dn, String((user as any)?.email || "User"))
        : dn;
    }

    const dn2 = String((user as any)?.name ?? "").trim(); // احتياط إضافي
    if (dn2 && dn2 !== "-" && dn2.length >= 2) {
      return language === "en"
        ? safeEnglishText(dn2, String((user as any)?.email || "User"))
        : dn2;
    }

    return language === "en"
      ? String((user as any)?.email || "User")
      : nameFromEmail((user as any)?.email);
  }, [language, user]);

  const sidebarProfile = useMemo(
    () =>
      normalizeEmployeeProfile(sidebarProfileDoc, {
        displayName: String(user?.displayName || "").trim() || null,
        email: String(user?.email || "").trim() || null,
        photoURL: user?.firebaseUser?.photoURL || auth.currentUser?.photoURL,
      }),
    [sidebarProfileDoc, user?.displayName, user?.email, user?.firebaseUser?.photoURL]
  );

  const sidebarAvatarUrl = sidebarProfile.personal.avatarUrl;
  const sidebarJobTitle = useMemo(() => {
    const resolvedTitle = pickText(
      (sidebarProfileDoc as any)?.employeeProfile?.employment?.title,
      (sidebarProfileDoc as any)?.employeeProfile?.employment?.jobTitle,
      (sidebarProfileDoc as any)?.employment?.title,
      (sidebarProfileDoc as any)?.employment?.jobTitle,
      (sidebarProfileDoc as any)?.title,
      (sidebarProfileDoc as any)?.jobTitle,
      (sidebarProfileDoc as any)?.profile?.title,
      (user as any)?.title,
      (user as any)?.jobTitle
    );

    if (language === "en") return safeEnglishText(resolvedTitle, "Employee");
    return resolvedTitle || "موظف";
  }, [language, sidebarProfileDoc, user]);

  useEffect(() => {
    if (!user?.uid) {
      setSidebarProfileSource(null);
      setSidebarProfileDoc(null);
      return;
    }

    let cancelled = false;

    const resolveSidebarProfileSource = async () => {
      const linkedEmployeeId = String(user.linkedEmployeeId || "").trim();
      const candidateEmployeeDocIds = Array.from(
        new Set([linkedEmployeeId, user.uid].filter(Boolean))
      );

      for (const docId of candidateEmployeeDocIds) {
        try {
          const employeeSnapshot = await getDoc(doc(db, "employees", docId));
          if (employeeSnapshot.exists()) {
            if (!cancelled) {
              setSidebarProfileSource({
                collectionName: "employees",
                docId,
              });
            }
            return;
          }
        } catch (error) {
          console.error("sidebar_profile_source_lookup_failed", error);
        }
      }

      if (!cancelled) {
        setSidebarProfileSource({
          collectionName: "users",
          docId: user.uid,
        });
      }
    };

    void resolveSidebarProfileSource();

    return () => {
      cancelled = true;
    };
  }, [user?.linkedEmployeeId, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !sidebarProfileSource) {
      setSidebarProfileDoc(null);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, sidebarProfileSource.collectionName, sidebarProfileSource.docId),
      snapshot => {
        const snapshotData = snapshot.data() as EmployeeProfileUserDoc | undefined;
        setSidebarProfileDoc(
          snapshot.exists()
            ? ({
                ...(snapshotData || {}),
                uid:
                  String(snapshotData?.uid || user.uid || snapshot.id).trim() ||
                  snapshot.id,
              } as EmployeeProfileUserDoc)
            : null
        );
      },
      error => {
        console.error("sidebar_profile_snapshot_error", error);
        setSidebarProfileDoc(null);
      }
    );

    return () => unsubscribe();
  }, [sidebarProfileSource, user?.uid]);

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const rect = sidebarRef.current?.getBoundingClientRect();
      if (!rect) return;

      const newWidth = isRight ? rect.right - e.clientX : e.clientX - rect.left;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, isRight, setSidebarWidth]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  return (
    <>
      <div
        className={cn(
          isMobile ? "contents" : "relative sticky top-0 h-screen shrink-0 self-start"
        )}
        ref={sidebarRef}
      >
        <Sidebar
          side={sidebarSide}
          collapsible="icon"
          className={cn(
            "bg-slate-950/95 text-slate-100 shadow-2xl shadow-slate-950/20 backdrop-blur-xl",
            isRight ? "border-l border-white/10" : "border-r border-white/10"
          )}
          disableTransition={isResizing}
        >
          <SidebarHeader
            className={cn(
              "h-16 justify-center border-b border-white/10 bg-slate-950/90",
              isCollapsed ? "px-0" : "px-3"
            )}
          >
            <div
              className={cn(
                "flex w-full min-w-0 items-center transition-all",
                isCollapsed ? "justify-center gap-0" : "gap-2"
              )}
            >
              <button
                onClick={handleSidebarToggle}
                className={cn(
                  "shrink-0 text-[#F2B705] transition-colors hover:bg-white/8 hover:text-[#FFD24A] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                  isCollapsed
                    ? "flex h-9 w-9 items-center justify-center rounded-2xl bg-white/[0.04]"
                    : "h-8 w-8 rounded-lg"
                )}
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 rtl:rotate-180" />
              </button>

              {!isCollapsed ? (
                <div
                  className={cn(
                    "flex min-w-0 items-center gap-2 overflow-hidden transition-[max-width,opacity,transform] duration-200",
                    area === "hr"
                      ? "max-w-36 translate-x-0 opacity-100"
                      : "max-w-48 translate-x-0 opacity-100"
                  )}
                >
                  {area === "hr" ? (
                    <img
                      src="/logo.png"
                      alt={tr(language, "شعار معدن", "MAEDIN logo")}
                      className="h-7 w-7 shrink-0 object-contain"
                    />
                  ) : null}
                  <span className="font-semibold tracking-tight truncate whitespace-nowrap text-[#F2B705]">
                    {layoutBrandLabel}
                  </span>
                </div>
              ) : null}

              {/* زر الرئيسية */}
              {!isCollapsed ? (
                <div
                  className={cn(
                    isRight ? "mr-auto" : "ml-auto",
                    "flex max-w-32 shrink-0 translate-x-0 items-center gap-2 overflow-hidden whitespace-nowrap opacity-100 transition-[max-width,opacity,transform] duration-200"
                  )}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 gap-1.5 rounded-full border-white/10 bg-white/[0.04] px-3 text-xs text-slate-100 hover:bg-white/[0.08] hover:text-white"
                    onClick={() => setLocation(homeTargetPath)}
                  >
                    <Home className="h-4 w-4 text-[#F2B705]" />
                    {tr(language, "الرئيسية", "Home")}
                  </Button>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 bg-transparent">
            <SidebarMenu className="px-2 py-1">
              {visibleMenuItems.map(item => {
                const isActive = location === item.path;
                const itemLabel = getMenuLabel(item);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={itemLabel}
                      className="h-10 rounded-xl font-normal text-slate-300 transition-all hover:text-white data-[active=true]:bg-white/10 data-[active=true]:text-white [&>svg]:text-[#F2B705]"
                    >
                      <item.icon
                        className={cn(
                          "h-4 w-4 text-[#F2B705]",
                          isActive && "text-[#FFD24A]"
                        )}
                      />
                      <span
                        className={cn(
                          "whitespace-nowrap transition-[max-width,opacity] duration-200",
                          isCollapsed
                            ? "max-w-0 opacity-0 pointer-events-none"
                            : "max-w-40 opacity-100"
                        )}
                      >
                        {itemLabel}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {area === "hr" ? (
              <>
                <div className="mx-4 my-3 h-px bg-white/10" />

                <div className="px-2 pb-3">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={isEmployeeProfileActive}
                        tooltip={employeeProfileLabel}
                        className="h-10 rounded-xl font-normal text-slate-300 transition-all hover:text-white data-[active=true]:bg-white/10 data-[active=true]:text-white [&>svg]:text-[#F2B705]"
                      >
                        <Link href={EMPLOYEE_PROFILE_PATH}>
                          <User
                            className={cn(
                              "h-4 w-4 text-[#F2B705]",
                              isEmployeeProfileActive && "text-[#FFD24A]"
                            )}
                          />
                          <span
                            className={cn(
                              "whitespace-nowrap transition-[max-width,opacity] duration-200",
                              isCollapsed
                                ? "max-w-0 opacity-0 pointer-events-none"
                                : "max-w-40 opacity-100"
                            )}
                          >
                            {employeeProfileLabel}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </div>
              </>
            ) : null}
          </SidebarContent>

          <SidebarFooter
            className={cn(
              "border-t border-white/10 bg-slate-950/90",
              isCollapsed ? "items-center p-2.5 pb-3" : "p-3"
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "group flex w-full items-center gap-3.5 text-start transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                    isCollapsed
                      ? "h-14 w-14 justify-center rounded-full border-0 bg-transparent p-0 hover:bg-white/[0.04]"
                      : "rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.06] to-white/[0.03] px-3 py-2.5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.95)] hover:border-white/15 hover:from-white/[0.08] hover:to-white/[0.05] hover:shadow-[0_22px_46px_-28px_rgba(15,23,42,0.98)]"
                  )}
                >
                  <Avatar
                    className={cn(
                      "shrink-0 overflow-hidden border border-white/15 shadow-[0_12px_24px_-14px_rgba(15,23,42,0.95)]",
                      isCollapsed
                        ? "h-12 w-12 rounded-full ring-1 ring-white/20"
                        : "h-11 w-11 ring-2 ring-white/6"
                    )}
                  >
                    <AvatarImage
                      src={sidebarAvatarUrl || undefined}
                      alt={displayName}
                      className="h-full w-full rounded-full object-cover"
                    />
                    <AvatarFallback className="rounded-full bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950 text-sm font-semibold text-slate-50">
                      {String(displayName ?? "م")
                        .trim()
                        .charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "min-w-0 flex-1 overflow-hidden transition-[max-width,opacity] duration-200",
                      isCollapsed
                        ? "max-w-0 opacity-0 pointer-events-none"
                        : "max-w-52 opacity-100"
                    )}
                  >
                    <p className="truncate text-sm font-semibold leading-5 tracking-tight text-slate-50">
                      {displayName}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-medium leading-5 text-slate-400/90">
                      {sidebarJobTitle}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{tr(language, "تسجيل الخروج", "Logout")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {!isMobile ? (
          <div
            className={cn(
              "absolute top-0 h-full w-1 cursor-col-resize transition-[opacity,background-color] duration-200 hover:bg-primary/20",
              isRight ? "left-0" : "right-0",
              isCollapsed
                ? "pointer-events-none opacity-0"
                : "pointer-events-auto opacity-100"
            )}
            onMouseDown={() => {
              if (isCollapsed) return;
              setIsResizing(true);
            }}
            style={{ zIndex: 50 }}
          />
        ) : null}
      </div>

      <SidebarInset className="max-w-full overflow-x-hidden">
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-transparent px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-transparent" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* زر الرئيسية في الموبايل */}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setLocation(homeTargetPath)}
            >
              <Home className="h-4 w-4" />
              {tr(language, "الرئيسية", "Home")}
            </Button>

            <NotificationBell />
          </div>
        )}

        <main
          ref={mainRef}
          className="min-w-0 max-w-full flex-1 overflow-x-hidden px-3 py-4 sm:px-4 md:px-6 md:py-6 lg:px-8"
        >
          {!isMobile ? (
            <div className="mb-5 flex items-center justify-end">
              <NotificationBell />
            </div>
          ) : null}
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
