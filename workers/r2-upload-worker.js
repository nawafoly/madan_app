/**
 * ARCHITECTURE NOTE (2026-03-12):
 * Files are stored in Cloudflare R2.
 * File metadata is stored in Cloudflare D1.
 * Do not reintroduce Firestore metadata writes into this upload flow.
 *
 * Upload contract:
 * 1. Receive multipart form-data from the frontend.
 * 2. Upload the binary to R2.
 * 3. Insert the metadata record into D1.
 * 4. If the D1 insert fails, delete the R2 object before returning an error.
 */

const ALLOWED_KINDS = new Set(["original", "signed", "attachment"]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_STATUS = "uploaded";
const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    const bucket = getBucket(env);
    const db = getDatabase(env);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/download") {
      if (!bucket) {
        return json(500, {
          ok: false,
          success: false,
          message: "missing_r2_binding",
        });
      }
      return handleDownload(url, bucket);
    }

    if (request.method === "GET" && url.pathname === "/files") {
      if (!db) {
        return json(500, {
          ok: false,
          success: false,
          message: "missing_d1_binding",
        });
      }
      return handleList(url, db, request.url);
    }

    if (request.method === "GET" && url.pathname === "/stats") {
      return handleStats(bucket, db);
    }

    if (request.method === "POST" && (url.pathname === "/" || url.pathname === "/upload")) {
      if (!bucket) {
        return json(500, {
          ok: false,
          success: false,
          message: "missing_r2_binding",
        });
      }
      if (!db) {
        return json(500, {
          ok: false,
          success: false,
          message: "missing_d1_binding",
        });
      }
      return handleUpload(request, bucket, db);
    }

    return json(405, {
      ok: false,
      success: false,
      message: "method_not_allowed",
    });
  },
};

function getBucket(env) {
  return env?.R2_BUCKET || env?.MAEDIN_STORAGE || env?.BUCKET || null;
}

function getDatabase(env) {
  return env?.DOCUMENTS_DB || env?.DB || null;
}

