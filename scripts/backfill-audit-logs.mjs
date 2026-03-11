import admin from "firebase-admin";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { diffAuditSnapshots, writeAuditLogEntry } = require("../functions/audit.js");

const SCRIPT_SOURCE = {
  area: "script",
  page: "backfill-audit-logs",
  route: "scripts/backfill-audit-logs.mjs",
  method: "backfill_snapshot",
};

const SCRIPT_ACTOR = {
  uid: "system-backfill",
  name: "Audit Backfill Script",
  email: "",
  role: "script",
};

const args = process.argv.slice(2);
const argSet = new Set(args);
const dryRun = argSet.has("--dry-run");
const force = argSet.has("--force");
const help = argSet.has("--help");
const limit = readNumericArg("--limit");
const collectionFilter = readCsvArg("--collections");
const runId = new Date().toISOString().replace(/[:.]/g, "-");

const COLLECTION_CONFIGS = [
  {
    collection: "projects",
    action: "project_snapshot_backfilled",
    category: "project",
    entityType: "project",
    paths: [
      "title",
      "titleAr",
      "status",
      "targetAmount",
      "currentAmount",
      "pendingAmount",
      "investorsCount",
      "profitRate",
      "expectedReturn",
      "roi",
      "durationMonths",
      "startAt",
      "endAt",
      "publishedAt",
      "closedAt",
      "isPublished",
      "isClosed",
    ],
    relatedIds: (id) => ({ projectId: id }),
    message: (id, data) =>
      `Backfilled current project snapshot for ${pickString(data?.titleAr, data?.title, id)}`,
    timestampFields: ["createdAt", "updatedAt", "publishedAt", "closedAt"],
    meta: (_id, data) => ({
      projectName: pickString(data?.titleAr, data?.title),
    }),
  },
  {
    collection: "investments",
    action: "investment_snapshot_backfilled",
    category: "investment",
    entityType: "investment",
    paths: [
      "status",
      "contractStatus",
      "amount",
      "approvedAmount",
      "projectId",
      "investorUid",
      "requestId",
      "sourceRequestId",
      "sourceMessageId",
      "contractId",
      "startAt",
      "plannedEndAt",
      "expectedProfit",
      "annualReturnAtSign",
      "durationMonthsAtSign",
      "termsLockedAt",
      "signedAt",
      "approvedAt",
      "completedAt",
      "createdAt",
    ],
    relatedIds: (id, data) =>
      compactObject({
        projectId: pickString(data?.projectId),
        investmentId: id,
        requestId: pickString(data?.requestId, data?.sourceRequestId, data?.sourceMessageId),
        userId: pickString(data?.investorUid),
        contractId: pickString(data?.contractId),
      }),
    message: (id) => `Backfilled current investment snapshot for ${id}`,
    timestampFields: [
      "createdAt",
      "approvedAt",
      "signedAt",
      "completedAt",
      "updatedAt",
    ],
    meta: (id, data) => ({
      projectId: pickString(data?.projectId),
      investmentCode: id,
      amount: numericOrNull(data?.approvedAmount ?? data?.amount),
    }),
  },
  {
    collection: "interest_requests",
    action: "request_snapshot_backfilled",
    category: "request",
    entityType: "request",
    paths: [
      "status",
      "type",
      "amount",
      "projectId",
      "investmentId",
      "investorUid",
      "userId",
      "createdByUid",
      "linkedMessageId",
      "adminSeen",
      "assignedTo",
      "createdAt",
      "updatedAt",
    ],
    relatedIds: (id, data) =>
      compactObject({
        projectId: pickString(data?.projectId),
        investmentId: pickString(data?.investmentId),
        requestId: id,
        userId: pickString(data?.investorUid, data?.userId, data?.createdByUid),
      }),
    message: (id) => `Backfilled current request snapshot for ${id}`,
    timestampFields: ["createdAt", "updatedAt"],
    meta: (id, data) => ({
      requestCode: id,
      projectId: pickString(data?.projectId),
    }),
  },
  {
    collection: "messages",
    action: "message_snapshot_backfilled",
    category: "message",
    entityType: "message",
    paths: [
      "status",
      "type",
      "category",
      "projectId",
      "requestId",
      "investmentId",
      "createdByUid",
      "userId",
      "adminSeen",
      "email",
      "phone",
      "createdAt",
      "updatedAt",
    ],
    relatedIds: (id, data) =>
      compactObject({
        projectId: pickString(data?.projectId),
        investmentId: pickString(data?.investmentId),
        requestId: pickString(data?.requestId),
        userId: pickString(data?.createdByUid, data?.userId),
      }),
    message: (id) => `Backfilled current message snapshot for ${id}`,
    timestampFields: ["createdAt", "updatedAt"],
    meta: (id, data) => ({
      messageId: id,
      projectId: pickString(data?.projectId),
    }),
  },
  {
    collection: "contracts",
    action: "contract_snapshot_backfilled",
    category: "contract",
    entityType: "contract",
    paths: [
      "status",
      "investmentId",
      "projectId",
      "userId",
      "investorUid",
      "fileName",
      "fileUrl",
      "path",
      "storagePath",
      "uploadedAt",
      "signedAt",
      "version",
      "metadata",
      "createdAt",
      "updatedAt",
    ],
    relatedIds: (id, data) =>
      compactObject({
        projectId: pickString(data?.projectId),
        investmentId: pickString(data?.investmentId),
        contractId: id,
        userId: pickString(data?.investorUid, data?.userId),
      }),
    message: (id) => `Backfilled current contract snapshot for ${id}`,
    timestampFields: ["signedAt", "uploadedAt", "createdAt", "updatedAt"],
    meta: (id, data) => ({
      contractId: id,
      fileName: pickString(data?.fileName),
    }),
  },
  {
    collection: "users",
    action: "user_snapshot_backfilled",
    category: "user",
    entityType: "user",
    paths: [
      "role",
      "email",
      "displayName",
      "phone",
      "isInvestor",
      "isActive",
      "source",
      "roleKeySource",
      "createdAt",
      "updatedAt",
    ],
    relatedIds: (id) => ({ userId: id }),
    message: (id, data) =>
      `Backfilled current user snapshot for ${pickString(data?.displayName, data?.email, id)}`,
    timestampFields: ["createdAt", "updatedAt"],
    meta: (id, data) => ({
      userId: id,
      email: pickString(data?.email),
      role: pickString(data?.role),
    }),
  },
  {
    collection: "settings",
    action: "settings_snapshot_backfilled",
    category: "settings",
    entityType: "settings",
    paths: [],
    snapshot: (_id, data) => compactObject(data || {}),
    relatedIds: () => ({}),
    message: (id) => `Backfilled current settings snapshot for ${id}`,
    timestampFields: ["updatedAt", "createdAt"],
    meta: (id) => ({
      settingsKey: id,
    }),
  },
];

