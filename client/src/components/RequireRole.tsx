// client/src/components/RequireRole.tsx
import { useEffect, useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import {
  getHomePathForUser,
  useAuth,
  type AppRole,
} from "@/_core/hooks/useAuth";


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
      const target = getLoginUrl(location);
      if (location !== target) setLocation(target);
      return;
    }

    const role = (user.role ?? "guest") as AppRole;

    // ✅ role not allowed -> go to its home
    if (!allow.includes(role)) {
      const target = getHomePathForUser(user);
      if (location !== target) setLocation(target);
    }
  }, [user, loading, allowKey, location, setLocation]);

  if (loading) return null;
  if (!user) return null;

  const role = (user.role ?? "guest") as AppRole;
  if (!allow.includes(role)) return null;

  return <>{children}</>;
}
