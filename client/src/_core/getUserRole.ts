import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export type AppRole = "user" | "owner" | "accountant" | "staff";

export async function getUserRole(uid: string): Promise<AppRole> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return "user";
  const role = (snap.data() as any)?.role;
  if (role === "owner" || role === "accountant" || role === "staff") return role;
  return "user";
}

