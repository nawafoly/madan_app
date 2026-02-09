// client/src/_core/recomputeAggregates.ts
import { db } from "./firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

type Totals = {
  currentAmount: number;
  investorsCount: number;
  pendingAmount?: number;
};

const toNum = (v: any) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const COUNTED = new Set(["active", "completed"]);
const PENDING = new Set(["pending", "pending_contract", "signing"]);

export async function recomputeProjectAggregatesClient(projectId: string): Promise<Totals> {
  const pid = String(projectId || "").trim();
  if (!pid) throw new Error("projectId missing");

  const q = query(collection(db, "investments"), where("projectId", "==", pid));
  const snap = await getDocs(q);

  let currentAmount = 0;
  let pendingAmount = 0;
  const investors = new Set<string>();

  snap.forEach((d) => {
    const inv: any = d.data() || {};
    const status = String(inv.status || "").trim().toLowerCase();

    const amountCounted =
      inv.approvedAmount !== undefined && inv.approvedAmount !== null
        ? toNum(inv.approvedAmount)
        : toNum(inv.amount);

    if (COUNTED.has(status)) {
      currentAmount += amountCounted;
      if (inv.investorUid) investors.add(String(inv.investorUid));
    } else if (PENDING.has(status)) {
      pendingAmount += amountCounted;
    }
  });

  await updateDoc(doc(db, "projects", pid), {
    currentAmount,
    investorsCount: investors.size,
    pendingAmount,
    updatedAt: serverTimestamp(),
  });

  return { currentAmount, investorsCount: investors.size, pendingAmount };
}