if (help) {
  printHelp();
  process.exit(0);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function main() {
  const configs = COLLECTION_CONFIGS.filter(
    (config) => !collectionFilter || collectionFilter.has(config.collection)
  );

  if (!configs.length) {
    throw new Error("No collections matched --collections filter.");
  }

  const summary = {
    runId,
    dryRun,
    force,
    limit: limit || null,
    scanned: 0,
    created: 0,
    skipped: 0,
    collections: {},
  };

  for (const config of configs) {
    const result = await processCollection(config);
    summary.scanned += result.scanned;
    summary.created += result.created;
    summary.skipped += result.skipped;
    summary.collections[config.collection] = result;
  }

  if (!dryRun) {
    await writeAuditLogEntry(
      db,
      {
        action: "system_backfill_executed",
        category: "system",
        severity: "warning",
        status: "success",
        message: `Audit backfill executed for ${summary.created} entities`,
        entityType: "system",
        entityId: `audit_backfill:${runId}`,
        entityPath: "audit_logs/*",
        relatedIds: {},
        source: {
          area: "script",
          page: "backfill-audit-logs",
          route: "scripts/backfill-audit-logs.mjs",
          method: "backfill_execute",
        },
        changes: [],
        meta: {
          backfilled: true,
          runId,
          dryRun: false,
          force,
          limit: limit || null,
          results: summary.collections,
        },
        clientTimestamp: Date.now(),
        occurredAt: new Date(),
        requestId: `backfill:summary:${runId}`,
      },
      { actorOverride: SCRIPT_ACTOR }
    );
  }

  console.log(JSON.stringify(summary, null, 2));
}

async function processCollection(config) {
  const result = {
    scanned: 0,
    created: 0,
    skipped: 0,
  };

  let query = db.collection(config.collection);
  if (limit && limit > 0) {
    query = query.limit(limit);
  }

  const snap = await query.get();

  for (const docSnap of snap.docs) {
    result.scanned += 1;
    const data = docSnap.data() || {};
    const snapshot = buildSnapshot(config, docSnap.id, data);
    const docId = buildBackfillDocId(config.collection, docSnap.id);
    const requestId = `backfill:${config.collection}:${docSnap.id}`;

    if (!Object.keys(snapshot).length) {
      result.skipped += 1;
      continue;
    }

    if (!force) {
      const exists = await db.doc(`audit_logs/${docId}`).get();
      if (exists.exists) {
        result.skipped += 1;
        continue;
      }
    }

    const eventTime = resolveEventTime(data, config.timestampFields);
    const changes = diffAuditSnapshots(null, snapshot);
    const payload = {
      action: config.action,
      category: config.category,
      severity: "info",
      status: "success",
      message: config.message(docSnap.id, data),
      entityType: config.entityType,
      entityId: docSnap.id,
      entityPath: `${config.collection}/${docSnap.id}`,
      relatedIds: config.relatedIds(docSnap.id, data),
      source: SCRIPT_SOURCE,
      changes,
      meta: compactObject({
        backfilled: true,
        confidence: "high",
        sourceCollection: config.collection,
        sourceDocId: docSnap.id,
        snapshotType: "current_document_state",
        timestampSource: eventTime.source,
        occurredAt: eventTime.date.toISOString(),
        snapshotFieldCount: Object.keys(snapshot).length,
        ...config.meta(docSnap.id, data),
      }),
      clientTimestamp: eventTime.date.getTime(),
      occurredAt: eventTime.date,
      requestId,
    };

    if (dryRun) {
      result.created += 1;
      console.log(`[dry-run] ${config.collection}/${docSnap.id} -> ${config.action}`);
      continue;
    }

    await writeAuditLogEntry(db, payload, {
      actorOverride: SCRIPT_ACTOR,
      docId,
    });
    result.created += 1;
  }

  return result;
}

function buildSnapshot(config, id, data) {
  const projected =
    typeof config.snapshot === "function"
      ? config.snapshot(id, data)
      : projectPaths(data, config.paths || []);

  const compacted = compactObject(projected);
  if (Object.keys(compacted).length) return compacted;

  return compactObject({
    id,
    status: pickString(data?.status),
    projectId: pickString(data?.projectId),
    investmentId: pickString(data?.investmentId),
    userId: pickString(data?.userId, data?.investorUid),
    email: pickString(data?.email),
  });
}

function projectPaths(source, paths) {
  const out = {};
  for (const path of paths) {
    const value = readPath(source, path);
    if (value === undefined) continue;
    setPath(out, path, value);
  }
  return out;
}

function readPath(source, path) {
  if (!source || typeof source !== "object") return undefined;
  const parts = String(path || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }

  return current;
}

function setPath(target, path, value) {
  const parts = String(path || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return;

  let current = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }

    if (!current[part] || typeof current[part] !== "object" || Array.isArray(current[part])) {
      current[part] = {};
    }
    current = current[part];
  });
}

