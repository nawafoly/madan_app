const HABAT_SESSION_COOKIE = "habat_session";
const HABAT_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const HABAT_PASSWORD_MIN_LENGTH = 10;
const HABAT_LOGIN_MAX_FAILURES = 5;
const HABAT_LOGIN_LOCK_SECONDS = 15 * 60;
const HABAT_PASSWORD_ALGORITHM = "pbkdf2-sha256";
const HABAT_PASSWORD_ITERATIONS = 100000;

const TRUSTED_ORIGINS = new Set([
  "https://habat-alwaraq.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
]);

export async function handleHabatNativeAuthRequest({ request, url, db }) {
  if (!db) return null;

  const pathname = normalizePath(url?.pathname);
  if (!pathname.startsWith("/attendance/habat/auth/")) return null;

  if (pathname === "/attendance/habat/auth/login") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!isTrustedMutationOrigin(request)) return forbidden("habat_auth_origin_forbidden");
    return login(request, db);
  }

  if (pathname === "/attendance/habat/auth/logout") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!isTrustedMutationOrigin(request)) return forbidden("habat_auth_origin_forbidden");
    return logout(request, db);
  }

  if (pathname === "/attendance/habat/auth/session") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const requester = await resolveHabatNativeSessionContext({ request, db });
    if (!requester) return unauthorized("habat_session_required");
    return json(200, {
      ok: true,
      authenticated: true,
      authSource: "habat_session",
      mustChangePassword: requester.mustChangePassword,
      principal: {
        accessId: requester.accessId,
        uid: requester.uid || null,
        email: requester.email || null,
        displayName: resolveRequesterDisplayName(requester) || null,
        accessLevel: requester.accessLevel,
        canManage: requester.accessLevel === "manager",
        canClock: requester.clockEnabled,
      },
    });
  }

  if (pathname === "/attendance/habat/auth/change-password") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!isTrustedMutationOrigin(request)) return forbidden("habat_auth_origin_forbidden");
    return changePassword(request, db);
  }

  if (pathname === "/attendance/habat/auth/admin/credentials") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!isTrustedMutationOrigin(request)) return forbidden("habat_auth_origin_forbidden");
    return provisionCredentials(request, db);
  }

  if (pathname === "/attendance/habat/auth/admin/reset-password") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!isTrustedMutationOrigin(request)) return forbidden("habat_auth_origin_forbidden");
    return resetPasswordByManager(request, db);
  }

  return json(404, { ok: false, message: "not_found" });
}

