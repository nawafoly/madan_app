import { auth } from "@/_core/firebase";
import { buildDocumentWorkerUrl } from "@/lib/documentUploadService";

export type EmployeeDirectoryWorkerEmployee = {
  uid: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  statusKey: string;
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
  const requestUrl = getEmployeeDirectoryWorkerUrl("/listActiveEmployeeDirectory");

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: await getEmployeeDirectoryAuthHeaders(),
      cache: "no-store",
    });
    const payload = await readWorkerJson<EmployeeDirectoryListResponse>(response);

    if (!response.ok) {
      console.error("employee_directory_worker_fetch_failed", {
        url: response.url || requestUrl,
        status: response.status,
        statusText: response.statusText,
        payload,
      });

      throw createEmployeeDirectoryWorkerError(
        getWorkerErrorMessage(
          response,
          payload,
          "Employee directory request failed."
        ),
        {
          response,
          payload,
        }
      );
    }

    if (payload && !Array.isArray(payload.employees) && payload.employees != null) {
      console.error("employee_directory_worker_payload_invalid", {
        url: response.url || requestUrl,
        status: response.status,
        payload,
      });

      throw createEmployeeDirectoryWorkerError(
        getWorkerErrorMessage(
          response,
          payload,
          "Employee directory payload is invalid."
        ),
        {
          response,
          payload,
        }
      );
    }

    const employees = Array.isArray(payload?.employees) ? payload.employees : [];
    const normalizedEmployees = employees
      .map(normalizeEmployeeDirectoryWorkerEmployee)
      .filter(
        (employee): employee is EmployeeDirectoryWorkerEmployee =>
          employee !== null
      );

    if (employees.length && normalizedEmployees.length !== employees.length) {
      console.warn("employee_directory_worker_rows_dropped_during_normalize", {
        url: response.url || requestUrl,
        rawCount: employees.length,
        normalizedCount: normalizedEmployees.length,
        droppedCount: employees.length - normalizedEmployees.length,
        payload,
      });
    }

    return normalizedEmployees;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "EmployeeDirectoryWorkerError"
    ) {
      throw error;
    }

    console.error("employee_directory_worker_fetch_unhandled_error", {
      url: requestUrl,
      error,
    });

    throw createEmployeeDirectoryWorkerError(
      error instanceof Error
        ? error.message
        : "Employee directory request failed.",
      {
        payload: null,
      }
    );
  }
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
