import {
  deleteDoc as firestoreDeleteDoc,
  getDoc,
  setDoc as firestoreSetDoc,
  Timestamp,
  updateDoc as firestoreUpdateDoc,
  type DocumentData,
  type DocumentReference,
  type PartialWithFieldValue,
  type SetOptions,
  type WithFieldValue,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, firebaseFunctions } from "@/_core/firebase";

export const AUDIT_ACTIONS = {
  PROJECT_CREATED: "project_created",
  PROJECT_UPDATED: "project_updated",
  PROJECT_STATUS_CHANGED: "project_status_changed",
  PROJECT_DELETED: "project_deleted",
  PROJECT_REOPENED: "project_reopened",
  INVESTMENT_CREATED: "investment_created",
  INVESTMENT_APPROVED: "investment_approved",
  INVESTMENT_REJECTED: "investment_rejected",
  INVESTMENT_STATUS_CHANGED: "investment_status_changed",
  INVESTMENT_FINANCIALS_UPDATED: "investment_financials_updated",
  INVESTMENT_COMPLETED: "investment_completed",
  INVESTMENT_ACTIVATED: "investment_activated",
  REQUEST_CREATED: "request_created",
  REQUEST_UPDATED: "request_updated",
  REQUEST_STATUS_CHANGED: "request_status_changed",
  REQUEST_INITIAL_APPROVED: "request_initial_approved",
  REQUEST_CONVERTED_TO_INVESTMENT: "request_converted_to_investment",
  REQUEST_REOPENED: "request_reopened",
  REQUEST_REJECTED: "request_rejected",
  MESSAGE_CREATED: "message_created",
  MESSAGE_REVIEWED: "message_reviewed",
  REQUEST_REVIEWED: "request_reviewed",
  CONTRACT_CREATED: "contract_created",
  CONTRACT_UPLOADED: "contract_uploaded",
  CONTRACT_SIGNED: "contract_signed",
  CONTRACT_VERIFIED: "contract_verified",
  CONTRACT_REPLACED: "contract_replaced",
  CONTRACT_DELETED: "contract_deleted",
  USER_CREATED: "user_created",
  USER_UPDATED: "user_updated",
  USER_ROLE_UPDATED: "user_role_updated",
  USER_ENABLED: "user_enabled",
  USER_DISABLED: "user_disabled",
  ROLE_INVITE_CREATED: "role_invite_created",
  ROLE_INVITE_UPDATED: "role_invite_updated",
  ROLE_INVITE_DELETED: "role_invite_deleted",
  SETTINGS_UPDATED: "settings_updated",
  SETTINGS_IMPORTED: "settings_imported",
  AGGREGATES_RECOMPUTED: "aggregates_recomputed",
  USER_LOGIN: "user_login",
  SYSTEM_BACKFILL_EXECUTED: "system_backfill_executed",
  PROJECT_SNAPSHOT_BACKFILLED: "project_snapshot_backfilled",
  INVESTMENT_SNAPSHOT_BACKFILLED: "investment_snapshot_backfilled",
  CONTRACT_SNAPSHOT_BACKFILLED: "contract_snapshot_backfilled",
  REQUEST_SNAPSHOT_BACKFILLED: "request_snapshot_backfilled",
  MESSAGE_SNAPSHOT_BACKFILLED: "message_snapshot_backfilled",
  USER_SNAPSHOT_BACKFILLED: "user_snapshot_backfilled",
  SETTINGS_SNAPSHOT_BACKFILLED: "settings_snapshot_backfilled",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | string;
export type AuditCategory =
  | "project"
  | "investment"
  | "request"
  | "message"
  | "contract"
  | "user"
  | "settings"
  | "finance"
  | "system";
export type AuditSeverity = "info" | "warning" | "critical";
export type AuditStatus = "success" | "failed";
export type AuditArea = "admin" | "client" | "public" | "function" | "script";

export type AuditRelatedIds = Partial<{
  projectId: string;
  investmentId: string;
  requestId: string;
  contractId: string;
  userId: string;
}>;

export type AuditSourceInput = {
  area: AuditArea;
  page: string;
  route?: string;
  method: string;
};

export type AuditSource = {
  area: AuditArea;
  page: string;
  route: string;
  method: string;
};

export type AuditChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export type AuditActor = {
  uid: string;
  name: string;
  email: string;
  role: string;
};

export type AuditLogInput = {
  action: AuditAction;
  category: AuditCategory;
  severity?: AuditSeverity;
  status?: AuditStatus;
  message: string;
  entityType: string;
  entityId: string;
  entityPath?: string;
  relatedIds?: AuditRelatedIds;
  source: AuditSourceInput;
  changes?: AuditChange[];
  meta?: Record<string, unknown>;
  clientTimestamp?: number;
  occurredAt?: number | string | Date;
  requestId?: string;
  sessionId?: string;
  actor?: Partial<AuditActor>;
};

type AuditSnapshotTarget = {
  ref?: DocumentReference<DocumentData, DocumentData>;
  entityType?: string;
  entityId?: string;
  entityPath?: string;
  label?: string;
  before?: unknown;
  after?: unknown;
  captureBefore?: boolean;
  captureAfter?: boolean;
};

type AuditedOperationOptions<T> = {
  action: AuditAction;
  category: AuditCategory;
  severity?: AuditSeverity;
  source: AuditSourceInput;
  message: string | ((ctx: AuditedSuccessContext<T>) => string);
  entityType: string;
  entityId?: string;
  entityPath?: string;
  relatedIds?: AuditRelatedIds;
  meta?:
    | Record<string, unknown>
    | ((ctx: AuditedSuccessContext<T>) => Record<string, unknown> | undefined);
  execute: () => Promise<T>;
  targets?: AuditSnapshotTarget[];
  ignoreFields?: string[];
  recordFailure?: boolean;
  failureSeverity?: AuditSeverity;
  failureMessage?: string | ((error: unknown) => string);
  failureMeta?: Record<string, unknown> | ((error: unknown) => Record<string, unknown> | undefined);
};

type AuditedSuccessContext<T> = {
  result: T;
  changes: AuditChange[];
  targets: Array<{ target: AuditSnapshotTarget; before: unknown; after: unknown }>;
};

type AuditedSetDocOptions<T extends DocumentData> = Omit<
  AuditedOperationOptions<void>,
  "execute" | "targets" | "entityId" | "entityPath"
> & {
  ref: DocumentReference<T, DocumentData>;
  data: WithFieldValue<T> | PartialWithFieldValue<T>;
  options?: SetOptions;
  entityId?: string;
  entityPath?: string;
};

type AuditedUpdateDocOptions<T extends DocumentData> = Omit<
  AuditedOperationOptions<void>,
  "execute" | "targets" | "entityId" | "entityPath"
> & {
  ref: DocumentReference<T, DocumentData>;
  data: PartialWithFieldValue<T>;
  entityId?: string;
  entityPath?: string;
};

type AuditedDeleteDocOptions<T extends DocumentData> = Omit<
  AuditedOperationOptions<void>,
  "execute" | "targets" | "entityId" | "entityPath"
> & {
  ref: DocumentReference<T, DocumentData>;
  entityId?: string;
  entityPath?: string;
};

const AUDIT_FAILURES_KEY = "maedin.audit.failures";
const AUDIT_SESSION_KEY = "maedin.audit.session";
const MAX_CHANGES = 80;
const MAX_FAILURES = 25;
const MAX_DEPTH = 5;
const LOCAL_AUDIT_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const DEFAULT_IGNORED_FIELDS = [
  "updatedAt",
  "updatedByUid",
  "updatedByEmail",
  "events",
  "__skipAggregates",
];

const callable = httpsCallable<AuditLogInput, { id: string }>(firebaseFunctions, "writeAuditLog");
let didWarnAboutSkippedRemoteAudit = false;

function envFlagEnabled(value: string) {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function shouldSkipRemoteAuditLogging() {
  const configured = String(import.meta.env.VITE_ENABLE_REMOTE_AUDIT_LOGGING ?? "").trim();
  if (configured) return !envFlagEnabled(configured);
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  return LOCAL_AUDIT_HOSTS.has(window.location.hostname);
}

function warnRemoteAuditSkippedOnce() {
  if (didWarnAboutSkippedRemoteAudit) return;
  didWarnAboutSkippedRemoteAudit = true;
  console.warn(
    "[audit] remote audit logging is disabled on localhost in development. " +
      "Deploy Firebase Functions and set VITE_ENABLE_REMOTE_AUDIT_LOGGING=true to test it."
  );
}

function nowRoute() {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getAuditSessionId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(AUDIT_SESSION_KEY);
  if (existing) return existing;
  const created = createId();
  window.localStorage.setItem(AUDIT_SESSION_KEY, created);
  return created;
}

function rememberAuditFailure(payload: AuditLogInput, error: unknown) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(AUDIT_FAILURES_KEY);
    const current = raw ? (JSON.parse(raw) as unknown[]) : [];
    const next = [
      {
        at: new Date().toISOString(),
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId,
        error: formatError(error),
      },
      ...current,
    ].slice(0, MAX_FAILURES);
    window.localStorage.setItem(AUDIT_FAILURES_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors; console output is the primary fallback.
  }
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || null,
    };
  }
  return { message: String(error ?? "unknown_error") };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeAuditValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return ((value as { toDate: () => Date }).toDate() || new Date()).toISOString();
    } catch {
      return String(value);
    }
  }
  if (value instanceof File) {
    return {
      name: value.name,
      size: value.size,
      type: value.type,
      lastModified: value.lastModified,
    };
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return value.length ? ["[truncated]"] : [];
    return value.slice(0, 25).map((entry) => normalizeAuditValue(entry, depth + 1, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value as object)) return "[circular]";
    seen.add(value as object);
    if (depth >= MAX_DEPTH) return "[truncated]";
    const out: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>)
      .sort()
      .slice(0, 50)
      .forEach((key) => {
        out[key] = normalizeAuditValue(
          (value as Record<string, unknown>)[key],
          depth + 1,
          seen
        );
      });
    return out;
  }
  return String(value);
}

