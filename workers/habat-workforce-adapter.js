import {
  handleWorkforceCoreRequest,
  workforceSafeHandler,
} from "./workforce-core.js";

const TENANT = {
  id: "restaurant_tenant_habat_alwaraq",
  productKey: "restaurants",
  tenantKey: "habat-alwaraq",
  displayName: "حبات الورق",
  timezone: "Asia/Riyadh",
};

/**
 * Habbat-specific edge adapter.
 *
 * Tenant names and legacy source-table knowledge are allowed here only. All new
 * workforce business logic stays in workforce-core.js and workforce_* tables.
 */
export async function handleHabatWorkforceRequest({
  request,
  url,
  db,
  resolveRequesterContext,
}) {
  return workforceSafeHandler(async () => {
    if (!db) {
      return json(500, { ok: false, message: "workforce_database_unavailable" });
    }
    if (typeof resolveRequesterContext !== "function") {
      return json(500, { ok: false, message: "workforce_auth_unavailable" });
    }

    const requester = await resolveRequesterContext(request);
    if (!requester?.ok) {
      return requester?.response || json(401, { ok: false, message: "workforce_authentication_required" });
    }

    const principal = await resolveEdgePrincipal(db, requester);
    if (!principal.authenticated) {
      return json(403, { ok: false, message: "workforce_access_forbidden" });
    }

    return handleWorkforceCoreRequest({
      request,
      url,
      db,
      tenant: TENANT,
      principal,
      sourceAdapter: {
        sourceType: "legacy_attendance_access",
        listEmployees: () => listLegacyEmployees(db),
      },
      routePrefix: "/attendance/habat/workforce",
    });
  });
}

async function resolveEdgePrincipal(db, requester) {
  const uid = clean(requester?.uid);
  const email = clean(requester?.email).toLowerCase();
  const runtimeRole = clean(requester?.runtime?.role).toLowerCase();

  if (runtimeRole === "owner") {
    return {
      authenticated: true,
      uid: uid || null,
      email: email || null,
      displayName: readRequesterName(requester) || email || "المالك",
      canManage: true,
      sourceEmployeeId: null,
    };
  }

  if (!uid && !email) return { authenticated: false, canManage: false };

  const row = await db
    .prepare(
      `SELECT id, uid, email, display_name, access_level, is_active
         FROM habat_attendance_access
        WHERE is_active = 1
          AND ((uid IS NOT NULL AND uid = ?) OR lower(email) = ?)
        ORDER BY CASE WHEN uid = ? THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1`
    )
    .bind(uid, email, uid)
    .first();

  if (!row) return { authenticated: false, canManage: false };

  return {
    authenticated: true,
    uid: uid || clean(row.uid) || null,
    email: clean(row.email).toLowerCase() || email || null,
    displayName: clean(row.display_name) || readRequesterName(requester) || email,
    canManage: clean(row.access_level) === "manager",
    sourceEmployeeId: clean(row.id) || null,
  };
}

async function listLegacyEmployees(db) {
  const result = await db
    .prepare(
      `SELECT id, uid, email, display_name, access_level, clock_enabled, is_active,
              created_at, updated_at
         FROM habat_attendance_access
        WHERE access_level = 'employee' OR clock_enabled = 1
        ORDER BY is_active DESC, display_name ASC, email ASC`
    )
    .all();

  return (result?.results || []).map(row => ({
    id: clean(row.id),
    uid: clean(row.uid) || null,
    email: clean(row.email).toLowerCase() || null,
    displayName: clean(row.display_name) || clean(row.email) || clean(row.id),
    isActive: Number(row.is_active) === 1,
    accessLevel: clean(row.access_level) || "employee",
    clockEnabled: Number(row.clock_enabled) === 1,
  }));
}

function readRequesterName(requester) {
  return (
    clean(requester?.userData?.displayName || requester?.userData?.name) ||
    clean(requester?.adminUserData?.displayName || requester?.adminUserData?.name)
  );
}

function clean(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
