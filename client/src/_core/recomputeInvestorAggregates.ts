import {
  collection,
  getDocs,
  query,
  where,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/_core/firebase";
import {
  AUDIT_ACTIONS,
  auditedUpdateDoc,
  buildAuditSource,
  type AuditRelatedIds,
  type AuditSourceInput,
} from "@/lib/auditLog";
import { getInvestmentProfitSnapshot, roundMoney } from "@shared/investmentProfit";

type Investment = Record<string, any>;

type RecomputeInvestorAuditContext = {
  source?: AuditSourceInput;
  reason?: string;
  relatedIds?: AuditRelatedIds;
};

export async function recomputeInvestorAggregates(
  investorUid: string,
  auditContext: RecomputeInvestorAuditContext = {}
) {
  const invRef = collection(db, "investments");
  const q = query(invRef, where("investorUid", "==", investorUid));
  const snap = await getDocs(q);

  let totalInvested = 0;
  let expectedProfitTotal = 0;
  let profitToDate = 0;
  const today = new Date();

  snap.forEach((d) => {
    const inv = d.data() as Investment;
    const metrics = getInvestmentProfitSnapshot(inv, { now: today });

    totalInvested += metrics.principalAmount;
    expectedProfitTotal += metrics.expectedProfit;
    profitToDate += metrics.currentProfit;
  });

  const userRef = doc(db, "users", investorUid);

  await auditedUpdateDoc({
    ref: userRef,
    data: {
      totalInvested: roundMoney(totalInvested),
      expectedProfitTotal: roundMoney(expectedProfitTotal),
      profitToDate: roundMoney(profitToDate),
      aggregatesUpdatedAt: serverTimestamp(),
    },
    action: AUDIT_ACTIONS.AGGREGATES_RECOMPUTED,
    category: "finance",
    entityType: "user",
    source: buildAuditSource(
      auditContext.source || {
        area: "admin",
        page: "recomputeInvestorAggregates",
        method: "recompute",
      }
    ),
    relatedIds: {
      userId: investorUid,
      ...(auditContext.relatedIds || {}),
    },
    message: `Recomputed investor aggregates for ${investorUid}`,
    meta: {
      reason: auditContext.reason || "client_recompute_investor_aggregates",
      investmentCount: snap.size,
    },
  });
}
  
