import { getUserFacingDisplayName } from "@/lib/ownerAccounts";

type AnyRecord = Record<string, any> | null | undefined;

export type IdentityBuckets = {
  userIds: string[];
  emails: string[];
  phones: string[];
};

export function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return text;
}

export function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

export function emailLocalPart(value: unknown) {
  const email = cleanText(value);
  if (!email.includes("@")) return "";
  return cleanText(email.split("@")[0]);
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  return cleanText(value).replace(/[^\d+]+/g, "");
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function joinNameParts(...values: unknown[]) {
  const parts = values.map(cleanText).filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "";
}

export function getUserDisplayName(user: AnyRecord, ...fallbacks: unknown[]) {
  const userFullName = joinNameParts(user?.firstName, user?.lastName);
  const profileFullName = joinNameParts(user?.profile?.firstName, user?.profile?.lastName);
  const contactFullName = joinNameParts(user?.contact?.firstName, user?.contact?.lastName);

  const resolvedName =
    pickText(
      user?.fullName,
      user?.displayName,
      user?.name,
      userFullName,
      user?.username,
      user?.profile?.fullName,
      user?.profile?.displayName,
      user?.profile?.name,
      profileFullName,
      user?.profile?.username,
      user?.contact?.name,
      contactFullName,
      ...fallbacks,
      emailLocalPart(user?.email),
      emailLocalPart(user?.profile?.email),
      emailLocalPart(user?.contact?.email)
    );

  return getUserFacingDisplayName(user?.role, resolvedName) || "غير محدد";
}

export function getUserIdentityBuckets(user: AnyRecord): IdentityBuckets {
  return {
    userIds: unique(
      [
        user?.id,
        user?.uid,
        user?.userId,
        user?.authUid,
        user?.clientId,
        user?.customerId,
        user?.investorId,
        user?.profile?.uid,
        user?.profile?.id,
        user?.profile?.userId,
        user?.profile?.authUid,
        user?.contact?.userId,
      ]
        .map(cleanText)
        .filter(Boolean)
    ),
    emails: unique(
      [user?.email, user?.profile?.email, user?.contact?.email]
        .map(normalizeEmail)
        .filter(Boolean)
    ),
    phones: unique(
      [
        user?.phone,
        user?.mobile,
        user?.phoneNumber,
        user?.profile?.phone,
        user?.contact?.phone,
      ]
        .map(normalizePhone)
        .filter(Boolean)
    ),
  };
}

export function getInvestmentIdentityBuckets(investment: AnyRecord): IdentityBuckets {
  return {
    userIds: unique(
      [
        investment?.investorUid,
        investment?.userId,
        investment?.investorId,
        investment?.clientId,
        investment?.customerId,
        investment?.uid,
        investment?.createdByUid,
        investment?.userSnapshot?.uid,
        investment?.userSnapshot?.id,
        investment?.userSnapshot?.userId,
        investment?.userSnapshot?.authUid,
        investment?.userSnapshot?.clientId,
        investment?.investor?.uid,
        investment?.investor?.id,
        investment?.client?.uid,
        investment?.client?.id,
      ]
        .map(cleanText)
        .filter(Boolean)
    ),
    emails: unique(
      [
        investment?.investorEmail,
        investment?.email,
        investment?.userSnapshot?.email,
        investment?.investor?.email,
        investment?.client?.email,
      ]
        .map(normalizeEmail)
        .filter(Boolean)
    ),
    phones: unique(
      [
        investment?.investorPhone,
        investment?.phone,
        investment?.userSnapshot?.phone,
        investment?.userSnapshot?.mobile,
        investment?.investor?.phone,
        investment?.investor?.mobile,
        investment?.client?.phone,
      ]
        .map(normalizePhone)
        .filter(Boolean)
    ),
  };
}

export function investmentMatchesUser(investment: AnyRecord, user: AnyRecord) {
  const userBuckets = getUserIdentityBuckets(user);
  const investmentBuckets = getInvestmentIdentityBuckets(investment);

  const userIds = new Set(userBuckets.userIds);
  if (investmentBuckets.userIds.some((value) => userIds.has(value))) return true;

  const emails = new Set(userBuckets.emails);
  if (investmentBuckets.emails.some((value) => emails.has(value))) return true;

  const phones = new Set(userBuckets.phones);
  if (investmentBuckets.phones.some((value) => phones.has(value))) return true;

  return false;
}
