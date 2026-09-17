import fs from "node:fs";

const file = "client/src/pages/habat/HabatAttendanceSettings.tsx";
let source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

function replaceOnce(anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error(`Missing anchor: ${label}`);
  source = source.replace(anchor, replacement);
}

if (!source.includes("function GeofenceMap(")) {
  replaceOnce(
`  MapPin,
  Pencil,`,
`  MapPin,
  Minus,
  Pencil,`,
"lucide Minus import"
  );

  replaceOnce(
`  useMemo,
  useState,
  type FormEvent,`,
`  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,`,
"React map imports"
  );

  const mapCode = `
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
  const { language } = useLanguage();
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
          key: \\`${rawX}:\\${rawY}:\\${zoom}\\`,
          src: \\`https://tile.openstreetmap.org/\\${zoom}/\\${tileX}/\\${rawY}.png\\`,
          left: rawX * TILE_SIZE - left,
          top: rawY * TILE_SIZE - top,
        });
      }
    }

    const radiusPx =
      Math.max(10, Number(radiusM || 0)) /
      Math.max(0.01, metersPerPixel(point.latitude, zoom));

    return { center, tiles, radiusPx };
  }, [point.latitude, point.longitude, radiusM, size.height, size.width, zoom]);

  function choosePoint(event: ReactMouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = map.center.x + (event.clientX - rect.left - rect.width / 2);
    const y = map.center.y + (event.clientY - rect.top - rect.height / 2);
    onChange(unproject(x, y, zoom));
  }

  const configured = latitude != null && longitude != null;

  return (
    <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100">
      <div
        ref={containerRef}
        onClick={choosePoint}
        className="relative h-[300px] w-full cursor-crosshair overflow-hidden bg-slate-100 sm:h-[360px]"
        role="application"
        aria-label={tr(language, "خريطة تحديد موقع ونطاق البصمة", "Attendance location geofence map")}
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
            aria-label={tr(language, "تكبير الخريطة", "Zoom in map")}
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(current => Math.max(12, current - 1))}
            className="flex h-10 w-10 items-center justify-center"
            aria-label={tr(language, "تصغير الخريطة", "Zoom out map")}
          >
            <Minus size={18} />
          </button>
        </div>

        {!configured ? (
          <div className="pointer-events-none absolute inset-x-4 bottom-10 rounded-2xl bg-white/95 px-4 py-3 text-center text-sm font-bold shadow-sm">
            {tr(language, "اضغط على الخريطة لتحديد موقع البصمة", "Click the map to set the attendance location")}
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
          {latitude == null ? tr(language, "غير محدد", "Not Set") : latitude.toFixed(6)}
        </p>
        <p className="truncate text-slate-600">
          <span className="font-bold text-slate-900">Longitude:</span>{" "}
          {longitude == null ? tr(language, "غير محدد", "Not Set") : longitude.toFixed(6)}
        </p>
      </div>
    </div>
  );
}
`;

  replaceOnce(
`type LocationDraft = {`,
`${mapCode}\ntype LocationDraft = {`,
"map component insertion"
  );

  replaceOnce(
`          </div>\n\n          <div className="mt-4 flex flex-col gap-2 sm:flex-row">`,
`          </div>\n\n          <GeofenceMap\n            latitude={draft.latitude === "" ? null : Number(draft.latitude)}\n            longitude={draft.longitude === "" ? null : Number(draft.longitude)}\n            radiusM={draft.radiusM}\n            onChange={point =>\n              setDraft(current => ({\n                ...current,\n                latitude: point.latitude,\n                longitude: point.longitude,\n              }))\n            }\n          />\n\n          <div className="mt-4 flex flex-col gap-2 sm:flex-row">`,
"map placement"
  );
}

fs.writeFileSync(file, source, "utf8");
console.log("Restored the interactive geofence map for multi-site attendance locations.");