function compactObject(value) {
  if (Array.isArray(value)) {
    const next = value
      .map((entry) => compactObject(entry))
      .filter((entry) => entry !== undefined);
    return next;
  }

  if (value && typeof value === "object" && !(value instanceof Date) && !isTimestampLike(value)) {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      const compacted = compactObject(entry);
      if (compacted === undefined) continue;
      out[key] = compacted;
    }
    return out;
  }

  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  return value;
}

function isTimestampLike(value) {
  return value instanceof admin.firestore.Timestamp || typeof value?.toDate === "function";
}

function resolveEventTime(data, fields) {
  for (const field of fields || []) {
    const value = readPath(data, field);
    const date = toDateSafe(value);
    if (date) {
      return { source: field, date };
    }
  }
  return { source: "script_run_time", date: new Date() };
}

function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof admin.firestore.Timestamp) return value.toDate();
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  return null;
}

function pickString(...values) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function numericOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildBackfillDocId(collection, id) {
  return `backfill__${sanitizeId(collection)}__${sanitizeId(id)}`;
}

function sanitizeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 180);
}

function readNumericArg(name) {
  const raw = readNamedArg(name);
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
}

function readCsvArg(name) {
  const raw = readNamedArg(name);
  if (!raw) return null;
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? new Set(values) : null;
}

function readNamedArg(name) {
  const prefix = `${name}=`;
  const match = args.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function printHelp() {
  console.log(`Usage: node scripts/backfill-audit-logs.mjs [options]

Options:
  --dry-run                 Scan and print what would be created without writing logs
  --force                   Recreate deterministic backfill docs even if they already exist
  --limit=N                 Limit scanned docs per collection
  --collections=a,b,c       Only process specific collections
  --help                    Show this help

Environment:
  GOOGLE_APPLICATION_CREDENTIALS must point to a Firebase service account JSON file.
`);
}

main().catch((error) => {
  console.error("[backfill-audit-logs] failed", error);
  process.exit(1);
});
