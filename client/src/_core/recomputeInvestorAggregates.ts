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
  
  type Investment = {
    amount?: number;
    approvedAmount?: number;
    expectedProfit?: number;
    startAt?: any;
    plannedEndAt?: any;
    status?: string;
  };
  
  function daysBetween(a: Date, b: Date) {
    return Math.max(
      0,
      Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
    );
  }
  
  export async function recomputeInvestorAggregates(
    investorUid: string
  ) {
    const invRef = collection(db, "investments");
  
    const q = query(
      invRef,
      where("investorUid", "==", investorUid)
    );
  
    const snap = await getDocs(q);
  
    let totalInvested = 0;
    let expectedProfitTotal = 0;
    let profitToDate = 0;
  
    const today = new Date();
  
    snap.forEach((d) => {
      const inv = d.data() as Investment;
  
      const amount =
        Number(inv.approvedAmount || inv.amount || 0);
  
      const expectedProfit =
        Number(inv.expectedProfit || 0);
  
      totalInvested += amount;
      expectedProfitTotal += expectedProfit;
  
      if (!inv.startAt || !inv.plannedEndAt) return;
  
      const start = inv.startAt.toDate();
      const end = inv.plannedEndAt.toDate();
  
      const totalDays = daysBetween(start, end);
      const elapsedDays = Math.min(
        totalDays,
        daysBetween(start, today)
      );
  
      if (totalDays > 0) {
        profitToDate +=
          expectedProfit * (elapsedDays / totalDays);
      }
    });
  
    const userRef = doc(db, "users", investorUid);
  
    await updateDoc(userRef, {
      totalInvested,
      expectedProfitTotal,
      profitToDate,
      aggregatesUpdatedAt: serverTimestamp(),
    });
  }
  