async function handleUpload(request, bucket, db) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    return json(400, {
      ok: false,
      success: false,
      message: "expected_multipart_form_data",
    });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return json(400, {
      ok: false,
      success: false,
      message: "missing_file",
    });
  }

  if (file.size <= 0) {
    return json(400, {
      ok: false,
      success: false,
      message: "empty_file",
    });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return json(413, {
      ok: false,
      success: false,
      message: "file_too_large",
    });
  }

  const entityType = normalizeSlug(form.get("entityType"));
  const entityId = normalizeSlug(form.get("entityId"));
  const category = normalizeSlug(form.get("category"));
  const kind = normalizeKind(form.get("kind"));

  if (!entityType || !entityId || !category || !kind) {
    return json(400, {
      ok: false,
      success: false,
      message: "missing_required_fields",
    });
  }

  const normalizedType = normalizeContentType(file.type, file.name);
  if ((kind === "original" || kind === "signed") && normalizedType !== "application/pdf") {
    return json(400, {
      ok: false,
      success: false,
      message: "contract_files_must_be_pdf",
    });
  }

  const uploadedAt = new Date().toISOString();
  const storageFolder = normalizeSlug(form.get("storageFolder")) || "attachments";
  const filePath = buildUploadPath({
    entityType,
    entityId,
    category,
    kind,
    storageFolder,
    fileName: file.name,
    contentType: normalizedType,
  });
  const fileName = getFileNameFromPath(filePath);
  const fileUrl = buildDownloadUrl(request.url, filePath, false);
  const record = {
    id: crypto.randomUUID(),
    kind,
    category,
    entityType,
    entityId,
    projectId: normalizeNullableSlug(form.get("projectId")),
    investmentId: normalizeNullableSlug(form.get("investmentId")),
    contractId: normalizeNullableSlug(form.get("contractId")),
    requestId: normalizeNullableSlug(form.get("requestId")),
    fileName,
    filePath,
    fileUrl,
    contentType: normalizedType,
    fileSize: file.size,
    uploadedBy: normalizeNullableString(form.get("uploadedBy")),
    uploadedAt,
    status: normalizeStatus(form.get("status")) || DEFAULT_STATUS,
    version: normalizeNullableInteger(form.get("version")),
    bucket: "R2_BUCKET",
  };

  console.log("[worker] upload received", {
    entityType,
    entityId,
    category,
    kind,
    fileName: file.name,
    fileSize: file.size,
    contentType: normalizedType,
    uploadedBy: record.uploadedBy,
  });

  try {
    await bucket.put(filePath, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: normalizedType,
      },
      customMetadata: {
        entityType,
        entityId,
        category,
        kind,
        storageFolder,
        uploadedAt,
        originalFileName: sanitizeFileName(file.name),
      },
    });
    console.log("[worker] r2 upload success", {
      filePath,
      fileName,
      contentType: normalizedType,
      fileSize: file.size,
    });
  } catch (error) {
    console.error("[worker] failed", {
      stage: "r2_upload",
      message: errorToMessage(error),
      filePath,
    });
    return json(500, {
      ok: false,
      success: false,
      message: "r2_upload_failed",
      detail: errorToMessage(error),
    });
  }

  try {
    console.log("[worker] d1 upsert start", {
      id: record.id,
      filePath: record.filePath,
      category: record.category,
      entityType: record.entityType,
      entityId: record.entityId,
    });
    await insertFileMetadata(db, record);
    console.log("[worker] d1 upsert success", {
      id: record.id,
      filePath: record.filePath,
    });
    console.log("[worker] metadata id", record.id);
  } catch (error) {
    let cleanupDeleted = false;
    let cleanupError = "";

    try {
      await bucket.delete(filePath);
      cleanupDeleted = true;
    } catch (cleanupFailure) {
      cleanupError = errorToMessage(cleanupFailure);
    }

    console.error("[worker] failed", {
      stage: "d1_upsert",
      message: errorToMessage(error),
      filePath,
      cleanupDeleted,
      cleanupError,
    });

    return json(500, {
      ok: false,
      success: false,
      message: "metadata_write_failed",
      detail: errorToMessage(error),
      cleanupDeleted,
      cleanupError: cleanupError || undefined,
    });
  }

  const responsePayload = {
    ok: true,
    success: true,
    message: "upload_complete",
    id: record.id,
    path: record.filePath,
    kind: record.kind,
    url: record.fileUrl,
    fileName: record.fileName,
    contentType: record.contentType,
    fileSize: record.fileSize,
    file: record,
  };

  console.log("[worker] final response", responsePayload);

  return json(200, responsePayload);
}

async function handleList(url, db, requestUrl) {
  const filters = [];
  const bindings = [];

  const entityType = normalizeSlug(url.searchParams.get("entityType"));
  const entityId = normalizeSlug(url.searchParams.get("entityId"));
  const entityIds = normalizeCsvSlugs(url.searchParams.get("entityIds"));
  const category = normalizeSlug(url.searchParams.get("category"));
  const categories = normalizeCsvSlugs(url.searchParams.get("categories"));
  const projectId = normalizeNullableSlug(url.searchParams.get("projectId"));
  const investmentId = normalizeNullableSlug(url.searchParams.get("investmentId"));
  const contractId = normalizeNullableSlug(url.searchParams.get("contractId"));
  const requestId = normalizeNullableSlug(url.searchParams.get("requestId"));
  const status = normalizeStatus(url.searchParams.get("status"));
  const limit = clampLimit(url.searchParams.get("limit"));

  if (entityType) {
    filters.push("entity_type = ?");
    bindings.push(entityType);
  }

  if (entityId) {
    filters.push("entity_id = ?");
    bindings.push(entityId);
  }

  if (entityIds.length) {
    filters.push(`entity_id IN (${entityIds.map(() => "?").join(", ")})`);
    bindings.push(...entityIds);
  }

  if (category) {
    filters.push("category = ?");
    bindings.push(category);
  }

  if (categories.length) {
    filters.push(`category IN (${categories.map(() => "?").join(", ")})`);
    bindings.push(...categories);
  }

  if (projectId) {
    filters.push("project_id = ?");
    bindings.push(projectId);
  }

  if (investmentId) {
    filters.push("investment_id = ?");
    bindings.push(investmentId);
  }

  if (contractId) {
    filters.push("contract_id = ?");
    bindings.push(contractId);
  }

  if (requestId) {
    filters.push("request_id = ?");
    bindings.push(requestId);
  }

  if (status) {
    filters.push("status = ?");
    bindings.push(status);
  }

  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const statement = db
    .prepare(
      `
        SELECT
          id,
          kind,
          category,
          entity_type,
          entity_id,
          project_id,
          investment_id,
          contract_id,
          request_id,
          file_name,
          file_path,
          file_url,
          content_type,
          file_size,
          uploaded_by,
          uploaded_at,
          status,
          version,
          bucket
        FROM file_metadata
        ${whereSql}
        ORDER BY uploaded_at DESC
        LIMIT ?
      `
    )
    .bind(...bindings, limit);

  const result = await statement.all();
  const rows = Array.isArray(result?.results) ? result.results : [];

  return json(200, {
    ok: true,
    success: true,
    files: rows.map((row) => mapDbRowToFileRecord(row, requestUrl)),
  });
}

