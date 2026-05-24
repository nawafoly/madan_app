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
const DEFAULT_MAX_FILE_SIZE_MB = 10;
const IMAGE_MAX_FILE_SIZE_MB = 10;
const VIDEO_MAX_FILE_SIZE_MB = 50;
const DEFAULT_STATUS = "uploaded";
const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 200;
const DEFAULT_ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "https://madan-app.vercel.app",
]);
const EMPLOYEE_DIRECTORY_CALLER_ROLES = new Set([
  "staff",
  "hr",
  "admin",
  "owner",
  "accountant",
]);
const KNOWN_APP_ROLES = new Set([
  "owner",
  "admin",
  "accountant",
  "hr",
  "staff",
  "client",
  "guest",
]);
const ROLE_ALIASES = {
  user: "client",
  employee: "staff",
  human_resources: "hr",
  "human-resources": "hr",
  "human resources": "hr",
  humanresources: "hr",
  administrator: "admin",
  "super_admin": "admin",
  "super-admin": "admin",
  "super admin": "admin",
  superadmin: "admin",
};
const ACTIVE_TRUE_VALUES = new Set(["active", "enabled", "true", "1", "yes"]);
const ACTIVE_FALSE_VALUES = new Set([
  "inactive",
  "disabled",
  "false",
  "0",
  "no",
]);
const EMPLOYEE_DIRECTORY_EXCLUDED_ROLES = new Set(["client", "guest"]);
const FIRESTORE_PAGE_SIZE = 300;
const ROLE_PRIORITY = {
  guest: 0,
  client: 1,
  staff: 2,
  hr: 3,
  accountant: 4,
  admin: 5,
  owner: 6,
};

const ROLE_DEFAULT_PERMISSIONS = {
  owner: [
    "dashboard.view",
    "projects.view",
    "projects.manage",
    "projects.publish",
    "investments.view",
    "investments.manage",
    "users.view",
    "users.manage",
    "messages.view",
    "messages.manage",
    "recruitment.view",
    "recruitment.manage",
    "employees.view",
    "employees.manage",
    "reports.view",
    "financial.view",
    "financial.edit",
    "settings.manage",
  ],
  admin: [
    "dashboard.view",
    "projects.view",
    "projects.manage",
    "projects.publish",
    "investments.view",
    "investments.manage",
    "users.view",
    "users.manage",
    "messages.view",
    "messages.manage",
    "recruitment.view",
    "recruitment.manage",
    "employees.view",
    "employees.manage",
    "reports.view",
    "settings.manage",
  ],
  accountant: [
    "dashboard.view",
    "projects.view",
    "investments.view",
    "financial.view",
    "financial.edit",
    "reports.view",
  ],
  hr: [
      "recruitment.view",
      "recruitment.manage",
      "employees.view",
      "employees.manage",
      "settings.manage", 
    ],
  staff: [],
  client: ["projects.view"],
  guest: ["projects.view"],
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request, env);
    }

    const bucket = getBucket(env);
    const db = getDatabase(env);
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/download") {
      if (!bucket) {
        return withCors(
          json(500, {
            ok: false,
            success: false,
            message: "missing_r2_binding",
          }),
          request,
          env
        );
      }
      return withCors(await handleDownload(request, url, bucket), request, env);
    }

    if (request.method === "GET" && url.pathname === "/files") {
      if (!db) {
        return withCors(
          json(500, {
            ok: false,
            success: false,
            message: "missing_d1_binding",
          }),
          request,
          env
        );
      }
      return withCors(await handleList(url, db, request.url), request, env);
    }

    if (
      request.method === "GET" &&
      url.pathname === "/listActiveEmployeeDirectory"
    ) {
      if (!db) {
        return withCors(
          json(500, {
            ok: false,
            success: false,
            message: "missing_d1_binding",
          }),
          request,
          env
        );
      }
      return withCors(
        await handleListActiveEmployeeDirectory(request, db),
        request,
        env
      );
    }

    if (
      request.method === "POST" &&
      url.pathname === "/admin/syncEmployeeDirectory"
    ) {
      if (!db) {
        return withCors(
          json(500, {
            ok: false,
            success: false,
            message: "missing_d1_binding",
          }),
          request,
          env
        );
      }
      return withCors(
        await handleAdminSyncEmployeeDirectory(request, db),
        request,
        env
      );
    }

    if (request.method === "GET" && url.pathname === "/stats") {
      return withCors(await handleStats(bucket, db), request, env);
    }

    if (
      request.method === "POST" &&
      (url.pathname === "/" || url.pathname === "/upload")
    ) {
      if (!bucket) {
        return withCors(
          json(500, {
            ok: false,
            success: false,
            message: "missing_r2_binding",
          }),
          request,
          env
        );
      }
      if (!db) {
        return withCors(
          json(500, {
            ok: false,
            success: false,
            message: "missing_d1_binding",
          }),
          request,
          env
        );
      }
      return withCors(await handleUpload(request, bucket, db), request, env);
    }

    return withCors(
      json(405, {
        ok: false,
        success: false,
        message: "method_not_allowed",
      }),
      request,
      env
    );
  },
};

