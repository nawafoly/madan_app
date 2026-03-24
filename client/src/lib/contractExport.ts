import { db } from "@/_core/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import {
  buildR2DownloadUrl,
  getDocumentWorkerBaseUrl,
  listDocumentMetadata,
  type CloudflareFileRecord,
} from "@/lib/documentUploadService";
import { buildStoredZip, type ZipEntryInput } from "@/lib/zipStore";

const CONTRACT_FILE_CATEGORIES = ["contract_original", "contract_signed"] as const;
const DEFAULT_CANDIDATE_LIMIT = 150;
const CSV_BOM = "\ufeff";

type ExportRecord = Record<string, any> & { id: string };
type ContractExportCounts = {
  investors: number;
  projects: number;
  investments: number;
  contracts: number;
  interestRequests: number;
  files: number;
  attachments: number;
};

type AttachmentEntry = {
  file: CloudflareFileRecord;
  packageRelPath: string;
  binaryIncluded: boolean;
  data?: Uint8Array;
};

export type ContractExportCandidate = {
  id: string;
  investmentId: string;
  projectId: string;
  projectTitle: string;
  investorName: string;
  investorEmail: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  signedAt: string | null;
};

export type ContractExportWarning = {
  code: string;
  message: string;
  relatedIds?: Record<string, string>;
};

export type ContractExportManifest = {
  packageVersion: string;
  mode: "contract_export";
  generatedAt: string;
  requestedContractIds: string[];
  exportedContractIds: string[];
  datasets: {
    investors: number;
    projects: number;
    investments: number;
    contracts: number;
    interest_requests: number;
    files: number;
    attachments: number;
  };
  sourceSummary: {
    firestoreCollections: string[];
    d1Catalog: string;
    r2Attachments: string;
    workerBaseUrl: string;
  };
  warnings: ContractExportWarning[];
};

export type ContractExportSummary = {
  fileName: string;
  generatedAt: string;
  requestedContractCount: number;
  exportedContractCount: number;
  attachmentCount: number;
  warningCount: number;
  rowCounts: ContractExportCounts;
};

export type ContractExportResult = {
  blob: Blob;
  fileName: string;
  manifest: ContractExportManifest;
  summary: ContractExportSummary;
};

type ContractExportInput = {
  contractIds: string[];
};

function pickString(...values: any[]) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function uniqueStrings(values: any[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeTimestamp(value: any): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value?.toDate === "function") {
    try {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
    } catch {
      return null;
    }
  }

  const seconds = Number(value?._seconds ?? value?.seconds);
  const nanoseconds = Number(value?._nanoseconds ?? value?.nanoseconds ?? 0);
  if (Number.isFinite(seconds)) {
    const date = new Date(seconds * 1000 + nanoseconds / 1000000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeForExport(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  const timestamp = normalizeTimestamp(value);
  if (timestamp) return timestamp;

  if (Array.isArray(value)) return value.map((item) => normalizeForExport(item));

  if (typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, any>>((accumulator, key) => {
        accumulator[key] = normalizeForExport(value[key]);
        return accumulator;
      }, {});
  }

  return String(value);
}

function normalizeDocRecord(id: string, data: any): ExportRecord {
  return {
    id,
    ...normalizeForExport(data),
  };
}

function jsonCell(value: any) {
  if (value === null || value === undefined || value === "") return "";
  return JSON.stringify(normalizeForExport(value));
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(normalizeForExport(value));
}

function escapeCsvCell(value: unknown) {
  const stringValue = csvCell(value);
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function buildCsv(headers: string[], rows: Array<Record<string, unknown>>) {
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(","));
  });
  return `${CSV_BOM}${lines.join("\r\n")}`;
}

function compareIsoDesc(left: string | null | undefined, right: string | null | undefined) {
  const leftTime = left ? Date.parse(left) : 0;
  const rightTime = right ? Date.parse(right) : 0;
  return rightTime - leftTime;
}

function sanitizeAttachmentPath(value: string) {
  const cleaned = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.\./g, "")
    .replace(/\/{2,}/g, "/");

  return cleaned || "missing-path";
}

