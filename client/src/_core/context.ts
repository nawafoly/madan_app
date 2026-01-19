// client/src/_core/context.ts

export type AppRole = "guest" | "client" | "owner" | "admin" | "accountant" | "staff";

/**
 * يحول الدور القادم من قاعدة البيانات/كود قديم لدور معتمد عندنا
 * + Bootstrap Owner
 */
export function normalizeRole(dbRole: string, email?: string | null): AppRole {
  const e = (email ?? "").toLowerCase().trim();
  const r = String(dbRole ?? "").trim();

  // ✅ Bootstrap Owner (طوق أمان)
  if (e === "nawafaaa0@gmail.com") return "owner";

  // ✅ Legacy mapping
  if (r === "user") return "client";
  if (r === "admin") return "admin";

  // ✅ Approved roles
  if (
    r === "owner" ||
    r === "admin" ||
    r === "accountant" ||
    r === "staff" ||
    r === "client" ||
    r === "guest"
  ) {
    return r as AppRole;
  }

  return "guest";
}
