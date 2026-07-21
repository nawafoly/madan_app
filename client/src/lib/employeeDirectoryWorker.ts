import { auth } from "@/_core/firebase";
import { buildDocumentWorkerUrl } from "@/lib/documentUploadService";
import { listHrCoreEmployeeDirectory } from "@/lib/hrCoreApi";

export type EmployeeDirectoryWorkerEmployee = {
  uid: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  statusKey: string;
  employeeCode?: string | null;
  allowedZoneIds?: string[];
};

export type EmployeeDirectorySyncResult = {
  syncedAt: string | null;
  sourceCount: number;
  employeesSynced: number;
  employeesDeleted: number;
  actor: {
    uid: string;
    email: string | null;
    role: string;
  } | null;
};

type EmployeeDirectoryListResponse = {
  ok?: boolean;
  success?: boolean;
  employees?: unknown[] | null;
  message?: string;
  detail?: string;
  reason?: string;
  allowedRoles?: unknown;
  uid?: unknown;
  email?: unknown;
  role?: unknown;
  isActive?: unknown;
  permissionsAllow?: unknown;
  permissionsDeny?: unknown;
  hasSettingsManage?: unknown;
};

type EmployeeDirectorySyncResponse = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  detail?: string;
  syncedAt?: string | null;
  sourceCount?: number | null;
  employeesSynced?: number | null;
  employeesDeleted?: number | null;
  actor?: {
    uid?: unknown;
    email?: unknown;
    role?: unknown;
  } | null;
};

function normalizeOptionalText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeEmployeeDirectoryWorkerEmployee(
  raw: unknown
): EmployeeDirectoryWorkerEmployee | null {
  if (!raw || typeof raw !== "object") return null;

  const source = raw as Record<string, unknown>;
  const uid = String(source.uid ?? "").trim();
  const name = String(source.name ?? "").trim();

  if (!uid || !name) return null;

  return {
    uid,
    name,
    email: normalizeOptionalText(source.email),
    avatarUrl: normalizeOptionalText(source.avatarUrl),
    title: normalizeOptionalText(source.title),
    department: normalizeOptionalText(source.department),
    statusKey: String(source.statusKey ?? "").trim() || "active",
  };
}

function getEmployeeDirectoryWorkerUrl(pathname: string) {
  const url = buildDocumentWorkerUrl(pathname);
  if (!url) {
    throw new Error("Employee directory worker URL is not configured.");
  }

  return url;
}

async function getEmployeeDirectoryAuthHeaders() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Authentication required.");
  }

  const idToken = await currentUser.getIdToken();

  return {
    Accept: "application/json",
    Authorization: `Bearer ${idToken}`,
  };
}

async function readWorkerJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getWorkerErrorMessage(
  response: Response,
  payload: { message?: string | null; detail?: string | null } | null,
  fallback: string
) {
  return (
    String(payload?.message || payload?.detail || "").trim() ||
    `${fallback} (${response.status})`
  );
}

function createEmployeeDirectoryWorkerError(
  message: string,
  {
    response,
    payload,
  }: {
    response?: Response | null;
    payload?: EmployeeDirectoryListResponse | EmployeeDirectorySyncResponse | null;
  } = {}
) {
  const error = new Error(message) as Error & {
    status?: number;
    url?: string;
    payload?: EmployeeDirectoryListResponse | EmployeeDirectorySyncResponse | null;
  };

  error.name = "EmployeeDirectoryWorkerError";
  error.status = response?.status;
  error.url = response?.url;
  error.payload = payload ?? null;

  return error;
}

export async function fetchEmployeeDirectoryFromWorker() {
  const result = await listHrCoreEmployeeDirectory();
  return result.employees.map(employee => ({
    uid: String(employee.uid || "").trim(),
    name: String(employee.name || "").trim(),
    email: normalizeOptionalText(employee.email),
    avatarUrl: normalizeOptionalText(employee.avatarUrl),
    title: normalizeOptionalText(employee.title),
    department: normalizeOptionalText(employee.department),
    statusKey: String(employee.statusKey || "active").trim() || "active",
    employeeCode: normalizeOptionalText(employee.employeeCode),
    allowedZoneIds: Array.isArray(employee.allowedZoneIds)
      ? employee.allowedZoneIds.map(value => String(value || "").trim()).filter(Boolean)
      : [],
  }));
}

export async function syncEmployeeDirectoryFromWorker(): Promise<EmployeeDirectorySyncResult> {
  const requestUrl = getEmployeeDirectoryWorkerUrl("/admin/syncEmployeeDirectory");
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: await getEmployeeDirectoryAuthHeaders(),
    cache: "no-store",
  });
  const payload = await readWorkerJson<EmployeeDirectorySyncResponse>(response);

  if (!response.ok || !payload?.ok) {
    console.error("employee_directory_worker_sync_failed", {
      url: response.url || requestUrl,
      status: response.status,
      statusText: response.statusText,
      payload,
    });

    throw createEmployeeDirectoryWorkerError(
      getWorkerErrorMessage(
        response,
        payload,
        "Employee directory sync failed."
      ),
      {
        response,
        payload,
      }
    );
  }

  return {
    syncedAt: normalizeOptionalText(payload.syncedAt),
    sourceCount: Number(payload.sourceCount ?? 0) || 0,
    employeesSynced: Number(payload.employeesSynced ?? 0) || 0,
    employeesDeleted: Number(payload.employeesDeleted ?? 0) || 0,
    actor: payload.actor
      ? {
          uid: String(payload.actor.uid ?? "").trim(),
          email: normalizeOptionalText(payload.actor.email),
          role: String(payload.actor.role ?? "").trim(),
        }
      : null,
  };
}
