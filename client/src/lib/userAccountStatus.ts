export type UserAccountStatusSource =
  | "active"
  | "isActive"
  | "status"
  | "default";

export type UserAccountLike = {
  active?: unknown;
  isActive?: unknown;
  status?: unknown;
};

export type UserAccountStatusResolution = {
  isActive: boolean;
  source: UserAccountStatusSource;
  rawValue: unknown;
};

const ACTIVE_VALUES = new Set(["active", "enabled", "true", "1", "yes"]);
const INACTIVE_VALUES = new Set(["inactive", "disabled", "false", "0", "no"]);

function hasOwnProperty(value: unknown, key: keyof UserAccountLike) {
  return (
    !!value &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

function parseAccountStatus(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  if (ACTIVE_VALUES.has(normalized)) return true;
  if (INACTIVE_VALUES.has(normalized)) return false;

  return null;
}

export function resolveUserAccountStatus(
  user: UserAccountLike | null | undefined
): UserAccountStatusResolution {
  const candidate = user ?? {};

  if (hasOwnProperty(candidate, "active")) {
    const parsed = parseAccountStatus(candidate.active);
    if (parsed !== null) {
      return {
        isActive: parsed,
        source: "active",
        rawValue: candidate.active,
      };
    }
  }

  if (hasOwnProperty(candidate, "isActive")) {
    const parsed = parseAccountStatus(candidate.isActive);
    if (parsed !== null) {
      return {
        isActive: parsed,
        source: "isActive",
        rawValue: candidate.isActive,
      };
    }
  }

  if (hasOwnProperty(candidate, "status")) {
    const parsed = parseAccountStatus(candidate.status);
    if (parsed !== null) {
      return {
        isActive: parsed,
        source: "status",
        rawValue: candidate.status,
      };
    }
  }

  return {
    isActive: true,
    source: "default",
    rawValue: undefined,
  };
}