export async function resolveHabatNativeSessionContext({ request, db }) {
  if (!db) return null;

  const token = readCookie(request, HABAT_SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256Base64Url(token);
  const now = new Date().toISOString();

  let row;
  try {
    row = await db
      .prepare(
        `SELECT
           s.id AS session_id,
           s.access_id,
           s.expires_at,
           a.uid,
           a.email,
           a.display_name,
           a.access_level,
           a.clock_enabled,
           a.is_active,
           c.must_change_password
         FROM habat_auth_sessions s
         INNER JOIN habat_attendance_access a
           ON a.id = s.access_id
         INNER JOIN habat_auth_credentials c ON c.access_id = a.id
         WHERE s.token_hash = ?
           AND s.revoked_at IS NULL
           AND s.expires_at > ?
           AND a.is_active = 1
         LIMIT 1`
      )
      .bind(tokenHash, now)
      .first();
  } catch (error) {
    console.error("[habat-native-auth] session lookup failed", error);
    return null;
  }

  if (!row) return null;

  const email = normalizeText(row.email).toLowerCase();
  const displayName = normalizeText(row.display_name);
  const accessLevel =
    normalizeText(row.access_level) === "manager" ? "manager" : "employee";

  return {
    ok: true,
    authSource: "habat_session",
    sessionId: normalizeText(row.session_id),
    accessId: normalizeText(row.access_id),
    // Preserve every existing attendance UID; new identities use their stable access ID.
    uid: normalizeText(row.uid) || normalizeText(row.access_id),
    mustChangePassword: Number(row.must_change_password) === 1,
    email,
    accessLevel,
    clockEnabled: Number(row.clock_enabled) === 1,
    runtime: {
      role: "guest",
      permissionsAllow: [],
      permissionsDeny: [],
      isActive: Number(row.is_active) === 1,
      sources: {
        habat: {
          role: "guest",
          rawRole: "",
          rawRoleKey: "",
          permissionsAllow: [],
          permissionsDeny: [],
          isActive: Number(row.is_active) === 1,
        },
      },
    },
    userData: {
      displayName: displayName || email,
      name: displayName || email,
      email: email || null,
    },
    adminUserData: null,
  };
}

async function login(request, db) {
  const body = await readJson(request);
  if (!body) return badRequest("invalid_json");

  const email = normalizeText(body.email).toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return badRequest("email_and_password_required");
  }

  let account;
  try {
    account = await db
      .prepare(
        `SELECT
           a.id AS access_id,
           a.uid,
           a.email,
           a.display_name,
           a.access_level,
           a.clock_enabled,
           a.is_active,
           c.password_hash,
           c.password_salt,
           c.password_algorithm,
           c.password_iterations,
           c.must_change_password,
           c.failed_login_attempts,
           c.locked_until
         FROM habat_attendance_access a
         INNER JOIN habat_auth_credentials c
           ON c.access_id = a.id
         WHERE lower(a.email) = ?
         LIMIT 1`
      )
      .bind(email)
      .first();
  } catch (error) {
    console.error("[habat-native-auth] login lookup failed", error);
    return json(500, { ok: false, message: "habat_auth_lookup_failed" });
  }

  if (!account || Number(account.is_active) !== 1) {
    return unauthorized("invalid_credentials");
  }

  const nowMs = Date.now();
  const lockedUntilMs = Date.parse(normalizeText(account.locked_until));
  if (Number.isFinite(lockedUntilMs) && lockedUntilMs > nowMs) {
    return json(429, {
      ok: false,
      message: "account_temporarily_locked",
      lockedUntil: new Date(lockedUntilMs).toISOString(),
    });
  }

  if (normalizeText(account.password_algorithm) !== HABAT_PASSWORD_ALGORITHM) {
    console.error("[habat-native-auth] unsupported password algorithm");
    return json(500, { ok: false, message: "habat_auth_algorithm_unsupported" });
  }

  const iterations = Number(account.password_iterations || 0);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return json(500, { ok: false, message: "habat_auth_iterations_invalid" });
  }

  let verified = false;
  try {
    verified = await verifyPassword({
      password,
      salt: normalizeText(account.password_salt),
      expectedHash: normalizeText(account.password_hash),
      iterations,
    });
  } catch (error) {
    console.error("[habat-native-auth] password verification failed", error);
    return json(500, { ok: false, message: "habat_auth_verification_failed" });
  }

  if (!verified) {
    const priorLockExpired =
      Number.isFinite(lockedUntilMs) && lockedUntilMs <= nowMs;
    const priorFailures = priorLockExpired
      ? 0
      : Math.max(0, Number(account.failed_login_attempts || 0));

    const nextFailures = priorFailures + 1;
    const nextLockedUntil =
      nextFailures >= HABAT_LOGIN_MAX_FAILURES
        ? new Date(nowMs + HABAT_LOGIN_LOCK_SECONDS * 1000).toISOString()
        : null;

    try {
      await db
        .prepare(
          `UPDATE habat_auth_credentials
           SET failed_login_attempts = ?,
               locked_until = ?,
               updated_at = ?
           WHERE access_id = ?`
        )
        .bind(
          nextFailures,
          nextLockedUntil,
          new Date(nowMs).toISOString(),
          account.access_id
        )
        .run();
    } catch (error) {
      console.warn("[habat-native-auth] failed-login counter update skipped", error);
    }

    if (nextLockedUntil) {
      return json(429, {
        ok: false,
        message: "account_temporarily_locked",
        lockedUntil: nextLockedUntil,
      });
    }

    return unauthorized("invalid_credentials");
  }

  try {
    await db
      .prepare(
        `UPDATE habat_auth_credentials
         SET failed_login_attempts = 0,
             locked_until = NULL,
             updated_at = ?
         WHERE access_id = ?`
      )
      .bind(new Date(nowMs).toISOString(), account.access_id)
      .run();
  } catch (error) {
    console.warn("[habat-native-auth] login-state reset skipped", error);
  }

  const issued = await issueSession({
    request,
    db,
    accessId: normalizeText(account.access_id),
  });

  return json(
    200,
    {
      ok: true,
      authenticated: true,
      authSource: "habat_session",
      mustChangePassword: Number(account.must_change_password) === 1,
      principal: {
        accessId: normalizeText(account.access_id),
        uid: normalizeText(account.uid) || normalizeText(account.access_id),
        email: normalizeText(account.email).toLowerCase() || null,
        displayName:
          normalizeText(account.display_name) ||
          normalizeText(account.email).toLowerCase() ||
          null,
        accessLevel:
          normalizeText(account.access_level) === "manager"
            ? "manager"
            : "employee",
        canManage: normalizeText(account.access_level) === "manager",
        canClock: Number(account.clock_enabled) === 1,
      },
    },
    {
      "Set-Cookie": buildSessionCookie(
        issued.token,
        HABAT_SESSION_MAX_AGE_SECONDS
      ),
    }
  );
}

