import { getHrCoreMe } from "@/lib/hrCoreApi";

export type AppRole = "user" | "owner" | "admin" | "accountant" | "hr" | "staff";

function normalizeRole(value: unknown): AppRole {
  const role = String(value ?? "").trim().toLowerCase();
  if (["owner", "admin", "accountant", "hr", "staff"].includes(role)) return role as AppRole;
  if (role === "employee") return "staff";
  return "user";
}

export async function getUserRole(uid: string): Promise<AppRole> {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) return "user";
  try {
    const result = await getHrCoreMe();
    if (result.account.uid !== normalizedUid) return "user";
    return normalizeRole(result.account.role);
  } catch {
    return "user";
  }
}