function stableStringify(value: unknown) {
  return JSON.stringify(normalizeAuditValue(value));
}

function pathIgnored(path: string, ignoreFields: string[]) {
  return ignoreFields.some(
    (field) =>
      path === field ||
      path.startsWith(`${field}.`) ||
      path.startsWith(`${field}[`) ||
      path.endsWith(`.${field}`)
  );
}

function diffWalk(
  before: unknown,
  after: unknown,
  path: string,
  out: AuditChange[],
  ignoreFields: string[]
) {
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
        diffWalk(
          left[key],
          right[key],
          path ? `${path}.${key}` : key,
          out,
          ignoreFields
        );
      });
    return;
  }

  out.push({ field: path || "value", before: left, after: right });
}

export function diffAuditSnapshots(
  before: unknown,
  after: unknown,
  options?: { prefix?: string; ignoreFields?: string[] }
) {
  const out: AuditChange[] = [];
  diffWalk(
    before,
    after,
    options?.prefix || "",
    out,
    [...DEFAULT_IGNORED_FIELDS, ...(options?.ignoreFields || [])]
  );
  return out;
}

export function diffAuditTargets(
  targets: Array<{ label?: string; before: unknown; after: unknown }>,
  options?: { ignoreFields?: string[] }
) {
  const multiple = targets.length > 1;
  return targets.flatMap((target) =>
    diffAuditSnapshots(target.before, target.after, {
      prefix: multiple && target.label ? target.label : "",
      ignoreFields: options?.ignoreFields,
    })
  );
}