async function logout(request, db) {
  const token = readCookie(request, HABAT_SESSION_COOKIE);

  if (token) {
    try {
      const tokenHash = await sha256Base64Url(token);
      await db
        .prepare(
          `UPDATE habat_auth_sessions
           SET revoked_at = COALESCE(revoked_at, ?)
           WHERE token_hash = ?`
        )
        .bind(new Date().toISOString(), tokenHash)
        .run();
    } catch (error) {
      console.warn("[habat-native-auth] logout revocation skipped", error);
    }
  }

  return json(
    200,
    { ok: true, authenticated: false },
    { "Set-Cookie": clearSessionCookie() }
  );
}

async function changePassword(request, db) {
  const requester = await resolveHabatNativeSessionContext({ request, db });
  if (!requester) return unauthorized("habat_session_required");

  const body = await readJson(request);
  if (!body) return badRequest("invalid_json");

  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (!currentPassword || !newPassword) {
    return badRequest("current_and_new_password_required");
  }
  if (newPassword.length < HABAT_PASSWORD_MIN_LENGTH) {
    return badRequest("password_too_short");
  }
  if (currentPassword === newPassword) {
    return badRequest("new_password_must_differ");
  }

  let credential;
  try {
    credential = await db
      .prepare(
        `SELECT
           password_hash,
           password_salt,
           password_algorithm,
           password_iterations
         FROM habat_auth_credentials
         WHERE access_id = ?
         LIMIT 1`
      )
      .bind(requester.accessId)
      .first();
  } catch (error) {
    console.error("[habat-native-auth] credential lookup failed", error);
    return json(500, { ok: false, message: "habat_auth_lookup_failed" });
  }

  if (!credential) return unauthorized("habat_credentials_missing");

  const verified = await verifyPassword({
    password: currentPassword,
    salt: normalizeText(credential.password_salt),
    expectedHash: normalizeText(credential.password_hash),
    iterations: Number(credential.password_iterations || 0),
  });

  if (!verified) return unauthorized("invalid_current_password");

  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToBase64Url(saltBytes);
  const passwordHash = await derivePasswordHash({
    password: newPassword,
    salt,
    iterations: HABAT_PASSWORD_ITERATIONS,
  });

  const now = new Date().toISOString();

  try {
    await db.batch([
      db
        .prepare(
          `UPDATE habat_auth_credentials
           SET password_hash = ?,
               password_salt = ?,
               password_algorithm = ?,
               password_iterations = ?,
               must_change_password = 0,
               failed_login_attempts = 0,
               locked_until = NULL,
               password_changed_at = ?,
               updated_at = ?
           WHERE access_id = ?`
        )
        .bind(
          passwordHash,
          salt,
          HABAT_PASSWORD_ALGORITHM,
          HABAT_PASSWORD_ITERATIONS,
          now,
          now,
          requester.accessId
        ),
      db
        .prepare(
          `UPDATE habat_auth_sessions
           SET revoked_at = COALESCE(revoked_at, ?)
           WHERE access_id = ?
             AND revoked_at IS NULL`
        )
        .bind(now, requester.accessId),
    ]);
  } catch (error) {
    console.error("[habat-native-auth] password update failed", error);
    return json(500, { ok: false, message: "habat_password_change_failed" });
  }

  const issued = await issueSession({
    request,
    db,
    accessId: requester.accessId,
  });

  return json(
    200,
    { ok: true, passwordChanged: true },
    {
      "Set-Cookie": buildSessionCookie(
        issued.token,
        HABAT_SESSION_MAX_AGE_SECONDS
      ),
    }
  );
}

async function requireManager(request, db) {
  const requester = await resolveHabatNativeSessionContext({ request, db });
  if (!requester) {
    return {
      ok: false,
      response: unauthorized("habat_session_required"),
    };
  }

  if (requester.accessLevel !== "manager") {
    return {
      ok: false,
      response: forbidden("habat_manager_required"),
    };
  }

  if (requester.mustChangePassword) {
    return { ok: false, response: forbidden("habat_password_change_required") };
  }

  return { ok: true, requester };
}

