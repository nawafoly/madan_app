import { db } from "@/_core/firebase";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";

import {
  buildR2DownloadUrl,
  getDocumentWorkerBaseUrl,
  listDocumentMetadata,
  type CloudflareFileRecord,
} from "@/lib/documentUploadService";
import { buildWorkbookXlsx, type XlsxColumn, type XlsxRow } from "@/lib/xlsxStore";
import { buildStoredZip, type ZipEntryInput } from "@/lib/zipStore";

const CONTRACT_FILE_CATEGORIES = ["contract_original", "contract_signed"] as const;

type ExportRecord = Record<string, any> & { id: string };

type BusinessExcelExportCounts = {
  investors: number;
  projects: number;
  investments: number;
  contracts: number;
  interestRequests: number;
  files: number;
};

type BusinessExcelExportWarning = {
  code: string;
  message: string;
  relatedIds?: Record<string, string>;
};

export type BusinessExcelExportSummary = {
  fileName: string;
  generatedAt: string;
  requestedContractCount: number;
  exportedContractCount: number;
  workbookCount: number;
  warningCount: number;
  rowCounts: BusinessExcelExportCounts;
};

export type BusinessExcelExportResult = {
  blob: Blob;
  fileName: string;
  summary: BusinessExcelExportSummary;
};

