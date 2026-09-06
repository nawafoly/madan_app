const HABAT_FIREBASE_PROJECT_ID = "index-599e8";
const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let firebaseJwksCache = {
  expiresAt: 0,
  keys: [],
};

/**
 * Habbat Al Waraq is authorized by its own D1 access table. Authentication must
 * therefore not require a Maedin users/admin_users Firestore document to exist.
 *
 * We still try the legacy resolver after verifying the token so existing Maedin
 * owner accounts retain bootstrap-manager behavior during the transition. A
 * missing/inactive Maedin runtime is not an authorization failure for Habbat;
 * the Habbat access table remains the source of truth.
 */
export async function resolveHabatRequesterContext(request, legacyResolver) {
  const idToken = readBearerToken(request);
  if (!idToken) {
    return unauthorized("missing_firebase_id_token");
  }

  let payload;
  try {
    payload = await verifyFirebaseIdToken(idToken, HABAT_FIREBASE_PROJECT_ID);
  } catch (error) {
    console.warn("[habat-auth] Firebase token verification failed", error);
    return unauthorized("invalid_firebase_id_token");
  }

  const uid = normalizeText(payload?.user_id || payload?.sub);
  const email = normalizeText(payload?.email).toLowerCase();
  const displayName =
    normalizeText(payload?.name || payload?.display_name) || email || uid;

  const fallbackRuntime = {
    role: "guest",
    permissionsAllow: [],
    permissionsDeny: [],
    isActive: true,
    sources: {
      habat: {
        role: "guest",
        rawRole: "",
        rawRoleKey: "",
        permissionsAllow: [],
        permissionsDeny: [],
        isActive: true,
      },
    },
  };

  let legacy = null;
  if (typeof legacyResolver === "function") {
    try {
      legacy = await legacyResolver(request);
    } catch (error) {
      console.warn("[habat-auth] legacy requester lookup skipped", error);
    }
  }

  const useLegacyRuntime = Boolean(legacy?.ok && legacy?.runtime?.isActive);

  return {
    ok: true,
    idToken,
    projectId: HABAT_FIREBASE_PROJECT_ID,
    uid,
    email: email || normalizeText(legacy?.email).toLowerCase(),
    runtime: useLegacyRuntime ? legacy.runtime : fallbackRuntime,
    userData:
      legacy?.ok && legacy?.userData
        ? legacy.userData
        : displayName
          ? { displayName, name: displayName, email: email || null }
          : null,
    adminUserData:
      legacy?.ok && legacy?.adminUserData ? legacy.adminUserData : null,
  };
}

export async function verifyFirebaseIdToken(token, projectId) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt_shape");

  const header = decodeBase64UrlJson(parts[0]);
  const payload = decodeBase64UrlJson(parts[1]);
  validateFirebaseTokenClaims(header, payload, projectId);

  const jwks = await getFirebaseJwks();
  let jwk = jwks.find(key => key.kid === header.kid);
  if (!jwk) {
    firebaseJwksCache.expiresAt = 0;
    const refreshed = await getFirebaseJwks();
    jwk = refreshed.find(key => key.kid === header.kid);
    if (!jwk) throw new Error("firebase_jwk_not_found");
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64UrlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!verified) throw new Error("firebase_signature_invalid");

  return payload;
}

export function validateFirebaseTokenClaims(header, payload, projectId, now) {
  const normalizedProjectId = normalizeText(projectId);
  const nowSeconds = Number.isFinite(now) ? now : Math.floor(Date.now() / 1000);

  if (!normalizedProjectId) throw new Error("firebase_project_id_missing");
  if (header?.alg !== "RS256" || !normalizeText(header?.kid)) {
    throw new Error("firebase_header_invalid");
  }
  if (payload?.aud !== normalizedProjectId) {
    throw new Error("firebase_audience_invalid");
  }
  if (payload?.iss !== `https://securetoken.google.com/${normalizedProjectId}`) {
    throw new Error("firebase_issuer_invalid");
  }
  if (!normalizeText(payload?.sub) || normalizeText(payload?.sub).length > 128) {
    throw new Error("firebase_subject_invalid");
  }
  if (!Number.isFinite(payload?.exp) || payload.exp <= nowSeconds) {
    throw new Error("firebase_token_expired");
  }
  if (!Number.isFinite(payload?.iat) || payload.iat > nowSeconds + 60) {
    throw new Error("firebase_issued_at_invalid");
  }
  if (
    payload?.auth_time !== undefined &&
    (!Number.isFinite(payload.auth_time) || payload.auth_time > nowSeconds + 60)
  ) {
    throw new Error("firebase_auth_time_invalid");
  }
  return true;
}

async function getFirebaseJwks() {
  const now = Date.now();
  if (firebaseJwksCache.keys.length && firebaseJwksCache.expiresAt > now) {
    return firebaseJwksCache.keys;
  }

  const response = await fetch(FIREBASE_JWKS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("firebase_jwks_fetch_failed");

  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  if (!keys.length) throw new Error("firebase_jwks_empty");

  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 3600);
  firebaseJwksCache = {
    keys,
    expiresAt: now + Math.max(60, maxAge) * 1000,
  };
  return keys;
}

function readBearerToken(request) {
  const header = String(request?.headers?.get("Authorization") || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function decodeBase64UrlJson(value) {
  const text = new TextDecoder().decode(decodeBase64UrlBytes(value));
  return JSON.parse(text);
}

function decodeBase64UrlBytes(value) {
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

function normalizeText(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

function unauthorized(message) {
  return {
    ok: false,
    response: new Response(JSON.stringify({ ok: false, message }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  };
}