function getBucket(env) {
  return env?.R2_BUCKET || env?.MAEDIN_STORAGE || env?.BUCKET || null;
}

function getDatabase(env) {
  return env?.DOCUMENTS_DB || env?.DB || null;
}

async function handleUpload(request, bucket, db) {
  const contentType = String(
    request.headers.get("content-type") || ""
  ).toLowerCase();
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

  const normalizedType = normalizeContentType(file.type, file.name);
  const maxFileSizeMb = getUploadFileSizeLimitMb(normalizedType);
  const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;

  if (file.size > maxFileSizeBytes) {
    return json(413, {
      ok: false,
      success: false,
      message: `File is too large. Max allowed size is ${maxFileSizeMb}MB for ${
        isVideoContentType(normalizedType)
          ? "videos"
          : isImageContentType(normalizedType)
            ? "images"
            : "this file type"
      }.`,
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

  if (
    (kind === "original" || kind === "signed") &&
    normalizedType !== "application/pdf"
  ) {
    return json(400, {
      ok: false,
      success: false,
      message: "contract_files_must_be_pdf",
    });
  }

  const uploadedAt = new Date().toISOString();
  const storageFolder =
    normalizeSlug(form.get("storageFolder")) || "attachments";
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
  const investmentId = normalizeNullableSlug(
    url.searchParams.get("investmentId")
  );
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
    files: rows.map(row => mapDbRowToFileRecord(row, requestUrl)),
  });
}

async function handleStats(bucket, db) {
  const checkedAt = new Date().toISOString();
  const [d1Stats, r2Stats] = await Promise.all([
    collectD1Stats(db),
    collectR2Stats(bucket),
  ]);

  const totalFiles = r2Stats.ok
    ? r2Stats.totalFiles
    : d1Stats.ok
      ? d1Stats.totalFiles
      : null;
  const totalFilesSource = r2Stats.ok ? "r2" : d1Stats.ok ? "d1" : null;
  const totalBytes = r2Stats.ok
    ? r2Stats.totalBytes
    : d1Stats.ok
      ? d1Stats.totalBytes
      : null;
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

async function handleListActiveEmployeeDirectory(request, db) {
  const requester = await resolveRequesterContext(request);
  if (!requester.ok) {
    return requester.response;
  }

  if (!hasEmployeeDirectoryAccess(requester.runtime)) {
    return json(403, {
      ok: false,
      success: false,
      message: "employee_directory_access_denied",
      reason: !requester.runtime.isActive
        ? "inactive_account"
        : "role_not_allowed",
      allowedRoles: Array.from(EMPLOYEE_DIRECTORY_CALLER_ROLES),
      ...buildRequesterDebugPayload(requester),
    });
  }

  try {
    const result = await db
      .prepare(
        `
          SELECT
            uid,
            name,
            email,
            avatar_url,
            title,
            department,
            status_key
          FROM employee_directory
          WHERE is_active = 1
            AND lower(coalesce(status_key, '')) = 'active'
            AND lower(coalesce(role, '')) NOT IN ('client', 'guest')
            AND length(trim(coalesce(uid, ''))) > 0
            AND length(trim(coalesce(name, ''))) > 0
          ORDER BY name COLLATE NOCASE ASC, uid ASC
        `
      )
      .all();

    const rows = Array.isArray(result?.results) ? result.results : [];

    return json(200, {
      ok: true,
      success: true,
      employees: rows.map(mapEmployeeDirectoryRow),
    });
  } catch (error) {
    return json(500, {
      ok: false,
      success: false,
      message: "employee_directory_query_failed",
      detail: errorToMessage(error),
    });
  }
}

async function handleAdminSyncEmployeeDirectory(request, db) {
  const requester = await resolveRequesterContext(request);
  if (!requester.ok) {
    return requester.response;
  }

  if (!hasEffectivePermission(requester.runtime, "settings.manage")) {
    return json(403, {
      ok: false,
      success: false,
      message: "employee_directory_sync_forbidden",
      requiredPermission: "settings.manage",
      ...buildRequesterDebugPayload(requester),
    });
  }

  try {
    const syncedAt = new Date().toISOString();
    const sourceUsers = await listFirestoreCollectionDocuments({
      projectId: requester.projectId,
      idToken: requester.idToken,
      collectionPath: "users",
      maskFields: [
        "role",
        "roleKey",
        "active",
        "isActive",
        "status",
        "linkedEmployeeId",
        "displayName",
        "name",
        "fullName",
        "email",
        "photoURL",
        "title",
        "department",
        "updatedAt",
        "profile.photoURL",
        "employeeProfile.updatedAt",
        "employeeProfile.personal.name",
        "employeeProfile.personal.email",
        "employeeProfile.personal.avatar.fileUrl",
        "employeeProfile.employment.title",
        "employeeProfile.employment.jobTitle",
        "employeeProfile.employment.department",
        "employeeProfile.employment.employmentStatus",
        "employeeProfile.employment.status",
        "employment.title",
        "employment.jobTitle",
        "employment.department",
        "employment.employmentStatus",
        "employment.status",
      ],
    });

    const rows = sourceUsers
      .map(userDoc =>
        buildEmployeeDirectoryRow(userDoc.documentId, userDoc.data, syncedAt)
      )
      .filter(Boolean)
      .sort((left, right) =>
        left.name.localeCompare(right.name, "ar", { sensitivity: "base" })
      );

    if (!rows.length) {
      return json(422, {
        ok: false,
        success: false,
        message: "employee_directory_source_empty",
        detail: "sync_aborted_to_avoid_clearing_directory",
      });
    }

    const syncResult = await syncEmployeeDirectoryRowsToD1(db, rows);

    return json(200, {
      ok: true,
      success: true,
      message: "employee_directory_sync_completed",
      syncedAt,
      sourceCount: sourceUsers.length,
      employeesSynced: rows.length,
      employeesDeleted: syncResult.deletedCount,
      actor: {
        uid: requester.uid,
        email: requester.email || null,
        role: requester.runtime.role,
      },
    });
  } catch (error) {
    return json(500, {
      ok: false,
      success: false,
      message: "employee_directory_sync_failed",
      detail: errorToMessage(error),
    });
  }
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
      const page = await bucket.list(
        cursor ? { limit: 1000, cursor } : { limit: 1000 }
      );
      const objects = Array.isArray(page?.objects) ? page.objects : [];

      totalFiles += objects.length;

      objects.forEach(object => {
        totalBytes += normalizeNonNegativeNumber(object?.size, 0);
        const uploadedAt = normalizeIsoDate(object?.uploaded);
        if (uploadedAt && (!latestUploadAt || uploadedAt > latestUploadAt)) {
          latestUploadAt = uploadedAt;
        }
      });

      truncated = Boolean(page?.truncated);
      cursor = truncated
        ? normalizeNullableString(page?.cursor) || undefined
        : undefined;
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

async function handleDownload(request, url, bucket) {
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

  const rangeHeader = String(request.headers.get("range") || "").trim();
  let object = await bucket.get(path);
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
      headers.get("Content-Type") ||
      inferContentTypeFromName(path) ||
      "application/octet-stream";

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
    headers.get("Content-Type") ||
    inferContentTypeFromName(path) ||
    "application/octet-stream";
  const range = parseHttpRangeHeader(rangeHeader, Number(object.size || 0));
  if (range) {
    const rangedObject = await bucket.get(path, {
      range: {
        offset: range.start,
        length: range.end - range.start + 1,
      },
    });
    if (rangedObject) {
      object = rangedObject;
      headers.delete("Content-Encoding");
    }
  }

  const fileName = getFileNameFromPath(path);
  const forceDownloadRaw = String(url.searchParams.get("download") || "")
    .trim()
    .toLowerCase();
  const forceDownload = forceDownloadRaw === "1" || forceDownloadRaw === "true";
  const disposition =
    forceDownload || !isInlinePreviewContentType(contentType)
      ? "attachment"
      : "inline";

  headers.set("Content-Type", contentType);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(range ? range.end - range.start + 1 : object.size || 0));
  if (range) {
    headers.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${range.size}`
    );
  }
  headers.set(
    "Content-Disposition",
    `${disposition}; filename="${toHeaderSafeFileName(fileName)}"`
  );
  headers.set("Cache-Control", "private, max-age=60");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(object.body, {
    status: range ? 206 : 200,
    headers,
  });
}

function parseHttpRangeHeader(rangeHeader, size) {
  if (!rangeHeader || !Number.isFinite(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader);
  if (!match) return null;

  const startRaw = match[1];
  const endRaw = match[2];
  if (!startRaw && !endRaw) return null;

  let start;
  let end;

  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : size - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1),
    size,
  };
}

function isInlinePreviewContentType(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  return (
    normalized === "application/pdf" ||
    normalized.startsWith("image/") ||
    normalized.startsWith("video/")
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
  const fileUrl = String(
    row?.file_url || buildDownloadUrl(requestUrl, filePath, false)
  ).trim();

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

function mapEmployeeDirectoryRow(row) {
  return {
    uid: String(row?.uid || "").trim(),
    name: String(row?.name || "").trim(),
    email: normalizeNullableString(row?.email),
    avatarUrl: normalizeNullableString(row?.avatar_url),
    title: normalizeNullableString(row?.title),
    department: normalizeNullableString(row?.department),
    statusKey: normalizeNullableString(row?.status_key) || "active",
  };
}

async function syncEmployeeDirectoryRowsToD1(db, rows) {
  const existingResult = await db
    .prepare(
      `
        SELECT uid
        FROM employee_directory
      `
    )
    .all();

  const existingUids = Array.isArray(existingResult?.results)
    ? existingResult.results
        .map(row => String(row?.uid || "").trim())
        .filter(Boolean)
    : [];
  const nextUidSet = new Set(rows.map(row => row.uid));
  const staleUids = existingUids.filter(uid => !nextUidSet.has(uid));

  for (const row of rows) {
    await upsertEmployeeDirectoryRow(db, row);
  }

  for (const uid of staleUids) {
    await db
      .prepare(
        `
          DELETE FROM employee_directory
          WHERE uid = ?
        `
      )
      .bind(uid)
      .run();
  }

  return {
    deletedCount: staleUids.length,
  };
}

async function upsertEmployeeDirectoryRow(db, row) {
  await db
    .prepare(
      `
        INSERT INTO employee_directory (
          uid,
          name,
          email,
          avatar_url,
          title,
          department,
          status_key,
          role,
          linked_employee_id,
          is_active,
          updated_at,
          synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET
          name = excluded.name,
          email = excluded.email,
          avatar_url = excluded.avatar_url,
          title = excluded.title,
          department = excluded.department,
          status_key = excluded.status_key,
          role = excluded.role,
          linked_employee_id = excluded.linked_employee_id,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at,
          synced_at = excluded.synced_at
      `
    )
    .bind(
      row.uid,
      row.name,
      row.email,
      row.avatarUrl,
      row.title,
      row.department,
      row.statusKey,
      row.role,
      row.linkedEmployeeId,
      row.isActive ? 1 : 0,
      row.updatedAt,
      row.syncedAt
    )
    .run();
}

async function resolveRequesterContext(request) {
  const idToken = readBearerToken(request);
  if (!idToken) {
    return {
      ok: false,
      response: json(401, {
        ok: false,
        success: false,
        message: "missing_firebase_id_token",
      }),
    };
  }

  const tokenPayload = decodeJwtPayload(idToken);
  const projectId = stringOrEmpty(tokenPayload?.aud);
  const uid = stringOrEmpty(tokenPayload?.user_id || tokenPayload?.sub);
  const email = stringOrEmpty(tokenPayload?.email).toLowerCase();

  if (!projectId || !uid) {
    return {
      ok: false,
      response: json(401, {
        ok: false,
        success: false,
        message: "invalid_firebase_id_token",
      }),
    };
  }

  const [userDocResult, adminUserDocResult] = await Promise.all([
    fetchFirestoreDocument({
      projectId,
      idToken,
      documentPath: `users/${uid}`,
    }),
    email
      ? fetchFirestoreDocument({
          projectId,
          idToken,
          documentPath: `admin_users/${email}`,
        })
      : Promise.resolve({ ok: true, found: false, data: null }),
  ]);

  if (!userDocResult.ok) {
    return {
      ok: false,
      response: json(userDocResult.status, {
        ok: false,
        success: false,
        message: "firebase_user_lookup_failed",
        detail: userDocResult.error || null,
      }),
    };
  }

  if (!adminUserDocResult.ok) {
    return {
      ok: false,
      response: json(adminUserDocResult.status, {
        ok: false,
        success: false,
        message: "firebase_admin_lookup_failed",
        detail: adminUserDocResult.error || null,
      }),
    };
  }

  console.log("[worker] requester context debug", {
    projectId,
    uid,
    email,
    userFound: userDocResult?.found ?? null,
    adminFound: adminUserDocResult?.found ?? null,
    userData: userDocResult?.data ?? null,
    adminData: adminUserDocResult?.data ?? null,
  });
  
  const runtime = resolveEffectiveRuntime(
    userDocResult.found ? userDocResult.data?.data ?? null : null,
    adminUserDocResult.found ? adminUserDocResult.data?.data ?? null : null
  );

  return {
    ok: true,
    idToken,
    projectId,
    uid,
    email,
    runtime,
  };
}

async function fetchFirestoreDocument({ projectId, idToken, documentPath }) {
  const url = buildFirestoreDocumentUrl(projectId, documentPath);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });

  const payload = await safeReadJson(response);

  if (response.status === 404) {
    return {
      ok: true,
      found: false,
      data: null,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 401 ? 401 : 403,
      error:
        stringOrEmpty(payload?.error?.message) ||
        `firestore_request_failed_${response.status}`,
    };
  }

  return {
    ok: true,
    found: true,
    data: parseFirestoreDocument(payload),
  };
}

async function listFirestoreCollectionDocuments({
  projectId,
  idToken,
  collectionPath,
  maskFields = [],
}) {
  const documents = [];
  let nextPageToken = "";

  do {
    const url = buildFirestoreCollectionUrl(projectId, collectionPath, {
      pageSize: FIRESTORE_PAGE_SIZE,
      pageToken: nextPageToken,
      maskFields,
    });

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${idToken}`,
      },
    });
    const payload = await safeReadJson(response);

    if (!response.ok) {
      throw new Error(
        stringOrEmpty(payload?.error?.message) ||
          `firestore_collection_request_failed_${response.status}`
      );
    }

    const pageDocuments = Array.isArray(payload?.documents)
      ? payload.documents.map(parseFirestoreDocument)
      : [];
    documents.push(...pageDocuments);
    nextPageToken = stringOrEmpty(payload?.nextPageToken);
  } while (nextPageToken);

  return documents;
}

