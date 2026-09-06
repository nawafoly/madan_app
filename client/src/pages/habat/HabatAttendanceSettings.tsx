import {
  CheckCircle2,
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  Save,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  friendlyHabatError,
  habatApi,
  type HabatSettings,
} from "./habatAttendanceClient";
import "./habat-mobile.css";

type Props = {
  onDataChanged?: () => void | Promise<void>;
};

type Point = {
  latitude: number;
  longitude: number;
};

type Size = {
  width: number;
  height: number;
};

const TILE_SIZE = 256;
const DEFAULT_CENTER: Point = { latitude: 24.7136, longitude: 46.6753 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function project(point: Point, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitude = clamp(point.latitude, -85.05112878, 85.05112878);
  const sin = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y:
      (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) *
      scale,
  };
}

function unproject(x: number, y: number, zoom: number): Point {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return {
    latitude: clamp(latitude, -85.05112878, 85.05112878),
    longitude: clamp(longitude, -180, 180),
  };
}

function metersPerPixel(latitude: number, zoom: number) {
  return (
    (156543.03392 * Math.cos((latitude * Math.PI) / 180)) /
    2 ** zoom
  );
}

function GeofenceMap({
  latitude,
  longitude,
  radiusM,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  onChange: (point: Point) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(17);
  const [size, setSize] = useState<Size>({ width: 640, height: 330 });
  const point =
    latitude == null || longitude == null
      ? DEFAULT_CENTER
      : { latitude, longitude };

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const map = useMemo(() => {
    const center = project(point, zoom);
    const left = center.x - size.width / 2;
    const top = center.y - size.height / 2;
    const right = center.x + size.width / 2;
    const bottom = center.y + size.height / 2;
    const worldTiles = 2 ** zoom;
    const tiles: Array<{
      key: string;
      x: number;
      y: number;
      src: string;
      left: number;
      top: number;
    }> = [];

    const startX = Math.floor(left / TILE_SIZE);
    const endX = Math.floor(right / TILE_SIZE);
    const startY = Math.floor(top / TILE_SIZE);
    const endY = Math.floor(bottom / TILE_SIZE);

    for (let rawX = startX; rawX <= endX; rawX += 1) {
      for (let rawY = startY; rawY <= endY; rawY += 1) {
        if (rawY < 0 || rawY >= worldTiles) continue;
        const tileX = ((rawX % worldTiles) + worldTiles) % worldTiles;
        tiles.push({
          key: `${rawX}:${rawY}:${zoom}`,
          x: tileX,
          y: rawY,
          src: `https://tile.openstreetmap.org/${zoom}/${tileX}/${rawY}.png`,
          left: rawX * TILE_SIZE - left,
          top: rawY * TILE_SIZE - top,
        });
      }
    }

    const radiusPx =
      Math.max(10, Number(radiusM || 0)) /
      Math.max(0.01, metersPerPixel(point.latitude, zoom));

    return { center, left, top, tiles, radiusPx };
  }, [point.latitude, point.longitude, radiusM, size.height, size.width, zoom]);

  function choosePoint(event: ReactMouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = map.center.x + (event.clientX - rect.left - rect.width / 2);
    const y = map.center.y + (event.clientY - rect.top - rect.height / 2);
    onChange(unproject(x, y, zoom));
  }

  const configured = latitude != null && longitude != null;

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100">
      <div
        ref={containerRef}
        onClick={choosePoint}
        className="relative h-[300px] w-full cursor-crosshair overflow-hidden bg-slate-100 sm:h-[360px]"
        role="application"
        aria-label="خريطة تحديد نطاق الحضور"
      >
        {map.tiles.map(tile => (
          <img
            key={tile.key}
            src={tile.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute h-64 w-64 select-none"
            style={{ left: tile.left, top: tile.top }}
          />
        ))}

        <div
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border-2 border-slate-950/70 bg-slate-950/10"
          style={{
            width: map.radiusPx * 2,
            height: map.radiusPx * 2,
            transform: "translate(-50%, -50%)",
          }}
        />
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-black text-white shadow-lg">
            <MapPin size={20} />
          </div>
        </div>

        <div
          className="absolute left-3 top-3 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          onClick={event => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setZoom(current => Math.min(19, current + 1))}
            className="flex h-10 w-10 items-center justify-center border-b border-slate-100"
            aria-label="تكبير الخريطة"
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(current => Math.max(12, current - 1))}
            className="flex h-10 w-10 items-center justify-center"
            aria-label="تصغير الخريطة"
          >
            <Minus size={18} />
          </button>
        </div>

        {!configured ? (
          <div className="pointer-events-none absolute inset-x-4 bottom-10 rounded-2xl bg-white/95 px-4 py-3 text-center text-sm font-bold shadow-sm">
            اضغط على الخريطة لتحديد موقع الفرع
          </div>
        ) : null}

        <div className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-1 text-[10px] text-slate-600">
          ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            onClick={event => event.stopPropagation()}
            className="underline"
          >
            OpenStreetMap
          </a>
        </div>
      </div>
      <div className="grid gap-2 border-t border-slate-200 bg-white px-4 py-3 text-xs sm:grid-cols-2">
        <p className="truncate text-slate-600">
          <span className="font-bold text-slate-900">Latitude:</span>{" "}
          {latitude == null ? "غير محدد" : latitude.toFixed(6)}
        </p>
        <p className="truncate text-slate-600">
          <span className="font-bold text-slate-900">Longitude:</span>{" "}
          {longitude == null ? "غير محدد" : longitude.toFixed(6)}
        </p>
      </div>
    </div>
  );
}

