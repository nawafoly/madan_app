import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";

import {
  canAccessEmployeeProfile,
  getHomePathForUser,
  hasStaffAdminPermission,
  hasStaffAreaPermission,
  useAuth,
} from "@/_core/hooks/useAuth";
import { getHrCoreEmployee, isHrCoreConfigured } from "@/lib/hrCoreApi";

type Props = {
  children: ReactNode;
  allowStaffAdmin?: boolean;
};

export default function RequireEmployeeProfileAccess({
  children,
  allowStaffAdmin = false,
}: Props) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const [hasLinkedEmployeeRecord, setHasLinkedEmployeeRecord] = useState<
    boolean | null
  >(null);

  const hasDirectAccess = useMemo(
    () =>
      canAccessEmployeeProfile(user) ||
      (allowStaffAdmin &&
        (hasStaffAdminPermission(user, "employees.view") ||
          hasStaffAdminPermission(user, "employees.manage") ||
          hasStaffAreaPermission(user, "weekly_reports.manager_notes"))),
    [allowStaffAdmin, user]
  );

  useEffect(() => {
    if (loading || !user) return;
    if (hasDirectAccess) {
      setHasLinkedEmployeeRecord(true);
      return;
    }

    const employeeId = String(user.linkedEmployeeId || user.uid || "").trim();
    if (!employeeId || !isHrCoreConfigured()) {
      setHasLinkedEmployeeRecord(false);
      return;
    }

    let cancelled = false;
    setHasLinkedEmployeeRecord(null);

    void getHrCoreEmployee(employeeId)
      .then(() => {
        if (!cancelled) setHasLinkedEmployeeRecord(true);
      })
      .catch(error => {
        console.error("employee_profile_d1_access_lookup_failed", error);
        if (!cancelled) setHasLinkedEmployeeRecord(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasDirectAccess, loading, user]);

  const canOpenEmployeeProfile =
    hasDirectAccess || hasLinkedEmployeeRecord === true;

  useEffect(() => {
    if (loading) return;

    if (!user) {
      const target = getLoginUrl(location);
      if (location !== target) setLocation(target);
      return;
    }

    if (hasLinkedEmployeeRecord === null) return;

    if (!canOpenEmployeeProfile) {
      const target = getHomePathForUser(user);
      if (location !== target) setLocation(target);
    }
  }, [
    canOpenEmployeeProfile,
    hasLinkedEmployeeRecord,
    loading,
    location,
    setLocation,
    user,
  ]);

  if (loading || !user || hasLinkedEmployeeRecord === null) return null;
  if (!canOpenEmployeeProfile) return null;

  return <>{children}</>;
}
