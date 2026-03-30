import {
  cleanText,
  emailLocalPart,
  getUserDisplayName,
  getUserIdentityBuckets,
  pickText,
  type IdentityBuckets,
} from "@/lib/investorIdentity";

type AnyRecord = Record<string, any> | null | undefined;

export type UserIdentityIndex<T extends { id: string } & Record<string, any>> = {
  byId: Record<string, T>;
  byEmail: Record<string, T>;
  byPhone: Record<string, T>;
};

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  return cleanText(value).replace(/[^\d+]+/g, "");
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildUserIdentityIndex<T extends { id: string } & Record<string, any>>(
  users: T[]
): UserIdentityIndex<T> {
  const index: UserIdentityIndex<T> = {
    byId: {},
    byEmail: {},
    byPhone: {},
  };

  for (const user of users) {
    const buckets = getUserIdentityBuckets(user);

    for (const userId of buckets.userIds) {
      if (!index.byId[userId]) index.byId[userId] = user;
    }

    for (const email of buckets.emails) {
      if (!index.byEmail[email]) index.byEmail[email] = user;
    }

    for (const phone of buckets.phones) {
      if (!index.byPhone[phone]) index.byPhone[phone] = user;
    }
  }

  return index;
}

export function getSourceIdentityBuckets(source: AnyRecord): IdentityBuckets {
  return {
    userIds: unique(
      [
        source?.userId,
        source?.uid,
        source?.authUid,
        source?.createdByUid,
        source?.createdByUserId,
        source?.investorUid,
        source?.investorId,
        source?.clientId,
        source?.customerId,
        source?.ownerUserId,
        source?.requestUserId,
        source?.senderId,
        source?.profile?.uid,
        source?.profile?.id,
        source?.contact?.userId,
        source?.userSnapshot?.uid,
        source?.userSnapshot?.id,
        source?.userSnapshot?.userId,
        source?.userSnapshot?.authUid,
        source?.userSnapshot?.clientId,
        source?.investor?.uid,
        source?.investor?.id,
        source?.client?.uid,
        source?.client?.id,
      ]
        .map(cleanText)
        .filter(Boolean)
    ),
    emails: unique(
      [
        source?.email,
        source?.createdByEmail,
        source?.contactEmail,
        source?.userEmail,
        source?.investorEmail,
        source?.clientEmail,
        source?.customerEmail,
        source?.profile?.email,
        source?.contact?.email,
        source?.userSnapshot?.email,
        source?.investor?.email,
        source?.client?.email,
      ]
        .map(normalizeEmail)
        .filter(Boolean)
    ),
    phones: unique(
      [
        source?.phone,
        source?.mobile,
        source?.phoneNumber,
        source?.contactPhone,
        source?.userPhone,
        source?.investorPhone,
        source?.clientPhone,
        source?.customerPhone,
        source?.profile?.phone,
        source?.contact?.phone,
        source?.userSnapshot?.phone,
        source?.userSnapshot?.mobile,
        source?.investor?.phone,
        source?.investor?.mobile,
        source?.client?.phone,
      ]
        .map(normalizePhone)
        .filter(Boolean)
    ),
  };
}

export function resolveLinkedUser<T extends { id: string } & Record<string, any>>(
  source: AnyRecord,
  userIdentityIndex: UserIdentityIndex<T>
) {
  const buckets = getSourceIdentityBuckets(source);

  for (const userId of buckets.userIds) {
    if (userIdentityIndex.byId[userId]) return userIdentityIndex.byId[userId];
  }

  for (const email of buckets.emails) {
    if (userIdentityIndex.byEmail[email]) return userIdentityIndex.byEmail[email];
  }

  for (const phone of buckets.phones) {
    if (userIdentityIndex.byPhone[phone]) return userIdentityIndex.byPhone[phone];
  }

  return null;
}

function getSourceNameFallbacks(source: AnyRecord) {
  return [
    source?.fullName,
    source?.displayName,
    source?.name,
    source?.clientName,
    source?.customerName,
    source?.contactName,
    source?.investorName,
    source?.profile?.name,
    source?.profile?.displayName,
    source?.contact?.name,
    source?.userSnapshot?.displayName,
    source?.userSnapshot?.name,
    emailLocalPart(source?.email),
    emailLocalPart(source?.createdByEmail),
    emailLocalPart(source?.contactEmail),
    emailLocalPart(source?.userEmail),
    emailLocalPart(source?.investorEmail),
    emailLocalPart(source?.clientEmail),
    emailLocalPart(source?.userSnapshot?.email),
  ];
}

export function getLinkedUserDisplayName<T extends { id: string } & Record<string, any>>(
  source: AnyRecord,
  userIdentityIndex: UserIdentityIndex<T>,
  ...fallbacks: unknown[]
) {
  const linkedUser = resolveLinkedUser(source, userIdentityIndex);
  return getUserDisplayName(linkedUser, ...getSourceNameFallbacks(source), ...fallbacks);
}

export function getLinkedUserEmail<T extends { id: string } & Record<string, any>>(
  source: AnyRecord,
  userIdentityIndex: UserIdentityIndex<T>,
  ...fallbacks: unknown[]
) {
  const linkedUser = resolveLinkedUser(source, userIdentityIndex);
  return pickText(
    linkedUser?.email,
    linkedUser?.profile?.email,
    linkedUser?.contact?.email,
    source?.email,
    source?.createdByEmail,
    source?.contactEmail,
    source?.userEmail,
    source?.investorEmail,
    source?.clientEmail,
    source?.userSnapshot?.email,
    ...fallbacks
  );
}
