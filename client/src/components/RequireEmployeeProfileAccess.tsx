import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { doc, getDoc } from "firebase/firestore";
import { getLoginUrl } from "@/const";

import {
  canAccessEmployeeProfile,
  getHomePathForUser,
  hasStaffAdminPermission,
  hasStaffAreaPermission,
  useAuth,
} from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";

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
          hasStaffAreaPermission(user, "weekly_reports.manager_notes") ||
          hasStaffAreaPermission(user, "daily_tasks.manager_notes"))),
    [allowStaffAdmin, user]
  );

  useEffect(() => {
    if (loading || !user) return;
    if (hasDirectAccess) {
      setHasLinkedEmployeeRecord(true);
      return;
    }

    let cancelled = false;
    setHasLinkedEmployeeRecord(null);

    void getDoc(doc(db, "employees", user.uid))
      .then(snapshot => {
        if (!cancelled) setHasLinkedEmployeeRecord(snapshot.exists());
      })
      .catch(() => {
        if (!cancelled) setHasLinkedEmployeeRecord(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasDirectAccess, loading, user]);

  const canOpenEmployeeProfile = hasDirectAccess || hasLinkedEmployeeRecord === true;

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