export default function HabatAttendanceSettings({ onDataChanged }: Props) {
  const [settings, setSettings] = useState<HabatSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const payload = await habatApi<{ ok: true; settings: HabatSettings }>(
        "v2/settings"
      );
      setSettings(payload.settings);
    } catch (caught) {
      setError(friendlyHabatError(caught));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("المتصفح لا يدعم تحديد الموقع.");
      return;
    }

    setLocating(true);
    setError("");
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      position => {
        setSettings(current =>
          current
            ? {
                ...current,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              }
            : current
        );
        setMessage("تم وضع مركز النطاق على موقعك الحالي. احفظ الإعدادات لتطبيقه.");
        setLocating(false);
      },
      () => {
        setError("تعذر الحصول على الموقع. اسمح للموقع من إعدادات المتصفح.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;

    if (
      settings.locationRequired &&
      (settings.latitude == null || settings.longitude == null)
    ) {
      setError("حدد موقع الفرع على الخريطة قبل تفعيل نطاق الحضور.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = await habatApi<{ ok: true; settings: HabatSettings }>(
        "v2/settings",
        {
          method: "PATCH",
          body: JSON.stringify({
            locationRequired: settings.locationRequired,
            latitude: settings.latitude,
            longitude: settings.longitude,
            radiusM: settings.radiusM,
            maxAccuracyM: settings.maxAccuracyM,
          }),
        }
      );
      setSettings(payload.settings);
      setMessage("تم حفظ موقع الفرع ونطاق الحضور بنجاح.");
      await onDataChanged?.();
    } catch (caught) {
      setError(friendlyHabatError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 text-center shadow-sm sm:p-6">
        <p className="py-8 text-sm font-semibold text-slate-500">جاري تحميل إعدادات الحضور...</p>
      </section>
    );
  }

  const updatePoint = (point: Point) => {
    setSettings(current =>
      current
        ? {
            ...current,
            latitude: point.latitude,
            longitude: point.longitude,
          }
        : current
    );
    setMessage("");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-6">
        <div className="mb-5 min-w-0">
          <h2 className="text-xl font-black">إعدادات الحضور</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            حدد موقع الفرع من الخريطة ثم اضبط نصف قطر الحضور ودقة GPS.
          </p>
        </div>

        <form onSubmit={save} className="space-y-5">
          <div className="rounded-2xl bg-slate-50 p-4">
            <label className="flex min-w-0 items-start gap-3">
              <input
                type="checkbox"
                checked={settings.locationRequired}
                onChange={event =>
                  setSettings({
                    ...settings,
                    locationRequired: event.target.checked,
                  })
                }
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black leading-6 sm:text-base">
                  إلزام الموظف بالتواجد داخل نطاق الفرع وقت البصمة
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  عند التفعيل يتم فحص الموقع فعليًا في السيرفر، وليس في الواجهة فقط.
                </span>
              </span>
            </label>
          </div>

          <div>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="font-black">موقع الفرع ونطاق الحضور</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  اضغط على أي نقطة بالخريطة لتحديد مركز النطاق. الدائرة تمثل المسافة المسموح بها.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void useCurrentLocation()}
                disabled={locating}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black sm:w-auto"
              >
                <LocateFixed size={18} />
                {locating ? "جاري تحديد الموقع..." : "استخدام موقعي الحالي"}
              </button>
            </div>

            <GeofenceMap
              latitude={settings.latitude}
              longitude={settings.longitude}
              radiusM={settings.radiusM}
              onChange={updatePoint}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-bold">
              Latitude
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={settings.latitude ?? ""}
                onChange={event =>
                  setSettings({
                    ...settings,
                    latitude:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
                className="mt-2 h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-left outline-none focus:border-slate-900"
                dir="ltr"
              />
            </label>
            <label className="min-w-0 text-sm font-bold">
              Longitude
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={settings.longitude ?? ""}
                onChange={event =>
                  setSettings({
                    ...settings,
                    longitude:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
                className="mt-2 h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-left outline-none focus:border-slate-900"
                dir="ltr"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-black">نصف قطر الحضور</p>
                <p className="mt-1 text-xs text-slate-500">
                  المسافة القصوى المسموح للموظف أن يبتعدها عن مركز الفرع.
                </p>
              </div>
              <div className="shrink-0 rounded-xl bg-black px-3 py-2 text-sm font-black text-white">
                {Math.round(settings.radiusM)} م
              </div>
            </div>
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={clamp(Number(settings.radiusM || 100), 10, 1000)}
              onChange={event =>
                setSettings({ ...settings, radiusM: Number(event.target.value) })
              }
              className="mt-4 w-full"
            />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[50, 100, 150, 200].map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSettings({ ...settings, radiusM: value })}
                  className={
                    Math.round(settings.radiusM) === value
                      ? "rounded-xl bg-black px-2 py-2 text-xs font-black text-white"
                      : "rounded-xl bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700"
                  }
                >
                  {value} م
                </button>
              ))}
            </div>
            <label className="mt-4 block text-xs font-bold text-slate-600">
              قيمة مخصصة بالمتر
              <input
                type="number"
                min={10}
                max={5000}
                value={settings.radiusM}
                onChange={event =>
                  setSettings({
                    ...settings,
                    radiusM: clamp(Number(event.target.value) || 10, 10, 5000),
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-left text-sm"
                dir="ltr"
              />
            </label>
          </div>

          <label className="block text-sm font-bold">
            أقصى دقة GPS مقبولة بالمتر
            <input
              type="number"
              min={10}
              max={1000}
              value={settings.maxAccuracyM}
              onChange={event =>
                setSettings({
                  ...settings,
                  maxAccuracyM: clamp(
                    Number(event.target.value) || 10,
                    10,
                    1000
                  ),
                })
              }
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-3 text-left"
              dir="ltr"
            />
            <span className="mt-2 block text-xs font-normal leading-5 text-slate-500">
              إذا كانت دقة جهاز الموظف أسوأ من هذه القيمة، يتم رفض البصمة حتى يتحسن GPS.
            </span>
          </label>

          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="shrink-0" />
              <span>المنطقة الزمنية: Asia/Riyadh</span>
            </div>
          </div>

          {message ? (
            <p className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-800">
              <CheckCircle2 size={17} className="mt-1 shrink-0" />
              <span>{message}</span>
            </p>
          ) : null}

          {error ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
              {error}
            </p>
          ) : null}

          <div className="habat-settings-savebar -mx-1 rounded-2xl bg-white/95 p-1 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0">
            <button
              disabled={saving}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-black px-5 font-black text-white disabled:opacity-50 sm:w-auto"
            >
              <Save size={18} />
              {saving ? "جاري الحفظ..." : "حفظ إعدادات الحضور"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
