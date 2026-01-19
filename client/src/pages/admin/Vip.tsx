import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Crown } from "lucide-react";

import {
  collection,
  getDocs,
  orderBy,
  query,
  limit,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/_core/firebase";

type ProjectDoc = {
  id: string;
  title?: string;
  titleEn?: string;
  location?: string;
  locationEn?: string;

  type?: string;
  projectType?: string;
  category?: string;

  status?: string;
  isVip?: boolean;

  createdAt?: any;
};

type Labels = {
  projectTypes?: Record<string, string>;
  projectStatus?: Record<string, string>;
};

type Flags = {
  maintenanceMode?: boolean;
  vipOnlyMode?: boolean;
  hideVipProjects?: boolean;
};

const FALLBACK_LABELS: Labels = {
  projectTypes: {
    vip: "VIP",
    sukuk: "صكوك",
    land_development: "تطوير أراضي",
  },
  projectStatus: {
    draft: "قريبا",
    published: "منشور",
    archived: "مؤرشف",
  },
};

export default function Vip() {
  const [, setLocation] = useLocation();

  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [labels, setLabels] = useState<Labels>(FALLBACK_LABELS);
  const [flags, setFlags] = useState<Flags>({});

  // ✅ Debug (اختياري) نخليه صغير وبسيط وما يخرب الشكل
  const [debug, setDebug] = useState<{
    fetchedCount: number;
    vipCount: number;
    typeValues: string[];
    projectTypeValues: string[];
    categoryValues: string[];
    vipByIsVipTrue: number;
  }>({
    fetchedCount: 0,
    vipCount: 0,
    typeValues: [],
    projectTypeValues: [],
    categoryValues: [],
    vipByIsVipTrue: 0,
  });

  function norm(v?: string) {
    return (v ?? "").toString().trim().toLowerCase();
  }

  function uniqSorted(arr: string[]) {
    return Array.from(new Set(arr.filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  function isVipProject(p: ProjectDoc) {
    const t = norm(p.type);
    const pt = norm(p.projectType);
    const c = norm(p.category);
    return t === "vip" || pt === "vip" || c === "vip" || p.isVip === true;
  }

  function labelForType(type?: string) {
    const key = (type ?? "").trim();
    return (
      labels.projectTypes?.[key] ??
      labels.projectTypes?.[norm(key)] ??
      key ??
      ""
    );
  }

  function labelForStatus(status?: string) {
    const key = (status ?? "").trim();
    return (
      labels.projectStatus?.[key] ??
      labels.projectStatus?.[norm(key)] ??
      key ??
      ""
    );
  }

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        // ✅ settings/labels + settings/flags (مثل منهج MAEDIN)
        const labelsRef = doc(db, "settings", "labels");
        const labelsSnap = await getDoc(labelsRef);

        const loadedLabels =
          labelsSnap.exists() && labelsSnap.data()
            ? (labelsSnap.data() as Labels)
            : FALLBACK_LABELS;

        const flagsRef = doc(db, "settings", "flags");
        const flagsSnap = await getDoc(flagsRef);

        const loadedFlags =
          flagsSnap.exists() && flagsSnap.data()
            ? (flagsSnap.data() as Flags)
            : {};

        if (!mounted) return;

        setLabels({
          ...FALLBACK_LABELS,
          ...loadedLabels,
          projectTypes: {
            ...FALLBACK_LABELS.projectTypes,
            ...(loadedLabels.projectTypes ?? {}),
          },
          projectStatus: {
            ...FALLBACK_LABELS.projectStatus,
            ...(loadedLabels.projectStatus ?? {}),
          },
        });
        setFlags(loadedFlags);

        if (loadedFlags?.maintenanceMode) {
          setProjects([]);
          setDebug((d) => ({ ...d, fetchedCount: 0, vipCount: 0 }));
          setLoading(false);
          return;
        }

        // ✅ load projects
        const projectsRef = collection(db, "projects");
        let list: ProjectDoc[] = [];

        try {
          const q = query(projectsRef, orderBy("createdAt", "desc"), limit(300));
          const snap = await getDocs(q);
          list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        } catch {
          const q2 = query(projectsRef, limit(300));
          const snap2 = await getDocs(q2);
          list = snap2.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        }

        const typeValues = uniqSorted(list.map((p) => norm(p.type)).filter(Boolean));
        const projectTypeValues = uniqSorted(
          list.map((p) => norm(p.projectType)).filter(Boolean)
        );
        const categoryValues = uniqSorted(
          list.map((p) => norm(p.category)).filter(Boolean)
        );
        const vipByIsVipTrue = list.filter((p) => p.isVip === true).length;

        let vip = list.filter(isVipProject);
        if (loadedFlags?.hideVipProjects) vip = [];

        if (!mounted) return;

        setProjects(vip);
        setDebug({
          fetchedCount: list.length,
          vipCount: vip.length,
          typeValues,
          projectTypeValues,
          categoryValues,
          vipByIsVipTrue,
        });
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "حدث خطأ أثناء تحميل مشاريع VIP");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();

    return projects
      .filter((p) => {
        if (statusFilter !== "all" && (p.status ?? "") !== statusFilter)
          return false;
        if (!s) return true;

        const hay =
          `${p.title ?? ""} ${p.location ?? ""} ${p.titleEn ?? ""} ${
            p.locationEn ?? ""
          }`.toLowerCase();

        return hay.includes(s);
      })
      .slice(0, 60);
  }, [projects, search, statusFilter]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ✅ Header like other admin pages */}
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <Crown className="w-10 h-10 text-primary" />
            مشاريع VIP
          </h1>
          <p className="text-muted-foreground text-lg">
            عرض وإدارة المشاريع المصنّفة VIP داخل لوحة التحكم
          </p>
        </div>

        {flags?.maintenanceMode && (
          <Card className="border-yellow-200">
            <CardContent className="py-6">
              <div className="font-medium mb-2">وضع الصيانة مفعل</div>
              <div className="text-sm opacity-80">
                تم تعطيل عرض البيانات مؤقتًا بسبب تفعيل وضع الصيانة.
              </div>
            </CardContent>
          </Card>
        )}

        {!flags?.maintenanceMode && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <div className="relative">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالعنوان أو الموقع..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 flex gap-2 flex-wrap">
                <Button
                  variant={statusFilter === "all" ? "default" : "outline"}
                  onClick={() => setStatusFilter("all")}
                >
                  الكل
                </Button>
                <Button
                  variant={statusFilter === "draft" ? "default" : "outline"}
                  onClick={() => setStatusFilter("draft")}
                >
                 قريبا
                </Button>
                <Button
                  variant={statusFilter === "published" ? "default" : "outline"}
                  onClick={() => setStatusFilter("published")}
                >
                  منشور
                </Button>

                <div className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">Loaded: {debug.fetchedCount}</Badge>
                  <Badge variant="outline">VIP: {debug.vipCount}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!flags?.maintenanceMode && error && (
          <Card className="border-red-200">
            <CardContent className="py-6">
              <div className="text-red-600 font-medium mb-2">حدث خطأ</div>
              <div className="text-sm opacity-90">{error}</div>
            </CardContent>
          </Card>
        )}

        {!flags?.maintenanceMode && !error && flags?.hideVipProjects && (
          <Card className="border-yellow-200">
            <CardContent className="py-6">
              <div className="font-medium mb-2">عرض VIP مخفي</div>
              <div className="text-sm opacity-80">
                تم تفعيل خيار إخفاء مشاريع VIP من الإعدادات.
              </div>
            </CardContent>
          </Card>
        )}

        {!flags?.maintenanceMode && loading && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              جاري التحميل...
            </CardContent>
          </Card>
        )}

        {!flags?.maintenanceMode &&
          !loading &&
          !error &&
          !flags?.hideVipProjects &&
          filtered.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                لا توجد مشاريع VIP مطابقة للبحث.
              </CardContent>
            </Card>
          )}

        {!flags?.maintenanceMode &&
          !loading &&
          !error &&
          !flags?.hideVipProjects &&
          filtered.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <Card
                  key={p.id}
                  className="cursor-pointer transition hover:shadow-md"
                  onClick={() => setLocation(`/admin/projects/${p.id}/edit`)}
                >
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold truncate">
                        {p.title ?? "بدون عنوان"}
                      </div>
                      <Badge variant="outline">{labelForStatus(p.status)}</Badge>
                    </div>

                    <div className="text-sm text-muted-foreground truncate">
                      {p.location ?? "—"}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      النوع:{" "}
                      {labelForType(p.type ?? p.projectType ?? p.category)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
      </div>
    </DashboardLayout>
  );
}
