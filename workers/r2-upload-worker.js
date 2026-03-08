/**
 * Cloudflare Worker for MAEDIN document uploads/downloads on R2.
 * Architecture contract:
 * - This worker is the source of truth for file storage success.
 * - Upload success must depend only on writing to R2.
 *
 * Required binding:
 * - R2 bucket binding name: R2_BUCKET
 *
 * Optional compatible binding names (fallback):
 * - MAEDIN_STORAGE
 * - BUCKET
 */

const ALLOWED_KINDS = new Set(["original", "signed", "attachment"]);

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    const bucket = getBucket(env);
    if (!bucket) {
      return json(500, {
        ok: false,
        message: "missing_r2_binding",
      });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/download") {
      return handleDownload(url, bucket);
    }

    if (request.method === "POST") {
      return handleUpload(request, bucket);
    }

    return json(405, {
      ok: false,
      message: "method_not_allowed",
    });
  },
};

function getBucket(env) {
  return env?.R2_BUCKET || env?.MAEDIN_STORAGE || env?.BUCKET || null;
}

async function handleUpload(request, bucket) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    return json(400, {
      ok: false,
      message: "expected_multipart_form_data",
    });
  }

  const form = await request.formData();
  const investmentId = normalizeInvestmentId(form.get("investmentId"));
  const kind = normalizeKind(form.get("kind"));
  const file = form.get("file");

  if (!investmentId || !kind || !(file instanceof File)) {
    return json(400, {
      ok: false,
      message: "missing data",
    });
  }

  const normalizedType = normalizeContentType(file.type, file.name);

  if ((kind === "original" || kind === "signed") && normalizedType !== "application/pdf") {
    return json(400, {
      ok: false,
      message: "contract_files_must_be_pdf",
    });
  }

  const uploadPath = buildUploadPath(investmentId, kind, file.name, normalizedType);
  const fileName = getFileNameFromPath(uploadPath);

  await bucket.put(uploadPath, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: normalizedType,
    },
    customMetadata: {
      investmentId,
      kind,
      uploadedAt: new Date().toISOString(),
      originalFileName: sanitizeFileName(file.name),
    },
  });

  return json(200, {
    ok: true,
    path: uploadPath,
    fileName,
    kind,
    contentType: normalizedType,
  });
}

async function handleDownload(url, bucket) {
  const path = normalizeObjectPath(url.searchParams.get("path"));
  const isProbe =
    String(url.searchParams.get("probe") || "").trim() === "1" ||
    String(url.searchParams.get("exists") || "").trim() === "1";
  if (!path) {
    return json(isProbe ? 200 : 400, {
      ok: false,
      exists: false,
      message: "invalid_path",
    });
  }

  const object = await bucket.get(path);
  if (!object) {
    if (isProbe) {
      return json(200, {
        ok: true,
        exists: false,
        path,
      });
    }
    return json(404, {
      ok: false,
      message: "file_not_found",
    });
  }

  if (isProbe) {
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    const contentType =
      headers.get("Content-Type") || inferContentTypeFromName(path) || "application/octet-stream";
    return json(200, {
      ok: true,
      exists: true,
      path,
      fileName: getFileNameFromPath(path),
      contentType,
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);

  const contentType =
    headers.get("Content-Type") || inferContentTypeFromName(path) || "application/octet-stream";
  const fileName = getFileNameFromPath(path);
  const forceDownloadRaw = String(url.searchParams.get("download") || "").trim().toLowerCase();
  const forceDownload = forceDownloadRaw === "1" || forceDownloadRaw === "true";
  const disposition =
    forceDownload || contentType !== "application/pdf" ? "attachment" : "inline";

  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", `${disposition}; filename="${toHeaderSafeFileName(fileName)}"`);
  headers.set("Cache-Control", "private, max-age=60");
  headers.set("X-Content-Type-Options", "nosniff");

  return withCors(
    new Response(object.body, {
      status: 200,
      headers,
    })
  );
}

function normalizeKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  return ALLOWED_KINDS.has(kind) ? kind : "";
}

function normalizeInvestmentId(value) {
  const id = String(value || "").trim();
  if (!id) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return "";
  return id;
}

function normalizeObjectPath(value) {
  const raw = String(value || "").trim().replace(/^\/+/, "");
  if (!raw) return "";
  if (raw.includes("..") || raw.includes("\\")) return "";
  if (!raw.startsWith("contracts/")) return "";
  return raw;
}

function sanitizeFileName(value) {
  const raw = String(value || "").trim();
  const cleaned = raw
    .replace(/[/\\]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return cleaned || "file";
}

function getFileNameFromPath(path) {
  const cleaned = String(path || "").replace(/\\/g, "/");
  const name = cleaned.split("/").pop() || "file";
  return sanitizeFileName(name);
}

function normalizeContentType(type, fileName) {
  const normalized = String(type || "").split(";")[0].trim().toLowerCase();
  if (normalized) return normalized;
  return inferContentTypeFromName(fileName) || "application/octet-stream";
}

function inferContentTypeFromName(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "";
}

function buildUploadPath(investmentId, kind, originalFileName, contentType) {
  if (kind === "original") {
    return `contracts/${investmentId}/original.pdf`;
  }

  if (kind === "signed") {
    return `contracts/${investmentId}/signed.pdf`;
  }

  const safeName = sanitizeFileName(originalFileName || "attachment");
  const ext = safeName.includes(".") ? "" : inferExtensionFromType(contentType);
  const stamp = Date.now();

  return `contracts/${investmentId}/attachments/${stamp}-${safeName}${ext}`;
}

function inferExtensionFromType(contentType) {
  if (contentType === "application/pdf") return ".pdf";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";
  if (contentType === "image/svg+xml") return ".svg";
  if (contentType === "image/avif") return ".avif";
  if (contentType === "text/plain") return ".txt";
  if (contentType === "text/csv") return ".csv";
  if (contentType === "application/json") return ".json";
  if (contentType === "application/zip") return ".zip";
  if (contentType === "application/msword") return ".doc";
  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return ".docx";
  }
  if (contentType === "application/vnd.ms-excel") return ".xls";
  if (contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return ".xlsx";
  }
  return "";
}

function toHeaderSafeFileName(value) {
  return String(value || "file")
    .replace(/[\r\n"]/g, "")
    .trim();
}

function json(status, payload) {
  return withCors(
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    })
  );
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
