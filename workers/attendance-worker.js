import * as core from "./attendance-worker-core.js";
import { handleHabatAttendanceRequest } from "./habat-attendance-core.js";
import { handleHabatAttendanceV2Request } from "./habat-attendance-v2.js";
import { handleHabatAttendanceV3Request } from "./habat-attendance-v3.js";
import { handleHabatAttendanceReportingRequest } from "./habat-attendance-reporting.js";
import { handleHabatPortalRequest } from "./habat-portal.js";
import { resolveHabatRequesterContext } from "./habat-auth.js";

export * from "./attendance-worker-core.js";

let configuredHrDb = null;

export function configureAttendanceHrDb(db) {
  configuredHrDb = db || null;
}

export async function resolveCanonicalAttendanceEmployee({
  hrDb,
  attendanceDb,
  employeeDocId,
  requesterUid,
}) {
  const canonicalEmployeeId = normalizeText(employeeDocId);
  const canonicalRequesterUid = normalizeText(requesterUid);
  if (!hrDb || !canonicalEmployeeId) {
    return { found: false, source: "legacy_firestore" };
  }

  let row = null;
  try {
    row = await hrDb
      .prepare(
        `
          SELECT id, auth_uid, email, is_active, employment_status,
                 allowed_zone_ids_json
          FROM employees
          WHERE id = ?
          LIMIT 1
        `
      )
      .bind(canonicalEmployeeId)
      .first();

    if (
      !row &&
      canonicalRequesterUid &&
      canonicalEmployeeId === canonicalRequesterUid
    ) {
      row = await hrDb
        .prepare(
          `
            SELECT id, auth_uid, email, is_active, employment_status,
                   allowed_zone_ids_json
            FROM employees
            WHERE auth_uid = ?
            LIMIT 1
          `
        )
        .bind(canonicalRequesterUid)
        .first();
    }
  } catch (error) {
    console.warn("[attendance] HR Core employee-zone lookup failed", error);
    return { found: false, source: "legacy_firestore", error };
  }

  if (!row) {
    return { found: false, source: "legacy_firestore" };
  }

  let allowedZoneIds = normalizeStringArray(row.allowed_zone_ids_json);
  let source = "hr_core";

  if (!allowedZoneIds.length) {
    const singleActiveZoneId = await resolveSingleActiveZoneId(attendanceDb);
    if (singleActiveZoneId) {
      allowedZoneIds = [singleActiveZoneId];
      source = "single_active_zone_default";
    }
  }

  return {
    found: true,
    source,
    employeeId: normalizeText(row.id) || canonicalEmployeeId,
    allowedZoneIds,
    data: {
      documentId: normalizeText(row.id) || canonicalEmployeeId,
      name: `hr-core/employees/${normalizeText(row.id) || canonicalEmployeeId}`,
      data: {
        uid: normalizeText(row.auth_uid) || null,
        authUid: normalizeText(row.auth_uid) || null,
        email: normalizeText(row.email) || null,
        active: Number(row.is_active) === 1,
        isActive: Number(row.is_active) === 1,
        employmentStatus: normalizeText(row.employment_status) || "active",
        allowedZoneIds,
      },
    },
  };
}

export async function resolveSingleActiveZoneId(attendanceDb) {
  if (!attendanceDb) return null;
  try {
    const result = await attendanceDb
      .prepare(
        `
          SELECT id
          FROM work_zones
          WHERE active = 1
          ORDER BY id ASC
          LIMIT 2
        `
      )
      .all();
    const ids = (result?.results || [])
      .map(row => normalizeText(row?.id))
      .filter(Boolean);
    return ids.length === 1 ? ids[0] : null;
  } catch (error) {
    console.warn("[attendance] single active work-zone lookup failed", error);
    return null;
  }
}

export async function handleAttendanceRequest(args) {
  const pathname = normalizeText(args?.url?.pathname);

  if (pathname.startsWith("/attendance/habat/")) {
    const legacyRequesterResolver = args?.resolveRequesterContext;
    const habatArgs = {
      ...args,
      resolveRequesterContext: request =>
        resolveHabatRequesterContext(request, legacyRequesterResolver),
    };

    if (pathname.startsWith("/attendance/habat/portal/")) {
      return handleHabatPortalRequest(habatArgs);
    }
    if (
      pathname === "/attendance/habat/v2/reports/summary" ||
      pathname === "/attendance/habat/v3/reports/summary" ||
      pathname === "/attendance/habat/v3/monthly-summary/generate"
    ) {
      return handleHabatAttendanceReportingRequest(habatArgs);
    }
    if (pathname.startsWith("/attendance/habat/v3/")) {
      return handleHabatAttendanceV3Request(habatArgs);
    }
    if (pathname.startsWith("/attendance/habat/v2/")) {
      return handleHabatAttendanceV2Request(habatArgs);
    }
    return handleHabatAttendanceRequest(habatArgs);
  }

  const legacyFetchFirestoreDocument = args?.fetchFirestoreDocument;
  const requesterUid = normalizeText(args?.requester?.uid);

  const fetchAttendanceDocument = async params => {
    const documentPath = normalizeText(params?.documentPath);
    const employeeMatch = /^employees\/([^/]+)$/.exec(documentPath);

    if (employeeMatch && configuredHrDb) {
      const canonical = await resolveCanonicalAttendanceEmployee({
        hrDb: configuredHrDb,
        attendanceDb: args?.db,
        employeeDocId: decodeURIComponent(employeeMatch[1]),
        requesterUid,
      });

      if (canonical.found) {
        console.log("[attendance] employee zone source", {
          employeeId: canonical.employeeId,
          source: canonical.source,
          allowedZoneCount: canonical.allowedZoneIds.length,
        });
        return {
          ok: true,
          found: true,
          data: canonical.data,
        };
      }
    }

    if (typeof legacyFetchFirestoreDocument !== "function") {
      return {
        ok: false,
        status: 500,
        error: "attendance_employee_source_unavailable",
      };
    }
    return legacyFetchFirestoreDocument(params);
  };

  return core.handleAttendanceRequest({
    ...args,
    fetchFirestoreDocument: fetchAttendanceDocument,
  });
}

function normalizeStringArray(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value || "[]");
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return Array.from(
    new Set(parsed.map(item => normalizeText(item)).filter(Boolean))
  );
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}
