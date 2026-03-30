function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export const BUSINESS_OWNER_EMAIL = "abdullah@madanalbena.com";
export const BUSINESS_OWNER_NAME_AR = "عبدالله الأطرم";
export const OWNER_DISPLAY_NAME_AR = BUSINESS_OWNER_NAME_AR;
export const OWNER_ROLE_TITLE_AR = "المالك";
export const TECHNICAL_BOOTSTRAP_OWNER_EMAILS = new Set<string>();

export function isTechnicalBootstrapOwnerEmail(email: unknown) {
  void email;
  return false;
}

export function isBusinessOwnerEmail(email: unknown) {
  return normalizeEmail(email) === BUSINESS_OWNER_EMAIL;
}

export function isOwnerRole(role: unknown) {
  return String(role || "").trim().toLowerCase() === "owner";
}

export function getUserFacingDisplayName(role: unknown, fallbackName?: unknown) {
  void role;
  return normalizeText(fallbackName);
}

export function getUserFacingTitle(role: unknown, fallbackTitle?: unknown) {
  void role;
  return normalizeText(fallbackTitle);
}

export function getRoleDisplayLabel(role: unknown) {
  const key = String(role || "").trim().toLowerCase();

  switch (key) {
    case "owner":
      return OWNER_ROLE_TITLE_AR;
    case "admin":
      return "أدمن";
    case "accountant":
      return "محاسب";
    case "staff":
      return "موظف";
    case "client":
      return "عميل";
    case "guest":
      return "زائر";
    default:
      return normalizeText(role);
  }
}

export function getOwnerRoleLabel(email?: unknown) {
  void email;
  return OWNER_ROLE_TITLE_AR;
}

export function getOwnerRoleLabelShort(email?: unknown) {
  void email;
  return OWNER_ROLE_TITLE_AR;
}
