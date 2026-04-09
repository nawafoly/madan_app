export type EmployeeCoworkerOption = {
  uid: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  statusKey: string;
};

type EmployeeDirectoryResponse = {
  employees?: EmployeeCoworkerOption[] | null;
};

function buildEmployeeDirectoryEndpoint() {
  const workerBaseUrl = String(import.meta.env.VITE_R2_UPLOAD_WORKER_URL || "").trim();
  if (!workerBaseUrl) return "";

  try {
    return new URL("/listActiveEmployeeDirectory", workerBaseUrl).toString();
  } catch {
    return "";
  }
}

export async function fetchActiveEmployeeCoworkers() {
  const endpoint = buildEmployeeDirectoryEndpoint();
  if (!endpoint) {
    throw new Error("Employee directory endpoint is not configured.");
  }

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  let payload: EmployeeDirectoryResponse | null = null;
  try {
    payload = (await response.json()) as EmployeeDirectoryResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      String((payload as { message?: string } | null)?.message || "").trim() ||
      `Employee directory request failed (${response.status}).`;
    throw new Error(message);
  }

  const employees = Array.isArray(payload?.employees) ? payload.employees : [];

  return employees
    .map(employee => ({
      uid: String(employee?.uid || "").trim(),
      name: String(employee?.name || "").trim(),
      email: String(employee?.email || "").trim() || null,
      avatarUrl: String(employee?.avatarUrl || "").trim() || null,
      title: String(employee?.title || "").trim() || null,
      department: String(employee?.department || "").trim() || null,
      statusKey: String(employee?.statusKey || "").trim() || "active",
    }))
    .filter(employee => employee.uid && employee.name);
}
