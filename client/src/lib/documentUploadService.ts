export type InvestmentDocumentKind = "original" | "signed" | "attachment";

export interface UploadDocumentInput {
  investmentId: string;
  file: File;
  kind: InvestmentDocumentKind;
}

export interface UploadDocumentResult {
  ok: boolean;
  path: string;
  fileName: string;
  kind: InvestmentDocumentKind;
  contentType: string;
  bucket?: string;
}

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const R2_UPLOAD_WORKER_URL = String(import.meta.env.VITE_R2_UPLOAD_WORKER_URL || "").trim();
const R2_DOWNLOAD_WORKER_URL = String(import.meta.env.VITE_R2_DOWNLOAD_WORKER_URL || "").trim();

function isPdfFile(file: File) {
  if (!file) return false;
  const mime = String(file.type || "").trim().toLowerCase();
  const name = String(file.name || "").trim().toLowerCase();
  return mime === "application/pdf" || name.endsWith(".pdf");
}

function expectedContractPath(investmentId: string, kind: InvestmentDocumentKind) {
  if (kind === "original") return `contracts/${investmentId}/original.pdf`;
  if (kind === "signed") return `contracts/${investmentId}/signed.pdf`;
  return "";
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

function normalizeWorkerResponse(
  raw: any,
  fallbackKind: InvestmentDocumentKind,
  fallbackType: string
): UploadDocumentResult {
  const ok = Boolean(raw?.ok);
  const path = String(raw?.path || "").trim();
  const fileName = String(raw?.fileName || "").trim();
  const kind = String(raw?.kind || fallbackKind).trim() as InvestmentDocumentKind;
  const contentType = String(raw?.contentType || fallbackType || "application/octet-stream").trim();

  if (!ok) {
    throw new Error(String(raw?.message || "Upload failed."));
  }

  if (!path) {
    throw new Error("Worker response missing path.");
  }

  if (!fileName) {
    throw new Error("Worker response missing fileName.");
  }

  if (!kind || !["original", "signed", "attachment"].includes(kind)) {
    throw new Error("Worker response has invalid kind.");
  }

  return {
    ok: true,
    path,
    fileName,
    kind,
    contentType,
    ...(raw?.bucket ? { bucket: String(raw.bucket) } : {}),
  };
}

function normalizeUploadErrorMessage(raw: any) {
  const msg = String(raw || "").trim().toLowerCase();
  if (!msg) return "Upload failed";
  if (
    msg.includes("unsupported_file_type") ||
    msg.includes("contract_files_must_be_pdf") ||
    msg.includes("please select a pdf file")
  ) {
    return "Please select a PDF file";
  }
  return "Upload failed";
}

export function buildR2DownloadUrl(path: string, forceDownload = false) {
  const objectPath = String(path || "").trim();
  if (!objectPath) return "";
  const baseUrl = R2_DOWNLOAD_WORKER_URL || R2_UPLOAD_WORKER_URL;
  if (!baseUrl) return "";
  try {
    const url = new URL(baseUrl);
    url.pathname = "/download";
    url.search = "";
    url.hash = "";
    url.searchParams.set("path", objectPath);
    if (forceDownload) {
      url.searchParams.set("download", "1");
    }
    return url.toString();
  } catch {
    return "";
  }
}

export async function uploadInvestmentDocument(
  input: UploadDocumentInput
): Promise<UploadDocumentResult> {
  const investmentId = String(input.investmentId || "").trim();
  const { file } = input;
  const kind = String(input.kind || "").trim().toLowerCase() as InvestmentDocumentKind;

  if (!investmentId) {
    throw new Error("investmentId is required.");
  }

  if (!kind || !["original", "signed", "attachment"].includes(kind)) {
    throw new Error("kind is required.");
  }

  validateUploadFile(file, kind);

  if (!R2_UPLOAD_WORKER_URL) {
    throw new Error("Missing VITE_R2_UPLOAD_WORKER_URL.");
  }

  const form = new FormData();
  form.append("investmentId", investmentId);
  form.append("kind", kind);
  form.append("file", file, file.name);

  const response = await fetch(R2_UPLOAD_WORKER_URL, {
    method: "POST",
    body: form,
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      normalizeUploadErrorMessage(payload?.message || payload?.error || response.statusText)
    );
  }

  const normalized = normalizeWorkerResponse(payload, kind, file.type || "application/pdf");
  const expectedPath = expectedContractPath(investmentId, normalized.kind);
  if (expectedPath && normalized.path !== expectedPath) {
    throw new Error("Upload failed");
  }
  return normalized;
}