async function handleStats(bucket, db) {
  const checkedAt = new Date().toISOString();
  const [d1Stats, r2Stats] = await Promise.all([collectD1Stats(db), collectR2Stats(bucket)]);

  const totalFiles = r2Stats.ok ? r2Stats.totalFiles : d1Stats.ok ? d1Stats.totalFiles : null;
  const totalFilesSource = r2Stats.ok ? "r2" : d1Stats.ok ? "d1" : null;
  const totalBytes = r2Stats.ok ? r2Stats.totalBytes : d1Stats.ok ? d1Stats.totalBytes : null;
  const totalBytesSource = r2Stats.ok ? "r2" : d1Stats.ok ? "d1" : null;
  const latestUploadAt =
    d1Stats.ok && d1Stats.latestUploadAt
      ? d1Stats.latestUploadAt
      : r2Stats.ok && r2Stats.latestUploadAt
        ? r2Stats.latestUploadAt
        : null;
  const latestUploadAtSource =
    d1Stats.ok && d1Stats.latestUploadAt
      ? "d1"
      : r2Stats.ok && r2Stats.latestUploadAt
        ? "r2"
        : null;

  return json(200, {
    ok: true,
    success: true,
    checkedAt,
    services: {
      worker: {
        status: "success",
        message: "worker_reachable",
        detail: "stats_endpoint_responded",
      },
      d1: {
        status: d1Stats.status,
        message: d1Stats.message,
        detail: d1Stats.detail,
      },
      r2: {
        status: r2Stats.status,
        message: r2Stats.message,
        detail: r2Stats.detail,
      },
    },
    metrics: {
      totalFiles,
      totalBytes,
      latestUploadAt,
      d1Records: d1Stats.ok ? d1Stats.totalFiles : null,
    },
    sources: {
      totalFiles: totalFilesSource,
      totalBytes: totalBytesSource,
      latestUploadAt: latestUploadAtSource,
      d1Records: d1Stats.ok ? "d1" : null,
    },
  });
}

async function collectD1Stats(db) {
  if (!db) {
    return {
      ok: false,
      status: "not_ready",
      message: "missing_d1_binding",
      detail: "d1_binding_unavailable",
      totalFiles: null,
      totalBytes: null,
      latestUploadAt: null,
    };
  }

  try {
    const result = await db
      .prepare(
        `
          SELECT
            COUNT(*) AS total_files,
            COALESCE(SUM(file_size), 0) AS total_bytes,
            MAX(uploaded_at) AS latest_upload_at
          FROM file_metadata
        `
      )
      .all();

    const row = Array.isArray(result?.results) ? result.results[0] : null;

    return {
      ok: true,
      status: "success",
      message: "d1_query_ok",
      detail: "d1_metadata_aggregated",
      totalFiles: normalizeNonNegativeNumber(row?.total_files, 0),
      totalBytes: normalizeNonNegativeNumber(row?.total_bytes, 0),
      latestUploadAt: normalizeIsoDate(row?.latest_upload_at),
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: "d1_query_failed",
      detail: errorToMessage(error),
      totalFiles: null,
      totalBytes: null,
      latestUploadAt: null,
    };
  }
}

