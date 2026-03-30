import {
  hasPermission,
  isOpsRole,
  useAuth,
  type Permission,
} from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  Users,
  Building2,
  DollarSign,
  MessageSquare,
  FileText,
  Settings,
  Crown,
  BarChart3,
  Home,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

type RoleKey = "owner" | "admin" | "accountant" | "staff";

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  allow: RoleKey[]; // ✅ أدوار مسموحة
  permission: Permission;
};

const menuItems: MenuItem[] = [
  {
    icon: LayoutDashboard,
    label: "لوحة التحكم",
    path: "/dashboard",
    allow: ["owner", "admin", "accountant", "staff"],
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
    label: "سجل طلبات الاستثمار",
    path: "/admin/messages",
    allow: ["owner", "admin", "staff"],
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
    label: "الإعدادات",
    path: "/admin/settings",
    allow: ["owner"],
    permission: "settings.manage",
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const SIDEBAR_OPEN_KEY = "dashboard_sidebar_open";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

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

// تحويل تقريبي (Transliteration) من اللاتيني للعربي — مو 100% لكن يعطي اسم “مقروء”
function latinToArabicApprox(word: string) {
  const w = word.toLowerCase();

  // بعض التركيبات الشائعة أولاً
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
    else if (/[\u0600-\u06FF]/.test(ch)) out += ch; // احتفظ بالأحرف العربية (من digraphs)
    // تجاهل أي رموز أخرى
  }

  // تنظيف المسافات
  out = out.replace(/\s+/g, " ").trim();
  return out || word;
}

function nameFromEmail(email?: string) {
  if (!email) return "مستخدم";
  const local = email.split("@")[0] ?? "";
  if (!local) return "مستخدم";

  // لو أصلاً عربي
  if (hasArabic(local)) {
    const parts = splitLocalPart(local);
    return parts.length ? parts.join(" ") : local;
  }

  const parts = splitLocalPart(local);
  if (!parts.length) return "مستخدم";

  // “تعريب” الاسم (تقريبي)
  const arParts = parts.map(p => latinToArabicApprox(p));
  const arName = arParts.join(" ").trim();

  // إذا التعريب طلع غريب جداً، نعرض نسخة مرتبة إنجليزي كخطة بديلة
  if (!arName || arName.length < 2) {
    return parts.map(titleCaseLatin).join(" ");
  }

  return arName;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to
              launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
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
      className="min-h-screen flex-row items-stretch"
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent
        setSidebarWidth={setSidebarWidth}
        sidebarSide={sidebarSide}
      >
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
  sidebarSide: "left" | "right";
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
  sidebarSide,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, setOpen, setOpenMobile } = useSidebar();

  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);

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

  // ✅ 1) الدور
  const role = user?.role;

  // ✅ 2) العناصر المسموحة
  const visibleMenuItems = useMemo(() => {
    if (!role || !isOpsRole(role)) return [];
    return menuItems.filter(item => hasPermission(user, item.permission));
  }, [role, user]);

  // ✅ 3) العنصر النشط
  const activeMenuItem = visibleMenuItems.find(item => item.path === location);

  // ✅ اسم العرض: يفضّل user.name، وإلا من الإيميل (بالعربي)
  // ✅ اسم العرض: استخدم displayName من useAuth أولاً (مو name)
  const displayName = useMemo(() => {
    const dn = String((user as any)?.displayName ?? "").trim();
    if (dn && dn !== "-" && dn.length >= 2) return dn;

    const dn2 = String((user as any)?.name ?? "").trim(); // احتياط لو عندك مكان ثاني
    if (dn2 && dn2 !== "-" && dn2.length >= 2) return dn2;

    return nameFromEmail((user as any)?.email);
  }, [user]);

  const titleText = useMemo(() => {
    const t = String((user as any)?.title ?? "").trim();
    return t && t !== "-" ? t : "";
  }, [user]);

  const displayNameWithTitle = useMemo(() => {
    if (!titleText) return displayName;
    return `${displayName} ${titleText}`.trim();
  }, [displayName, titleText]);

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
          "relative shrink-0",
          !isMobile && "sticky top-0 h-screen self-start"
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
          <SidebarHeader className="h-16 justify-center border-b border-white/10 bg-slate-950/90">
            <div className="flex items-center gap-2 px-2 transition-all w-full">
              <button
                onClick={handleSidebarToggle}
                className="h-8 w-8 shrink-0 rounded-lg text-[#F2B705] transition-colors hover:bg-white/8 hover:text-[#FFD24A] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 rtl:rotate-180" />
              </button>

              <div
                className={cn(
                  "flex min-w-0 items-center gap-2 overflow-hidden transition-[max-width,opacity,transform] duration-200",
                  isCollapsed
                    ? "max-w-0 -translate-x-2 opacity-0 pointer-events-none"
                    : "max-w-32 translate-x-0 opacity-100"
                )}
              >
                <span className="font-semibold tracking-tight truncate whitespace-nowrap text-[#F2B705]">
                  معدن
                </span>
              </div>

              {/* ✅ زر الرئيسية */}
              <div
                className={cn(
                  isRight ? "mr-auto" : "ml-auto",
                  "flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200",
                  isCollapsed
                    ? "max-w-0 translate-x-2 opacity-0 pointer-events-none"
                    : "max-w-40 translate-x-0 opacity-100"
                )}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08] hover:text-white"
                  onClick={() => setLocation("/")}
                >
                  <Home className="h-4 w-4 text-[#F2B705]" />
                  الرئيسية
                </Button>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 bg-transparent">
            <SidebarMenu className="px-2 py-1">
              {visibleMenuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
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
                        {item.label}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-white/10 bg-slate-950/90 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/6 group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20">
                  <Avatar className="h-9 w-9 shrink-0 border border-white/10">
                    <AvatarFallback className="bg-white/[0.06] text-xs font-medium text-slate-100">
                      {String(displayName ?? "م")
                        .trim()
                        .charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "flex-1 min-w-0 overflow-hidden transition-[max-width,opacity] duration-200",
                      isCollapsed
                        ? "max-w-0 opacity-0 pointer-events-none"
                        : "max-w-48 opacity-100"
                    )}
                  >
                    <p className="truncate text-sm font-medium leading-none text-slate-100">
                      {displayNameWithTitle}
                    </p>
                    <p className="mt-1.5 truncate text-xs text-slate-400">
                      {(user as any)?.email || "-"}
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
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

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
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-transparent px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-transparent" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>

            {/* ✅ زر الرئيسية في الموبايل */}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setLocation("/")}
            >
              <Home className="h-4 w-4" />
              الرئيسية
            </Button>
          </div>
        )}

        <main
          ref={mainRef}
          className="flex-1 w-full px-4 md:px-6 lg:px-8 py-4 md:py-6"
        >
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
