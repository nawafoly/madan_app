// client/src/_core/recomputeAggregates.ts
import { db } from "./firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import {
  AUDIT_ACTIONS,
  auditedUpdateDoc,
  buildAuditSource,
  type AuditRelatedIds,
  type AuditSourceInput,
} from "@/lib/auditLog";

type Totals = {
  currentAmount: number;
  investorsCount: number;
  pendingAmount?: number;
};

type RecomputeProjectAuditContext = {
  source?: AuditSourceInput;
  reason?: string;
  relatedIds?: AuditRelatedIds;
};

const toNum = (v: any) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const COUNTED = new Set(["active", "completed"]);
const PENDING = new Set([
  "pending",
  "pending_contract",
  "signing",
  "signed",
  "approved",
]);

export async function recomputeProjectAggregatesClient(
  projectId: string,
  auditContext: RecomputeProjectAuditContext = {}
): Promise<Totals> {
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

  await auditedUpdateDoc({
    ref: doc(db, "projects", pid),
    data: {
      currentAmount,
      investorsCount: investors.size,
      pendingAmount,
      updatedAt: serverTimestamp(),
    },
    action: AUDIT_ACTIONS.AGGREGATES_RECOMPUTED,
    category: "finance",
    entityType: "project",
    source: buildAuditSource(
      auditContext.source || {
        area: "admin",
        page: "recomputeProjectAggregatesClient",
        method: "recompute",
      }
    ),
    relatedIds: {
      projectId: pid,
      ...(auditContext.relatedIds || {}),
    },
    message: `Recomputed project aggregates for ${pid}`,
    meta: {
      reason: auditContext.reason || "client_recompute_project_aggregates",
      investmentCount: snap.size,
    },
  });

  return { currentAmount, investorsCount: investors.size, pendingAmount };
}
