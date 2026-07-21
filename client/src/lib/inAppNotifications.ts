import { db } from "@/_core/firebase";
import { toDateSafe } from "@/lib/formatters";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  EMPLOYEE_NOTIFICATIONS_COLLECTION,
  EMPLOYEE_NOTIFICATION_TYPES,
  type EmployeeNotificationDoc,
  type EmployeeNotificationType,
} from "@shared/employee";
import {
  HR_CORE_D1_ENABLED,
  createHrCoreNotification,
  isHrCoreConfigured,
  listHrCoreNotifications,
  markHrCoreNotificationRead,
  markHrCoreNotificationsRead,
} from "@/lib/hrCoreApi";

export const IN_APP_NOTIFICATION_TYPE_OPTIONS: Array<{
  value: EmployeeNotificationType;
  label: string;
}> = [
  { value: "leave", label: "إجازة" },
  { value: "file", label: "ملف" },
  { value: "message", label: "رسالة" },
  { value: "system", label: "إشعار نظام" },
];

export type InAppNotificationRecord = EmployeeNotificationDoc & {
  id: string;
  bodyText: string;
  createdAtDate: Date | null;
  readAtDate: Date | null;
  targetPath: string;
  typeLabel: string;
};

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function normalizeNotificationType(value: unknown) {
  const normalized = String(value || "system").trim().toLowerCase();
  return (EMPLOYEE_NOTIFICATION_TYPES.some(type => type === normalized)
    ? normalized
    : "system") as EmployeeNotificationType;
}

export function getInAppNotificationTypeLabel(value: unknown) {
  const normalized = normalizeNotificationType(value);
  return (
    IN_APP_NOTIFICATION_TYPE_OPTIONS.find(option => option.value === normalized)?.label ||
    "إشعار"
  );
}

export function resolveNotificationTargetPath(
  notification:
    | Pick<EmployeeNotificationDoc, "relatedPath" | "type">
    | null
    | undefined
) {
  const explicitPath = pickText(notification?.relatedPath);
  if (explicitPath) return explicitPath;

  const normalizedType = normalizeNotificationType(notification?.type);
  if (pickText(notification?.relatedTo) === "weekly_report") {
    return "/employee/weekly-reports";
  }
  if (pickText(notification?.relatedTo) === "daily_task") {
    return "/employee/daily-tasks";
  }
  if (normalizedType === "message") return "/employee/messages";
  if (normalizedType === "file") return "/employee/files";
  return "/employee/profile";
}

export function normalizeInAppNotificationRecord(
  id: string,
  raw: Record<string, any> | null | undefined
): InAppNotificationRecord {
  const normalizedType = normalizeNotificationType(raw?.type);
  const bodyText = pickText(raw?.body, raw?.message);
  const userId = pickText(raw?.userId, raw?.targetUid, raw?.uid);

  return {
    id,
    userId,
    uid: pickText(raw?.uid) || userId || null,
    targetUid: pickText(raw?.targetUid) || userId || null,
    title: pickText(raw?.title) || "إشعار داخلي",
    body: pickText(raw?.body) || bodyText || null,
    message: pickText(raw?.message) || bodyText || null,
    type: normalizedType,
    relatedTo: pickText(raw?.relatedTo) || null,
    relatedId: pickText(raw?.relatedId) || null,
    relatedPath: pickText(raw?.relatedPath) || null,
    createdAt: raw?.createdAt ?? null,
    isRead: Boolean(raw?.isRead),
    readAt: raw?.readAt ?? null,
    updatedAt: raw?.updatedAt ?? null,
    bodyText,
    createdAtDate: toDateSafe(raw?.createdAt),
    readAtDate: toDateSafe(raw?.readAt),
    targetPath: resolveNotificationTargetPath(raw as EmployeeNotificationDoc),
    typeLabel: getInAppNotificationTypeLabel(normalizedType),
  };
}

