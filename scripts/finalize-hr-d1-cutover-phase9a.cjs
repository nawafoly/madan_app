const fs = require("node:fs");

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, content) {
  fs.writeFileSync(path, content.replace(/\r\n/g, "\n"), "utf8");
}

function replaceExact(path, from, to, expected = 1) {
  let content = read(path);
  const count = content.split(from).length - 1;
  if (count !== expected) {
    throw new Error(`${path}: expected ${expected} exact match(es), found ${count}\n${from}`);
  }
  content = content.split(from).join(to);
  write(path, content);
}

function replaceRegex(path, regex, replacement, expected = 1) {
  let content = read(path);
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const matcher = new RegExp(regex.source, flags);
  const matches = [...content.matchAll(matcher)];
  if (matches.length !== expected) {
    throw new Error(`${path}: expected ${expected} regex match(es), found ${matches.length}\n${regex}`);
  }
  content = content.replace(matcher, replacement);
  write(path, content);
}

function assertAbsent(path, snippets) {
  const content = read(path);
  for (const snippet of snippets) {
    if (content.includes(snippet)) {
      throw new Error(`${path}: forbidden snippet remains: ${snippet}`);
    }
  }
}

const requireAccessPath = "client/src/components/RequireEmployeeProfileAccess.tsx";
write(
  requireAccessPath,
  `import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";

import {
  canAccessEmployeeProfile,
  getHomePathForUser,
  hasStaffAdminPermission,
  hasStaffAreaPermission,
  useAuth,
} from "@/_core/hooks/useAuth";
import { getHrCoreEmployee, isHrCoreConfigured } from "@/lib/hrCoreApi";

type Props = {
  children: ReactNode;
  allowStaffAdmin?: boolean;
};

export default function RequireEmployeeProfileAccess({
  children,
  allowStaffAdmin = false,
}: Props) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const [hasLinkedEmployeeRecord, setHasLinkedEmployeeRecord] = useState<
    boolean | null
  >(null);

  const hasDirectAccess = useMemo(
    () =>
      canAccessEmployeeProfile(user) ||
      (allowStaffAdmin &&
        (hasStaffAdminPermission(user, "employees.view") ||
          hasStaffAdminPermission(user, "employees.manage") ||
          hasStaffAreaPermission(user, "weekly_reports.manager_notes"))),
    [allowStaffAdmin, user]
  );

  useEffect(() => {
    if (loading || !user) return;
    if (hasDirectAccess) {
      setHasLinkedEmployeeRecord(true);
      return;
    }

    const employeeId = String(user.linkedEmployeeId || user.uid || "").trim();
    if (!employeeId || !isHrCoreConfigured()) {
      setHasLinkedEmployeeRecord(false);
      return;
    }

    let cancelled = false;
    setHasLinkedEmployeeRecord(null);

    void getHrCoreEmployee(employeeId)
      .then(() => {
        if (!cancelled) setHasLinkedEmployeeRecord(true);
      })
      .catch(error => {
        console.error("employee_profile_d1_access_lookup_failed", error);
        if (!cancelled) setHasLinkedEmployeeRecord(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasDirectAccess, loading, user]);

  const canOpenEmployeeProfile =
    hasDirectAccess || hasLinkedEmployeeRecord === true;

  useEffect(() => {
    if (loading) return;

    if (!user) {
      const target = getLoginUrl(location);
      if (location !== target) setLocation(target);
      return;
    }

    if (hasLinkedEmployeeRecord === null) return;

    if (!canOpenEmployeeProfile) {
      const target = getHomePathForUser(user);
      if (location !== target) setLocation(target);
    }
  }, [
    canOpenEmployeeProfile,
    hasLinkedEmployeeRecord,
    loading,
    location,
    setLocation,
    user,
  ]);

  if (loading || !user || hasLinkedEmployeeRecord === null) return null;
  if (!canOpenEmployeeProfile) return null;

  return <>{children}</>;
}
`
);

const notificationsPath = "client/src/lib/inAppNotifications.ts";
write(
  notificationsPath,
  `import { toDateSafe } from "@/lib/formatters";
import {
  EMPLOYEE_NOTIFICATION_TYPES,
  type EmployeeNotificationDoc,
  type EmployeeNotificationType,
} from "@shared/employee";
import {
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

function requireHrCoreNotifications() {
  if (!isHrCoreConfigured()) {
    throw new Error("VITE_HR_CORE_API_URL is not configured.");
  }
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
    IN_APP_NOTIFICATION_TYPE_OPTIONS.find(option => option.value === normalized)
      ?.label || "إشعار"
  );
}

export function resolveNotificationTargetPath(
  notification:
    | Pick<EmployeeNotificationDoc, "relatedPath" | "relatedTo" | "type">
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
  requireHrCoreNotifications();

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
  requireHrCoreNotifications();

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

export async function markInAppNotificationRead(id: string) {
  requireHrCoreNotifications();
  await markHrCoreNotificationRead(id);
}

export async function markInAppNotificationsRead(ids: string[]) {
  const normalizedIds = Array.from(new Set(ids.filter(Boolean)));
  if (!normalizedIds.length) return;
  requireHrCoreNotifications();
  await markHrCoreNotificationsRead(normalizedIds);
}
`
);

