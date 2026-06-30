const ADMIN_EMAIL_DOMAIN = "maedin.sa";

export function normalizeAdminUsername(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/[._-]{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "");
}

export function isValidAdminUsername(value: unknown) {
  const username = normalizeAdminUsername(value);
  return username.length >= 3 && username.length <= 32;
}

export function buildAdminUsernameSeed(...values: unknown[]) {
  for (const value of values) {
    const username = normalizeAdminUsername(value);
    if (username) return username;
  }
  return "";
}

export function buildAdminEmailFromUsername(username: unknown) {
  const normalizedUsername = normalizeAdminUsername(username);
  return normalizedUsername ? `${normalizedUsername}@${ADMIN_EMAIL_DOMAIN}` : "";
}