type BusinessExcelExportInput = {
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
    const date = new Date(seconds * 1000 + nanoseconds / 1_000_000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDisplayTimestamp(value: any) {
  const iso = normalizeTimestamp(value);
  return iso ? iso.replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : "";
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

function compareIsoDesc(left: string | null | undefined, right: string | null | undefined) {
  const leftTime = left ? Date.parse(left) : 0;
  const rightTime = right ? Date.parse(right) : 0;
  return rightTime - leftTime;
}

function toNullableNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function toYesNo(value: any) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return "";
  if (["1", "true", "yes"].includes(normalized)) return "Yes";
  if (["0", "false", "no"].includes(normalized)) return "No";
  return String(value);
}

function buildExportFileName(contractIds: string[], generatedAt: string) {
  const stamp = generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14);
  if (contractIds.length === 1) {
    return `maedin-contract-export-excel-${contractIds[0]}-${stamp}.zip`;
  }
  return `maedin-contract-export-excel-${contractIds.length}-contracts-${stamp}.zip`;
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
  const chunks = chunkArray(uniqueStrings(contractIds), 25);

  for (const chunk of chunks) {
    const rows = await Promise.all(
      chunk.map((contractId) =>
        listDocumentMetadata({
          contractId,
          categories: [...CONTRACT_FILE_CATEGORIES],
          limit: 20,
        })
      )
    );
    rows.forEach((group) => results.push(...group));
  }

  return results;
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

type CollectedBusinessExportData = {
  generatedAt: string;
  warnings: BusinessExcelExportWarning[];
  requestedContractIds: string[];
  contractRecords: ExportRecord[];
  investmentRecords: ExportRecord[];
  projectRecords: ExportRecord[];
  investorRecords: ExportRecord[];
  interestRequestRecords: ExportRecord[];
  fileRecords: CloudflareFileRecord[];
};

async function collectBusinessExportData(
  input: BusinessExcelExportInput
): Promise<CollectedBusinessExportData> {
  const requestedContractIds = uniqueStrings(input.contractIds);
  if (!requestedContractIds.length) {
    throw new Error("Please select at least one contract.");
  }

  const workerBaseUrl = String(getDocumentWorkerBaseUrl() || "").trim();
  if (!workerBaseUrl) {
    throw new Error("Document worker URL is not configured.");
  }

  const warnings: BusinessExcelExportWarning[] = [];
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
  const directInvestments = await fetchDocsByIds("investments", directInvestmentIds);
  directInvestments.forEach((record) => {
    investmentMap.set(record.id, record);
  });

  const fallbackContracts = contractRecords.filter((contract) => {
    const directInvestmentId = pickString(contract.investmentId);
    return !directInvestmentId || !investmentMap.has(directInvestmentId);
  });
  const fallbackResults = await Promise.all(
    fallbackContracts.map((contract) => fetchInvestmentForContractId(contract.id))
  );

  fallbackResults.forEach((fallback, index) => {
    const contract = fallbackContracts[index];
    const directInvestmentId = pickString(contract.investmentId);

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
  });

  const investmentRecords = Array.from(investmentMap.values()).sort((left, right) =>
    left.id.localeCompare(right.id)
  );

  const projectIds = uniqueStrings(
    contractRecords.flatMap((contract) => [
      contract.projectId,
      investmentMap.get(pickString(contract.investmentId))?.projectId,
    ])
  );
  const investorIds = uniqueStrings(
    contractRecords.flatMap((contract) => [
      contract.investorUid,
      investmentMap.get(pickString(contract.investmentId))?.investorUid,
      investmentMap.get(pickString(contract.investmentId))?.userId,
    ])
  );

  const [projectRecords, investorRecords] = await Promise.all([
    fetchDocsByIds("projects", projectIds),
    fetchDocsByIds("users", investorIds),
  ]);

  const requestMap = new Map<string, ExportRecord>();
  const requestIdsByInvestmentId = new Map<string, ExportRecord[]>();
  const explicitRequestIds = uniqueStrings(
    contractRecords.flatMap((contract) =>
      collectRequestLinkIds(contract, investmentMap.get(pickString(contract.investmentId)) || null)
    )
  );

  const explicitRequests = await Promise.all(
    explicitRequestIds.map((requestId) => fetchInterestRequestByLinkId(requestId))
  );
  explicitRequests.filter(Boolean).forEach((requestRecord) => {
    requestMap.set((requestRecord as ExportRecord).id, requestRecord as ExportRecord);
  });

  const linkedRequestGroups = await Promise.all(
    investmentRecords.map(async (investment) => ({
      investmentId: investment.id,
      requests: await fetchRequestsByInvestmentId(investment.id),
    }))
  );
  linkedRequestGroups.forEach(({ investmentId, requests }) => {
    if (!requests.length) return;
    requestIdsByInvestmentId.set(investmentId, requests);
    requests.forEach((requestRecord) => {
      requestMap.set(requestRecord.id, requestRecord);
    });
  });

  const filesById = new Map<string, CloudflareFileRecord>();
  const filesFromInvestments = await listFilesForInvestments(
    investmentRecords.map((record) => record.id)
  );
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
  const selectedInvestmentIdSet = new Set(investmentRecords.map((record) => record.id));
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

  return {
    generatedAt,
    warnings,
    requestedContractIds,
    contractRecords,
    investmentRecords,
    projectRecords: projectRecords.sort((left, right) => left.id.localeCompare(right.id)),
    investorRecords: investorRecords.sort((left, right) => left.id.localeCompare(right.id)),
    interestRequestRecords: Array.from(requestMap.values()).sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    fileRecords,
  };
}

function buildWorkbookEntry(
  fileName: string,
  title: string,
  sheetName: string,
  generatedAt: string,
  columns: XlsxColumn[],
  rows: XlsxRow[]
) {
  return buildWorkbookXlsx({
    title,
    creator: "MAEDIN",
    description: `Human-readable business export generated at ${generatedAt}`,
    sheets: [
      {
        name: sheetName,
        columns,
        rows,
      },
    ],
  }).then((blob) => ({
    path: fileName,
    data: blob,
    lastModified: generatedAt,
  }));
}

export async function generateBusinessExcelExport(
  input: BusinessExcelExportInput
): Promise<BusinessExcelExportResult> {
  const {
    generatedAt,
    warnings,
    requestedContractIds,
    contractRecords,
    investmentRecords,
    projectRecords,
    investorRecords,
    interestRequestRecords,
    fileRecords,
  } = await collectBusinessExportData(input);

  const contractMap = new Map(contractRecords.map((record) => [record.id, record]));
  const investmentMap = new Map(investmentRecords.map((record) => [record.id, record]));
  const requestMap = new Map(interestRequestRecords.map((record) => [record.id, record]));
  const requestsByInvestmentId = new Map<string, ExportRecord[]>();

  interestRequestRecords.forEach((requestRecord) => {
    const investmentId = pickString(requestRecord.investmentId);
    if (!investmentId) return;
    const current = requestsByInvestmentId.get(investmentId) || [];
    current.push(requestRecord);
    requestsByInvestmentId.set(investmentId, current);
  });

  const investorRows: XlsxRow[] = investorRecords.map((investor) => ({
    investor_record_id: investor.id,
    user_uid: pickString(investor.uid, investor.id),
    display_name: pickString(investor.displayName, investor.name),
    email: pickString(investor.email),
    phone: pickString(investor.phone),
    role: pickString(investor.role),
    investor_enabled: toYesNo(investor.isInvestor),
    vip_status: toYesNo(investor.vipStatus ?? investor.isVip),
    total_invested: toNullableNumber(investor.totalInvested),
    expected_profit_total: toNullableNumber(investor.expectedProfitTotal),
    profit_to_date: toNullableNumber(investor.profitToDate),
    created_at: formatDisplayTimestamp(investor.createdAt),
    updated_at: formatDisplayTimestamp(investor.updatedAt),
  }));

  const projectRows: XlsxRow[] = projectRecords.map((project) => ({
    project_id: project.id,
    issue_number: pickString(project.issueNumber),
    title: pickString(project.title),
    title_ar: pickString(project.titleAr),
    project_type: pickString(project.projectType),
    status: pickString(project.status),
    target_amount: toNullableNumber(project.targetAmount),
    current_amount: toNullableNumber(project.currentAmount),
    pending_amount: toNullableNumber(project.pendingAmount),
    investors_count: toNullableNumber(project.investorsCount),
    minimum_investment: toNullableNumber(project.minInvestment),
    annual_return: toNullableNumber(project.annualReturn ?? project.investmentReturn),
    duration: pickString(project.duration) || toNullableNumber(project.duration),
    created_at: formatDisplayTimestamp(project.createdAt),
    updated_at: formatDisplayTimestamp(project.updatedAt),
  }));

  const investmentRows: XlsxRow[] = investmentRecords.map((investment) => {
    const linkedContract = contractMap.get(pickString(investment.contractId));
    const resolvedRequestId = resolveRequestId(
      linkedContract || investment,
      investment,
      requestMap,
      requestsByInvestmentId
    );

    return {
      investment_id: investment.id,
      contract_id: pickString(investment.contractId),
      request_id: resolvedRequestId,
      project_id: pickString(investment.projectId),
      project_title: pickString(investment.projectTitle, linkedContract?.projectTitle),
      investor_uid: pickString(investment.investorUid, investment.userId),
      investor_name: pickString(investment.investorName),
      investor_email: pickString(investment.investorEmail),
      investor_phone: pickString(investment.investorPhone),
      amount: toNullableNumber(investment.amount),
      approved_amount: toNullableNumber(investment.approvedAmount),
      currency: pickString(investment.currency),
      status: pickString(investment.status),
      contract_status: pickString(investment.contractStatus),
      contract_version: pickString(investment.contractVersion),
      signed_against_version: pickString(investment.signedAgainstContractVersion),
      requires_resign: toYesNo(investment.requiresResign),
      signed_contract_outdated: toYesNo(investment.signedContractOutdated),
      signing_at: formatDisplayTimestamp(investment.signingAt),
      signed_at: formatDisplayTimestamp(investment.signedAt),
      finalized_at: formatDisplayTimestamp(investment.finalizedAt),
      approved_at: formatDisplayTimestamp(investment.approvedAt),
      start_at: formatDisplayTimestamp(investment.startAt),
      planned_end_at: formatDisplayTimestamp(investment.plannedEndAt),
      created_at: formatDisplayTimestamp(investment.createdAt),
      updated_at: formatDisplayTimestamp(investment.updatedAt),
    };
  });

  const contractRows: XlsxRow[] = contractRecords.map((contract) => {
    const investment = investmentMap.get(pickString(contract.investmentId)) || null;
    const resolvedRequestId = resolveRequestId(
      contract,
      investment,
      requestMap,
      requestsByInvestmentId
    );

    return {
      contract_id: contract.id,
      investment_id: pickString(investment?.id, contract.investmentId),
      project_id: pickString(contract.projectId, investment?.projectId),
      request_id: resolvedRequestId,
      investor_uid: pickString(contract.investorUid, investment?.investorUid, investment?.userId),
      project_title: pickString(contract.projectTitle, investment?.projectTitle),
      investor_name: pickString(contract.investorName, investment?.investorName),
      investor_email: pickString(contract.investorEmail, investment?.investorEmail),
      investor_phone: pickString(contract.investorPhone, investment?.investorPhone),
      amount: toNullableNumber(contract.amount ?? investment?.amount),
      currency: pickString(contract.currency, investment?.currency),
      status: pickString(contract.status, investment?.contractStatus),
      signing_at: formatDisplayTimestamp(contract.signingAt),
      signed_at: formatDisplayTimestamp(contract.signedAt),
      approved_at: formatDisplayTimestamp(contract.approvedAt),
      returned_at: formatDisplayTimestamp(contract.returnedAt),
      last_action_at: formatDisplayTimestamp(contract.lastActionAt),
      created_at: formatDisplayTimestamp(contract.createdAt),
      updated_at: formatDisplayTimestamp(contract.updatedAt),
    };
  });

  const interestRequestRows: XlsxRow[] = interestRequestRecords.map((requestRecord) => ({
    request_record_id: requestRecord.id,
    request_id: pickString(requestRecord.requestId, requestRecord.id),
    investment_id: pickString(requestRecord.investmentId),
    project_id: pickString(requestRecord.projectId),
    project_title: pickString(requestRecord.projectTitle),
    investor_uid: pickString(
      requestRecord.investorUid,
      requestRecord.userId,
      requestRecord.createdByUid
    ),
    investor_name: pickString(requestRecord.investorName),
    investor_email: pickString(requestRecord.investorEmail),
    investor_phone: pickString(requestRecord.investorPhone),
    amount: toNullableNumber(requestRecord.amount),
    approved_amount: toNullableNumber(requestRecord.approvedAmount),
    status: pickString(requestRecord.status),
    stage_role: pickString(requestRecord.stageRole),
    stage: pickString(requestRecord.stage),
    note: pickString(requestRecord.note),
    created_at: formatDisplayTimestamp(requestRecord.createdAt),
    updated_at: formatDisplayTimestamp(requestRecord.updatedAt),
  }));

  const filesRows: XlsxRow[] = fileRecords.map((file) => ({
    file_id: file.id,
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
    download_url: pickString(buildR2DownloadUrl(file.filePath, true), file.fileUrl),
    content_type: pickString(file.contentType),
    file_size_bytes: toNullableNumber(file.fileSize),
    uploaded_by: pickString(file.uploadedBy),
    uploaded_at: formatDisplayTimestamp(file.uploadedAt) || pickString(file.uploadedAt),
    status: pickString(file.status),
    version: toNullableNumber(file.version),
    bucket: pickString(file.bucket),
    has_r2_reference: toYesNo(Boolean(pickString(file.filePath))),
  }));

  const counts: BusinessExcelExportCounts = {
    investors: investorRows.length,
    projects: projectRows.length,
    investments: investmentRows.length,
    contracts: contractRows.length,
    interestRequests: interestRequestRows.length,
    files: filesRows.length,
  };

  const workbookEntries = await Promise.all<ZipEntryInput>([
    buildWorkbookEntry(
      "investors.xlsx",
      "MAEDIN Investors Export",
      "Investors",
      generatedAt,
      [
        { key: "investor_record_id", header: "Investor Record ID" },
        { key: "user_uid", header: "User UID" },
        { key: "display_name", header: "Display Name", width: 24 },
        { key: "email", header: "Email", width: 28 },
        { key: "phone", header: "Phone", width: 18 },
        { key: "role", header: "Role" },
        { key: "investor_enabled", header: "Investor Enabled" },
        { key: "vip_status", header: "VIP Status" },
        { key: "total_invested", header: "Total Invested" },
        { key: "expected_profit_total", header: "Expected Profit Total" },
        { key: "profit_to_date", header: "Profit To Date" },
        { key: "created_at", header: "Created At", width: 22 },
        { key: "updated_at", header: "Updated At", width: 22 },
      ],
      investorRows
    ),
    buildWorkbookEntry(
      "projects.xlsx",
      "MAEDIN Projects Export",
      "Projects",
      generatedAt,
      [
        { key: "project_id", header: "Project ID" },
        { key: "issue_number", header: "Issue Number" },
        { key: "title", header: "Title", width: 26 },
        { key: "title_ar", header: "Title (Arabic)", width: 26 },
        { key: "project_type", header: "Project Type" },
        { key: "status", header: "Status" },
        { key: "target_amount", header: "Target Amount" },
        { key: "current_amount", header: "Current Amount" },
        { key: "pending_amount", header: "Pending Amount" },
        { key: "investors_count", header: "Investors Count" },
        { key: "minimum_investment", header: "Minimum Investment" },
        { key: "annual_return", header: "Annual Return" },
        { key: "duration", header: "Duration" },
        { key: "created_at", header: "Created At", width: 22 },
        { key: "updated_at", header: "Updated At", width: 22 },
      ],
      projectRows
    ),
    buildWorkbookEntry(
      "investments.xlsx",
      "MAEDIN Investments Export",
      "Investments",
      generatedAt,
      [
        { key: "investment_id", header: "Investment ID" },
        { key: "contract_id", header: "Contract ID" },
        { key: "request_id", header: "Request ID" },
        { key: "project_id", header: "Project ID" },
        { key: "project_title", header: "Project Title", width: 26 },
        { key: "investor_uid", header: "Investor UID" },
        { key: "investor_name", header: "Investor Name", width: 22 },
        { key: "investor_email", header: "Investor Email", width: 28 },
        { key: "investor_phone", header: "Investor Phone", width: 18 },
        { key: "amount", header: "Amount" },
        { key: "approved_amount", header: "Approved Amount" },
        { key: "currency", header: "Currency" },
        { key: "status", header: "Status" },
        { key: "contract_status", header: "Contract Status" },
        { key: "contract_version", header: "Contract Version" },
        { key: "signed_against_version", header: "Signed Against Version" },
        { key: "requires_resign", header: "Requires Re-sign" },
        { key: "signed_contract_outdated", header: "Signed Contract Outdated" },
        { key: "signing_at", header: "Signing At", width: 22 },
        { key: "signed_at", header: "Signed At", width: 22 },
        { key: "finalized_at", header: "Finalized At", width: 22 },
        { key: "approved_at", header: "Approved At", width: 22 },
        { key: "start_at", header: "Start At", width: 22 },
        { key: "planned_end_at", header: "Planned End At", width: 22 },
        { key: "created_at", header: "Created At", width: 22 },
        { key: "updated_at", header: "Updated At", width: 22 },
      ],
      investmentRows
    ),
    buildWorkbookEntry(
      "contracts.xlsx",
      "MAEDIN Contracts Export",
      "Contracts",
      generatedAt,
      [
        { key: "contract_id", header: "Contract ID" },
        { key: "investment_id", header: "Investment ID" },
        { key: "project_id", header: "Project ID" },
        { key: "request_id", header: "Request ID" },
        { key: "investor_uid", header: "Investor UID" },
        { key: "project_title", header: "Project Title", width: 26 },
        { key: "investor_name", header: "Investor Name", width: 22 },
        { key: "investor_email", header: "Investor Email", width: 28 },
        { key: "investor_phone", header: "Investor Phone", width: 18 },
        { key: "amount", header: "Amount" },
        { key: "currency", header: "Currency" },
        { key: "status", header: "Status" },
        { key: "signing_at", header: "Signing At", width: 22 },
        { key: "signed_at", header: "Signed At", width: 22 },
        { key: "approved_at", header: "Approved At", width: 22 },
        { key: "returned_at", header: "Returned At", width: 22 },
        { key: "last_action_at", header: "Last Action At", width: 22 },
        { key: "created_at", header: "Created At", width: 22 },
        { key: "updated_at", header: "Updated At", width: 22 },
      ],
      contractRows
    ),
    buildWorkbookEntry(
      "interest_requests.xlsx",
      "MAEDIN Interest Requests Export",
      "Interest Requests",
      generatedAt,
      [
        { key: "request_record_id", header: "Request Record ID" },
        { key: "request_id", header: "Request ID" },
        { key: "investment_id", header: "Investment ID" },
        { key: "project_id", header: "Project ID" },
        { key: "project_title", header: "Project Title", width: 26 },
        { key: "investor_uid", header: "Investor UID" },
        { key: "investor_name", header: "Investor Name", width: 22 },
        { key: "investor_email", header: "Investor Email", width: 28 },
        { key: "investor_phone", header: "Investor Phone", width: 18 },
        { key: "amount", header: "Amount" },
        { key: "approved_amount", header: "Approved Amount" },
        { key: "status", header: "Status" },
        { key: "stage_role", header: "Stage Role" },
        { key: "stage", header: "Stage" },
        { key: "note", header: "Note", width: 28 },
        { key: "created_at", header: "Created At", width: 22 },
        { key: "updated_at", header: "Updated At", width: 22 },
      ],
      interestRequestRows
    ),
    buildWorkbookEntry(
      "files.xlsx",
      "MAEDIN Files Export",
      "Files",
      generatedAt,
      [
        { key: "file_id", header: "File ID" },
        { key: "kind", header: "Kind" },
        { key: "category", header: "Category" },
        { key: "entity_type", header: "Entity Type" },
        { key: "entity_id", header: "Entity ID" },
        { key: "project_id", header: "Project ID" },
        { key: "investment_id", header: "Investment ID" },
        { key: "contract_id", header: "Contract ID" },
        { key: "request_id", header: "Request ID" },
        { key: "file_name", header: "File Name", width: 26 },
        { key: "file_path", header: "File Path", width: 34 },
        { key: "file_url", header: "File URL", width: 34 },
        { key: "download_url", header: "Download URL", width: 34 },
        { key: "content_type", header: "Content Type", width: 22 },
        { key: "file_size_bytes", header: "File Size (Bytes)" },
        { key: "uploaded_by", header: "Uploaded By" },
        { key: "uploaded_at", header: "Uploaded At", width: 22 },
        { key: "status", header: "Status" },
        { key: "version", header: "Version" },
        { key: "bucket", header: "Bucket" },
        { key: "has_r2_reference", header: "Has R2 Reference" },
      ],
      filesRows
    ),
  ]);

  const blob = await buildStoredZip(workbookEntries);
  const fileName = buildExportFileName(contractRecords.map((record) => record.id), generatedAt);

  return {
    blob,
    fileName,
    summary: {
      fileName,
      generatedAt,
      requestedContractCount: requestedContractIds.length,
      exportedContractCount: contractRecords.length,
      workbookCount: workbookEntries.length,
      warningCount: warnings.length,
      rowCounts: counts,
    },
  };
}
