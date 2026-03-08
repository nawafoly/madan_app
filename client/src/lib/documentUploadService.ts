import { httpsCallable } from "firebase/functions";
import { auth, fbFunctions } from "../_core/firebase";

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

export interface UploadDocumentOptions {
  strategy?: "worker" | "callable";
}

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Upload architecture (do not break):
// 1) File storage is handled by R2 via the worker endpoint.
// 2) A successful worker response means upload is successful.
// 3) Firestore / Cloud Functions metadata sync is optional and must NEVER block upload success.
const R2_UPLOAD_WORKER_URL = String(import.meta.env.VITE_R2_UPLOAD_WORKER_URL || "").trim();
const uploadContractToR2Callable = httpsCallable(fbFunctions, "uploadContractToR2");
const syncInvestmentContractMetadataCallable = httpsCallable(
  fbFunctions,
  "syncInvestmentContractMetadata"
);
const SHOULD_SYNC_METADATA = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_ENABLE_OPTIONAL_METADATA_SYNC || "")
    .trim()
    .toLowerCase()
);

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

function validateUploadFile(file: File) {
  if (!file) {
    throw new Error("Please select a PDF file");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File is too large. Max allowed size is ${MAX_FILE_SIZE_MB}MB.`);
  }

  if (!isPdfFile(file)) {
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const marker = "base64,";
      const markerIndex = result.indexOf(marker);
      const encoded =
        markerIndex >= 0 ? result.slice(markerIndex + marker.length).trim() : result.trim();
      if (!encoded) {
        reject(new Error("Upload failed"));
        return;
      }
      resolve(encoded);
    };
    reader.onerror = () => reject(new Error("Upload failed"));
    reader.readAsDataURL(file);
  });
}

async function syncInvestmentDocumentMetadata(
  investmentId: string,
  upload: UploadDocumentResult,
  uploadedBy: string | null
) {
  // Optional by design: disabled by default to avoid any dependency on callable functions.
  // Enable only when the backend callable is deployed and intentionally used.
  if (!SHOULD_SYNC_METADATA) return;

  try {
    await syncInvestmentContractMetadataCallable({
      investmentId,
      kind: upload.kind,
      path: upload.path,
      fileName: upload.fileName,
      contentType: upload.contentType,
      uploadedBy: uploadedBy || null,
    });
  } catch (error: any) {
    // Optional non-blocking sync:
    // If callable is missing, blocked by CORS, or project plan doesn't support deployment,
    // upload must still be considered successful because the file is already stored in R2.
    console.warn("[upload] optional metadata sync skipped", {
      investmentId,
      kind: upload.kind,
      error,
    });
  }
}

export async function uploadInvestmentDocument(
  input: UploadDocumentInput,
  options: UploadDocumentOptions = {}
): Promise<UploadDocumentResult> {
  const investmentId = String(input.investmentId || "").trim();
  const { file } = input;
  const kind = String(input.kind || "").trim().toLowerCase() as InvestmentDocumentKind;
  const strategy = String(options.strategy || "worker").trim().toLowerCase();

  if (!investmentId) {
    throw new Error("investmentId is required.");
  }

  if (!kind || !["original", "signed", "attachment"].includes(kind)) {
    throw new Error("kind is required.");
  }

  validateUploadFile(file);

  const currentUser = auth.currentUser;
  if (!currentUser?.uid) {
    throw new Error("Authentication required.");
  }

  if (strategy === "callable") {
    const encoded = await fileToBase64(file);
    try {
      const callableRes = await uploadContractToR2Callable({
        investmentId,
        kind,
        fileName: file.name || "signed.pdf",
        contentType: "application/pdf",
        base64: encoded,
      });
      const raw = callableRes?.data as any;
      const normalized = normalizeWorkerResponse(
        {
          ok: raw?.ok,
          path: raw?.path,
          fileName: raw?.fileName,
          kind: raw?.kind,
          contentType: "application/pdf",
          bucket: raw?.bucket,
        },
        kind,
        file.type || "application/pdf"
      );
      const expectedPath = expectedContractPath(investmentId, normalized.kind);
      if (expectedPath && normalized.path !== expectedPath) {
        throw new Error("Upload failed");
      }
      return normalized;
    } catch (error: any) {
      throw new Error(
        normalizeUploadErrorMessage(error?.message || error?.details || "Upload failed")
      );
    }
  }

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

  // Metadata sync is intentionally fire-and-forget so upload success depends only on R2.
  void syncInvestmentDocumentMetadata(investmentId, normalized, currentUser.uid);
  return normalized;
}
