import { auth } from "@/_core/firebase";
import { buildDocumentWorkerUrl } from "@/lib/documentUploadService";

export const WORK_ZONES_COLLECTION = "work_zones" as const;

export type WorkZone = {
  id: string;
  name: string;
  type: "radius";
  center: { lat: number; lng: number };
  radiusMeters: number;
  active: boolean;
  officeIp: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type WorkZoneInput = Pick<
  WorkZone,
  "name" | "type" | "center" | "radiusMeters" | "active" | "officeIp"
>;

type WorkZonesResponse = {
  ok?: boolean;
  zones?: unknown[];
  zone?: unknown;
  message?: string;
  detail?: string;
};

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeWorkZone(id: string, data: Record<string, any>) {
  const center = data?.center || {};
  return {
    id,
    name: String(data?.name || "").trim() || "منطقة عمل",
    type: "radius",
    center: {
      lat: finiteNumber(center.lat ?? center.latitude),
      lng: finiteNumber(center.lng ?? center.longitude),
    },
    radiusMeters: Math.max(1, finiteNumber(data?.radiusMeters, 100)),
    active: data?.active !== false,
    officeIp: String(data?.officeIp ?? data?.office_ip ?? "").trim() || null,
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  } satisfies WorkZone;
}

export function normalizeAllowedZoneIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map(entry => String(entry || "").trim()).filter(Boolean))
  );
}

export function formatZoneRadiusLabel(zone: Pick<WorkZone, "radiusMeters">) {
  return `${Math.round(zone.radiusMeters)} م`;
}

async function requestAttendanceWorker(
  pathname: string,
  init: RequestInit = {}
): Promise<WorkZonesResponse> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Authentication required.");

  const requestUrl = buildDocumentWorkerUrl(pathname);
  if (!requestUrl) throw new Error("Attendance worker URL is not configured.");

  const response = await fetch(requestUrl, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${await currentUser.getIdToken()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const payload = (await response
    .json()
    .catch(() => null)) as WorkZonesResponse | null;
  if (!response.ok || !payload) {
    throw new Error(
      String(
        payload?.message ||
          payload?.detail ||
          `Attendance worker request failed (${response.status}).`
      )
    );
  }
  return payload;
}

export async function fetchWorkZones() {
  const payload = await requestAttendanceWorker("/attendance/work-zones");
  return (Array.isArray(payload.zones) ? payload.zones : [])
    .map(raw => {
      const value =
        raw && typeof raw === "object" ? (raw as Record<string, any>) : {};
      return normalizeWorkZone(String(value.id || ""), value);
    })
    .filter(zone => zone.id)
    .sort((left, right) =>
      left.name.localeCompare(right.name, "ar", { sensitivity: "base" })
    );
}

export async function createWorkZone(input: WorkZoneInput) {
  const payload = await requestAttendanceWorker("/attendance/work-zones", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const value =
    payload.zone && typeof payload.zone === "object"
      ? (payload.zone as Record<string, any>)
      : null;
  return value ? normalizeWorkZone(String(value.id || ""), value) : null;
}

export async function updateWorkZone(id: string, input: WorkZoneInput) {
  const payload = await requestAttendanceWorker(
    `/attendance/work-zones/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
  const value =
    payload.zone && typeof payload.zone === "object"
      ? (payload.zone as Record<string, any>)
      : null;
  return value ? normalizeWorkZone(String(value.id || id), value) : null;
}

export async function deleteWorkZone(id: string) {
  await requestAttendanceWorker(
    `/attendance/work-zones/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    }
  );
}
