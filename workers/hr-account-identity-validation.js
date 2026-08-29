const EMPLOYEE_PROFILE_ROLES = new Set([
  "staff",
  "hr",
  "accountant",
  "admin",
  "owner",
]);

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function role(value) {
  return (text(value) || "").toLowerCase();
}

function bool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  }
  return Boolean(value);
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

export function resolveNextAccountIdentityState({ before = {}, patch = {} } = {}) {
  return {
    role: has(patch, "role") ? role(patch.role) : role(before.role_key ?? before.role),
    employeeProfileEnabled: has(patch, "employeeProfileEnabled")
      ? bool(patch.employeeProfileEnabled)
      : bool(before.employee_profile_enabled ?? before.employeeProfileEnabled),
    linkedEmployeeId: has(patch, "linkedEmployeeId")
      ? text(patch.linkedEmployeeId)
      : text(before.linked_employee_id ?? before.linkedEmployeeId),
  };
}

export function validateAccountIdentityMutation({
  uid,
  before = {},
  patch = {},
  linkedEmployee = null,
  employeeByAuthUid = null,
} = {}) {
  const accountUid = text(uid ?? before.uid);
  if (!accountUid) {
    return { ok: false, status: 400, message: "identity_account_uid_required" };
  }

  const next = resolveNextAccountIdentityState({ before, patch });
  const employeeForUidId = text(employeeByAuthUid?.id);

  if (employeeForUidId) {
    if (next.linkedEmployeeId !== employeeForUidId) {
      return {
        ok: false,
        status: 409,
        message: "identity_account_employee_unlink_forbidden",
      };
    }
    if (!next.employeeProfileEnabled) {
      return {
        ok: false,
        status: 409,
        message: "identity_employee_profile_disable_forbidden",
      };
    }
  }

  if (
    next.employeeProfileEnabled &&
    EMPLOYEE_PROFILE_ROLES.has(next.role) &&
    !next.linkedEmployeeId
  ) {
    return {
      ok: false,
      status: 409,
      message: "identity_account_employee_link_required",
    };
  }

  if (next.linkedEmployeeId) {
    if (!linkedEmployee || text(linkedEmployee.id) !== next.linkedEmployeeId) {
      return {
        ok: false,
        status: 409,
        message: "identity_linked_employee_not_found",
      };
    }
    if (text(linkedEmployee.auth_uid ?? linkedEmployee.authUid) !== accountUid) {
      return {
        ok: false,
        status: 409,
        message: "identity_linked_employee_auth_mismatch",
      };
    }
    if (!next.employeeProfileEnabled) {
      return {
        ok: false,
        status: 409,
        message: "identity_linked_employee_profile_required",
      };
    }
  }

  return { ok: true, next };
}
