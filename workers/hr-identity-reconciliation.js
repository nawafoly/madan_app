const PROFILE_ROLES = new Set(["staff", "hr", "accountant", "admin", "owner"]);

function nullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeRole(value) {
  return (nullableText(value) || "").toLowerCase();
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  }
  return Boolean(value);
}

export function normalizeIdentityAccount(row = {}) {
  return {
    uid: nullableText(row.uid ?? row.authUid ?? row.auth_uid),
    role: normalizeRole(row.role ?? row.roleKey ?? row.role_key),
    employeeProfileEnabled: normalizeBoolean(
      row.employeeProfileEnabled ?? row.employee_profile_enabled
    ),
    linkedEmployeeId: nullableText(
      row.linkedEmployeeId ?? row.linked_employee_id
    ),
    raw: row,
  };
}

export function normalizeIdentityEmployee(row = {}) {
  return {
    id: nullableText(row.id ?? row.employeeId ?? row.employee_id),
    authUid: nullableText(row.authUid ?? row.auth_uid ?? row.uid),
    raw: row,
  };
}

function duplicateKeys(rows, keySelector) {
  const counts = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function indexUnique(rows, keySelector) {
  const index = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    if (!key || index.has(key)) continue;
    index.set(key, row);
  }
  return index;
}

function detailIds(rows, mapper) {
  return rows.map(mapper).filter(Boolean);
}

export function evaluateIdentityIntegrity({ accounts = [], employees = [] } = {}) {
  const normalizedAccounts = accounts.map(normalizeIdentityAccount);
  const normalizedEmployees = employees.map(normalizeIdentityEmployee);
  const accountsByUid = indexUnique(normalizedAccounts, account => account.uid);
  const employeesById = indexUnique(normalizedEmployees, employee => employee.id);
  const employeesByAuthUid = indexUnique(
    normalizedEmployees,
    employee => employee.authUid
  );

  const duplicateAccountUid = duplicateKeys(
    normalizedAccounts,
    account => account.uid
  );
  const duplicateEmployeeId = duplicateKeys(
    normalizedEmployees,
    employee => employee.id
  );
  const duplicateEmployeeAuthUid = duplicateKeys(
    normalizedEmployees,
    employee => employee.authUid
  );

  const staffProfileWithoutEmployee = normalizedAccounts.filter(
    account =>
      account.uid &&
      account.employeeProfileEnabled &&
      PROFILE_ROLES.has(account.role) &&
      !employeesByAuthUid.has(account.uid)
  );
  const brokenLinkedEmployeeId = normalizedAccounts.filter(
    account =>
      account.linkedEmployeeId && !employeesById.has(account.linkedEmployeeId)
  );
  const linkAuthMismatch = normalizedAccounts.filter(account => {
    if (!account.uid || !account.linkedEmployeeId) return false;
    const employee = employeesById.get(account.linkedEmployeeId);
    return Boolean(employee && employee.authUid !== account.uid);
  });
  const employeeWithoutAuthUid = normalizedEmployees.filter(
    employee => !employee.authUid
  );
  const employeeWithoutAccount = normalizedEmployees.filter(
    employee => employee.authUid && !accountsByUid.has(employee.authUid)
  );
  const reverseLinkMismatch = normalizedEmployees.filter(employee => {
    if (!employee.authUid) return false;
    const account = accountsByUid.get(employee.authUid);
    return Boolean(
      account &&
        account.linkedEmployeeId &&
        account.linkedEmployeeId !== employee.id
    );
  });

  const counts = {
    staff_profile_without_employee: staffProfileWithoutEmployee.length,
    broken_linked_employee_id: brokenLinkedEmployeeId.length,
    link_auth_mismatch: linkAuthMismatch.length,
    employee_without_auth_uid: employeeWithoutAuthUid.length,
    employee_without_account: employeeWithoutAccount.length,
    reverse_link_mismatch: reverseLinkMismatch.length,
    duplicate_account_uid: duplicateAccountUid.length,
    duplicate_employee_id: duplicateEmployeeId.length,
    duplicate_employee_auth_uid: duplicateEmployeeAuthUid.length,
  };

  const ok = Object.values(counts).every(count => count === 0);

  return {
    ok,
    counts,
    details: {
      staffProfileWithoutEmployee: detailIds(
        staffProfileWithoutEmployee,
        account => account.uid
      ),
      brokenLinkedEmployeeId: detailIds(
        brokenLinkedEmployeeId,
        account => `${account.uid || "unknown"}:${account.linkedEmployeeId}`
      ),
      linkAuthMismatch: detailIds(
        linkAuthMismatch,
        account => `${account.uid || "unknown"}:${account.linkedEmployeeId}`
      ),
      employeeWithoutAuthUid: detailIds(
        employeeWithoutAuthUid,
        employee => employee.id
      ),
      employeeWithoutAccount: detailIds(
        employeeWithoutAccount,
        employee => employee.authUid
      ),
      reverseLinkMismatch: detailIds(
        reverseLinkMismatch,
        employee => `${employee.authUid || "unknown"}:${employee.id || "unknown"}`
      ),
      duplicateAccountUid,
      duplicateEmployeeId,
      duplicateEmployeeAuthUid,
    },
  };
}

