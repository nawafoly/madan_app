// client/src/components/RequireRole.tsx
import { useEffect, useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth, type AppRole } from "@/_core/hooks/useAuth";

function homeForRole(role: AppRole) {
  // ✅ Admin dashboard roles
  if (
    role === "owner" ||
    role === "admin" ||
    role === "accountant" ||
    role === "staff"
  ) {
    return "/dashboard";
  }

  // ✅ Client area
  if (role === "client") return "/client/dashboard";

  // ✅ Guest (نفس صفحة العميل لكن بواجهة Guest داخلها)
  return "/client/dashboard";
}


type Props = {
  allow: AppRole[];
  children: ReactNode;
};


export default function RequireRole({ allow, children }: Props) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  const allowKey = useMemo(() => allow.join("|"), [allow]);

  useEffect(() => {
    if (loading) return;

    // ✅ not logged in -> login
    if (!user) {
      if (location !== "/login") setLocation("/login");
      return;
    }

    const role = (user.role ?? "guest") as AppRole;

    // ✅ role not allowed -> go to its home
    if (!allow.includes(role)) {
      const target = homeForRole(role);
      if (location !== target) setLocation(target);
    }
  }, [user, loading, allowKey, location, setLocation]);

  if (loading) return null;
  if (!user) return null;

  const role = (user.role ?? "guest") as AppRole;
  if (!allow.includes(role)) return null;

  return <>{children}</>;
}