function buildFirestoreDocumentUrl(projectId, documentPath) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/(default)/documents/${documentPath}`;
}

function buildFirestoreCollectionUrl(
  projectId,
  collectionPath,
  { pageSize, pageToken, maskFields = [] } = {}
) {
  const url = new URL(
    buildFirestoreDocumentUrl(projectId, collectionPath)
  );

  if (pageSize) {
    url.searchParams.set("pageSize", String(pageSize));
  }
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }
  maskFields.forEach(fieldPath => {
    const normalizedFieldPath = stringOrEmpty(fieldPath);
    if (normalizedFieldPath) {
      url.searchParams.append("mask.fieldPaths", normalizedFieldPath);
    }
  });

  return url.toString();
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseFirestoreDocument(document) {
  const documentName = stringOrEmpty(document?.name);
  const segments = documentName.split("/").filter(Boolean);
  const documentId = segments.length ? segments[segments.length - 1] : "";

  return {
    documentId,
    name: documentName,
    data: parseFirestoreFields(document?.fields),
  };
}

function parseFirestoreFields(fields) {
  if (!fields || typeof fields !== "object") return {};

  const output = {};
  Object.entries(fields).forEach(([key, value]) => {
    output[key] = parseFirestoreValue(value);
  });
  return output;
}

function parseFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return String(value.stringValue || "");
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("integerValue" in value) return Number(value.integerValue || 0);
  if ("doubleValue" in value) return Number(value.doubleValue || 0);
  if ("timestampValue" in value) return normalizeIsoDate(value.timestampValue);
  if ("nullValue" in value) return null;
  if ("mapValue" in value) return parseFirestoreFields(value.mapValue?.fields);
  if ("arrayValue" in value) {
    const values = Array.isArray(value.arrayValue?.values)
      ? value.arrayValue.values
      : [];
    return values.map(parseFirestoreValue);
  }
  return null;
}

function readBearerToken(request) {
  const header = String(request.headers.get("Authorization") || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1] || "";
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding =
      normalized.length % 4 === 0
        ? ""
        : "=".repeat(4 - (normalized.length % 4));
    return JSON.parse(atob(normalized + padding));
  } catch {
    return null;
  }
}

function resolveEffectiveRuntime(userData, adminUserData) {
  const userRuntime = createRuntimeFromUserData(userData);
  const adminRuntime = createRuntimeFromAdminUserData(adminUserData);
  const runtimes = [userRuntime, adminRuntime];

  return {
    role: resolveHighestPriorityRuntimeRole(runtimes),
    permissionsAllow: collectRuntimePermissions(runtimes, "permissionsAllow"),
    permissionsDeny: collectRuntimePermissions(runtimes, "permissionsDeny"),
    isActive: runtimes.some(runtime => runtime.isActive),
    sources: {
      user: userRuntime,
      admin: adminRuntime,
    },
  };
}

function createRuntimeFromUserData(data) {
  if (!data || typeof data !== "object") {
    return createEmptyRuntime();
  }

  return {
    role: resolveRoleFromData(data),
    rawRole: normalizeRawRoleValue(data?.role),
    rawRoleKey: normalizeRawRoleValue(data?.roleKey),
    permissionsAllow: normalizePermissionList(data?.permissionsAllow),
    permissionsDeny: normalizePermissionList(data?.permissionsDeny),
    isActive: resolveUserActive(data),
  };
}

function createRuntimeFromAdminUserData(data) {
  if (!data || typeof data !== "object") {
    return createEmptyRuntime();
  }

  return {
    role: resolveRoleFromData(data, { preferRoleKey: true }),
    rawRole: normalizeRawRoleValue(data?.role),
    rawRoleKey: normalizeRawRoleValue(data?.roleKey),
    permissionsAllow: normalizePermissionList(data?.permissionsAllow),
    permissionsDeny: normalizePermissionList(data?.permissionsDeny),
    isActive: resolveAdminUserActive(data),
  };
}

function normalizeKnownRole(value) {
  return resolveNormalizedRole(value) || "guest";
}

function normalizePermissionList(value) {
  return Array.isArray(value)
    ? value.map(entry => stringOrEmpty(entry)).filter(Boolean)
    : [];
}

function createEmptyRuntime() {
  return {
    role: "guest",
    rawRole: "",
    rawRoleKey: "",
    permissionsAllow: [],
    permissionsDeny: [],
    isActive: false,
  };
}

function resolveRoleFromData(data, { preferRoleKey = false } = {}) {
  const candidates = preferRoleKey
    ? [data?.roleKey, data?.role]
    : [data?.role, data?.roleKey];

  for (const candidate of candidates) {
    const resolvedRole = resolveNormalizedRole(candidate);
    if (resolvedRole) return resolvedRole;
  }

  return "guest";
}

function normalizeRawRoleValue(value) {
  return stringOrEmpty(value).toLowerCase();
}

function resolveNormalizedRole(value) {
  const rawRole = normalizeRawRoleValue(value);
  if (!rawRole) return "";
  if (KNOWN_APP_ROLES.has(rawRole)) return rawRole;
  return ROLE_ALIASES[rawRole] || "";
}

function resolveHighestPriorityRuntimeRole(runtimes) {
  const activeRuntimes = runtimes.filter(runtime => runtime?.isActive);
  const candidates = activeRuntimes.length ? activeRuntimes : runtimes;
  let highestRole = "guest";
  let highestPriority = ROLE_PRIORITY.guest ?? 0;

  candidates.forEach(runtime => {
    const role = normalizeKnownRole(runtime?.role);
    const priority = ROLE_PRIORITY[role] ?? 0;
    if (priority > highestPriority) {
      highestRole = role;
      highestPriority = priority;
    }
  });

  return highestRole;
}

function collectRuntimePermissions(runtimes, key) {
  return Array.from(
    new Set(
      runtimes.flatMap(runtime =>
        Array.isArray(runtime?.[key]) ? runtime[key] : []
      )
    )
  );
}

function getRuntimeSources(runtime) {
  const runtimeSources = runtime?.sources;
  if (!runtimeSources || typeof runtimeSources !== "object") {
    return runtime ? [runtime] : [];
  }

  return Object.values(runtimeSources).filter(
    source => source && typeof source === "object"
  );
}

function hasEffectivePermission(runtime, permission) {
  const normalizedPermission = stringOrEmpty(permission);
  if (!normalizedPermission) return false;

  return getRuntimeSources(runtime).some(source =>
    doesRuntimeGrantPermission(source, normalizedPermission)
  );
}

function doesRuntimeGrantPermission(runtime, permission) {
  if (!runtime?.isActive) return false;

  const deny = new Set(runtime.permissionsDeny || []);
  if (deny.has(permission)) return false;

  const allow = new Set(runtime.permissionsAllow || []);
  if (allow.has(permission)) return true;

  const defaults = ROLE_DEFAULT_PERMISSIONS[runtime.role] || [];
  return defaults.includes(permission);
}

function hasEmployeeDirectoryAccess(runtime) {
  return getRuntimeSources(runtime).some(
    source =>
      source?.isActive && EMPLOYEE_DIRECTORY_CALLER_ROLES.has(source.role)
  );
}

function buildRequesterDebugPayload(requester) {
  const userRuntime = requester?.runtime?.sources?.user || null;
  const adminRuntime = requester?.runtime?.sources?.admin || null;

  return {
    uid: requester?.uid || "",
    email: requester?.email || null,
    role: requester?.runtime?.role || "guest",
    resolvedRole: requester?.runtime?.role || "guest",
    rawUserRole: userRuntime?.rawRole || "",
    rawUserRoleKey: userRuntime?.rawRoleKey || "",
    rawAdminRole: adminRuntime?.rawRole || "",
    rawAdminRoleKey: adminRuntime?.rawRoleKey || "",
    isActive: Boolean(requester?.runtime?.isActive),
    permissionsAllow: Array.isArray(requester?.runtime?.permissionsAllow)
      ? requester.runtime.permissionsAllow
      : [],
    permissionsDeny: Array.isArray(requester?.runtime?.permissionsDeny)
      ? requester.runtime.permissionsDeny
      : [],
    hasSettingsManage: hasEffectivePermission(
      requester?.runtime,
      "settings.manage"
    ),
  };
}

function resolveEmployeeDirectoryActive(data) {
  if (!data || typeof data !== "object") return false;

  const direct = parseActiveValue(data?.active);
  if (direct !== null) return direct;

  const legacyFlag = parseActiveValue(data?.isActive);
  if (legacyFlag !== null) return legacyFlag;

  const legacyStatus = parseActiveValue(data?.status);
  if (legacyStatus !== null) return legacyStatus;

  const employment = data?.employeeProfile?.employment || data?.employment || {};
  const employmentStatus = parseActiveValue(
    employment?.employmentStatus ?? employment?.status
  );
  if (employmentStatus !== null) return employmentStatus;

  return true;
}

function resolveAdminUserActive(data) {
  if (!data || typeof data !== "object") return false;

  const direct = parseActiveValue(data?.active);
  if (direct !== null) return direct;

  const legacy = parseActiveValue(data?.isActive);
  if (legacy !== null) return legacy;

  const status = parseActiveValue(data?.status);
  if (status !== null) return status;

  return true;
}

function resolveUserActive(data) {
  if (!data || typeof data !== "object") return false;

  const direct = parseActiveValue(data?.active);
  if (direct !== null) return direct;

  const legacyFlag = parseActiveValue(data?.isActive);
  if (legacyFlag !== null) return legacyFlag;

  const legacyStatus = parseActiveValue(data?.status);
  if (legacyStatus !== null) return legacyStatus;

  return true;
}

function parseActiveValue(value) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = stringOrEmpty(value).toLowerCase();
  if (!normalized) return null;
  if (ACTIVE_TRUE_VALUES.has(normalized)) return true;
  if (ACTIVE_FALSE_VALUES.has(normalized)) return false;
  return null;
}

function buildEmployeeDirectoryRow(uid, data, syncedAt) {
  if (!uid || !isEmployeeDirectoryCandidate(data)) {
    return null;
  }

  const employment = data?.employeeProfile?.employment || data?.employment || {};
  const personal = data?.employeeProfile?.personal || data?.personal || {};
  const role = normalizeEmployeeDirectoryRole(data) || null;
  const isActive = resolveEmployeeDirectoryActive(data);
  const statusKey = isActive ? "active" : "inactive";
  const name = pickFirstText(
    data?.displayName,
    data?.name,
    data?.fullName,
    personal?.name,
    uid
  );

  if (!name) {
    return null;
  }

  return {
    uid,
    name,
    email: pickFirstText(data?.email, personal?.email) || null,
    avatarUrl:
      pickFirstText(
        personal?.avatar?.fileUrl,
        data?.photoURL,
        data?.profile?.photoURL
      ) || null,
    title: pickFirstText(employment?.title, employment?.jobTitle, data?.title) || null,
    department: pickFirstText(employment?.department, data?.department) || null,
    statusKey,
    role,
    linkedEmployeeId: stringOrEmpty(data?.linkedEmployeeId) || null,
    isActive,
    updatedAt:
      normalizeIsoDate(data?.updatedAt) ||
      normalizeIsoDate(data?.employeeProfile?.updatedAt) ||
      syncedAt,
    syncedAt,
  };
}

function isEmployeeDirectoryCandidate(data) {
  const role = normalizeEmployeeDirectoryRole(data);
  if (EMPLOYEE_DIRECTORY_EXCLUDED_ROLES.has(role)) return false;

  const employment = data?.employeeProfile?.employment || data?.employment || {};
  const personal = data?.employeeProfile?.personal || data?.personal || {};

  return (
    role === "staff" ||
    role === "hr" ||
    stringOrEmpty(data?.linkedEmployeeId).length > 0 ||
    hasValuesObject(employment) ||
    hasValuesObject(personal)
  );
}

function normalizeEmployeeDirectoryRole(value) {
  if (value && typeof value === "object") {
    return resolveRoleFromData(value);
  }

  return normalizeKnownRole(value);
}

function hasValuesObject(value) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function pickFirstText(...values) {
  for (const value of values) {
    const normalized = stringOrEmpty(value);
    if (normalized) return normalized;
  }
  return "";
}

function stringOrEmpty(value) {
  return String(value || "").trim();
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
    const ext = safeName.includes(".")
      ? ""
      : inferExtensionFromType(contentType);
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
  const kind = String(value || "")
    .trim()
    .toLowerCase();
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
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (!/^[a-z0-9_-]+$/.test(raw)) return "";
  return raw;
}

function normalizeCsvSlugs(value) {
  return String(value || "")
    .split(",")
    .map(part => normalizeSlug(part))
    .filter(Boolean);
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return LIST_LIMIT_DEFAULT;
  return Math.min(LIST_LIMIT_MAX, Math.floor(parsed));
}

function normalizeObjectPath(value) {
  const raw = String(value || "")
    .trim()
    .replace(/^\/+/, "");
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
  const normalized = String(type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (normalized) return normalized;
  return inferContentTypeFromName(fileName) || "application/octet-stream";
}

function isVideoContentType(contentType) {
  return String(contentType || "").toLowerCase().startsWith("video/");
}

function isImageContentType(contentType) {
  return String(contentType || "").toLowerCase().startsWith("image/");
}

function getUploadFileSizeLimitMb(contentType) {
  if (isVideoContentType(contentType)) return VIDEO_MAX_FILE_SIZE_MB;
  if (isImageContentType(contentType)) return IMAGE_MAX_FILE_SIZE_MB;
  return DEFAULT_MAX_FILE_SIZE_MB;
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
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".avi")) return "video/x-msvideo";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".mpeg") || lower.endsWith(".mpg")) return "video/mpeg";
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
  if (contentType === "video/mp4") return ".mp4";
  if (contentType === "video/quicktime") return ".mov";
  if (contentType === "video/x-m4v") return ".m4v";
  if (contentType === "video/webm") return ".webm";
  if (contentType === "video/x-msvideo") return ".avi";
  if (contentType === "video/x-matroska") return ".mkv";
  if (contentType === "video/mpeg") return ".mpeg";
  if (contentType === "text/plain") return ".txt";
  if (contentType === "text/csv") return ".csv";
  if (contentType === "application/json") return ".json";
  if (contentType === "application/zip") return ".zip";
  if (contentType === "application/msword") return ".doc";
  if (
    contentType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return ".docx";
  }
  if (contentType === "application/vnd.ms-excel") return ".xls";
  if (
    contentType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
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
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function getAllowedCorsOrigins(env) {
  const configuredOrigins = String(env?.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]);
}

function resolveCorsOrigin(request, env) {
  const requestOrigin = String(request.headers.get("Origin") || "").trim();
  if (!requestOrigin) return "";

  return getAllowedCorsOrigins(env).has(requestOrigin) ? requestOrigin : "";
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  const allowedOrigin = resolveCorsOrigin(request, env);

  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.append("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  headers.set("Access-Control-Max-Age", "86400");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
