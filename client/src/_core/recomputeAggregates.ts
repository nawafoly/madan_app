// client/src/_core/recomputeAggregates.ts
import { db } from "./firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
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
  remainingInvestorsCount?: number;
  pendingAmount?: number;
  baseCoveredAmount?: number;
  investmentsAmount?: number;
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

const COUNTED = new Set(["active", "stopped", "completed"]);
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
  const projectRef = doc(db, "projects", pid);
  const [snap, projectSnap] = await Promise.all([getDocs(q), getDoc(projectRef)]);
  const projectData: any = projectSnap.exists() ? projectSnap.data() : {};
  const targetAmount = toNum(projectData.targetAmount);
  const coverageRate = toNum(projectData.coverageRate);
  const minInvestment = toNum(
    projectData.minInvestment ?? projectData.minInvestmentAmount
  );
  const baseCoveredAmount = (targetAmount * coverageRate) / 100;

  let investmentsAmount = 0;
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
      investmentsAmount += amountCounted;
      if (inv.investorUid) investors.add(String(inv.investorUid));
    } else if (PENDING.has(status)) {
      pendingAmount += amountCounted;
    }
  });

  const currentAmount = baseCoveredAmount + investmentsAmount;
  const remainingAmount = Math.max(targetAmount - currentAmount, 0);
  const remainingInvestorsCount =
    minInvestment > 0 && remainingAmount > 0
      ? Math.ceil(remainingAmount / minInvestment)
      : 0;

  await auditedUpdateDoc({
    ref: projectRef,
    data: {
      baseCoveredAmount,
      investmentsAmount,
      currentAmount,
      investorsCount: investors.size,
      remainingInvestorsCount,
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

  return {
    currentAmount,
    investorsCount: investors.size,
    remainingInvestorsCount,
    pendingAmount,
    baseCoveredAmount,
    investmentsAmount,
  };
}