async function provisionCredentials(request, db) {
  const manager = await requireManager(request, db);
  if (!manager.ok) return manager.response;

  const body = await readJson(request);
  if (!body) return badRequest("invalid_json");

  const accessId = normalizeText(body.accessId);
  const password = String(body.password ?? "");

  if (!accessId || !password) {
    return badRequest("access_id_and_password_required");
  }

  if (password.length < HABAT_PASSWORD_MIN_LENGTH) {
    return badRequest("password_too_short");
  }

  const access = await db
    .prepare(
      `SELECT id, email, display_name, access_level, clock_enabled, is_active
       FROM habat_attendance_access
       WHERE id = ?
       LIMIT 1`
    )
    .bind(accessId)
    .first();

  if (!access) return json(404, { ok: false, message: "habat_access_not_found" });
  if (Number(access.is_active) !== 1) {
    return badRequest("habat_access_inactive");
  }

  const existing = await db
    .prepare(
      `SELECT access_id
       FROM habat_auth_credentials
       WHERE access_id = ?
       LIMIT 1`
    )
    .bind(accessId)
    .first();

  if (existing) {
    return json(409, {
      ok: false,
      message: "habat_credentials_already_exist",
    });
  }

  const hashed = await hashHabatPassword(password);
  const now = new Date().toISOString();

  try {
    await db
      .prepare(
        `INSERT INTO habat_auth_credentials (
           access_id,
           password_hash,
           password_salt,
           password_algorithm,
           password_iterations,
           must_change_password,
           failed_login_attempts,
           locked_until,
           password_changed_at,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, 1, 0, NULL, ?, ?, ?)`
      )
      .bind(
        accessId,
        hashed.passwordHash,
        hashed.passwordSalt,
        hashed.passwordAlgorithm,
        hashed.passwordIterations,
        now,
        now,
        now
      )
      .run();

    await writeAuthAudit(
      db,
      manager.requester,
      "create_auth_credentials",
      accessId,
      null,
      {
        accessId,
        email: normalizeText(access.email).toLowerCase() || null,
        mustChangePassword: true,
      }
    );
  } catch (error) {
    console.error("[habat-native-auth] credential provisioning failed", error);
    return json(500, {
      ok: false,
      message: "habat_credentials_create_failed",
    });
  }

  return json(200, {
    ok: true,
    accessId,
    credentialsCreated: true,
    mustChangePassword: true,
  });
}

async function resetPasswordByManager(request, db) {
  const manager = await requireManager(request, db);
  if (!manager.ok) return manager.response;

  const body = await readJson(request);
  if (!body) return badRequest("invalid_json");

  const accessId = normalizeText(body.accessId);
  const password = String(body.password ?? "");

  if (!accessId || !password) {
    return badRequest("access_id_and_password_required");
  }

  if (password.length < HABAT_PASSWORD_MIN_LENGTH) {
    return badRequest("password_too_short");
  }

  const credential = await db
    .prepare(
      `SELECT access_id
       FROM habat_auth_credentials
       WHERE access_id = ?
       LIMIT 1`
    )
    .bind(accessId)
    .first();

  if (!credential) {
    return json(404, {
      ok: false,
      message: "habat_credentials_not_found",
    });
  }

  const hashed = await hashHabatPassword(password);
  const now = new Date().toISOString();

  try {
    await db.batch([
      db
        .prepare(
          `UPDATE habat_auth_credentials
           SET password_hash = ?,
               password_salt = ?,
               password_algorithm = ?,
               password_iterations = ?,
               must_change_password = 1,
               failed_login_attempts = 0,
               locked_until = NULL,
               password_changed_at = ?,
               updated_at = ?
           WHERE access_id = ?`
        )
        .bind(
          hashed.passwordHash,
          hashed.passwordSalt,
          hashed.passwordAlgorithm,
          hashed.passwordIterations,
          now,
          now,
          accessId
        ),
      db
        .prepare(
          `UPDATE habat_auth_sessions
           SET revoked_at = COALESCE(revoked_at, ?)
           WHERE access_id = ?
             AND revoked_at IS NULL`
        )
        .bind(now, accessId),
    ]);

    await writeAuthAudit(
      db,
      manager.requester,
      "reset_auth_password",
      accessId,
      null,
      {
        accessId,
        mustChangePassword: true,
        sessionsRevoked: true,
      }
    );
  } catch (error) {
    console.error("[habat-native-auth] manager password reset failed", error);
    return json(500, {
      ok: false,
      message: "habat_password_reset_failed",
    });
  }

  return json(200, {
    ok: true,
    accessId,
    passwordReset: true,
    mustChangePassword: true,
    sessionsRevoked: true,
  });
}

