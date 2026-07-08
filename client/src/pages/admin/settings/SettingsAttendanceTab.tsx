import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  LocateFixed,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Radar,
  Save,
  Trash2,
  Wifi,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

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
  officeIp: string;
  active: boolean;
};

const DEFAULT_CENTER = { lat: 24.7136, lng: 46.6753 };
const TILE_SIZE = 256;
const EARTH_RADIUS_METERS = 6378137;
const MIN_MAP_ZOOM = 2;
const MAX_MAP_ZOOM = 19;

const createEmptyForm = (): AttendanceZoneForm => ({
  name: "",
  lat: String(DEFAULT_CENTER.lat),
  lng: String(DEFAULT_CENTER.lng),
  radiusMeters: "100",
  officeIp: "",
  active: true,
});

function parseFiniteNumber(value: string) {
  const parsed = Number(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidIpAddress(value: string) {
  const input = String(value || "").trim();
  if (!input) return true;

  const ipv4Parts = input.split(".");
  if (
    ipv4Parts.length === 4 &&
    ipv4Parts.every(part => {
      if (!/^\d{1,3}$/.test(part)) return false;
      if (part.length > 1 && part.startsWith("0")) return false;
      const number = Number(part);
      return number >= 0 && number <= 255;
    })
  ) {
    return true;
  }

  if (!input.includes(":")) return false;
  try {
    return new URL(`http://[${input.replace(/^\[|\]$/g, "")}]/`).hostname.includes(":");
  } catch {
    return false;
  }
}

function formatCoordinate(value: number) {
  return Number(value.toFixed(7)).toString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function latLngToPixel(
  point: { lat: number; lng: number },
  zoom: number
) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = clamp(point.lat, -85.05112878, 85.05112878);
  const sinLat = Math.sin((lat * Math.PI) / 180);

  return {
    x: ((point.lng + 180) / 360) * scale,
    y:
      (0.5 -
        Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) *
      scale,
  };
}

function pixelToLatLng(pixel: { x: number; y: number }, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (pixel.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * pixel.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));

  return { lat, lng };
}

function metersPerPixel(lat: number, zoom: number) {
  return (
    (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * EARTH_RADIUS_METERS) /
    (TILE_SIZE * 2 ** zoom)
  );
}

function getTileUrl(x: number, y: number, zoom: number) {
  const maxTile = 2 ** zoom;
  const wrappedX = ((x % maxTile) + maxTile) % maxTile;
  const server = ["a", "b", "c"][Math.abs(wrappedX + y) % 3];
  return `https://${server}.tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`;
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
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    moved: boolean;
    pointerId: number;
    startCenterPixel: { x: number; y: number };
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(15);

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;

    const resizeObserver = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setMapSize({
        width: rect.width,
        height: rect.height,
      });
    });

    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, []);

  const centerPixel = useMemo(() => latLngToPixel(center, zoom), [center, zoom]);
  const topLeftPixel = useMemo(
    () => ({
      x: centerPixel.x - mapSize.width / 2,
      y: centerPixel.y - mapSize.height / 2,
    }),
    [centerPixel.x, centerPixel.y, mapSize.height, mapSize.width]
  );
  const tiles = useMemo(() => {
    if (!mapSize.width || !mapSize.height) return [];

    const minTileX = Math.floor(topLeftPixel.x / TILE_SIZE);
    const maxTileX = Math.floor((topLeftPixel.x + mapSize.width) / TILE_SIZE);
    const minTileY = Math.floor(topLeftPixel.y / TILE_SIZE);
    const maxTileY = Math.floor((topLeftPixel.y + mapSize.height) / TILE_SIZE);
    const maxTileIndex = 2 ** zoom - 1;
    const nextTiles: Array<{
      key: string;
      url: string;
      left: number;
      top: number;
    }> = [];

    for (let x = minTileX; x <= maxTileX; x += 1) {
      for (
        let y = clamp(minTileY, 0, maxTileIndex);
        y <= clamp(maxTileY, 0, maxTileIndex);
        y += 1
      ) {
        nextTiles.push({
          key: `${zoom}-${x}-${y}`,
          url: getTileUrl(x, y, zoom),
          left: x * TILE_SIZE - topLeftPixel.x,
          top: y * TILE_SIZE - topLeftPixel.y,
        });
      }
    }

    return nextTiles;
  }, [mapSize.height, mapSize.width, topLeftPixel.x, topLeftPixel.y, zoom]);
  const radiusPixels =
    radiusMeters / Math.max(metersPerPixel(center.lat, zoom), 0.000001);

  const setCenterFromClientPoint = (
    clientX: number,
    clientY: number,
    element: HTMLDivElement
  ) => {
    const rect = element.getBoundingClientRect();
    const x = topLeftPixel.x + clientX - rect.left;
    const y = topLeftPixel.y + clientY - rect.top;
    const nextCenter = pixelToLatLng({ x, y }, zoom);

    onCenterChange({
      lat: clamp(nextCenter.lat, -90, 90),
      lng: clamp(nextCenter.lng, -180, 180),
    });
  };

  const handleMapPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      moved: false,
      pointerId: event.pointerId,
      startCenterPixel: centerPixel,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    setIsDragging(true);
    event.preventDefault();
  };

  const handleMapPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) {
      drag.moved = true;
    }

    const nextCenter = pixelToLatLng(
      {
        x: drag.startCenterPixel.x - deltaX,
        y: drag.startCenterPixel.y - deltaY,
      },
      zoom
    );

    onCenterChange({
      lat: clamp(nextCenter.lat, -90, 90),
      lng: clamp(nextCenter.lng, -180, 180),
    });
  };

  const finishMapPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setIsDragging(false);

    if (!drag.moved) {
      setCenterFromClientPoint(event.clientX, event.clientY, event.currentTarget);
    }
  };

  const handleMapWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();

    setZoom(current =>
      clamp(
        current + (event.deltaY < 0 ? 1 : -1),
        MIN_MAP_ZOOM,
        MAX_MAP_ZOOM
      )
    );
  }, []);

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;

    node.addEventListener("wheel", handleMapWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", handleMapWheel);
    };
  }, [handleMapWheel]);

  return (
    <div
      ref={mapRef}
      role="button"
      tabIndex={0}
      className={cn(
        "relative h-[360px] touch-none overflow-hidden rounded-[22px] border border-slate-200 bg-slate-100",
        isDragging ? "cursor-grabbing" : "cursor-grab"
      )}
      onPointerCancel={finishMapPointer}
      onPointerDown={handleMapPointerDown}
      onPointerMove={handleMapPointerMove}
      onPointerUp={finishMapPointer}
      onKeyDown={event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onCenterChange(center);
      }}
    >
      {tiles.map(tile => (
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          className="absolute h-64 w-64 select-none"
          draggable={false}
          style={{
            left: tile.left,
            top: tile.top,
          }}
        />
      ))}

      <div
        className="pointer-events-none absolute rounded-full border-2 border-emerald-700/80 bg-emerald-500/15 shadow-[0_0_0_1px_rgba(255,255,255,0.7)]"
        style={{
          width: radiusPixels * 2,
          height: radiusPixels * 2,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full bg-slate-950 text-white shadow-lg">
        <MapPin className="h-5 w-5" />
      </div>

      <div
        className="absolute left-3 top-3 flex overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-sm"
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-50"
          onClick={() =>
            setZoom(current => clamp(current + 1, MIN_MAP_ZOOM, MAX_MAP_ZOOM))
          }
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center border-l border-slate-200 text-slate-700 transition-colors hover:bg-slate-50"
          onClick={() =>
            setZoom(current => clamp(current - 1, MIN_MAP_ZOOM, MAX_MAP_ZOOM))
          }
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
        lat {center.lat.toFixed(5)} | lng {center.lng.toFixed(5)}
      </div>
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
      officeIp: zone.officeIp || "",
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
    const officeIp = form.officeIp.trim();

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

    if (!isValidIpAddress(officeIp)) {
      toast.error("عنوان IP العام غير صحيح.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        type: "radius" as const,
        center: { lat, lng },
        radiusMeters,
        officeIp: officeIp || null,
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
                  إدارة نطاق GPS وإضافة شرط شبكة الفرع عند الحاجة.
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
                          className={cn(
                            "rounded-full bg-white",
                            zone.officeIp
                              ? "border-sky-200 text-sky-700"
                              : "text-slate-500"
                          )}
                        >
                          <Wifi className="ml-1 h-3.5 w-3.5" />
                          {zone.officeIp
                            ? `IP مطلوب: ${zone.officeIp}`
                            : "تحقق IP غير مفعّل"}
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
                  اختر نقطة المركز، وحدد نصف القطر، وأضف IP الفرع اختياريًا.
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

              <div className="space-y-2 md:col-span-2">
                <Label>عنوان IP العام للفرع (اختياري)</Label>
                <Input
                  dir="ltr"
                  inputMode="text"
                  value={form.officeIp}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      officeIp: event.target.value,
                    }))
                  }
                  placeholder="مثال: 203.0.113.10"
                  disabled={saving}
                />
                <p className="text-xs leading-5 text-slate-500">
                  عند إدخاله يجب أن يتطابق IP الموظف معه بالإضافة إلى نجاح
                  فحص الموقع. اتركه فارغًا للاستمرار بفحص GPS الحالي فقط.
                </p>
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
