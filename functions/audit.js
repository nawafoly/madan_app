const admin = require("firebase-admin");

const MAX_CHANGES = 80;
const MAX_DEPTH = 5;

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeAuditValue(value, depth = 0, seen = new WeakSet()) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate().toISOString();
    } catch {
      return String(value);
    }
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return value.length ? ["[truncated]"] : [];
    return value.slice(0, 25).map((entry) => normalizeAuditValue(entry, depth + 1, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    if (depth >= MAX_DEPTH) return "[truncated]";
    const out = {};
    Object.keys(value)
      .sort()
      .slice(0, 50)
      .forEach((key) => {
        out[key] = normalizeAuditValue(value[key], depth + 1, seen);
      });
    return out;
  }
  return String(value);
}

function stableStringify(value) {
  return JSON.stringify(normalizeAuditValue(value));
}

function pathIgnored(path, ignoreFields) {
  return ignoreFields.some(
    (field) =>
      path === field ||
      path.startsWith(`${field}.`) ||
      path.startsWith(`${field}[`) ||
      path.endsWith(`.${field}`)
  );
}

function diffWalk(before, after, path, out, ignoreFields) {
  if (out.length >= MAX_CHANGES) return;
  if (path && pathIgnored(path, ignoreFields)) return;

  const left = normalizeAuditValue(before);
  const right = normalizeAuditValue(after);

  if (stableStringify(left) === stableStringify(right)) return;

  if (Array.isArray(left) || Array.isArray(right)) {
    out.push({ field: path || "value", before: left, after: right });
    return;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    Array.from(keys)
      .sort()
      .forEach((key) => {
        diffWalk(left[key], right[key], path ? `${path}.${key}` : key, out, ignoreFields);
      });
    return;
  }

  out.push({ field: path || "value", before: left, after: right });
}

function diffAuditSnapshots(before, after, options = {}) {
  const out = [];
  diffWalk(before, after, options.prefix || "", out, options.ignoreFields || []);
  return out;
}

function diffAuditTargets(targets, options = {}) {
  const multiple = targets.length > 1;
  return targets.flatMap((target) =>
    diffAuditSnapshots(target.before, target.after, {
      prefix: multiple && target.label ? target.label : "",
      ignoreFields: options.ignoreFields || [],
    })
  );
}

function changedKeysFromChanges(changes) {
  return Array.from(
    new Set(
      (changes || [])
        .map((change) => String(change?.field || "").split(".")[0]?.split("[")[0]?.trim())
        .filter(Boolean)
    )
  );
}

function toAuditTimestamp(value) {
  if (value instanceof admin.firestore.Timestamp) return value;
  if (value instanceof Date) return admin.firestore.Timestamp.fromDate(value);
  if (typeof value?.toDate === "function") {
    try {
      return admin.firestore.Timestamp.fromDate(value.toDate());
    } catch {
      return null;
    }
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return admin.firestore.Timestamp.fromMillis(numeric);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return admin.firestore.Timestamp.fromDate(parsed);
    }
  }

  return null;
}

async function resolveActor(db, options = {}) {
  if (options.actorOverride) {
    return {
      uid: String(options.actorOverride.uid || "system"),
      name: String(options.actorOverride.name || "System"),
      email: String(options.actorOverride.email || ""),
      role: String(options.actorOverride.role || "system"),
    };
  }

  const auth = options.auth || null;
  if (!auth?.uid) {
    return {
      uid: "system",
      name: "System",
      email: "",
      role: "system",
    };
  }

  try {
    const snap = await db.doc(`users/${auth.uid}`).get();
    const data = snap.exists ? snap.data() || {} : {};
    return {
      uid: auth.uid,
      name: String(data.displayName || data.name || auth.token?.name || auth.token?.email || "Unknown"),
      email: String(data.email || auth.token?.email || ""),
      role: String(data.role || "guest"),
    };
  } catch (error) {
    console.error("[audit] failed to resolve actor", error);
    return {
      uid: auth.uid,
      name: String(auth.token?.name || auth.token?.email || "Unknown"),
      email: String(auth.token?.email || ""),
      role: "guest",
    };
  }
}

async function writeAuditLogEntry(db, payload, options = {}) {
  const actor = await resolveActor(db, options);
  const changes = Array.isArray(payload?.changes)
    ? payload.changes.slice(0, MAX_CHANGES).map((change) => ({
        field: String(change?.field || "value"),
        before: normalizeAuditValue(change?.before),
        after: normalizeAuditValue(change?.after),
      }))
    : [];

  const meta = normalizeAuditValue(payload?.meta) || {};
  const sourceRaw = payload?.source || {};
  const source = {
    area: String(sourceRaw.area || "function"),
    page: String(sourceRaw.page || "unknown"),
    route: String(sourceRaw.route || sourceRaw.page || ""),
    method: String(sourceRaw.method || "unknown"),
  };

  const docData = {
    action: String(payload?.action || "unknown_action"),
    category: String(payload?.category || "system"),
    severity: String(payload?.severity || "info"),
    status: String(payload?.status || "success"),
    message: String(payload?.message || payload?.action || "Audit event"),
    entityType: String(payload?.entityType || "unknown"),
    entityId: String(payload?.entityId || ""),
    entityPath: String(payload?.entityPath || ""),
    relatedIds: normalizeAuditValue(payload?.relatedIds) || {},
    actor,
    source,
    changes,
    meta: {
      ...(meta || {}),
      changedKeys:
        Array.isArray(meta?.changedKeys) && meta.changedKeys.length
          ? meta.changedKeys
          : changedKeysFromChanges(changes),
    },
    occurredAt: toAuditTimestamp(payload?.occurredAt ?? payload?.clientTimestamp ?? Date.now()),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    clientTimestamp: Number(payload?.clientTimestamp || Date.now()),
    requestId: String(payload?.requestId || createId()),
    sessionId: payload?.sessionId ? String(payload.sessionId) : null,
  };

  if (options.docId) {
    const ref = db.collection("audit_logs").doc(String(options.docId));
    await ref.set(docData, { merge: false });
    return ref.id;
  }

  const ref = await db.collection("audit_logs").add(docData);
  return ref.id;
}

async function safeWriteAuditLog(db, payload, options = {}) {
  try {
    return await writeAuditLogEntry(db, payload, options);
  } catch (error) {
    console.error("[audit] failed to persist audit log", error, {
      action: payload?.action,
      entityType: payload?.entityType,
      entityId: payload?.entityId,
    });
    return null;
  }
}

module.exports = {
  changedKeysFromChanges,
  diffAuditSnapshots,
  diffAuditTargets,
  normalizeAuditValue,
  safeWriteAuditLog,
  writeAuditLogEntry,
};
