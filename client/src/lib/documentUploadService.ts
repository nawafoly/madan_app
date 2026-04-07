export type InvestmentDocumentKind = "original" | "signed" | "attachment";

export type FileEntityType = "project" | "investment" | "request" | "contract" | string;
export type FileCategory =
  | "project_cover"
  | "project_gallery"
  | "project_attachment"
  | "contract_original"
  | "contract_signed"
  | "investment_settlement"
  | "career_attachment"
  | string;

export interface CloudflareFileRecord {
  id: string;
  kind: InvestmentDocumentKind;
  category: FileCategory;
  entityType: FileEntityType;
  entityId: string;
  projectId?: string | null;
  investmentId?: string | null;
  contractId?: string | null;
  requestId?: string | null;
  fileName: string;
  filePath: string;
  fileUrl: string;
  contentType: string;
  fileSize: number;
  uploadedBy?: string | null;
  uploadedAt: string;
  status: string;
  version?: number | null;
  bucket?: string | null;
}

export interface UploadDocumentInput {
  entityType: FileEntityType;
  entityId: string;
  category: FileCategory;
  file: File;
  kind: InvestmentDocumentKind;
  projectId?: string;
  investmentId?: string;
  contractId?: string;
  requestId?: string;
  uploadedBy?: string;
  status?: string;
  version?: number | null;
  storageFolder?: string;
}

export interface UploadDocumentResult extends CloudflareFileRecord {
  ok: boolean;
  path: string;
}

export interface ListDocumentMetadataQuery {
  entityType?: FileEntityType;
  entityId?: string;
  entityIds?: string[];
  category?: FileCategory;
  categories?: FileCategory[];
  projectId?: string;
  investmentId?: string;
  contractId?: string;
  requestId?: string;
  status?: string;
  limit?: number;
}

export type DocumentStorageServiceState = "success" | "failed" | "not_ready";

export interface DocumentStorageServiceHealth {
  status: DocumentStorageServiceState;
  message: string | null;
  detail: string | null;
}

export type DocumentStorageMetricSource = "d1" | "r2" | null;

export interface DocumentStorageMetricsSnapshot {
  totalFiles: number | null;
  totalBytes: number | null;
  latestUploadAt: string | null;
  d1Records: number | null;
}

export interface DocumentStorageMetricSources {
  totalFiles: DocumentStorageMetricSource;
  totalBytes: DocumentStorageMetricSource;
  latestUploadAt: DocumentStorageMetricSource;
  d1Records: DocumentStorageMetricSource;
}

export interface DocumentStorageDashboardSnapshot {
  checkedAt: string | null;
  services: {
    worker: DocumentStorageServiceHealth;
    d1: DocumentStorageServiceHealth;
    r2: DocumentStorageServiceHealth;
  };
  metrics: DocumentStorageMetricsSnapshot;
  sources: DocumentStorageMetricSources;
}

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ARCHITECTURE NOTE (2026-03-12):
// Files are stored in Cloudflare R2.
// File metadata is stored in Cloudflare D1.
// Do not reintroduce Firestore metadata writes into this upload flow.
// Cloudflare R2 upload endpoint. This must point to the Worker that writes the
// binary object to R2 and persists the metadata record in D1.
const R2_UPLOAD_WORKER_URL = String(import.meta.env.VITE_R2_UPLOAD_WORKER_URL || "").trim();
const R2_DOWNLOAD_WORKER_URL = String(import.meta.env.VITE_R2_DOWNLOAD_WORKER_URL || "").trim();
const UPLOAD_PROBE_RETRIES = 5;
const UPLOAD_PROBE_DELAY_MS = 750;

function isPdfFile(file: File) {
  if (!file) return false;
  const mime = String(file.type || "").trim().toLowerCase();
  const name = String(file.name || "").trim().toLowerCase();
  return mime === "application/pdf" || name.endsWith(".pdf");
}

