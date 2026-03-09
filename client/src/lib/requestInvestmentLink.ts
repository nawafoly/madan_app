import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";

import { db } from "@/_core/firebase";

export type LinkedFirestoreDoc = Record<string, any> & { id: string };

export function normalizeLinkId(value: any) {
  return String(value || "").trim();
}

export function pickLinkId(...values: any[]) {
  for (const value of values) {
    const normalized = normalizeLinkId(value);
    if (normalized) return normalized;
  }
  return "";
}

function uniqueLinkIds(values: any[]) {
  const seen = new Set<string>();
  const list: string[] = [];

  for (const value of values) {
    const normalized = normalizeLinkId(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    list.push(normalized);
  }

  return list;
}

function toMillisSafe(value: any) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") {
    try {
      return Number(value.toMillis()) || 0;
    } catch {
      return 0;
    }
  }
  if (typeof value?.seconds === "number") return value.seconds * 1000;

  const date = new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function sortLinkedDocs(list: LinkedFirestoreDoc[]) {
  return [...list].sort((a, b) => {
    const aUpdated = Math.max(toMillisSafe(a?.updatedAt), toMillisSafe(a?.createdAt));
    const bUpdated = Math.max(toMillisSafe(b?.updatedAt), toMillisSafe(b?.createdAt));
    return bUpdated - aUpdated;
  });
}

function ownerIdForDoc(data: any) {
  return pickLinkId(data?.investorUid, data?.userId, data?.createdByUid);
}

function matchesInvestor(data: any, investorUid: string) {
  const ownerId = ownerIdForDoc(data);
  const normalizedInvestorUid = normalizeLinkId(investorUid);
  return !!ownerId && !!normalizedInvestorUid && ownerId === normalizedInvestorUid;
}

function toLinkedDoc(id: string, data: any): LinkedFirestoreDoc {
  return { id, ...(data as Record<string, any>) };
}

type RequestLookupInput = {
  investorUid: string;
  requestIds?: any[];
  investmentIds?: any[];
};

type InvestmentLookupInput = {
  investorUid: string;
  requestIds?: any[];
  investmentIds?: any[];
};

function requestMatchesContext(data: any, input: RequestLookupInput) {
  if (!matchesInvestor(data, input.investorUid)) return false;

  const expectedInvestmentIds = uniqueLinkIds(input.investmentIds || []);
  const linkedInvestmentId = pickLinkId(data?.investmentId);
  if (expectedInvestmentIds.length && linkedInvestmentId && !expectedInvestmentIds.includes(linkedInvestmentId)) {
    return false;
  }

  return true;
}

function investmentMatchesContext(data: any, input: InvestmentLookupInput) {
  if (!matchesInvestor(data, input.investorUid)) return false;

  const expectedRequestIds = uniqueLinkIds(input.requestIds || []);
  const linkedRequestId = pickLinkId(
    data?.requestId,
    data?.sourceRequestId,
    data?.sourceMessageId,
    data?.messageId
  );

  if (expectedRequestIds.length && linkedRequestId && !expectedRequestIds.includes(linkedRequestId)) {
    return false;
  }

  return true;
}

export async function findInterestRequestForInvestor(
  input: RequestLookupInput
): Promise<LinkedFirestoreDoc | null> {
  const requestIds = uniqueLinkIds(input.requestIds || []);
  const investmentIds = uniqueLinkIds(input.investmentIds || []);

  for (const requestId of requestIds) {
    try {
      const snap = await getDoc(doc(db, "interest_requests", requestId));
      if (!snap.exists()) continue;

      const data = snap.data() as Record<string, any>;
      if (!requestMatchesContext(data, input)) continue;

      return toLinkedDoc(snap.id, data);
    } catch (error) {
      console.error("interest_request_lookup_error", error);
    }
  }

  for (const investmentId of investmentIds) {
    try {
      const snap = await getDocs(
        query(
          collection(db, "interest_requests"),
          where("investmentId", "==", investmentId),
          where("investorUid", "==", normalizeLinkId(input.investorUid)),
          limit(5)
        )
      );
      const rows = sortLinkedDocs(
        snap.docs
          .map((row) => toLinkedDoc(row.id, row.data()))
          .filter((row) => requestMatchesContext(row, input))
      );
      if (rows[0]) return rows[0];
    } catch (error) {
      console.error("interest_request_by_investment_lookup_error", error);
    }
  }

  return null;
}

export async function findInvestmentForInvestor(
  input: InvestmentLookupInput
): Promise<LinkedFirestoreDoc | null> {
  const investmentIds = uniqueLinkIds(input.investmentIds || []);
  const requestIds = uniqueLinkIds(input.requestIds || []);

  for (const investmentId of investmentIds) {
    try {
      const snap = await getDoc(doc(db, "investments", investmentId));
      if (!snap.exists()) continue;

      const data = snap.data() as Record<string, any>;
      if (!investmentMatchesContext(data, input)) continue;

      return toLinkedDoc(snap.id, data);
    } catch (error) {
      console.error("investment_lookup_error", error);
    }
  }

  for (const requestId of requestIds) {
    try {
      const snap = await getDocs(
        query(
          collection(db, "investments"),
          where("requestId", "==", requestId),
          where("investorUid", "==", normalizeLinkId(input.investorUid)),
          limit(5)
        )
      );
      const rows = sortLinkedDocs(
        snap.docs
          .map((row) => toLinkedDoc(row.id, row.data()))
          .filter((row) => investmentMatchesContext(row, input))
      );
      if (rows[0]) return rows[0];
    } catch (error) {
      console.error("investment_by_request_lookup_error", error);
    }
  }

  return null;
}