export function sortInAppNotifications<T extends EmployeeNotificationDoc>(
  notifications: T[]
) {
  return [...notifications].sort((left, right) => {
    const leftTime = toDateSafe(left.createdAt)?.getTime() ?? 0;
    const rightTime = toDateSafe(right.createdAt)?.getTime() ?? 0;
    return rightTime - leftTime;
  });
}

export async function listInAppNotifications(userId: string) {
  const normalizedUserId = pickText(userId);
  if (!normalizedUserId) return [];

  if (HR_CORE_D1_ENABLED && isHrCoreConfigured()) {
    const result = await listHrCoreNotifications({
      targetUid: normalizedUserId,
      limit: 200,
      offset: 0,
    });
    return sortInAppNotifications(
      result.notifications.map(notification =>
        normalizeInAppNotificationRecord(notification.id, notification)
      )
    );
  }

  const snapshot = await getDocs(
    query(
      collection(db, EMPLOYEE_NOTIFICATIONS_COLLECTION),
      where("targetUid", "==", normalizedUserId),
      orderBy("createdAt", "desc")
    )
  );
  return sortInAppNotifications(
    snapshot.docs.map(docSnapshot =>
      normalizeInAppNotificationRecord(
        docSnapshot.id,
        (docSnapshot.data() as Record<string, any>) || {}
      )
    )
  );
}

export async function createInAppNotification(input: {
  userId?: string;
  targetRoles?: string[];
  excludeUid?: string | null;
  title: string;
  body: string;
  type: EmployeeNotificationType | string;
  relatedId?: string | null;
  relatedTo?: string | null;
  relatedPath?: string | null;
}) {
  const userId = pickText(input.userId);
  const targetRoles = Array.isArray(input.targetRoles)
    ? input.targetRoles.map(pickText).filter(Boolean)
    : [];
  if (!userId && !targetRoles.length) {
    throw new Error("notification_user_required");
  }

  if (HR_CORE_D1_ENABLED && isHrCoreConfigured()) {
    const result = await createHrCoreNotification({
      userId: userId || undefined,
      targetRoles,
      excludeUid: pickText(input.excludeUid) || null,
      title: pickText(input.title) || "إشعار داخلي",
      body: pickText(input.body) || "",
      type: normalizeNotificationType(input.type),
      relatedId: pickText(input.relatedId) || null,
      relatedTo: pickText(input.relatedTo) || null,
      relatedPath: pickText(input.relatedPath) || null,
    });
    return result.targetUids[0] || "broadcast";
  }

  if (!userId) {
    throw new Error("notification_user_required");
  }
  const notificationRef = doc(collection(db, EMPLOYEE_NOTIFICATIONS_COLLECTION));
  await setDoc(notificationRef, {
    userId,
    uid: userId,
    targetUid: userId,
    title: pickText(input.title) || "إشعار داخلي",
    body: pickText(input.body) || "",
    message: pickText(input.body) || "",
    type: normalizeNotificationType(input.type),
    relatedId: pickText(input.relatedId) || null,
    relatedTo: pickText(input.relatedTo) || null,
    relatedPath: pickText(input.relatedPath) || null,
    createdAt: serverTimestamp(),
    isRead: false,
    readAt: null,
    updatedAt: serverTimestamp(),
  } satisfies EmployeeNotificationDoc);

  return notificationRef.id;
}

export async function markInAppNotificationRead(id: string) {
  if (HR_CORE_D1_ENABLED && isHrCoreConfigured()) {
    await markHrCoreNotificationRead(id);
    return;
  }
  await updateDoc(doc(db, EMPLOYEE_NOTIFICATIONS_COLLECTION, id), {
    isRead: true,
    readAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function markInAppNotificationsRead(ids: string[]) {
  const normalizedIds = Array.from(new Set(ids.filter(Boolean)));
  if (!normalizedIds.length) return;

  if (HR_CORE_D1_ENABLED && isHrCoreConfigured()) {
    await markHrCoreNotificationsRead(normalizedIds);
    return;
  }

  const batch = writeBatch(db);
  normalizedIds.forEach(id => {
    batch.update(doc(db, EMPLOYEE_NOTIFICATIONS_COLLECTION, id), {
      isRead: true,
      readAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}
