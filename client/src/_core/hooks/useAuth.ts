// client/src/_core/hooks/useAuth.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut, type User as FbUser } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/_core/firebase";

export type AppRole = "user" | "owner" | "accountant" | "staff";

export type AppUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  role: AppRole;
  firebaseUser?: FbUser;
};

function normalizeRole(role: any): AppRole {
  if (role === "owner" || role === "accountant" || role === "staff") return role;
  return "user";
}

/** ✅ Bootstrap Owner emails (عدلها براحتك) */
const BOOTSTRAP_OWNER_EMAILS = new Set<string>(["nawafaaa0@gmail.com"]);

function isBootstrapOwnerEmail(email?: string | null) {
  const e = (email ?? "").toLowerCase().trim();
  return Boolean(e) && BOOTSTRAP_OWNER_EMAILS.has(e);
}

async function ensureUserDocAndGetRole(fb: FbUser): Promise<AppRole> {
  const ref = doc(db, "users", fb.uid);

  // Default role derived from bootstrap (لو احتجناه)
  const bootstrapRole: AppRole = isBootstrapOwnerEmail(fb.email) ? "owner" : "user";

  try {
    const snap = await getDoc(ref);

    // ✅ موجود: رجّع role صحيح + إذا ناقص طبّق bootstrap + حدث updatedAt
    if (snap.exists()) {
      const data = snap.data() as any;
      const existingRole = normalizeRole(data?.role);

      const finalRole: AppRole = existingRole !== "user" ? existingRole : bootstrapRole;

      // ✅ نضمن تحديث بسيط (بدون ما نخرب بياناته)
      await setDoc(
        ref,
        {
          uid: fb.uid,
          email: fb.email ?? null,
          displayName: fb.displayName ?? null,
          role: finalRole,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return finalRole;
    }

    // ✅ غير موجود: أنشئ doc من الصفر
    await setDoc(
      ref,
      {
        uid: fb.uid,
        email: fb.email ?? null,
        displayName: fb.displayName ?? null,
        role: bootstrapRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return bootstrapRole;
  } catch {
    // ✅ لا نعلّق النظام بسبب Firestore
    return "user";
  }
}

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const fb = auth.currentUser;

    if (!fb) {
      setUser(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const role = await ensureUserDocAndGetRole(fb);
      if (!aliveRef.current) return;

      setUser({
        uid: fb.uid,
        email: fb.email,
        displayName: fb.displayName,
        role,
        firebaseUser: fb,
      });
      setError(null);
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e);
    } finally {
      if (!aliveRef.current) return;
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } finally {
      setUser(null);
      setError(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;

    const unsub = onAuthStateChanged(auth, async (fb) => {
      if (!aliveRef.current) return;

      // ✅ أهم سطرين يمنعون Loading للأبد
      if (!fb) {
        setUser(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const role = await ensureUserDocAndGetRole(fb);
        if (!aliveRef.current) return;

        setUser({
          uid: fb.uid,
          email: fb.email,
          displayName: fb.displayName,
          role,
          firebaseUser: fb,
        });
        setError(null);
      } catch (e) {
        if (!aliveRef.current) return;
        setError(e);
        setUser(null);
      } finally {
        if (!aliveRef.current) return;
        setLoading(false);
      }
    });

    return () => {
      aliveRef.current = false;
      unsub();
    };
  }, []);

  return useMemo(() => ({ user, loading, error, refresh, logout }), [
    user,
    loading,
    error,
    refresh,
    logout,
  ]);
}
