import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { doc, getDoc } from "firebase/firestore";

import {
  canAccessEmployeeProfile,
  getHomePathForUser,
  isOpsRole,
  useAuth,
} from "@/_core/hooks/useAuth";
import { db } from "@/_core/firebase";

type Props = {
  children: ReactNode;
};

export default function RequireEmployeeProfileAccess({ children }: Props) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const [hasLinkedEmployeeRecord, setHasLinkedEmployeeRecord] = useState<
    boolean | null
  >(null);

  const hasDirectAccess = useMemo(
    () => isOpsRole(user?.role) || canAccessEmployeeProfile(user),
    [user]
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
    if (loading || hasLinkedEmployeeRecord === null) return;

    if (!user) {
      if (location !== "/login") setLocation("/login");
      return;
    }

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