async function collectR2Stats(bucket) {
  if (!bucket) {
    return {
      ok: false,
      status: "not_ready",
      message: "missing_r2_binding",
      detail: "r2_binding_unavailable",
      totalFiles: null,
      totalBytes: null,
      latestUploadAt: null,
    };
  }

  try {
    let totalFiles = 0;
    let totalBytes = 0;
    let latestUploadAt = null;
    let cursor = undefined;
    let truncated = false;

    do {
      const page = await bucket.list(cursor ? { limit: 1000, cursor } : { limit: 1000 });
      const objects = Array.isArray(page?.objects) ? page.objects : [];

      totalFiles += objects.length;

      objects.forEach((object) => {
        totalBytes += normalizeNonNegativeNumber(object?.size, 0);
        const uploadedAt = normalizeIsoDate(object?.uploaded);
        if (uploadedAt && (!latestUploadAt || uploadedAt > latestUploadAt)) {
          latestUploadAt = uploadedAt;
        }
      });

      truncated = Boolean(page?.truncated);
      cursor = truncated ? normalizeNullableString(page?.cursor) || undefined : undefined;
    } while (truncated && cursor);

    return {
      ok: true,
      status: "success",
      message: "r2_list_ok",
      detail: "r2_objects_aggregated",
      totalFiles,
      totalBytes,
      latestUploadAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: "r2_list_failed",
      detail: errorToMessage(error),
      totalFiles: null,
      totalBytes: null,
      latestUploadAt: null,
    };
  }
}

