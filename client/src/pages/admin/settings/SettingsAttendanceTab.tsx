import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  Radar,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { MapView } from "@/components/Map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import {
  createWorkZone,
  deleteWorkZone,
  fetchWorkZones,
  formatZoneRadiusLabel,
  updateWorkZone,
  type WorkZone,
} from "@/lib/workZones";
import { cn } from "@/lib/utils";

type AttendanceZoneForm = {
  name: string;
  lat: string;
  lng: string;
  radiusMeters: string;
  active: boolean;
};

const DEFAULT_CENTER = { lat: 24.7136, lng: 46.6753 };

const createEmptyForm = (): AttendanceZoneForm => ({
  name: "",
  lat: String(DEFAULT_CENTER.lat),
  lng: String(DEFAULT_CENTER.lng),
  radiusMeters: "100",
  active: true,
});

function parseFiniteNumber(value: string) {
  const parsed = Number(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCoordinate(value: number) {
  return Number(value.toFixed(7)).toString();
}

function getCurrentGpsPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("الموقع غير مدعوم في هذا الجهاز."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });
  });
}

function ZonePointPicker({
  center,
  radiusMeters,
  onCenterChange,
}: {
  center: { lat: number; lng: number };
  radiusMeters: number;
  onCenterChange: (center: { lat: number; lng: number }) => void;
}) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;
    clickListenerRef.current?.remove();
    clickListenerRef.current = map.addListener(
      "click",
      (event: google.maps.MapMouseEvent) => {
        const point = event.latLng;
        if (!point) return;
        onCenterChange({
          lat: point.lat(),
          lng: point.lng(),
        });
      }
    );
  };

  useEffect(() => {
    const map = mapRef.current;
    const googleMaps = window.google?.maps;
    if (!map || !googleMaps) return;

    map.setCenter(center);

    if (!circleRef.current) {
      circleRef.current = new googleMaps.Circle({
        map,
        center,
        radius: radiusMeters,
        strokeColor: "#0f766e",
        strokeOpacity: 0.85,
        strokeWeight: 2,
        fillColor: "#14b8a6",
        fillOpacity: 0.12,
      });
    } else {
      circleRef.current.setCenter(center);
      circleRef.current.setRadius(radiusMeters);
    }

    const MarkerCtor =
      (googleMaps.marker as any)?.AdvancedMarkerElement ||
      (googleMaps as any).Marker;

    if (!markerRef.current && MarkerCtor) {
      markerRef.current = new MarkerCtor({
        map,
        position: center,
        title: "مركز منطقة العمل",
      });
    } else if (markerRef.current) {
      markerRef.current.position = center;
      if (typeof markerRef.current.setPosition === "function") {
        markerRef.current.setPosition(center);
      }
    }
  }, [center, radiusMeters]);

  useEffect(() => {
    return () => {
      clickListenerRef.current?.remove();
      markerRef.current?.setMap?.(null);
      circleRef.current?.setMap(null);
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-slate-100">
      <MapView
        className="h-[360px]"
        initialCenter={center}
        initialZoom={15}
        onMapReady={handleMapReady}
      />
    </div>
  );
}

export default function SettingsAttendanceTab() {
  const [zones, setZones] = useState<WorkZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [form, setForm] = useState<AttendanceZoneForm>(createEmptyForm);

  useEffect(() => {
    let active = true;
    fetchWorkZones()
      .then(nextZones => {
        if (active) setZones(nextZones);
      })
      .catch(error => {
        console.error("work_zones_snapshot_failed", error);
        if (active) setZones([]);
        toast.error("تعذر تحميل مناطق العمل.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const parsedCenter = useMemo(() => {
    const lat = parseFiniteNumber(form.lat);
    const lng = parseFiniteNumber(form.lng);
    return {
      lat: lat ?? DEFAULT_CENTER.lat,
      lng: lng ?? DEFAULT_CENTER.lng,
    };
  }, [form.lat, form.lng]);

  const parsedRadius = useMemo(() => {
    const radius = parseFiniteNumber(form.radiusMeters);
    return radius && radius > 0 ? radius : 100;
  }, [form.radiusMeters]);

  const activeZonesCount = zones.filter(zone => zone.active).length;
  const editingZone = zones.find(zone => zone.id === editingZoneId) || null;

  const resetForm = () => {
    setEditingZoneId(null);
    setForm(createEmptyForm());
  };

  const handleEditZone = (zone: WorkZone) => {
    setEditingZoneId(zone.id);
    setForm({
      name: zone.name,
      lat: formatCoordinate(zone.center.lat),
      lng: formatCoordinate(zone.center.lng),
      radiusMeters: String(Math.round(zone.radiusMeters)),
      active: zone.active,
    });
  };

  const handleUseCurrentLocation = async () => {
    try {
      const position = await getCurrentGpsPosition();
      setForm(current => ({
        ...current,
        lat: formatCoordinate(position.coords.latitude),
        lng: formatCoordinate(position.coords.longitude),
      }));
      toast.success("تم تحديد الموقع الحالي.");
    } catch (error) {
      console.error("work_zone_geolocation_failed", error);
      toast.error(
        error instanceof Error ? error.message : "تعذر جلب موقع الجهاز."
      );
    }
  };

  const handleSaveZone = async () => {
    const name = form.name.trim();
    const lat = parseFiniteNumber(form.lat);
    const lng = parseFiniteNumber(form.lng);
    const radiusMeters = parseFiniteNumber(form.radiusMeters);

    if (!name) {
      toast.error("اسم المنطقة مطلوب.");
      return;
    }

    if (lat === null || lat < -90 || lat > 90) {
      toast.error("خط العرض غير صحيح.");
      return;
    }

    if (lng === null || lng < -180 || lng > 180) {
      toast.error("خط الطول غير صحيح.");
      return;
    }

    if (radiusMeters === null || radiusMeters <= 0) {
      toast.error("Radius يجب أن يكون رقماً أكبر من صفر.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        type: "radius" as const,
        center: { lat, lng },
        radiusMeters,
        active: form.active,
      };

      if (editingZoneId) {
        await updateWorkZone(editingZoneId, payload);
        toast.success("تم تحديث منطقة العمل.");
      } else {
        await createWorkZone(payload);
        toast.success("تم إنشاء منطقة العمل.");
      }

      setZones(await fetchWorkZones());
      resetForm();
    } catch (error) {
      console.error("work_zone_save_failed", error);
      toast.error("تعذر حفظ منطقة العمل.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async (zone: WorkZone) => {
    const confirmed = window.confirm(`حذف منطقة العمل "${zone.name}"؟`);
    if (!confirmed) return;

    try {
      await deleteWorkZone(zone.id);
      setZones(current => current.filter(item => item.id !== zone.id));
      if (editingZoneId === zone.id) resetForm();
      toast.success("تم حذف منطقة العمل.");
    } catch (error) {
      console.error("work_zone_delete_failed", error);
      toast.error("تعذر حذف منطقة العمل.");
    }
  };

  return (
    <TabsContent value="attendance" className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                  <Radar className="h-5 w-5 text-emerald-700" />
                  مناطق العمل
                </CardTitle>
                <CardDescription>
                  إنشاء وإدارة مناطق Radius التي تستخدمها عمليات الحضور.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                {activeZonesCount} نشطة
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {loading ? (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                جارٍ تحميل مناطق العمل...
              </div>
            ) : zones.length ? (
              zones.map(zone => (
                <div
                  key={zone.id}
                  className={cn(
                    "rounded-[22px] border p-4 transition-colors",
                    editingZoneId === zone.id
                      ? "border-[#F2B705]/50 bg-[#F2B705]/10"
                      : "border-slate-200 bg-slate-50/80"
                  )}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-950">
                          {zone.name}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full",
                            zone.active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-500"
                          )}
                        >
                          {zone.active ? "مفعلة" : "غير مفعلة"}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                        <Badge
                          variant="outline"
                          className="rounded-full bg-white"
                        >
                          Radius: {formatZoneRadiusLabel(zone)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full bg-white"
                        >
                          lat {zone.center.lat.toFixed(5)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full bg-white"
                        >
                          lng {zone.center.lng.toFixed(5)}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl border-slate-200 bg-white"
                        onClick={() => handleEditZone(zone)}
                      >
                        <Pencil className="h-4 w-4" />
                        تعديل
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                        onClick={() => void handleDeleteZone(zone)}
                      >
                        <Trash2 className="h-4 w-4" />
                        حذف
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                لا توجد مناطق عمل بعد.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                  <MapPin className="h-5 w-5 text-slate-700" />
                  {editingZone ? "تعديل منطقة العمل" : "منطقة عمل جديدة"}
                </CardTitle>
                <CardDescription>
                  اختر نقطة المركز ثم حدد نصف القطر بالمتر.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl border-slate-200 bg-white"
                onClick={resetForm}
                disabled={saving}
              >
                <Plus className="h-4 w-4" />
                جديد
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <ZonePointPicker
              center={parsedCenter}
              radiusMeters={parsedRadius}
              onCenterChange={center =>
                setForm(current => ({
                  ...current,
                  lat: formatCoordinate(center.lat),
                  lng: formatCoordinate(center.lng),
                }))
              }
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>اسم المنطقة</Label>
                <Input
                  value={form.name}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="مثال: الفرع الرئيسي"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>خط العرض</Label>
                <Input
                  dir="ltr"
                  value={form.lat}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      lat: event.target.value,
                    }))
                  }
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>خط الطول</Label>
                <Input
                  dir="ltr"
                  value={form.lng}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      lng: event.target.value,
                    }))
                  }
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>Radius بالمتر</Label>
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  value={form.radiusMeters}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      radiusMeters: event.target.value,
                    }))
                  }
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>الحالة</Label>
                <label className="flex h-10 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                  <Checkbox
                    checked={form.active}
                    onCheckedChange={checked =>
                      setForm(current => ({
                        ...current,
                        active: checked === true,
                      }))
                    }
                    disabled={saving}
                  />
                  {form.active ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-slate-500" />
                  )}
                  {form.active ? "مفعلة" : "غير مفعلة"}
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl border-slate-200 bg-white"
                onClick={() => void handleUseCurrentLocation()}
                disabled={saving}
              >
                <LocateFixed className="h-4 w-4" />
                استخدام موقعي
              </Button>

              <Button
                type="button"
                className="rounded-2xl bg-slate-950 text-white hover:bg-slate-900"
                onClick={() => void handleSaveZone()}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {editingZone ? "حفظ التعديل" : "إنشاء المنطقة"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