const dashboardPath = "client/src/components/DashboardLayout.tsx";
replaceExact(
  dashboardPath,
  `import { auth, db } from "@/_core/firebase";\nimport { doc, getDoc, onSnapshot } from "firebase/firestore";`,
  `import { auth } from "@/_core/firebase";`
);
replaceExact(
  dashboardPath,
  `import { cn } from "@/lib/utils";`,
  `import { cn } from "@/lib/utils";\nimport { getHrCoreEmployee, isHrCoreConfigured } from "@/lib/hrCoreApi";`
);
replaceExact(
  dashboardPath,
  `  const [sidebarProfileSource, setSidebarProfileSource] = useState<{\n    collectionName: "employees" | "users";\n    docId: string;\n  } | null>(null);\n`,
  ""
);
replaceRegex(
  dashboardPath,
  /  useEffect\(\(\) => \{\n    if \(!user\?\.uid\) \{\n      setSidebarProfileSource\(null\);[\s\S]*?  \}, \[sidebarProfileSource, user\?\.uid\]\);\n/,
  `  useEffect(() => {\n    if (!user?.uid) {\n      setSidebarProfileDoc(null);\n      return;\n    }\n\n    const employeeId = String(user.linkedEmployeeId || user.uid || "").trim();\n    if (!employeeId || !isHrCoreConfigured()) {\n      setSidebarProfileDoc(null);\n      return;\n    }\n\n    let cancelled = false;\n\n    void getHrCoreEmployee(employeeId)\n      .then(({ employee }) => {\n        if (cancelled) return;\n        setSidebarProfileDoc({\n          uid: employee.authUid || user.uid,\n          displayName: employee.name,\n          name: employee.name,\n          email: employee.email,\n          phone: employee.phone,\n          photoURL: employee.avatarUrl,\n          avatarUrl: employee.avatarUrl,\n          title: employee.title,\n          jobTitle: employee.title,\n          employeeProfile: {\n            personal: {\n              name: employee.name,\n              email: employee.email,\n              phone: employee.phone,\n              avatar: employee.avatarUrl\n                ? { fileUrl: employee.avatarUrl, url: employee.avatarUrl }\n                : null,\n            },\n            employment: {\n              ...(employee.employment || {}),\n              title: employee.title,\n              jobTitle: employee.title,\n              department: employee.department,\n            },\n          },\n          employment: {\n            ...(employee.employment || {}),\n            title: employee.title,\n            jobTitle: employee.title,\n            department: employee.department,\n          },\n        } as EmployeeProfileUserDoc);\n      })\n      .catch(error => {\n        console.error("sidebar_profile_d1_lookup_failed", error);\n        if (!cancelled) setSidebarProfileDoc(null);\n      });\n\n    return () => {\n      cancelled = true;\n    };\n  }, [user?.linkedEmployeeId, user?.uid]);\n`
);

const filesPath = "client/src/pages/employee/Files.tsx";
replaceRegex(
  filesPath,
  /import \{\n  collection,[\s\S]*?\n\} from "firebase\/firestore";\n/,
  ""
);
replaceExact(filesPath, `import { db } from "@/_core/firebase";\n`, "");
replaceExact(filesPath, `  EMPLOYEE_FILES_COLLECTION,\n`, "");
replaceExact(
  filesPath,
  `  createHrCoreEmployeeFile,\n  HR_CORE_D1_ENABLED,\n  isHrCoreConfigured,\n  listHrCoreEmployeeFiles,`,
  `  createHrCoreEmployeeFile,\n  listHrCoreEmployeeFiles,`
);
replaceRegex(
  filesPath,
  /  useEffect\(\(\) => \{\n    if \(!user\?\.uid\) \{\n      setLegacyFiles\(\[\]\);[\s\S]*?  \}, \[user\?\.uid\]\);\n/,
  `  useEffect(() => {\n    if (!user?.uid) {\n      setLegacyFiles([]);\n      setParticipantFiles([]);\n      setLegacyLoading(false);\n      setParticipantLoading(false);\n      return;\n    }\n\n    let cancelled = false;\n    setLegacyLoading(true);\n    setParticipantLoading(true);\n\n    void listHrCoreEmployeeFiles({ participantUid: user.uid, limit: 200 })\n      .then(response => {\n        if (cancelled) return;\n        const rows = response.employeeFiles.map(file =>\n          normalizeEmployeeFileRecord(\n            file.id,\n            file as Record<string, unknown>,\n            user.uid\n          )\n        );\n        setLegacyFiles(rows);\n        setParticipantFiles([]);\n      })\n      .catch(error => {\n        console.error("employee_files_hr_core_load_failed", error);\n        if (!cancelled) {\n          setLegacyFiles([]);\n          setParticipantFiles([]);\n        }\n      })\n      .finally(() => {\n        if (!cancelled) {\n          setLegacyLoading(false);\n          setParticipantLoading(false);\n        }\n      });\n\n    return () => {\n      cancelled = true;\n    };\n  }, [user?.uid]);\n`
);
replaceRegex(
  filesPath,
  /  const markFileAsReadIfNeeded = async \(file: EmployeeFileRecord\) => \{[\s\S]*?  \};\n\n  const openFileUrl/,
  `  const markFileAsReadIfNeeded = async (file: EmployeeFileRecord) => {\n    if (!user?.uid) return;\n    const canMarkRead =\n      !file.isRead &&\n      file.direction === "incoming" &&\n      (!file.isInternalTransfer ||\n        file.receiverUid === user.uid ||\n        file.employeeUid === user.uid);\n\n    if (!canMarkRead) return;\n\n    const response = await markHrCoreEmployeeFileRead(file.id);\n    const updated = normalizeEmployeeFileRecord(\n      response.employeeFile.id,\n      response.employeeFile as Record<string, unknown>,\n      user.uid\n    );\n    setLegacyFiles(current =>\n      current.map(item => (item.id === updated.id ? updated : item))\n    );\n    setParticipantFiles(current =>\n      current.map(item => (item.id === updated.id ? updated : item))\n    );\n  };\n\n  const openFileUrl`
);
replaceExact(
  filesPath,
  `      const fileRecordId = crypto.randomUUID();\n      const fileRef = doc(db, EMPLOYEE_FILES_COLLECTION, fileRecordId);`,
  `      const fileRecordId = crypto.randomUUID();\n      const nowIso = new Date().toISOString();`
);
replaceExact(filesPath, `        createdAt: serverTimestamp(),`, `        createdAt: nowIso,`);
replaceExact(filesPath, `        updatedAt: serverTimestamp(),`, `        updatedAt: nowIso,`);
replaceRegex(
  filesPath,
  /      if \(HR_CORE_D1_ENABLED && isHrCoreConfigured\(\)\) \{\n        const response = await createHrCoreEmployeeFile\([\s\S]*?\n      \} else \{\n        await setDoc\(fileRef, fileDoc\);\n      \}/,
  `      const response = await createHrCoreEmployeeFile({\n        id: fileRecordId,\n        ...fileDoc,\n        createdAt: nowIso,\n        updatedAt: nowIso,\n      });\n      const created = normalizeEmployeeFileRecord(\n        response.employeeFile.id,\n        response.employeeFile as Record<string, unknown>,\n        user.uid\n      );\n      setLegacyFiles(current => [\n        created,\n        ...current.filter(item => item.id !== created.id),\n      ]);`
);

const messagesPath = "client/src/pages/employee/messages/EmployeeMessagesScreen.tsx";
replaceRegex(
  messagesPath,
  /import \{\n  collection,[\s\S]*?\n\} from "firebase\/firestore";\n/,
  ""
);
replaceExact(messagesPath, `import { db } from "@/_core/firebase";\n`, "");
replaceExact(
  messagesPath,
  `import {\n  EMPLOYEE_EMPTY_VALUE,\n  normalizeEmployeeProfile,\n  type EmployeeProfileUserDoc,\n} from "@/lib/employeeProfile";\n`,
  ""
);
replaceExact(
  messagesPath,
  `  createHrCoreEmployeeMessage,\n  HR_CORE_D1_ENABLED,\n  isHrCoreConfigured,\n  listHrCoreEmployeeMessages,`,
  `  createHrCoreEmployeeMessage,\n  listHrCoreEmployeeMessages,`
);
replaceExact(
  messagesPath,
  `import {\n  EMPLOYEE_MESSAGES_COLLECTION,\n  type EmployeeMessageDoc,\n} from "@shared/employee";`,
  `import { type EmployeeMessageDoc } from "@shared/employee";`
);
replaceRegex(
  messagesPath,
  /  useEffect\(\(\) => \{\n    if \(!user\?\.uid\) \{\n      setLegacyMessages\(\[\]\);[\s\S]*?  \}, \[user\?\.uid\]\);\n/,
  `  useEffect(() => {\n    if (!user?.uid) {\n      setLegacyMessages([]);\n      setParticipantMessages([]);\n      setLegacyLoading(false);\n      setParticipantLoading(false);\n      return;\n    }\n\n    let cancelled = false;\n    setLegacyLoading(true);\n    setParticipantLoading(true);\n\n    void listHrCoreEmployeeMessages({ participantUid: user.uid, limit: 200 })\n      .then(response => {\n        if (cancelled) return;\n        const rows = response.employeeMessages.map(message =>\n          normalizeEmployeeMessageRecord(\n            message.id,\n            message as Record<string, any>\n          )\n        );\n        setLegacyMessages(rows);\n        setParticipantMessages([]);\n      })\n      .catch(error => {\n        console.error("employee_messages_hr_core_load_failed", error);\n        if (!cancelled) {\n          setLegacyMessages([]);\n          setParticipantMessages([]);\n        }\n      })\n      .finally(() => {\n        if (!cancelled) {\n          setLegacyLoading(false);\n          setParticipantLoading(false);\n        }\n      });\n\n    return () => {\n      cancelled = true;\n    };\n  }, [user?.uid]);\n`
);
replaceRegex(
  messagesPath,
  /        try \{\n          const snapshot = await getDoc\(doc\(db, "users", senderUid\)\);[\s\S]*?        \}\n\n        return \[/,
  `        return [`
);
replaceRegex(
  messagesPath,
  /  const markConversationAsRead = async \([\s\S]*?  \};\n\n  const selectConversation/,
  `  const markConversationAsRead = async (\n    conversation: EmployeeMessageConversationRecord\n  ) => {\n    if (!user?.uid) return;\n    const unreadIncomingMessages = conversation.messages.filter(\n      message => message.toUserId === user.uid && !message.isRead\n    );\n    if (!unreadIncomingMessages.length) return;\n\n    setOpeningConversationId(conversation.id);\n    try {\n      const ids = unreadIncomingMessages.map(message => message.id);\n      await markHrCoreEmployeeMessagesRead(ids);\n      const now = new Date();\n      setLegacyMessages(current =>\n        current.map(message =>\n          ids.includes(message.id)\n            ? {\n                ...message,\n                isRead: true,\n                status: "read",\n                readAt: now,\n                readAtDate: now,\n              }\n            : message\n        )\n      );\n      setParticipantMessages(current =>\n        current.map(message =>\n          ids.includes(message.id)\n            ? {\n                ...message,\n                isRead: true,\n                status: "read",\n                readAt: now,\n                readAtDate: now,\n              }\n            : message\n        )\n      );\n    } catch (error) {\n      console.error("employee_message_mark_read_failed", error);\n    } finally {\n      setOpeningConversationId(current =>\n        current === conversation.id ? null : current\n      );\n    }\n  };\n\n  const selectConversation`
);
replaceExact(
  messagesPath,
  `      const messageId = crypto.randomUUID();\n      const messageRef = doc(db, EMPLOYEE_MESSAGES_COLLECTION, messageId);`,
  `      const messageId = crypto.randomUUID();\n      const nowIso = new Date().toISOString();`,
  2
);
replaceExact(messagesPath, `        createdAt: serverTimestamp(),`, `        createdAt: nowIso,`, 2);
replaceExact(messagesPath, `        updatedAt: serverTimestamp(),`, `        updatedAt: nowIso,`, 2);
replaceRegex(
  messagesPath,
  /      if \(HR_CORE_D1_ENABLED && isHrCoreConfigured\(\)\) \{\n        const response = await createHrCoreEmployeeMessage\([\s\S]*?\n      \} else \{\n        await setDoc\(messageRef, messagePayload\);\n      \}/,
  `      const response = await createHrCoreEmployeeMessage({\n        id: messageId,\n        ...messagePayload,\n        createdAt: nowIso,\n        updatedAt: nowIso,\n      });\n      const created = normalizeEmployeeMessageRecord(\n        response.employeeMessage.id,\n        response.employeeMessage as Record<string, any>\n      );\n      setLegacyMessages(current => [...current, created]);`,
  2
);
replaceExact(messagesPath, `messageRef.id`, `messageId`);

const cutoverFiles = [
  requireAccessPath,
  dashboardPath,
  notificationsPath,
  filesPath,
  messagesPath,
];
for (const path of cutoverFiles) {
  assertAbsent(path, ["firebase/firestore"]);
}
for (const path of [notificationsPath, filesPath, messagesPath]) {
  assertAbsent(path, ["HR_CORE_D1_ENABLED", "EMPLOYEE_NOTIFICATIONS_COLLECTION"]);
}

console.log("Phase 9A applied: HR access, sidebar profile, notifications, employee files, and employee messages are D1-only.");