async function handleDownload(url, bucket) {
  const path = normalizeObjectPath(url.searchParams.get("path"));
  const isProbe =
    String(url.searchParams.get("probe") || "").trim() === "1" ||
    String(url.searchParams.get("exists") || "").trim() === "1";

  if (!path) {
    return json(isProbe ? 200 : 400, {
      ok: false,
      success: false,
      exists: false,
      message: "invalid_path",
    });
  }

  const object = await bucket.get(path);
  if (!object) {
    if (isProbe) {
      return json(200, {
        ok: true,
        success: true,
        exists: false,
        path,
      });
    }

    return json(404, {
      ok: false,
      success: false,
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
      success: true,
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

async function insertFileMetadata(db, record) {
  await db
    .prepare(
      `
        INSERT INTO file_metadata (
          id,
          kind,
          category,
          entity_type,
          entity_id,
          project_id,
          investment_id,
          contract_id,
          request_id,
          file_name,
          file_path,
          file_url,
          content_type,
          file_size,
          uploaded_by,
          uploaded_at,
          status,
          version,
          bucket
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
          id = excluded.id,
          kind = excluded.kind,
          category = excluded.category,
          entity_type = excluded.entity_type,
          entity_id = excluded.entity_id,
          project_id = excluded.project_id,
          investment_id = excluded.investment_id,
          contract_id = excluded.contract_id,
          request_id = excluded.request_id,
          file_name = excluded.file_name,
          file_url = excluded.file_url,
          content_type = excluded.content_type,
          file_size = excluded.file_size,
          uploaded_by = excluded.uploaded_by,
          uploaded_at = excluded.uploaded_at,
          status = excluded.status,
          version = excluded.version,
          bucket = excluded.bucket
      `
    )
    .bind(
      record.id,
      record.kind,
      record.category,
      record.entityType,
      record.entityId,
      record.projectId,
      record.investmentId,
      record.contractId,
      record.requestId,
      record.fileName,
      record.filePath,
      record.fileUrl,
      record.contentType,
      record.fileSize,
      record.uploadedBy,
      record.uploadedAt,
      record.status,
      record.version,
      record.bucket
    )
    .run();
}

function mapDbRowToFileRecord(row, requestUrl) {
  const filePath = String(row?.file_path || "").trim();
  const fileUrl = String(row?.file_url || buildDownloadUrl(requestUrl, filePath, false)).trim();

  return {
    id: String(row?.id || "").trim(),
    kind: String(row?.kind || "attachment").trim(),
    category: String(row?.category || "").trim(),
    entityType: String(row?.entity_type || "").trim(),
    entityId: String(row?.entity_id || "").trim(),
    projectId: normalizeNullableString(row?.project_id),
    investmentId: normalizeNullableString(row?.investment_id),
    contractId: normalizeNullableString(row?.contract_id),
    requestId: normalizeNullableString(row?.request_id),
    fileName: String(row?.file_name || "").trim(),
    filePath,
    fileUrl,
    contentType: String(row?.content_type || "application/octet-stream").trim(),
    fileSize: Number(row?.file_size || 0),
    uploadedBy: normalizeNullableString(row?.uploaded_by),
    uploadedAt: String(row?.uploaded_at || "").trim(),
    status: String(row?.status || DEFAULT_STATUS).trim(),
    version: normalizeNullableInteger(row?.version),
    bucket: normalizeNullableString(row?.bucket),
  };
}

function buildUploadPath({
  entityType,
  entityId,
  category,
  kind,
  storageFolder,
  fileName,
  contentType,
}) {
  const safeEntityType = `${entityType}s`;
  const safeEntityId = entityId;

  if (category === "career_attachment") {
    const safeFolder = normalizeSlug(storageFolder) || "attachments";
    const safeName = sanitizeFileName(fileName || "attachment");
    const ext = safeName.includes(".") ? "" : inferExtensionFromType(contentType);
    const stamp = Date.now();
    return `careers/${safeEntityId}/${safeFolder}/${stamp}-${safeName}${ext}`;
  }

  if (category === "contract_original" && kind === "original") {
    return `${safeEntityType}/${safeEntityId}/contracts/original.pdf`;
  }

  if (category === "contract_signed" && kind === "signed") {
    return `${safeEntityType}/${safeEntityId}/contracts/signed.pdf`;
  }

  const safeName = sanitizeFileName(fileName || "attachment");
  const ext = safeName.includes(".") ? "" : inferExtensionFromType(contentType);
  const stamp = Date.now();

  if (category === "project_cover") {
    return `${safeEntityType}/${safeEntityId}/cover/${stamp}-${safeName}${ext}`;
  }

  if (category === "project_gallery") {
    return `${safeEntityType}/${safeEntityId}/gallery/${stamp}-${safeName}${ext}`;
  }

  if (category === "project_attachment") {
    return `${safeEntityType}/${safeEntityId}/attachments/${stamp}-${safeName}${ext}`;
  }

  if (category === "investment_settlement") {
    return `${safeEntityType}/${safeEntityId}/settlement/${stamp}-${safeName}${ext}`;
  }

  return `${safeEntityType}/${safeEntityId}/${category}/${stamp}-${safeName}${ext}`;
}

function buildDownloadUrl(requestUrl, path, forceDownload) {
  const objectPath = String(path || "").trim();
  if (!objectPath) return "";

  const url = new URL(requestUrl);
  url.pathname = "/download";
  url.search = "";
  url.hash = "";
  url.searchParams.set("path", objectPath);
  if (forceDownload) {
    url.searchParams.set("download", "1");
  }
  return url.toString();
}

function normalizeKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  return ALLOWED_KINDS.has(kind) ? kind : "";
}

function normalizeSlug(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return "";
  return raw;
}

function normalizeNullableSlug(value) {
  const normalized = normalizeSlug(value);
  return normalized || null;
}

function normalizeNullableString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeNullableInteger(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) ? normalized : null;
}

function normalizeNonNegativeNumber(value, fallback = null) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return fallback;
  return normalized;
}

function normalizeIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (!/^[a-z0-9_-]+$/.test(raw)) return "";
  return raw;
}

function normalizeCsvSlugs(value) {
  return String(value || "")
    .split(",")
    .map((part) => normalizeSlug(part))
    .filter(Boolean);
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return LIST_LIMIT_DEFAULT;
  return Math.min(LIST_LIMIT_MAX, Math.floor(parsed));
}

function normalizeObjectPath(value) {
  const raw = String(value || "").trim().replace(/^\/+/, "");
  if (!raw) return "";
  if (raw.includes("..") || raw.includes("\\")) return "";
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

function errorToMessage(error) {
  return String(error?.message || error || "unknown_error").trim();
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
        "Cache-Control": "no-store",
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
