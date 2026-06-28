import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import {
  getHomePathForUser,
  hasPermission,
  hasInvestmentAdminPermission,
  hasStaffAdminPermission,
  useAuth,
  type Permission,
} from "@/_core/hooks/useAuth";

type Props = {
  permission: Permission;
  area?: "investment" | "staff";
  directPermission?: boolean;
  children: ReactNode;
};

export default function RequireAdminPermission({
  permission,
  area = "investment",
  directPermission = false,
  children,
}: Props) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  const allowed =
    !!user &&
    (directPermission
      ? user.role !== "client" &&
        user.role !== "guest" &&
        hasPermission(user, permission)
      : area === "staff"
      ? hasStaffAdminPermission(user, permission)
      : hasInvestmentAdminPermission(user, permission));

  useEffect(() => {
    if (loading) return;

    if (!user) {
      const target = area === "staff" ? getLoginUrl(location) : "/login";
      if (location !== target) setLocation(target);
      return;
    }

    if (!allowed) {
      const target = getHomePathForUser(user);
      if (location !== target) setLocation(target);
    }
  }, [allowed, loading, location, setLocation, user]);

  if (loading || !user || !allowed) return null;

  return <>{children}</>;
}