export function changedKeysFromChanges(changes: AuditChange[]) {
  return Array.from(
    new Set(
      changes
        .map((change) => change.field.split(".")[0]?.split("[")[0]?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
}

export function buildAuditSource(source: AuditSourceInput): AuditSource {
  return {
    area: source.area,
    page: source.page,
    route: source.route || nowRoute(),
    method: source.method,
  };
}

async function captureSnapshot(target: AuditSnapshotTarget, phase: "before" | "after") {
  const explicit = phase === "before" ? target.before : target.after;
  if (explicit !== undefined) return explicit;

  const shouldCapture =
    phase === "before" ? target.captureBefore !== false : target.captureAfter !== false;
  if (!shouldCapture || !target.ref) return null;

  try {
    const snap = await getDoc(target.ref);
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    console.error(`[audit] failed to capture ${phase} snapshot`, error, target.ref.path);
    return null;
  }
}

function resolveMaybeFn<TArg, TResult>(
  value: TResult | ((arg: TArg) => TResult),
  arg: TArg
): TResult {
  return typeof value === "function" ? (value as (input: TArg) => TResult)(arg) : value;
}

export async function logAuditEvent(payload: AuditLogInput) {
  const normalizedChanges = (payload.changes || []).map((change) => ({
    field: change.field,
    before: normalizeAuditValue(change.before),
    after: normalizeAuditValue(change.after),
  }));

  const normalizedPayload: AuditLogInput = {
    ...payload,
    severity: payload.severity || "info",
    status: payload.status || "success",
    source: buildAuditSource(payload.source),
    changes: normalizedChanges,
    meta: {
      ...(payload.meta || {}),
      changedKeys:
        Array.isArray((payload.meta as { changedKeys?: unknown[] } | undefined)?.changedKeys) &&
        ((payload.meta as { changedKeys?: unknown[] } | undefined)?.changedKeys?.length || 0) > 0
          ? (payload.meta as { changedKeys?: string[] }).changedKeys
          : changedKeysFromChanges(normalizedChanges),
    },
    clientTimestamp: payload.clientTimestamp ?? Date.now(),
    occurredAt: payload.occurredAt ?? payload.clientTimestamp ?? Date.now(),
    requestId: payload.requestId || createId(),
    sessionId: payload.sessionId || getAuditSessionId(),
  };

  if (shouldSkipRemoteAuditLogging()) {
    warnRemoteAuditSkippedOnce();
    return;
  }

  try {
    await callable(normalizedPayload);
  } catch (error) {
    console.error("[audit] failed to write audit log", error, normalizedPayload);
    rememberAuditFailure(normalizedPayload, error);
  }
}

export async function runAuditedOperation<T>(options: AuditedOperationOptions<T>) {
  const primaryTarget: AuditSnapshotTarget = {
    entityType: options.entityType,
    entityId: options.entityId,
    entityPath: options.entityPath,
    ...(options.targets?.[0] || {}),
  };

  const targets = options.targets?.length ? options.targets : [primaryTarget];
  const beforeTargets = await Promise.all(
    targets.map(async (target) => ({
      target,
      before: await captureSnapshot(target, "before"),
    }))
  );

  try {
    const result = await options.execute();

    const afterTargets = await Promise.all(
      beforeTargets.map(async ({ target, before }) => ({
        target,
        before,
        after: await captureSnapshot(target, "after"),
      }))
    );

    const changes = diffAuditTargets(
      afterTargets.map(({ target, before, after }) => ({
        label: target.label,
        before,
        after,
      })),
      { ignoreFields: options.ignoreFields }
    );

    const ctx: AuditedSuccessContext<T> = {
      result,
      changes,
      targets: afterTargets,
    };

    const primary = afterTargets[0]?.target || primaryTarget;
    await logAuditEvent({
      action: options.action,
      category: options.category,
      severity: options.severity || "info",
      status: "success",
      message: resolveMaybeFn(options.message, ctx),
      entityType: primary.entityType || options.entityType,
      entityId: primary.entityId || primary.ref?.id || options.entityId || "",
      entityPath: primary.entityPath || primary.ref?.path || options.entityPath,
      relatedIds: options.relatedIds,
      source: options.source,
      changes,
      meta: normalizeAuditValue(resolveMaybeFn(options.meta || {}, ctx)) as Record<string, unknown>,
    });

    return result;
  } catch (error) {
    if (options.recordFailure !== false) {
      await logAuditEvent({
        action: options.action,
        category: options.category,
        severity: options.failureSeverity || "warning",
        status: "failed",
        message: options.failureMessage
          ? resolveMaybeFn(options.failureMessage, error)
          : `Failed to execute ${options.action}`,
        entityType: primaryTarget.entityType || options.entityType,
        entityId: primaryTarget.entityId || primaryTarget.ref?.id || options.entityId || "",
        entityPath: primaryTarget.entityPath || primaryTarget.ref?.path || options.entityPath,
        relatedIds: options.relatedIds,
        source: options.source,
        meta: {
          ...(normalizeAuditValue(
            resolveMaybeFn(options.failureMeta || {}, error)
          ) as Record<string, unknown>),
          error: formatError(error),
          actorUid: auth.currentUser?.uid || null,
        },
      });
    }

    throw error;
  }
}

export async function auditedSetDoc<T extends DocumentData>(options: AuditedSetDocOptions<T>) {
  return runAuditedOperation<void>({
    ...options,
    entityId: options.entityId || options.ref.id,
    entityPath: options.entityPath || options.ref.path,
    targets: [
      {
        ref: options.ref as DocumentReference<DocumentData>,
        entityType: options.entityType,
        entityId: options.entityId || options.ref.id,
        entityPath: options.entityPath || options.ref.path,
      },
    ],
    execute: async () => {
      if (options.options) {
        await firestoreSetDoc(
          options.ref as DocumentReference<DocumentData, DocumentData>,
          options.data as WithFieldValue<DocumentData>,
          options.options
        );
        return;
      }
      await firestoreSetDoc(
        options.ref as DocumentReference<DocumentData, DocumentData>,
        options.data as WithFieldValue<DocumentData>
      );
    },
  });
}

export async function auditedUpdateDoc<T extends DocumentData>(options: AuditedUpdateDocOptions<T>) {
  return runAuditedOperation<void>({
    ...options,
    entityId: options.entityId || options.ref.id,
    entityPath: options.entityPath || options.ref.path,
    targets: [
      {
        ref: options.ref as DocumentReference<DocumentData, DocumentData>,
        entityType: options.entityType,
        entityId: options.entityId || options.ref.id,
        entityPath: options.entityPath || options.ref.path,
      },
    ],
    execute: async () => {
      await firestoreUpdateDoc(
        options.ref as DocumentReference<DocumentData, DocumentData>,
        options.data as PartialWithFieldValue<DocumentData>
      );
    },
  });
}

export async function auditedDeleteDoc<T extends DocumentData>(options: AuditedDeleteDocOptions<T>) {
  return runAuditedOperation<void>({
    ...options,
    entityId: options.entityId || options.ref.id,
    entityPath: options.entityPath || options.ref.path,
    targets: [
      {
        ref: options.ref as DocumentReference<DocumentData, DocumentData>,
        entityType: options.entityType,
        entityId: options.entityId || options.ref.id,
        entityPath: options.entityPath || options.ref.path,
        after: null,
      },
    ],
    execute: async () => {
      await firestoreDeleteDoc(options.ref);
    },
  });
}

export async function captureAuditSnapshot<T extends DocumentData>(
  ref: DocumentReference<T, DocumentData>
) {
  const snap = await getDoc(ref as DocumentReference<DocumentData, DocumentData>);
  return snap.exists() ? (snap.data() as T) : null;
}
