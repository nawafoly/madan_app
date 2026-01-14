// client/src/components/RequireRole.tsx
import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth, type AppRole } from "@/_core/hooks/useAuth";

function homeForRole(role: AppRole) {
  if (role === "owner" || role === "accountant" || role === "staff") return "/dashboard";
  return "/client/dashboard";
}

type Props = {
  allow: AppRole[];
  children: React.ReactNode;
};

export default function RequireRole({ allow, children }: Props) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  const allowKey = useMemo(() => allow.join("|"), [allow]);

  useEffect(() => {
    if (loading) return;

    // ✅ not logged in → login
    if (!user) {
      if (location !== "/login") setLocation("/login");
      return;
    }

    const role = (user.role ?? "user") as AppRole;

    // ✅ not allowed → role home
    if (!allow.includes(role)) {
      const target = homeForRole(role);
      if (location !== target) setLocation(target);
    }
  }, [user, loading, allowKey, location, setLocation]);

  if (loading) return null;
  if (!user) return null;

  const role = (user.role ?? "user") as AppRole;
  if (!allow.includes(role)) return null;

  return <>{children}</>;
}
