export type DefaultEmployeeAvatarGender = "male" | "female";

const EMPLOYEE_AVATAR_BASE_PATH = "/employee-avatars";

export const DEFAULT_BOY_AVATAR_URLS = Array.from(
  { length: 12 },
  (_, index) =>
    `${EMPLOYEE_AVATAR_BASE_PATH}/boys/${encodeURIComponent(
      `Boy ${index + 1}.png`
    )}`
);

export const DEFAULT_GIRL_AVATAR_URLS = Array.from(
  { length: 11 },
  (_, index) =>
    `${EMPLOYEE_AVATAR_BASE_PATH}/girls/${encodeURIComponent(
      `Girl ${index + 1}.png`
    )}`
);

const FEMALE_GENDER_VALUES = new Set([
  "female",
  "f",
  "woman",
  "girl",
  "\u0627\u0646\u062b\u064a",
  "\u0628\u0646\u062a",
  "\u0627\u0645\u0631\u0627\u0647",
]);

const MALE_GENDER_VALUES = new Set([
  "male",
  "m",
  "man",
  "boy",
  "\u0630\u0643\u0631",
  "\u0631\u062c\u0644",
  "\u0648\u0644\u062f",
]);

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

function normalizeHumanText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622]/g, "\u0627")
    .replace(/\u0649/g, "\u064a")
    .replace(/\u0629/g, "\u0647")
    .replace(/\s+/g, " ");
}

const COMMON_FEMALE_FIRST_NAMES = new Set(
  [
    "\u0633\u0627\u0631\u0647",
    "\u0633\u0627\u0631\u0629",
    "\u0646\u0648\u0631\u0647",
    "\u0646\u0648\u0631\u0629",
    "\u0646\u0648\u0631\u0627",
    "\u0645\u0647\u0627",
    "\u0634\u0647\u062f",
    "\u062d\u0646\u064a\u0646",
    "\u0634\u0631\u0648\u0642",
    "\u0631\u064a\u0645",
    "\u0631\u063a\u062f",
    "\u0631\u0647\u0641",
    "\u0644\u064a\u0646\u0627",
    "\u0644\u064a\u0627\u0646",
    "\u0644\u064a\u0646",
    "\u0646\u062f\u0649",
    "\u062c\u0648\u062f",
    "\u062f\u0627\u0646\u0647",
    "\u062f\u0627\u0646\u0629",
    "\u063a\u0627\u062f\u0647",
    "\u063a\u0627\u062f\u0629",
    "\u0639\u0628\u064a\u0631",
    "\u0627\u0645\u0644",
    "\u0623\u0645\u0644",
    "\u064a\u0627\u0631\u0627",
    "\u0647\u0646\u062f",
    "\u0631\u0648\u0627\u0646",
    "\u0631\u0646\u0627",
    "\u0631\u0632\u0627\u0646",
    "\u0628\u0633\u0645\u0647",
    "\u0628\u0633\u0645\u0629",
    "\u0634\u0648\u0642",
    "\u0648\u0641\u0627\u0621",
    "\u0647\u064a\u0627",
    "\u0647\u0627\u0644\u0647",
    "\u0647\u0627\u0644\u0629",
    "\u0644\u0645\u0649",
    "\u062c\u0648\u0627\u0647\u0631",
    "\u0645\u0646\u0649",
    "\u0645\u0631\u064a\u0645",
    "\u0641\u0627\u0637\u0645\u0647",
    "\u0641\u0627\u0637\u0645\u0629",
    "\u0639\u0627\u064a\u0634\u0647",
    "\u0639\u0627\u0626\u0634\u0629",
    "\u0646\u062c\u0644\u0627\u0621",
    "\u0646\u0648\u0627\u0644",
    "\u0633\u0645\u064a\u0647",
    "\u0633\u0645\u064a\u0629",
    "\u0647\u062f\u0649",
    "\u0647\u0628\u0647",
    "\u0647\u0628\u0629",
    "\u062e\u0644\u0648\u062f",
    "\u0645\u064a",
    "\u0632\u064a\u0646\u0628",
    "\u0634\u064a\u062e\u0647",
    "\u0634\u064a\u062e\u0629",
    "\u0646\u0648\u0641",
    "\u0644\u0637\u064a\u0641\u0647",
    "\u0644\u0637\u064a\u0641\u0629",
    "\u0627\u0645\u0627\u0646\u064a",
    "\u0623\u0645\u0627\u0646\u064a",
    "\u0627\u064a\u0645\u0627\u0646",
    "\u0625\u064a\u0645\u0627\u0646",
    "\u0627\u0641\u0646\u0627\u0646",
    "\u0623\u0641\u0646\u0627\u0646",
    "sara",
    "sarah",
    "hanin",
    "haneen",
    "shahad",
    "shorouq",
    "noura",
    "nora",
    "reem",
    "maha",
    "hend",
  ].map(normalizeHumanText)
);

