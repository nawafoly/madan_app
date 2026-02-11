import { useAuth } from "@/_core/hooks/useAuth";
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

type RoleKey = "owner" | "admin" | "accountant" | "staff";

type MenuItem = {
  icon: any;
  label: string;
  path: string;
  allow: RoleKey[]; // ✅ أدوار مسموحة
};

const menuItems: MenuItem[] = [
  { icon: LayoutDashboard, label: "لوحة التحكم", path: "/dashboard", allow: ["owner", "admin", "accountant", "staff"] },

  { icon: Building2, label: "المشاريع", path: "/admin/projects", allow: ["owner", "admin"] },

  { icon: DollarSign, label: "الشؤون المالية", path: "/admin/financial", allow: ["owner", "accountant"] },

  { icon: Users, label: "العملاء", path: "/admin/clients", allow: ["owner", "admin"] },

  { icon: Crown, label: "إدارة VIP", path: "/admin/vip", allow: ["owner", "admin"] },

  { icon: MessageSquare, label: "الرسائل", path: "/admin/messages", allow: ["owner", "admin", "staff"] },

  { icon: FileText, label: "سجل التعديلات", path: "/admin/audit-log", allow: ["owner"] },

  { icon: BarChart3, label: "التقارير", path: "/admin/reports", allow: ["owner", "admin", "accountant"] },

  { icon: Settings, label: "الإعدادات", path: "/admin/settings", allow: ["owner"] },
];


const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

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
    .map((w) => w.trim())
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
  const arParts = parts.map((p) => latinToArabicApprox(p));
  const arName = arParts.join(" ").trim();

  // إذا التعريب طلع غريب جداً، نعرض نسخة مرتبة إنجليزي كخطة بديلة
  if (!arName || arName.length < 2) {
    return parts.map(titleCaseLatin).join(" ");
  }

  return arName;
}

function normalizeRole(raw: any): "owner" | "admin" | "accountant" | "staff" | "" {
  if (!raw) return "";
  const r = String(raw).toLowerCase();

  if (r.includes("owner")) return "owner";
  if (r.includes("admin")) return "admin";
  if (r.includes("account")) return "accountant";
  if (r.includes("staff") || r.includes("reception")) return "staff";

  return "";
}

function roleLabelAr(rawRole: any) {
  const role = normalizeRole(rawRole);

  if (role === "owner") return "أونر";
  if (role === "admin") return "أدمن";
  if (role === "accountant") return "محاسب";
  if (role === "staff") return "موظف";
  return "";
}


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
              Access to this dashboard requires authentication. Continue to launch
              the login flow.
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
      dir={layoutDir}
      className="flex-row"
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
  const { state, toggleSidebar } = useSidebar();

  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const isMobile = useIsMobile();
  const isRight = sidebarSide === "right";

  // ✅ 1) الدور
  const role = (user as any)?.role as RoleKey | undefined;

  // ✅ 2) العناصر المسموحة
  const visibleMenuItems = useMemo(() => {
    if (!role) return [];
    return menuItems.filter((it) => it.allow.includes(role));
  }, [role]);

  // ✅ 3) العنصر النشط
  const activeMenuItem = visibleMenuItems.find(
    (item) => item.path === location
  );



  // ✅ اسم العرض: يفضّل user.name، وإلا من الإيميل (بالعربي)
  // ✅ اسم العرض: استخدم displayName من useAuth أولاً (مو name)
  const displayName = useMemo(() => {
    const dn = String((user as any)?.displayName ?? "").trim();
    if (dn && dn !== "-" && dn.length >= 2) return dn;

    const dn2 = String((user as any)?.name ?? "").trim(); // احتياط لو عندك مكان ثاني
    if (dn2 && dn2 !== "-" && dn2.length >= 2) return dn2;

    return nameFromEmail((user as any)?.email);
  }, [user]);


  // ✅ الدور: يدعم role أو roles[0] أو userRole
  const roleRaw =
    (user as any)?.role ??
    (Array.isArray((user as any)?.roles) ? (user as any)?.roles?.[0] : undefined) ??
    (user as any)?.userRole ??
    (user as any)?.accountRole;

  const roleText = useMemo(() => roleLabelAr(roleRaw), [roleRaw]);

  const displayNameWithRole = useMemo(() => {
    if (!roleText) return displayName;
    return `${displayName} (${roleText})`;
  }, [displayName, roleText]);

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
      <div className="relative shrink-0" ref={sidebarRef}>
        <Sidebar
          side={sidebarSide}
          collapsible="icon"
          className={`${isRight ? "border-l border-border/60" : "border-r border-border/60"}${isMobile ? " bg-white" : ""}`}
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-2 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
              </button>

              {!isCollapsed ? (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold tracking-tight truncate text-[#F2B705]">
                      معدن
                    </span>
                  </div>

                  {/* ✅ زر الرئيسية */}
                  <div
                    className={`${isRight ? "mr-auto" : "ml-auto"} flex items-center gap-2`}
                  >
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
                </>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {visibleMenuItems.map((item) => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 transition-all font-normal"
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {String(displayName ?? "م").trim().charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {displayNameWithRole}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
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
          className={`absolute top-0 ${isRight ? "left-0" : "right-0"} w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""
            }`}
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