function pushDuplicateConflicts(conflicts, scope, integrity) {
  for (const item of integrity.details.duplicateAccountUid) {
    conflicts.push({
      code: `duplicate_${scope}_account_uid`,
      key: item.key,
      count: item.count,
    });
  }
  for (const item of integrity.details.duplicateEmployeeId) {
    conflicts.push({
      code: `duplicate_${scope}_employee_id`,
      key: item.key,
      count: item.count,
    });
  }
  for (const item of integrity.details.duplicateEmployeeAuthUid) {
    conflicts.push({
      code: `duplicate_${scope}_employee_auth_uid`,
      key: item.key,
      count: item.count,
    });
  }
}

export function planMissingOnlyIdentityReconciliation({
  sourceAccounts = [],
  sourceEmployees = [],
  canonicalAccounts = [],
  canonicalEmployees = [],
} = {}) {
  const sourceAccountRows = sourceAccounts.map(normalizeIdentityAccount);
  const sourceEmployeeRows = sourceEmployees.map(normalizeIdentityEmployee);
  const canonicalAccountRows = canonicalAccounts.map(normalizeIdentityAccount);
  const canonicalEmployeeRows = canonicalEmployees.map(normalizeIdentityEmployee);

  const sourceIntegrity = evaluateIdentityIntegrity({
    accounts: sourceAccounts,
    employees: sourceEmployees,
  });
  const canonicalIntegrity = evaluateIdentityIntegrity({
    accounts: canonicalAccounts,
    employees: canonicalEmployees,
  });

  const conflicts = [];
  pushDuplicateConflicts(conflicts, "source", sourceIntegrity);
  pushDuplicateConflicts(conflicts, "canonical", canonicalIntegrity);

  if (!canonicalIntegrity.ok) {
    conflicts.push({
      code: "canonical_integrity_not_clean",
      counts: canonicalIntegrity.counts,
    });
  }

  const sourceAccountsByUid = indexUnique(
    sourceAccountRows,
    account => account.uid
  );
  const sourceEmployeesById = indexUnique(
    sourceEmployeeRows,
    employee => employee.id
  );
  const sourceEmployeesByAuthUid = indexUnique(
    sourceEmployeeRows,
    employee => employee.authUid
  );
  const canonicalAccountsByUid = indexUnique(
    canonicalAccountRows,
    account => account.uid
  );
  const canonicalEmployeesById = indexUnique(
    canonicalEmployeeRows,
    employee => employee.id
  );
  const canonicalEmployeesByAuthUid = indexUnique(
    canonicalEmployeeRows,
    employee => employee.authUid
  );

  const candidateActions = [];

  for (const employee of sourceEmployeeRows) {
    if (!employee.id || !employee.authUid) {
      conflicts.push({
        code: "source_employee_missing_identity",
        employeeId: employee.id,
        authUid: employee.authUid,
      });
      continue;
    }

    const canonicalById = canonicalEmployeesById.get(employee.id);
    if (canonicalById) {
      if (canonicalById.authUid !== employee.authUid) {
        conflicts.push({
          code: "canonical_employee_id_auth_mismatch",
          employeeId: employee.id,
          sourceAuthUid: employee.authUid,
          canonicalAuthUid: canonicalById.authUid,
        });
      }
      continue;
    }

    const canonicalByAuthUid = canonicalEmployeesByAuthUid.get(employee.authUid);
    if (canonicalByAuthUid) {
      conflicts.push({
        code: "canonical_employee_auth_uid_collision",
        authUid: employee.authUid,
        sourceEmployeeId: employee.id,
        canonicalEmployeeId: canonicalByAuthUid.id,
      });
      continue;
    }

    const canonicalAccount = canonicalAccountsByUid.get(employee.authUid);
    if (canonicalAccount) {
      conflicts.push({
        code: "canonical_account_exists_for_missing_employee",
        authUid: employee.authUid,
        employeeId: employee.id,
        canonicalLinkedEmployeeId: canonicalAccount.linkedEmployeeId,
      });
      continue;
    }

    const sourceAccount = sourceAccountsByUid.get(employee.authUid);
    if (!sourceAccount) {
      conflicts.push({
        code: "source_account_missing_for_employee",
        authUid: employee.authUid,
        employeeId: employee.id,
      });
      continue;
    }

    if (
      sourceAccount.linkedEmployeeId &&
      sourceAccount.linkedEmployeeId !== employee.id
    ) {
      conflicts.push({
        code: "source_account_employee_link_mismatch",
        authUid: employee.authUid,
        employeeId: employee.id,
        linkedEmployeeId: sourceAccount.linkedEmployeeId,
      });
      continue;
    }

    if (
      PROFILE_ROLES.has(sourceAccount.role) &&
      !sourceAccount.employeeProfileEnabled
    ) {
      conflicts.push({
        code: "source_account_profile_disabled",
        authUid: employee.authUid,
        employeeId: employee.id,
        role: sourceAccount.role,
      });
      continue;
    }

    candidateActions.push({
      type: "insert_missing_identity_pair",
      authUid: employee.authUid,
      employeeId: employee.id,
      account: sourceAccount.raw,
      employee: employee.raw,
      preconditions: {
        canonicalAccountAbsent: true,
        canonicalEmployeeIdAbsent: true,
        canonicalEmployeeAuthUidAbsent: true,
      },
    });
  }

  for (const account of sourceAccountRows) {
    if (
      !account.uid ||
      !account.employeeProfileEnabled ||
      !PROFILE_ROLES.has(account.role)
    ) {
      continue;
    }
    if (!sourceEmployeesByAuthUid.has(account.uid)) {
      conflicts.push({
        code: "source_staff_account_without_employee",
        authUid: account.uid,
        linkedEmployeeId: account.linkedEmployeeId,
        role: account.role,
      });
    }
    if (
      account.linkedEmployeeId &&
      !sourceEmployeesById.has(account.linkedEmployeeId)
    ) {
      conflicts.push({
        code: "source_account_link_target_missing",
        authUid: account.uid,
        linkedEmployeeId: account.linkedEmployeeId,
      });
    }
  }

  const blocked = conflicts.length > 0;

  return {
    mode: "dry-run",
    policy: "missing-only-no-overwrite",
    blocked,
    summary: {
      sourceAccounts: sourceAccountRows.length,
      sourceEmployees: sourceEmployeeRows.length,
      canonicalAccounts: canonicalAccountRows.length,
      canonicalEmployees: canonicalEmployeeRows.length,
      candidateActions: candidateActions.length,
      executableActions: blocked ? 0 : candidateActions.length,
      conflicts: conflicts.length,
    },
    canonicalIntegrity,
    sourceIntegrity,
    conflicts,
    candidateActions,
    actions: blocked ? [] : candidateActions,
  };
}
