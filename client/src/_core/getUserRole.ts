import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export type AppRole =
  | "user"
  | "owner"
  | "admin"
  | "accountant"
  | "hr"
  | "staff";

export async function getUserRole(uid: string): Promise<AppRole> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return "user";
  const role = String((snap.data() as any)?.role || "")
    .trim()
    .toLowerCase();
  if (
    role === "owner" ||
    role === "admin" ||
    role === "accountant" ||
    role === "hr" ||
    role === "staff"
  ) {
    return role;
  }
  return "user";
}