function validateUploadFile(file: File, kind: InvestmentDocumentKind) {
  if (!file) {
    throw new Error("Please select a file");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File is too large. Max allowed size is ${MAX_FILE_SIZE_MB}MB.`);
  }

  const isContract = kind === "original" || kind === "signed";
  if (isContract && !isPdfFile(file)) {
    throw new Error("Please select a PDF file");
  }
}

function sanitizeKeyPart(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_");
}

function sanitizeStorageFolder(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");

  return normalized || "attachments";
}

function expectedUploadPrefixes(
  entityType: FileEntityType,
  entityId: string,
  category: FileCategory,
  storageFolder?: string
) {
  const safeEntityType = sanitizeKeyPart(entityType);
  const safeEntityId = sanitizeKeyPart(entityId);

  if (category === "career_attachment") {
    const prefixes = [`careers/${safeEntityId}/${sanitizeStorageFolder(storageFolder)}/`];
    const legacyCategoryPrefix = `careers/${safeEntityId}/${sanitizeKeyPart(category)}/`;

    if (!prefixes.includes(legacyCategoryPrefix)) {
      prefixes.push(legacyCategoryPrefix);
    }

    return prefixes;
  }

  if (category === "contract_original") {
    return [`${safeEntityType}s/${safeEntityId}/contracts/original`];
  }

  if (category === "contract_signed") {
    return [`${safeEntityType}s/${safeEntityId}/contracts/signed`];
  }

  if (category === "project_cover") {
    return [`${safeEntityType}s/${safeEntityId}/cover/`];
  }

  if (category === "project_gallery") {
    return [`${safeEntityType}s/${safeEntityId}/gallery/`];
  }

  if (category === "project_attachment") {
    return [`${safeEntityType}s/${safeEntityId}/attachments/`];
  }

  if (category === "investment_settlement") {
    return [`${safeEntityType}s/${safeEntityId}/settlement/`];
  }

  return [`${safeEntityType}s/${safeEntityId}/`];
}

function normalizeUploadErrorMessage(raw: any) {
  const original = String(raw || "").trim();
  const msg = original.toLowerCase();
  if (!msg) return "Upload failed";
  if (
    msg.includes("unsupported_file_type") ||
    msg.includes("contract_files_must_be_pdf") ||
    msg.includes("please select a pdf file")
  ) {
    return "Please select a PDF file";
  }
  return original.replace(/_/g, " ");
}

function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function getWorkerBaseUrl() {
  return R2_DOWNLOAD_WORKER_URL || R2_UPLOAD_WORKER_URL;
}

function buildWorkerUrl(pathname: string, params?: Record<string, string | undefined>) {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) return "";
  try {
    const url = new URL(baseUrl);
    url.pathname = pathname;
    url.search = "";
    url.hash = "";
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    return url.toString();
  } catch {
    return "";
  }
}

export function getDocumentWorkerBaseUrl() {
  return getWorkerBaseUrl();
}

export function buildDocumentWorkerUrl(
  pathname: string,
  params?: Record<string, string | undefined>
) {
  return buildWorkerUrl(pathname, params);
}

function normalizeOptionalString(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeOptionalNumber(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeWorkerRecord(raw: any, fallback?: Partial<CloudflareFileRecord>): CloudflareFileRecord {
  const source = raw?.file && typeof raw.file === "object" ? raw.file : raw;
  const id = String(source?.id || fallback?.id || "").trim();
  const filePath = String(source?.filePath || source?.path || fallback?.filePath || "").trim();
  const fileName = String(source?.fileName || fallback?.fileName || "").trim();
  const fileUrl = String(
    source?.fileUrl || source?.url || fallback?.fileUrl || buildR2DownloadUrl(filePath, false)
  ).trim();
  const category = String(source?.category || fallback?.category || "").trim();
  const entityType = String(source?.entityType || fallback?.entityType || "").trim();
  const entityId = String(source?.entityId || fallback?.entityId || "").trim();
  const kind = String(source?.kind || fallback?.kind || "attachment").trim() as InvestmentDocumentKind;
  const contentType = String(
    source?.contentType || fallback?.contentType || "application/octet-stream"
  ).trim();
  const fileSize = Number(source?.fileSize ?? fallback?.fileSize ?? 0);
  const uploadedAt = String(source?.uploadedAt || fallback?.uploadedAt || "").trim();
  const status = String(source?.status || fallback?.status || "uploaded").trim();

  if (!id) throw new Error("Worker response missing metadata id.");
  if (!filePath) throw new Error("Worker response missing filePath.");
  if (!fileName) throw new Error("Worker response missing fileName.");
  if (!fileUrl) throw new Error("Worker response missing fileUrl.");
  if (!category) throw new Error("Worker response missing category.");
  if (!entityType) throw new Error("Worker response missing entityType.");
  if (!entityId) throw new Error("Worker response missing entityId.");
  if (!uploadedAt) throw new Error("Worker response missing uploadedAt.");

  return {
    id,
    kind,
    category,
    entityType,
    entityId,
    projectId: normalizeOptionalString(source?.projectId ?? fallback?.projectId),
    investmentId: normalizeOptionalString(source?.investmentId ?? fallback?.investmentId),
    contractId: normalizeOptionalString(source?.contractId ?? fallback?.contractId),
    requestId: normalizeOptionalString(source?.requestId ?? fallback?.requestId),
    fileName,
    filePath,
    fileUrl,
    contentType,
    fileSize: Number.isFinite(fileSize) ? fileSize : 0,
    uploadedBy: normalizeOptionalString(source?.uploadedBy ?? fallback?.uploadedBy),
    uploadedAt,
    status,
    version: normalizeOptionalNumber(source?.version ?? fallback?.version),
    bucket: normalizeOptionalString(source?.bucket ?? fallback?.bucket),
  };
}

function normalizeUploadResponse(
  raw: any,
  input: UploadDocumentInput
): UploadDocumentResult {
  const success = Boolean(raw?.ok ?? raw?.success);
  if (!success) {
    throw new Error(String(raw?.message || "Upload failed."));
  }

  const normalized = normalizeWorkerRecord(raw, {
    kind: input.kind,
    category: input.category,
    entityType: input.entityType,
    entityId: input.entityId,
    projectId: input.projectId || null,
    investmentId: input.investmentId || null,
    contractId: input.contractId || null,
    requestId: input.requestId || null,
    uploadedBy: input.uploadedBy || null,
    version: input.version ?? null,
  });

  const expectedPrefixes = expectedUploadPrefixes(
    input.entityType,
    input.entityId,
    input.category,
    input.storageFolder
  );
  if (!expectedPrefixes.some((prefix) => normalized.filePath.startsWith(prefix))) {
    console.warn("[upload] unexpected file path prefix", {
      filePath: normalized.filePath,
      expectedPrefixes,
      entityType: input.entityType,
      entityId: input.entityId,
      category: input.category,
      storageFolder: input.storageFolder || null,
    });
    throw new Error("Upload failed");
  }

  return {
    ...normalized,
    ok: true,
    path: normalized.filePath,
  };
}

function buildProbeUrl(path: string) {
  return buildWorkerUrl("/download", {
    path: String(path || "").trim(),
    probe: "1",
  });
}

async function verifyUploadedPathExists(path: string) {
  const probeUrl = buildProbeUrl(path);
  if (!probeUrl) {
    console.warn("[upload] probe url unavailable", { path });
    return;
  }

  for (let attempt = 1; attempt <= UPLOAD_PROBE_RETRIES; attempt += 1) {
    console.log("[upload] probe request", { attempt, path, probeUrl });

    let response: Response;
    try {
      response = await fetch(probeUrl, { method: "GET" });
    } catch (error) {
      console.error("[upload] probe request failed", error, { attempt, path, probeUrl });
      if (attempt === UPLOAD_PROBE_RETRIES) {
        throw new Error("Uploaded file could not be verified in R2.");
      }
      await sleep(UPLOAD_PROBE_DELAY_MS);
      continue;
    }

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    console.log("[upload] probe response status", response.status, { attempt, path });
    console.log("[upload] probe response body", payload);

    if (response.ok && payload?.exists === true) {
      console.log("[upload] probe verified object exists", { attempt, path });
      return;
    }

    if (attempt < UPLOAD_PROBE_RETRIES) {
      await sleep(UPLOAD_PROBE_DELAY_MS);
    }
  }

  throw new Error("Uploaded file could not be verified in R2.");
}

export function buildR2DownloadUrl(path: string, forceDownload = false) {
  const objectPath = String(path || "").trim();
  if (!objectPath) return "";
  return buildWorkerUrl("/download", {
    path: objectPath,
    ...(forceDownload ? { download: "1" } : {}),
  });
}

export async function listDocumentMetadata(
  query: ListDocumentMetadataQuery
): Promise<CloudflareFileRecord[]> {
  const filesUrl = buildWorkerUrl("/files", {
    entityType: query.entityType ? String(query.entityType) : undefined,
    entityId: query.entityId ? String(query.entityId) : undefined,
    entityIds:
      query.entityIds && query.entityIds.length
        ? query.entityIds.map((value) => String(value).trim()).filter(Boolean).join(",")
        : undefined,
    category: query.category ? String(query.category) : undefined,
    categories:
      query.categories && query.categories.length
        ? query.categories.map((value) => String(value).trim()).filter(Boolean).join(",")
        : undefined,
    projectId: query.projectId ? String(query.projectId) : undefined,
    investmentId: query.investmentId ? String(query.investmentId) : undefined,
    contractId: query.contractId ? String(query.contractId) : undefined,
    requestId: query.requestId ? String(query.requestId) : undefined,
    status: query.status ? String(query.status) : undefined,
    limit: query.limit ? String(query.limit) : undefined,
  });

  if (!filesUrl) {
    throw new Error("Missing worker URL for file metadata.");
  }

  const response = await fetch(filesUrl, { method: "GET" });
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(String(payload?.message || "Failed to load file metadata."));
  }

  const rows = Array.isArray(payload?.files) ? payload.files : [];
  return rows.map((row: any) => normalizeWorkerRecord(row));
}

function normalizeDashboardServiceState(value: unknown): DocumentStorageServiceState {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "success" || normalized === "failed" || normalized === "not_ready") {
    return normalized;
  }
  return "failed";
}

function normalizeMetricSource(value: unknown): DocumentStorageMetricSource {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "d1" || normalized === "r2") return normalized;
  return null;
}

function normalizeDashboardService(raw: any): DocumentStorageServiceHealth {
  return {
    status: normalizeDashboardServiceState(raw?.status),
    message: normalizeOptionalString(raw?.message),
    detail: normalizeOptionalString(raw?.detail),
  };
}

function normalizeIsoString(value: unknown) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeNullableMetricNumber(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

function normalizeDashboardSnapshot(raw: any): DocumentStorageDashboardSnapshot {
  return {
    checkedAt: normalizeIsoString(raw?.checkedAt),
    services: {
      worker: normalizeDashboardService(raw?.services?.worker),
      d1: normalizeDashboardService(raw?.services?.d1),
      r2: normalizeDashboardService(raw?.services?.r2),
    },
    metrics: {
      totalFiles: normalizeNullableMetricNumber(raw?.metrics?.totalFiles),
      totalBytes: normalizeNullableMetricNumber(raw?.metrics?.totalBytes),
      latestUploadAt: normalizeIsoString(raw?.metrics?.latestUploadAt),
      d1Records: normalizeNullableMetricNumber(raw?.metrics?.d1Records),
    },
    sources: {
      totalFiles: normalizeMetricSource(raw?.sources?.totalFiles),
      totalBytes: normalizeMetricSource(raw?.sources?.totalBytes),
      latestUploadAt: normalizeMetricSource(raw?.sources?.latestUploadAt),
      d1Records: normalizeMetricSource(raw?.sources?.d1Records),
    },
  };
}

export async function fetchDocumentStorageDashboardSnapshot(): Promise<DocumentStorageDashboardSnapshot> {
  const statsUrl = buildWorkerUrl("/stats");
  if (!statsUrl) {
    throw new Error("Missing worker URL for document storage.");
  }

  const response = await fetch(statsUrl, { method: "GET" });
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(String(payload?.message || "Failed to load document storage snapshot."));
  }

  return normalizeDashboardSnapshot(payload);
}

export function groupLatestFilesByEntityAndCategory(
  records: CloudflareFileRecord[]
) {
  const grouped: Record<string, Record<string, CloudflareFileRecord>> = {};

  records.forEach((record) => {
    const entityId = String(record.entityId || "").trim();
    const category = String(record.category || "").trim();
    if (!entityId || !category) return;
    grouped[entityId] ||= {};
    if (!grouped[entityId][category]) {
      grouped[entityId][category] = record;
    }
  });

  return grouped;
}

export function groupFilesByCategory(records: CloudflareFileRecord[]) {
  const grouped: Record<string, CloudflareFileRecord[]> = {};
  records.forEach((record) => {
    const category = String(record.category || "").trim();
    if (!category) return;
    grouped[category] ||= [];
    grouped[category].push(record);
  });
  return grouped;
}

export function pickLatestFileByCategory(
  records: CloudflareFileRecord[],
  category: FileCategory
) {
  return records.find((record) => String(record.category || "").trim() === String(category).trim()) || null;
}

// STEP 1 (Cloudflare R2):
// Upload the binary to Cloudflare Worker + R2 first.
// STEP 2 (Cloudflare D1):
// The Worker persists file metadata in D1 and returns the final record.
// Do not add Firestore metadata writes after this function.
export async function uploadDocumentToCloudflare(
  input: UploadDocumentInput
): Promise<UploadDocumentResult> {
  const entityId = String(input.entityId || "").trim();
  const entityType = String(input.entityType || "").trim();
  const category = String(input.category || "").trim();
  const { file } = input;
  const kind = String(input.kind || "").trim().toLowerCase() as InvestmentDocumentKind;

  try {
    if (!entityType) throw new Error("entityType is required.");
    if (!entityId) throw new Error("entityId is required.");
    if (!category) throw new Error("category is required.");
    if (!kind || !["original", "signed", "attachment"].includes(kind)) {
      throw new Error("kind is required.");
    }

    validateUploadFile(file, kind);

    console.log("[upload] start", {
      entityType,
      entityId,
      category,
      fileName: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
    });

    if (!R2_UPLOAD_WORKER_URL) {
      throw new Error("Missing VITE_R2_UPLOAD_WORKER_URL.");
    }

    console.log("[upload] worker url", R2_UPLOAD_WORKER_URL);

    const form = new FormData();
    form.append("entityType", entityType);
    form.append("entityId", entityId);
    form.append("category", category);
    form.append("kind", kind);
    form.append("file", file, file.name);

    if (input.projectId) form.append("projectId", input.projectId);
    if (input.investmentId) form.append("investmentId", input.investmentId);
    if (input.contractId) form.append("contractId", input.contractId);
    if (input.requestId) form.append("requestId", input.requestId);
    if (input.uploadedBy) form.append("uploadedBy", input.uploadedBy);
    if (input.status) form.append("status", input.status);
    if (input.storageFolder) form.append("storageFolder", input.storageFolder);
    if (input.version !== undefined && input.version !== null) {
      form.append("version", String(input.version));
    }

    console.log("[upload] sending request...");
    const response = await fetch(R2_UPLOAD_WORKER_URL, {
      method: "POST",
      body: form,
    });

    let payload: any = null;
    let responseText = "";
    try {
      responseText = await response.text();
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = null;
    }

    console.log("[upload] response status", response.status);
    console.log("[upload] response text", responseText);
    console.log("[upload] response body", payload);

    if (!response.ok) {
      throw new Error(
        normalizeUploadErrorMessage(payload?.message || payload?.error || response.statusText)
      );
    }

    const normalized = normalizeUploadResponse(payload, input);
    await verifyUploadedPathExists(normalized.filePath);
    console.log("[upload] upload verified", normalized);
    return normalized;
  } catch (error) {
    console.error("[upload] failed", error);
    throw error;
  }
}

// LEGACY NAME — DO NOT EXPAND
// This alias is kept temporarily so existing imports can migrate incrementally,
// but the implementation is Cloudflare Worker + R2 + D1 only.
export const uploadInvestmentDocument = uploadDocumentToCloudflare;
// LEGACY NAME - DO NOT EXPAND
// This ASCII duplicate comment exists because the older encoded comment above is
// still present in the file history and should not be relied on for future edits.
