import {
  collection,
  getDoc,
  getDocs,
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
import { buildProjectsMap } from "@/lib/projectDisplay";
import { investmentMatchesUser } from "@/lib/investorIdentity";
import { getProjectProfitFallback } from "@/lib/projectProfitFallback";
import { getInvestmentProfitSnapshot, roundMoney } from "@shared/investmentProfit";

type Investment = Record<string, any>;
type UserRecord = Record<string, any> & { id: string };

type RecomputeInvestorAuditContext = {
  source?: AuditSourceInput;
  reason?: string;
  relatedIds?: AuditRelatedIds;
};

export async function recomputeInvestorAggregates(
  investorUid: string,
  auditContext: RecomputeInvestorAuditContext = {}
) {
  const userRef = doc(db, "users", investorUid);
  const [userSnapshot, investmentsSnapshot, projectsSnapshot] = await Promise.all([
    getDoc(userRef),
    getDocs(collection(db, "investments")),
    getDocs(collection(db, "projects")),
  ]);

  const userRecord: UserRecord = userSnapshot.exists()
    ? ({
        id: userSnapshot.id,
        ...(userSnapshot.data() as any),
      } as UserRecord)
    : ({ id: investorUid } as UserRecord);

  const allInvestments = investmentsSnapshot.docs.map((row) => ({
    id: row.id,
    ...(row.data() as any),
  })) as Investment[];
  const projectsMap = buildProjectsMap(
    projectsSnapshot.docs.map((row) => ({
      id: row.id,
      ...(row.data() as any),
    }))
  );
  const linkedInvestments = allInvestments.filter((investment) => {
    if (userSnapshot.exists()) {
      return investmentMatchesUser(investment, userRecord);
    }

    return [investment?.investorUid, investment?.userId, investment?.investorId, investment?.clientId]
      .map((value) => String(value || "").trim())
      .some((value) => value && value === investorUid);
  });

  let totalInvested = 0;
  let expectedProfitTotal = 0;
  let profitToDate = 0;
  const today = new Date();

  linkedInvestments.forEach((inv) => {
    const projectId = String(inv?.projectId || "").trim();
    const metrics = getInvestmentProfitSnapshot(inv, {
      now: today,
      projectFallback: getProjectProfitFallback(projectsMap[projectId]),
    });

    totalInvested += metrics.principalAmount;
    expectedProfitTotal += metrics.expectedProfit;
    profitToDate += metrics.currentProfit;
  });

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
      investmentCount: linkedInvestments.length,
    },
  });
}
  