export function normalizeDefaultEmployeeAvatarGender(
  ...values: unknown[]
): DefaultEmployeeAvatarGender | null {
  for (const value of values) {
    const normalized = normalizeHumanText(value);
    if (!normalized) continue;
    if (FEMALE_GENDER_VALUES.has(normalized)) return "female";
    if (MALE_GENDER_VALUES.has(normalized)) return "male";
  }

  return null;
}

function inferGenderFromName(...values: unknown[]): DefaultEmployeeAvatarGender | null {
  for (const value of values) {
    const normalized = normalizeHumanText(value);
    if (!normalized) continue;
    const firstName = normalized.split(" ")[0] || "";
    if (COMMON_FEMALE_FIRST_NAMES.has(firstName)) return "female";
  }

  return null;
}

function resolveDefaultEmployeeAvatarGender(input: {
  name?: unknown;
  displayName?: unknown;
  gender?: unknown;
  sex?: unknown;
}) {
  return (
    normalizeDefaultEmployeeAvatarGender(input.gender, input.sex) ||
    inferGenderFromName(input.name, input.displayName) ||
    "male"
  );
}

function getDefaultAvatarUrlGender(value: string): DefaultEmployeeAvatarGender | null {
  if (value.includes(`${EMPLOYEE_AVATAR_BASE_PATH}/girls/`)) return "female";
  if (value.includes(`${EMPLOYEE_AVATAR_BASE_PATH}/boys/`)) return "male";
  return null;
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function chooseSeededValue(values: string[], seed: string) {
  if (!values.length) return "";
  return values[hashSeed(seed || "employee-avatar") % values.length] || "";
}

export function getDefaultEmployeeAvatarUrl(input: {
  id?: unknown;
  uid?: unknown;
  name?: unknown;
  displayName?: unknown;
  email?: unknown;
  gender?: unknown;
  sex?: unknown;
} = {}) {
  const gender = resolveDefaultEmployeeAvatarGender(input);
  const pool =
    gender === "female" ? DEFAULT_GIRL_AVATAR_URLS : DEFAULT_BOY_AVATAR_URLS;
  const seed = pickText(
    input.id,
    input.uid,
    input.email,
    input.displayName,
    input.name,
    "employee-avatar"
  );

  return chooseSeededValue(pool, seed);
}

export function resolveEmployeeAvatarUrl(
  explicitAvatarUrl: unknown,
  fallbackInput: Parameters<typeof getDefaultEmployeeAvatarUrl>[0] = {}
) {
  const explicit = pickText(explicitAvatarUrl);
  const fallback = getDefaultEmployeeAvatarUrl(fallbackInput);
  if (!explicit) return fallback;

  const explicitDefaultGender = getDefaultAvatarUrlGender(explicit);
  if (!explicitDefaultGender) return explicit;

  const targetGender = resolveDefaultEmployeeAvatarGender(fallbackInput);
  return explicitDefaultGender === targetGender ? explicit : fallback;
}

export function buildDefaultEmployeeAvatarPatch(input: {
  id?: unknown;
  uid?: unknown;
  name?: unknown;
  displayName?: unknown;
  email?: unknown;
  username?: unknown;
  gender?: unknown;
  sex?: unknown;
  avatarUrl?: unknown;
}) {
  const fileUrl = resolveEmployeeAvatarUrl(input.avatarUrl, input);
  const fileName = decodeURIComponent(fileUrl.split("/").pop() || "avatar.png");
  const avatar = {
    id: "default_employee_avatar",
    fileName,
    filePath: null,
    fileUrl,
    contentType: "image/png",
    fileSize: null,
    uploadedAt: null,
  };

  return {
    photoURL: fileUrl,
    profile: {
      photoURL: fileUrl,
      avatar,
    },
    employeeProfile: {
      personal: {
        avatar,
      },
    },
  };
}
