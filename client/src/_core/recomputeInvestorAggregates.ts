import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/_core/firebase";
import { getInvestmentProfitSnapshot, roundMoney } from "@shared/investmentProfit";

type Investment = Record<string, any>;

export async function recomputeInvestorAggregates(investorUid: string) {
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

  await updateDoc(userRef, {
    totalInvested: roundMoney(totalInvested),
    expectedProfitTotal: roundMoney(expectedProfitTotal),
    profitToDate: roundMoney(profitToDate),
    aggregatesUpdatedAt: serverTimestamp(),
  });
}
  