async function writeAuthAudit(
  db,
  requester,
  action,
  entityId,
  before,
  after
) {
  try {
    await db
      .prepare(
        `INSERT INTO habat_attendance_audit (
           id,
           actor_uid,
           actor_email,
           action,
           entity_type,
           entity_id,
           before_json,
           after_json,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `habat_audit_${crypto.randomUUID()}`,
        normalizeText(requester?.uid) || null,
        normalizeText(requester?.email).toLowerCase() || null,
        action,
        "habat_auth_credentials",
        entityId || null,
        before == null ? null : JSON.stringify(before),
        after == null ? null : JSON.stringify(after),
        new Date().toISOString()
      )
      .run();
  } catch (error) {
    console.warn("[habat-native-auth] audit write skipped", error);
  }
}

async function issueSession({ request, db, accessId }) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64Url(tokenBytes);
  const tokenHash = await sha256Base64Url(token);
  const id = crypto.randomUUID();

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + HABAT_SESSION_MAX_AGE_SECONDS * 1000
  ).toISOString();

  const ip =
    normalizeText(request.headers.get("CF-Connecting-IP")) ||
    normalizeText(request.headers.get("X-Forwarded-For")).split(",")[0] ||
    null;
  const userAgent = normalizeText(request.headers.get("User-Agent")) || null;

  await db
    .prepare(
      `INSERT INTO habat_auth_sessions (
         id,
         access_id,
         token_hash,
         expires_at,
         created_ip,
         created_user_agent,
         last_seen_at,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      accessId,
      tokenHash,
      expiresAt,
      ip,
      userAgent,
      now.toISOString(),
      now.toISOString()
    )
    .run();

  return { id, token, expiresAt };
}

export async function hashHabatPassword(
  password,
  iterations = HABAT_PASSWORD_ITERATIONS
) {
  const value = String(password ?? "");
  if (value.length < HABAT_PASSWORD_MIN_LENGTH) {
    throw new Error("password_too_short");
  }

  const salt = bytesToBase64Url(
    crypto.getRandomValues(new Uint8Array(16))
  );
  const passwordHash = await derivePasswordHash({
    password: value,
    salt,
    iterations,
  });

  return {
    passwordHash,
    passwordSalt: salt,
    passwordAlgorithm: HABAT_PASSWORD_ALGORITHM,
    passwordIterations: iterations,
  };
}

async function verifyPassword({
  password,
  salt,
  expectedHash,
  iterations,
}) {
  if (!salt || !expectedHash || !Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const actualHash = await derivePasswordHash({
    password,
    salt,
    iterations,
  });

  return timingSafeTextEqual(actualHash, expectedHash);
}

async function derivePasswordHash({ password, salt, iterations }) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password ?? "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlToBytes(salt),
      iterations,
    },
    material,
    256
  );

  return bytesToBase64Url(new Uint8Array(bits));
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value ?? ""))
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

function timingSafeTextEqual(left, right) {
  const a = new TextEncoder().encode(String(left ?? ""));
  const b = new TextEncoder().encode(String(right ?? ""));

  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index] ^ b[index];
  }
  return mismatch === 0;
}

function readCookie(request, name) {
  const raw = String(request?.headers?.get("Cookie") || "");
  if (!raw) return "";

  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;

    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return part.slice(index + 1).trim();
    }
  }

  return "";
}

function buildSessionCookie(token, maxAgeSeconds) {
  return [
    `${HABAT_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/habat-api",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

function clearSessionCookie() {
  return [
    `${HABAT_SESSION_COOKIE}=`,
    "Path=/habat-api",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function isTrustedMutationOrigin(request) {
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return false;
  const origin = normalizeText(request?.headers?.get("Origin"));
  if (!origin) return true;
  if (TRUSTED_ORIGINS.has(origin)) return true;

  try {
    const url = new URL(origin);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".habat-alwaraq.pages.dev")
    );
  } catch {
    return false;
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function resolveRequesterDisplayName(requester) {
  return (
    normalizeText(requester?.userData?.displayName) ||
    normalizeText(requester?.userData?.name) ||
    normalizeText(requester?.email) ||
    ""
  );
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0
      ? ""
      : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizePath(value) {
  const path = String(value || "").trim();
  if (!path) return "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function json(status, payload, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });

  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }

  return new Response(JSON.stringify(payload), { status, headers });
}

function badRequest(message) {
  return json(400, { ok: false, message });
}

function unauthorized(message) {
  return json(401, { ok: false, message });
}

function forbidden(message) {
  return json(403, { ok: false, message });
}

function methodNotAllowed(allowed) {
  return new Response(
    JSON.stringify({ ok: false, message: "method_not_allowed" }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Allow: allowed.join(", "),
        "Cache-Control": "no-store",
      },
    }
  );
}
