// client/src/_core/context.ts
export type AppRole =
  | "guest"
  | "client"
  | "owner"
  | "admin"
  | "accountant"
  | "hr"
  | "staff";

/**
 * يحول الدور القادم من قاعدة البيانات/كود قديم لدور معتمد عندنا
 */
export function normalizeRole(dbRole: string, email?: string | null): AppRole {
  void email;
  const r = String(dbRole ?? "").trim();

  // ✅ Legacy mapping
  if (r === "user") return "client";
  if (r === "admin") return "admin";

  // ✅ Approved roles
  if (
    r === "owner" ||
    r === "admin" ||
    r === "accountant" ||
    r === "hr" ||
    r === "staff" ||
    r === "client" ||
    r === "guest"
  ) {
    return r as AppRole;
  }

  if (
    r === "human_resources" ||
    r === "human-resources" ||
    r === "human resources"
  ) {
    return "hr";
  }

  return "guest";
}
