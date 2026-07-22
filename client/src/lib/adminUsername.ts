const ADMIN_EMAIL_DOMAIN = "madanalbena.com";

const ARABIC_TO_LATIN: Record<string, string> = {
  "\u0621": "",
  "\u0622": "a",
  "\u0623": "a",
  "\u0624": "w",
  "\u0625": "i",
  "\u0626": "y",
  "\u0627": "a",
  "\u0628": "b",
  "\u0629": "h",
  "\u062A": "t",
  "\u062B": "th",
  "\u062C": "j",
  "\u062D": "h",
  "\u062E": "kh",
  "\u062F": "d",
  "\u0630": "dh",
  "\u0631": "r",
  "\u0632": "z",
  "\u0633": "s",
  "\u0634": "sh",
  "\u0635": "s",
  "\u0636": "d",
  "\u0637": "t",
  "\u0638": "z",
  "\u0639": "a",
  "\u063A": "gh",
  "\u0640": "",
  "\u0641": "f",
  "\u0642": "q",
  "\u0643": "k",
  "\u0644": "l",
  "\u0645": "m",
  "\u0646": "n",
  "\u0647": "h",
  "\u0648": "w",
  "\u0649": "a",
  "\u064A": "y",
};

function transliterateArabic(value: string) {
  return value
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .split("")
    .map(character => ARABIC_TO_LATIN[character] ?? character)
    .join("");
}

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
  return username.length >= 2 && username.length <= 32;
}

export function buildAdminUsernameSeed(...values: unknown[]) {
  for (const value of values) {
    const username = normalizeAdminUsername(value);
    if (username) return username;

    const transliteratedUsername = normalizeAdminUsername(
      transliterateArabic(String(value ?? ""))
    );
    if (transliteratedUsername) return transliteratedUsername;
  }
  return "";
}

export function buildAdminEmailFromUsername(username: unknown) {
  const normalizedUsername = normalizeAdminUsername(username);
  return normalizedUsername ? `${normalizedUsername}@${ADMIN_EMAIL_DOMAIN}` : "";
}

