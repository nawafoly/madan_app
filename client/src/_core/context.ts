export type AppRole = "user" | "owner" | "accountant" | "staff";

function normalizeRole(dbRole: string, email?: string | null): AppRole {
  // ✅ Bootstrap Owner (طوق أمان)
  if (email && email.toLowerCase() === "nawafaaa0@gmail.com") return "owner";

  // ✅ DB legacy mapping
  if (dbRole === "admin") return "owner";
  if (dbRole === "accountant") return "accountant";
  if (dbRole === "staff") return "staff";

  return "user";
}

// بعد ما تجيب user من sdk.authenticateRequest(...)
const normalizedUser = user
  ? { ...user, role: normalizeRole(user.role, (user as any).email ?? null) }
  : null;

// ثم رجّع ctx.user = normalizedUser
