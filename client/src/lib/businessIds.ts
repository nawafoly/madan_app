import { doc, type Transaction } from "firebase/firestore";

import { db } from "@/_core/firebase";

export type BusinessEntityType =
  | "projects"
  | "requests"
  | "investments"
  | "contracts";

type BusinessIdConfig = {
  counterDocId: string;
  prefix: string;
};

const BUSINESS_ID_CONFIG: Record<BusinessEntityType, BusinessIdConfig> = {
  projects: {
    counterDocId: "projects",
    prefix: "PRJ",
  },
  requests: {
    counterDocId: "requests",
    prefix: "REQ",
  },
  investments: {
    counterDocId: "investments",
    prefix: "INVST",
  },
  contracts: {
    counterDocId: "contracts",
    prefix: "CTR",
  },
};

function cleanValue(value: unknown) {
  return String(value ?? "").trim();
}

function pickFirstValue(...values: unknown[]) {
  for (const value of values) {
    const normalized = cleanValue(value);
    if (normalized) return normalized;
  }

  return "";
}

export function formatBusinessId(type: BusinessEntityType, sequence: number) {
  const config = BUSINESS_ID_CONFIG[type];
  return `${config.prefix}-${String(sequence).padStart(6, "0")}`;
}

export async function reserveNextBusinessId(
  tx: Transaction,
  type: BusinessEntityType
) {
  const config = BUSINESS_ID_CONFIG[type];
  const counterRef = doc(db, "counters", config.counterDocId);
  const counterSnap = await tx.get(counterRef);
  const rawCurrent = Number(counterSnap.data()?.current ?? 0);
  const current = Number.isFinite(rawCurrent) && rawCurrent > 0 ? rawCurrent : 0;
  const next = current + 1;

  tx.set(
    counterRef,
    {
      current: next,
    },
    { merge: true }
  );

  return formatBusinessId(type, next);
}

export function getProjectBusinessId(project: Record<string, any> | null | undefined) {
  return pickFirstValue(
    project?.businessId,
    project?.issueNumber,
    project?.projectNumber
  );
}

export function getRequestBusinessId(request: Record<string, any> | null | undefined) {
  return pickFirstValue(
    request?.businessId,
    request?.requestNumber,
    request?.issueNumber
  );
}

export function getInvestmentBusinessId(
  investment: Record<string, any> | null | undefined
) {
  return pickFirstValue(
    investment?.businessId,
    investment?.investmentNumber
  );
}

export function getContractBusinessId(contract: Record<string, any> | null | undefined) {
  return pickFirstValue(
    contract?.businessId,
    contract?.contractNumber
  );
}