function getAttachmentPackagePath(file: CloudflareFileRecord) {
  return `attachments/r2/${sanitizeAttachmentPath(file.filePath)}`;
}

function buildExportFileName(contractIds: string[], generatedAt: string) {
  const stamp = generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14);
  if (contractIds.length === 1) {
    return `maedin-contract-export-${contractIds[0]}-${stamp}.zip`;
  }
  return `maedin-contract-export-${contractIds.length}-contracts-${stamp}.zip`;
}

function getContractStatusLabel(status: string) {
  return String(status || "").trim() || "unknown";
}

async function fetchDocsByIds(collectionName: string, ids: string[]) {
  const uniqueIds = uniqueStrings(ids);
  const entries = await Promise.all(
    uniqueIds.map(async (id) => {
      const snapshot = await getDoc(doc(db, collectionName, id));
      if (!snapshot.exists()) return null;
      return normalizeDocRecord(snapshot.id, snapshot.data());
    })
  );

  return entries.filter(Boolean) as ExportRecord[];
}

async function fetchInterestRequestByLinkId(linkId: string) {
  const normalized = String(linkId || "").trim();
  if (!normalized) return null;

  const directSnapshot = await getDoc(doc(db, "interest_requests", normalized));
  if (directSnapshot.exists()) {
    return normalizeDocRecord(directSnapshot.id, directSnapshot.data());
  }

  const byFieldSnapshot = await getDocs(
    query(collection(db, "interest_requests"), where("requestId", "==", normalized), limit(1))
  );

  const match = byFieldSnapshot.docs[0];
  return match ? normalizeDocRecord(match.id, match.data()) : null;
}

async function fetchRequestsByInvestmentId(investmentId: string) {
  const normalized = String(investmentId || "").trim();
  if (!normalized) return [];

  const snapshot = await getDocs(
    query(collection(db, "interest_requests"), where("investmentId", "==", normalized), limit(10))
  );

  return snapshot.docs.map((item) => normalizeDocRecord(item.id, item.data()));
}

async function fetchInvestmentForContractId(contractId: string) {
  const normalized = String(contractId || "").trim();
  if (!normalized) return null;

  const snapshot = await getDocs(
    query(collection(db, "investments"), where("contractId", "==", normalized), limit(2))
  );

  const docs = snapshot.docs.map((item) => normalizeDocRecord(item.id, item.data()));
  return {
    primary: docs[0] || null,
    duplicates: docs.slice(1),
  };
}

async function listFilesForInvestments(investmentIds: string[]) {
  const results: CloudflareFileRecord[] = [];
  const chunks = chunkArray(uniqueStrings(investmentIds), 25);

  for (const chunk of chunks) {
    if (!chunk.length) continue;
    const rows = await listDocumentMetadata({
      entityType: "investment",
      entityIds: chunk,
      categories: [...CONTRACT_FILE_CATEGORIES],
      limit: Math.min(200, Math.max(50, chunk.length * 8)),
    });
    results.push(...rows);
  }

  return results;
}

async function listFilesForContracts(contractIds: string[]) {
  const results: CloudflareFileRecord[] = [];
  for (const contractId of uniqueStrings(contractIds)) {
    const rows = await listDocumentMetadata({
      contractId,
      categories: [...CONTRACT_FILE_CATEGORIES],
      limit: 20,
    });
    results.push(...rows);
  }
  return results;
}

async function downloadAttachment(file: CloudflareFileRecord) {
  const url = buildR2DownloadUrl(file.filePath, true) || pickString(file.fileUrl);
  if (!url) {
    throw new Error("missing_download_url");
  }

  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`download_failed_${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

function buildReadme(manifest: ContractExportManifest) {
  return [
    "# MAEDIN Contract Export Package",
    "",
    `Generated at: ${manifest.generatedAt}`,
    `Mode: ${manifest.mode}`,
    "",
    "Contents:",
    "- investors.csv: investor records from Firestore users for the selected contract scope.",
    "- projects.csv: project records from Firestore projects for the selected contract scope.",
    "- investments.csv: investment records linked to the selected contracts.",
    "- contracts.csv: requested contract records from Firestore contracts.",
    "- interest_requests.csv: linked request records from Firestore interest_requests.",
    "- files.csv: contract file metadata catalog from Cloudflare D1 file_metadata.",
    "- attachments/: contract PDF binaries downloaded from Cloudflare R2.",
    "- manifest.json: package metadata, counts, and export warnings.",
    "",
    "Join keys:",
    "- investors.id <-> investments.investor_uid / contracts.investor_uid",
    "- projects.id <-> investments.project_id / contracts.project_id",
    "- investments.id <-> contracts.investment_id",
    "- interest_requests.id <-> investments.resolved_request_id / contracts.resolved_request_id",
    "- files.investment_id / files.contract_id <-> investments.id / contracts.id",
    "",
    "Notes:",
    "- This package is generated from the current live multi-source architecture without migration.",
    "- Firestore is used for business records, D1 for file metadata, and R2 for binary attachments.",
    "- When an attachment could not be downloaded, the file row remains in files.csv and the warning is recorded in manifest.json.",
    "",
  ].join("\n");
}

function collectRequestLinkIds(contract: ExportRecord, investment: ExportRecord | null) {
  return uniqueStrings([
    contract.requestId,
    contract.sourceRequestId,
    contract.sourceMessageId,
    contract.messageId,
    investment?.requestId,
    investment?.sourceRequestId,
    investment?.sourceMessageId,
    investment?.messageId,
  ]);
}

function resolveRequestId(
  contract: ExportRecord,
  investment: ExportRecord | null,
  requestsById: Map<string, ExportRecord>,
  requestsByInvestmentId: Map<string, ExportRecord[]>
) {
  const requestIds = collectRequestLinkIds(contract, investment);
  for (const requestId of requestIds) {
    const directMatch = requestsById.get(requestId);
    if (directMatch) return directMatch.id;

    const byFieldMatch = Array.from(requestsById.values()).find(
      (request) => pickString(request.requestId) === requestId
    );
    if (byFieldMatch) return byFieldMatch.id;
  }

  const investmentId = pickString(investment?.id, contract.investmentId);
  if (investmentId) {
    return requestsByInvestmentId.get(investmentId)?.[0]?.id || "";
  }

  return requestIds[0] || "";
}

function buildCandidateItem(record: ExportRecord): ContractExportCandidate {
  return {
    id: record.id,
    investmentId: pickString(record.investmentId),
    projectId: pickString(record.projectId),
    projectTitle: pickString(record.projectTitle),
    investorName: pickString(record.investorName),
    investorEmail: pickString(record.investorEmail),
    status: getContractStatusLabel(pickString(record.status)),
    createdAt: normalizeTimestamp(record.createdAt),
    updatedAt: normalizeTimestamp(record.updatedAt),
    signedAt: normalizeTimestamp(record.signedAt),
  };
}

export async function listContractExportCandidates(limitCount = DEFAULT_CANDIDATE_LIMIT) {
  const contractsRef = collection(db, "contracts");
  const attempts = [
    query(contractsRef, orderBy("updatedAt", "desc"), limit(limitCount)),
    query(contractsRef, orderBy("createdAt", "desc"), limit(limitCount)),
    query(contractsRef, limit(limitCount)),
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const snapshot = await getDocs(attempt);
      return snapshot.docs
        .map((item) => buildCandidateItem(normalizeDocRecord(item.id, item.data())))
        .sort(
          (left, right) =>
            compareIsoDesc(
              left.updatedAt || left.signedAt || left.createdAt,
              right.updatedAt || right.signedAt || right.createdAt
            ) || left.id.localeCompare(right.id)
        );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Failed to load contracts.");
}

export async function generateContractExportPackage(
  input: ContractExportInput
): Promise<ContractExportResult> {
  const requestedContractIds = uniqueStrings(input.contractIds);
  if (!requestedContractIds.length) {
    throw new Error("Please select at least one contract.");
  }

  const workerBaseUrl = String(getDocumentWorkerBaseUrl() || "").trim();
  if (!workerBaseUrl) {
    throw new Error("Document worker URL is not configured.");
  }

  const warnings: ContractExportWarning[] = [];
  const generatedAt = new Date().toISOString();

  const contractRecords = await fetchDocsByIds("contracts", requestedContractIds);
  const contractMap = new Map(contractRecords.map((record) => [record.id, record]));

  requestedContractIds.forEach((contractId) => {
    if (!contractMap.has(contractId)) {
      warnings.push({
        code: "contract_not_found",
        message: `Contract ${contractId} was requested but not found in Firestore.`,
        relatedIds: { contractId },
      });
    }
  });

  if (!contractRecords.length) {
    throw new Error("No matching contracts were found.");
  }

  const directInvestmentIds = uniqueStrings(contractRecords.map((record) => record.investmentId));
  const investmentMap = new Map<string, ExportRecord>();
  const investmentRecords = await fetchDocsByIds("investments", directInvestmentIds);
  investmentRecords.forEach((record) => {
    investmentMap.set(record.id, record);
  });

  for (const contract of contractRecords) {
    const directInvestmentId = pickString(contract.investmentId);
    if (directInvestmentId && investmentMap.has(directInvestmentId)) continue;

    const fallback = await fetchInvestmentForContractId(contract.id);
    if (fallback?.primary) {
      investmentMap.set(fallback.primary.id, fallback.primary);
      if (!directInvestmentId) {
        contract.investmentId = fallback.primary.id;
      }
    } else {
      warnings.push({
        code: "investment_missing",
        message: `No linked investment was found for contract ${contract.id}.`,
        relatedIds: { contractId: contract.id },
      });
    }

    fallback?.duplicates.forEach((duplicate) => {
      warnings.push({
        code: "duplicate_investment_link",
        message: `Additional investment ${duplicate.id} matched contract ${contract.id}.`,
        relatedIds: { contractId: contract.id, investmentId: duplicate.id },
      });
    });
  }

  const finalInvestmentRecords = Array.from(investmentMap.values()).sort((left, right) =>
    left.id.localeCompare(right.id)
  );

  const projectIds = uniqueStrings(
    contractRecords.flatMap((contract) => [
      contract.projectId,
      investmentMap.get(pickString(contract.investmentId))?.projectId,
    ])
  );
  const projectRecords = await fetchDocsByIds("projects", projectIds);

  const investorIds = uniqueStrings(
    contractRecords.flatMap((contract) => [
      contract.investorUid,
      investmentMap.get(pickString(contract.investmentId))?.investorUid,
      investmentMap.get(pickString(contract.investmentId))?.userId,
    ])
  );
  const investorRecords = await fetchDocsByIds("users", investorIds);

  const requestMap = new Map<string, ExportRecord>();
  const requestIdsByInvestmentId = new Map<string, ExportRecord[]>();
  const explicitRequestIds = uniqueStrings(
    contractRecords.flatMap((contract) =>
      collectRequestLinkIds(contract, investmentMap.get(pickString(contract.investmentId)) || null)
    )
  );

  for (const requestId of explicitRequestIds) {
    const requestRecord = await fetchInterestRequestByLinkId(requestId);
    if (requestRecord) {
      requestMap.set(requestRecord.id, requestRecord);
    }
  }

  for (const investment of finalInvestmentRecords) {
    const linkedRequests = await fetchRequestsByInvestmentId(investment.id);
    if (linkedRequests.length) {
      requestIdsByInvestmentId.set(investment.id, linkedRequests);
      linkedRequests.forEach((requestRecord) => {
        requestMap.set(requestRecord.id, requestRecord);
      });
    }
  }

  const filesById = new Map<string, CloudflareFileRecord>();
  const filesFromInvestments = await listFilesForInvestments(finalInvestmentRecords.map((record) => record.id));
  filesFromInvestments.forEach((file) => {
    filesById.set(file.id, file);
  });

  const contractsWithoutInvestment = contractRecords
    .filter((record) => !pickString(record.investmentId))
    .map((record) => record.id);
  const filesFromContracts = await listFilesForContracts(contractsWithoutInvestment);
  filesFromContracts.forEach((file) => {
    filesById.set(file.id, file);
  });

  const selectedContractIdSet = new Set(contractRecords.map((record) => record.id));
  const selectedInvestmentIdSet = new Set(finalInvestmentRecords.map((record) => record.id));
  const fileRecords = Array.from(filesById.values())
    .filter((file) => {
      if (file.contractId && !selectedContractIdSet.has(file.contractId)) return false;
      if (file.investmentId && !selectedInvestmentIdSet.has(file.investmentId)) return false;
      return true;
    })
    .sort(
      (left, right) =>
        compareIsoDesc(left.uploadedAt, right.uploadedAt) || left.id.localeCompare(right.id)
    );

  const attachmentEntries: AttachmentEntry[] = [];
  for (const file of fileRecords) {
    const packageRelPath = getAttachmentPackagePath(file);
    try {
      const data = await downloadAttachment(file);
      attachmentEntries.push({
        file,
        packageRelPath,
        binaryIncluded: true,
        data,
      });
    } catch (error) {
      warnings.push({
        code: "attachment_download_failed",
        message: `Failed to download contract attachment ${file.id}.`,
        relatedIds: {
          fileId: file.id,
          contractId: pickString(file.contractId),
          investmentId: pickString(file.investmentId),
        },
      });
      attachmentEntries.push({
        file,
        packageRelPath,
        binaryIncluded: false,
      });
      console.error("[contract-export] attachment download failed", file, error);
    }
  }

  const contractRows = contractRecords
    .map((contract) => {
      const investment = investmentMap.get(pickString(contract.investmentId)) || null;
      const resolvedProjectId = pickString(contract.projectId, investment?.projectId);
      const resolvedInvestorUid = pickString(
        contract.investorUid,
        investment?.investorUid,
        investment?.userId
      );
      const resolvedRequestId = resolveRequestId(
        contract,
        investment,
        requestMap,
        requestIdsByInvestmentId
      );

      return {
        id: contract.id,
        investment_id: pickString(contract.investmentId),
        resolved_investment_id: pickString(investment?.id, contract.investmentId),
        project_id: pickString(contract.projectId),
        resolved_project_id: resolvedProjectId,
        request_id: pickString(
          contract.requestId,
          contract.sourceRequestId,
          contract.sourceMessageId,
          contract.messageId
        ),
        resolved_request_id: resolvedRequestId,
        investor_uid: pickString(contract.investorUid),
        resolved_investor_uid: resolvedInvestorUid,
        project_title: pickString(contract.projectTitle, investment?.projectTitle),
        investor_name: pickString(contract.investorName, investment?.investorName),
        investor_email: pickString(contract.investorEmail, investment?.investorEmail),
        investor_phone: pickString(contract.investorPhone, investment?.investorPhone),
        amount: contract.amount ?? investment?.amount ?? "",
        currency: pickString(contract.currency, investment?.currency),
        status: pickString(contract.status, investment?.contractStatus),
        signing_at: normalizeTimestamp(contract.signingAt),
        signed_at: normalizeTimestamp(contract.signedAt),
        approved_at: normalizeTimestamp(contract.approvedAt),
        returned_at: normalizeTimestamp(contract.returnedAt),
        last_action_at: normalizeTimestamp(contract.lastActionAt),
        created_at: normalizeTimestamp(contract.createdAt),
        updated_at: normalizeTimestamp(contract.updatedAt),
        terms_json: jsonCell(contract.terms),
        legal_terms_snapshot_json: jsonCell(contract.legalTermsSnapshot),
        legal_reference_json: jsonCell(contract.legalReference),
        body: contract.body ?? "",
        return_note: contract.returnNote ?? "",
        raw_json: jsonCell(contract),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const investmentRows = finalInvestmentRecords
    .map((investment) => {
      const linkedContract = contractMap.get(pickString(investment.contractId));
      const resolvedRequestId = resolveRequestId(
        linkedContract || investment,
        investment,
        requestMap,
        requestIdsByInvestmentId
      );

      return {
        id: investment.id,
        contract_id: pickString(investment.contractId),
        request_id: pickString(investment.requestId),
        source_request_id: pickString(investment.sourceRequestId),
        source_message_id: pickString(investment.sourceMessageId),
        resolved_request_id: resolvedRequestId,
        project_id: pickString(investment.projectId),
        project_title: pickString(investment.projectTitle, linkedContract?.projectTitle),
        investor_uid: pickString(investment.investorUid, investment.userId),
        investor_name: pickString(investment.investorName),
        investor_email: pickString(investment.investorEmail),
        investor_phone: pickString(investment.investorPhone),
        amount: investment.amount ?? "",
        approved_amount: investment.approvedAmount ?? "",
        currency: pickString(investment.currency),
        status: pickString(investment.status),
        contract_status: pickString(investment.contractStatus),
        contract_version: investment.contractVersion ?? "",
        signed_against_contract_version: investment.signedAgainstContractVersion ?? "",
        requires_resign: investment.requiresResign ?? "",
        signed_contract_outdated: investment.signedContractOutdated ?? "",
        signing_at: normalizeTimestamp(investment.signingAt),
        signed_at: normalizeTimestamp(investment.signedAt),
        finalized_at: normalizeTimestamp(investment.finalizedAt),
        approved_at: normalizeTimestamp(investment.approvedAt),
        start_at: normalizeTimestamp(investment.startAt),
        planned_end_at: normalizeTimestamp(investment.plannedEndAt),
        created_at: normalizeTimestamp(investment.createdAt),
        updated_at: normalizeTimestamp(investment.updatedAt),
        project_title_at_sign: pickString(investment.projectTitleAtSign),
        legal_terms_snapshot_json: jsonCell(investment.legalTermsSnapshot),
        raw_json: jsonCell(investment),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const projectRows = projectRecords
    .map((project) => ({
      id: project.id,
      issue_number: pickString(project.issueNumber),
      title: pickString(project.title),
      title_ar: pickString(project.titleAr),
      project_type: pickString(project.projectType),
      status: pickString(project.status),
      target_amount: project.targetAmount ?? "",
      current_amount: project.currentAmount ?? "",
      pending_amount: project.pendingAmount ?? "",
      investors_count: project.investorsCount ?? "",
      min_investment: project.minInvestment ?? "",
      annual_return: project.annualReturn ?? project.investmentReturn ?? "",
      duration: project.duration ?? "",
      cover_image: pickString(project.coverImage),
      gallery_json: jsonCell(project.gallery),
      attachments_json: jsonCell(project.attachments),
      created_at: normalizeTimestamp(project.createdAt),
      updated_at: normalizeTimestamp(project.updatedAt),
      raw_json: jsonCell(project),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const investorRows = investorRecords
    .map((investor) => ({
      id: investor.id,
      uid: pickString(investor.uid, investor.id),
      display_name: pickString(investor.displayName, investor.name),
      email: pickString(investor.email),
      phone: pickString(investor.phone),
      role: pickString(investor.role),
      is_investor: investor.isInvestor ?? "",
      vip_status: investor.vipStatus ?? investor.isVip ?? "",
      total_invested: investor.totalInvested ?? "",
      expected_profit_total: investor.expectedProfitTotal ?? "",
      profit_to_date: investor.profitToDate ?? "",
      created_at: normalizeTimestamp(investor.createdAt),
      updated_at: normalizeTimestamp(investor.updatedAt),
      raw_json: jsonCell(investor),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const interestRequestRows = Array.from(requestMap.values())
    .map((requestRecord) => ({
      id: requestRecord.id,
      request_id: pickString(requestRecord.requestId, requestRecord.id),
      investment_id: pickString(requestRecord.investmentId),
      project_id: pickString(requestRecord.projectId),
      project_title: pickString(requestRecord.projectTitle),
      investor_uid: pickString(
        requestRecord.investorUid,
        requestRecord.userId,
        requestRecord.createdByUid
      ),
      user_id: pickString(requestRecord.userId),
      created_by_uid: pickString(requestRecord.createdByUid),
      investor_name: pickString(requestRecord.investorName),
      investor_email: pickString(requestRecord.investorEmail),
      investor_phone: pickString(requestRecord.investorPhone),
      amount: requestRecord.amount ?? "",
      approved_amount: requestRecord.approvedAmount ?? "",
      status: pickString(requestRecord.status),
      stage_role: pickString(requestRecord.stageRole),
      stage: pickString(requestRecord.stage),
      note: requestRecord.note ?? "",
      project_snapshot_json: jsonCell(requestRecord.projectSnapshot),
      user_snapshot_json: jsonCell(requestRecord.userSnapshot),
      events_json: jsonCell(requestRecord.events),
      created_at: normalizeTimestamp(requestRecord.createdAt),
      updated_at: normalizeTimestamp(requestRecord.updatedAt),
      raw_json: jsonCell(requestRecord),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const attachmentMap = new Map(attachmentEntries.map((entry) => [entry.file.id, entry]));
  const filesRows = fileRecords.map((file) => {
    const attachment = attachmentMap.get(file.id);
    return {
      id: file.id,
      kind: pickString(file.kind),
      category: pickString(file.category),
      entity_type: pickString(file.entityType),
      entity_id: pickString(file.entityId),
      project_id: pickString(file.projectId),
      investment_id: pickString(file.investmentId),
      contract_id: pickString(file.contractId),
      request_id: pickString(file.requestId),
      file_name: pickString(file.fileName),
      file_path: pickString(file.filePath),
      file_url: pickString(file.fileUrl),
      content_type: pickString(file.contentType),
      file_size: file.fileSize ?? "",
      uploaded_by: pickString(file.uploadedBy),
      uploaded_at: normalizeTimestamp(file.uploadedAt) || pickString(file.uploadedAt),
      status: pickString(file.status),
      version: file.version ?? "",
      bucket: pickString(file.bucket),
      package_rel_path: attachment?.packageRelPath || "",
      binary_included: attachment?.binaryIncluded ?? false,
    };
  });

  const counts: ContractExportCounts = {
    investors: investorRows.length,
    projects: projectRows.length,
    investments: investmentRows.length,
    contracts: contractRows.length,
    interestRequests: interestRequestRows.length,
    files: filesRows.length,
    attachments: attachmentEntries.filter((entry) => entry.binaryIncluded).length,
  };

  const manifest: ContractExportManifest = {
    packageVersion: "1.0.0",
    mode: "contract_export",
    generatedAt,
    requestedContractIds,
    exportedContractIds: contractRows.map((row) => String(row.id)),
    datasets: {
      investors: counts.investors,
      projects: counts.projects,
      investments: counts.investments,
      contracts: counts.contracts,
      interest_requests: counts.interestRequests,
      files: counts.files,
      attachments: counts.attachments,
    },
    sourceSummary: {
      firestoreCollections: ["users", "projects", "investments", "contracts", "interest_requests"],
      d1Catalog: "file_metadata",
      r2Attachments: "contract PDFs",
      workerBaseUrl,
    },
    warnings,
  };

  const zipEntries: ZipEntryInput[] = [
    {
      path: "investors.csv",
      data: buildCsv(
        [
          "id",
          "uid",
          "display_name",
          "email",
          "phone",
          "role",
          "is_investor",
          "vip_status",
          "total_invested",
          "expected_profit_total",
          "profit_to_date",
          "created_at",
          "updated_at",
          "raw_json",
        ],
        investorRows
      ),
    },
    {
      path: "projects.csv",
      data: buildCsv(
        [
          "id",
          "issue_number",
          "title",
          "title_ar",
          "project_type",
          "status",
          "target_amount",
          "current_amount",
          "pending_amount",
          "investors_count",
          "min_investment",
          "annual_return",
          "duration",
          "cover_image",
          "gallery_json",
          "attachments_json",
          "created_at",
          "updated_at",
          "raw_json",
        ],
        projectRows
      ),
    },
    {
      path: "investments.csv",
      data: buildCsv(
        [
          "id",
          "contract_id",
          "request_id",
          "source_request_id",
          "source_message_id",
          "resolved_request_id",
          "project_id",
          "project_title",
          "investor_uid",
          "investor_name",
          "investor_email",
          "investor_phone",
          "amount",
          "approved_amount",
          "currency",
          "status",
          "contract_status",
          "contract_version",
          "signed_against_contract_version",
          "requires_resign",
          "signed_contract_outdated",
          "signing_at",
          "signed_at",
          "finalized_at",
          "approved_at",
          "start_at",
          "planned_end_at",
          "created_at",
          "updated_at",
          "project_title_at_sign",
          "legal_terms_snapshot_json",
          "raw_json",
        ],
        investmentRows
      ),
    },
    {
      path: "contracts.csv",
      data: buildCsv(
        [
          "id",
          "investment_id",
          "resolved_investment_id",
          "project_id",
          "resolved_project_id",
          "request_id",
          "resolved_request_id",
          "investor_uid",
          "resolved_investor_uid",
          "project_title",
          "investor_name",
          "investor_email",
          "investor_phone",
          "amount",
          "currency",
          "status",
          "signing_at",
          "signed_at",
          "approved_at",
          "returned_at",
          "last_action_at",
          "created_at",
          "updated_at",
          "terms_json",
          "legal_terms_snapshot_json",
          "legal_reference_json",
          "body",
          "return_note",
          "raw_json",
        ],
        contractRows
      ),
    },
    {
      path: "interest_requests.csv",
      data: buildCsv(
        [
          "id",
          "request_id",
          "investment_id",
          "project_id",
          "project_title",
          "investor_uid",
          "user_id",
          "created_by_uid",
          "investor_name",
          "investor_email",
          "investor_phone",
          "amount",
          "approved_amount",
          "status",
          "stage_role",
          "stage",
          "note",
          "project_snapshot_json",
          "user_snapshot_json",
          "events_json",
          "created_at",
          "updated_at",
          "raw_json",
        ],
        interestRequestRows
      ),
    },
    {
      path: "files.csv",
      data: buildCsv(
        [
          "id",
          "kind",
          "category",
          "entity_type",
          "entity_id",
          "project_id",
          "investment_id",
          "contract_id",
          "request_id",
          "file_name",
          "file_path",
          "file_url",
          "content_type",
          "file_size",
          "uploaded_by",
          "uploaded_at",
          "status",
          "version",
          "bucket",
          "package_rel_path",
          "binary_included",
        ],
        filesRows
      ),
    },
    {
      path: "manifest.json",
      data: JSON.stringify(manifest, null, 2),
    },
    {
      path: "README.md",
      data: buildReadme(manifest),
    },
  ];

  attachmentEntries
    .filter((entry) => entry.binaryIncluded && entry.data)
    .forEach((entry) => {
      zipEntries.push({
        path: entry.packageRelPath,
        data: entry.data as Uint8Array,
        lastModified: entry.file.uploadedAt || generatedAt,
      });
    });

  const blob = await buildStoredZip(zipEntries);
  const fileName = buildExportFileName(manifest.exportedContractIds, generatedAt);

  return {
    blob,
    fileName,
    manifest,
    summary: {
      fileName,
      generatedAt,
      requestedContractCount: requestedContractIds.length,
      exportedContractCount: manifest.exportedContractIds.length,
      attachmentCount: counts.attachments,
      warningCount: warnings.length,
      rowCounts: counts,
    },
  };
}
