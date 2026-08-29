PRAGMA foreign_keys = ON;

-- MADAN IDENTITY INTEGRITY V1
-- Enforces the steady-state account <-> employee identity contract without
-- breaking the existing atomic account-first / employee-second HR Core batch.
--
-- Cloudflare D1 remote migrations use a trigger-aware SQL splitter. Keep
-- trigger BEGIN tokens uppercase and parenthesize CASE expressions so CASE
-- END tokens are not mistaken for the end of the trigger body.

DROP VIEW IF EXISTS hr_identity_integrity_summary;
CREATE VIEW hr_identity_integrity_summary AS
SELECT
  (SELECT COUNT(*)
     FROM accounts a
     LEFT JOIN employees e ON e.auth_uid = a.uid
    WHERE a.employee_profile_enabled = 1
      AND a.role_key IN ('staff', 'hr', 'accountant', 'admin', 'owner')
      AND e.id IS NULL) AS staff_profile_without_employee,
  (SELECT COUNT(*)
     FROM accounts a
     LEFT JOIN employees e ON e.id = a.linked_employee_id
    WHERE a.linked_employee_id IS NOT NULL
      AND TRIM(a.linked_employee_id) <> ''
      AND e.id IS NULL) AS broken_linked_employee_id,
  (SELECT COUNT(*)
     FROM accounts a
     JOIN employees e ON e.id = a.linked_employee_id
    WHERE a.linked_employee_id IS NOT NULL
      AND TRIM(a.linked_employee_id) <> ''
      AND COALESCE(e.auth_uid, '') <> a.uid) AS link_auth_mismatch,
  (SELECT COUNT(*)
     FROM employees
    WHERE auth_uid IS NULL OR TRIM(auth_uid) = '') AS employee_without_auth_uid,
  (SELECT COUNT(*)
     FROM employees e
     LEFT JOIN accounts a ON a.uid = e.auth_uid
    WHERE e.auth_uid IS NOT NULL
      AND TRIM(e.auth_uid) <> ''
      AND a.uid IS NULL) AS employee_without_account,
  (SELECT COUNT(*)
     FROM employees e
     JOIN accounts a ON a.uid = e.auth_uid
    WHERE a.linked_employee_id IS NOT NULL
      AND TRIM(a.linked_employee_id) <> ''
      AND a.linked_employee_id <> e.id) AS reverse_link_mismatch;

DROP TRIGGER IF EXISTS trg_accounts_profile_requires_link_insert;
CREATE TRIGGER trg_accounts_profile_requires_link_insert
BEFORE INSERT ON accounts
WHEN NEW.employee_profile_enabled = 1
 AND NEW.role_key IN ('staff', 'hr', 'accountant', 'admin', 'owner')
 AND (NEW.linked_employee_id IS NULL OR TRIM(NEW.linked_employee_id) = '')
BEGIN
  SELECT RAISE(ABORT, 'identity_profile_requires_employee_link');
END;

DROP TRIGGER IF EXISTS trg_accounts_profile_requires_link_update;
CREATE TRIGGER trg_accounts_profile_requires_link_update
BEFORE UPDATE OF employee_profile_enabled, role_key, linked_employee_id ON accounts
WHEN NEW.employee_profile_enabled = 1
 AND NEW.role_key IN ('staff', 'hr', 'accountant', 'admin', 'owner')
 AND (NEW.linked_employee_id IS NULL OR TRIM(NEW.linked_employee_id) = '')
BEGIN
  SELECT RAISE(ABORT, 'identity_profile_requires_employee_link');
END;

-- Account writes may precede employee creation within one D1 batch. If the
-- employee already exists, however, a mismatched auth UID is never allowed.
DROP TRIGGER IF EXISTS trg_accounts_existing_employee_auth_match_insert;
CREATE TRIGGER trg_accounts_existing_employee_auth_match_insert
BEFORE INSERT ON accounts
WHEN NEW.linked_employee_id IS NOT NULL
 AND TRIM(NEW.linked_employee_id) <> ''
 AND EXISTS (SELECT 1 FROM employees e WHERE e.id = NEW.linked_employee_id)
 AND NOT EXISTS (
   SELECT 1
     FROM employees e
    WHERE e.id = NEW.linked_employee_id
      AND e.auth_uid = NEW.uid
 )
BEGIN
  SELECT RAISE(ABORT, 'identity_account_employee_auth_mismatch');
END;

DROP TRIGGER IF EXISTS trg_accounts_existing_employee_auth_match_update;
CREATE TRIGGER trg_accounts_existing_employee_auth_match_update
BEFORE UPDATE OF uid, linked_employee_id ON accounts
WHEN NEW.linked_employee_id IS NOT NULL
 AND TRIM(NEW.linked_employee_id) <> ''
 AND EXISTS (SELECT 1 FROM employees e WHERE e.id = NEW.linked_employee_id)
 AND NOT EXISTS (
   SELECT 1
     FROM employees e
    WHERE e.id = NEW.linked_employee_id
      AND e.auth_uid = NEW.uid
 )
BEGIN
  SELECT RAISE(ABORT, 'identity_account_employee_auth_mismatch');
END;

-- Employee creation is the point at which the account-first batch must become
-- coherent. A non-null auth UID requires the reverse account link to exist.
DROP TRIGGER IF EXISTS trg_employees_require_reverse_link_insert;
CREATE TRIGGER trg_employees_require_reverse_link_insert
AFTER INSERT ON employees
WHEN NEW.auth_uid IS NOT NULL AND TRIM(NEW.auth_uid) <> ''
BEGIN
  SELECT (CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM accounts a
       WHERE a.uid = NEW.auth_uid
         AND a.linked_employee_id = NEW.id
         AND a.employee_profile_enabled = 1
    )
    THEN RAISE(ABORT, 'identity_employee_reverse_link_missing')
  END);
END;

DROP TRIGGER IF EXISTS trg_employees_require_reverse_link_update;
CREATE TRIGGER trg_employees_require_reverse_link_update
AFTER UPDATE OF id, auth_uid ON employees
WHEN NEW.auth_uid IS NOT NULL AND TRIM(NEW.auth_uid) <> ''
BEGIN
  SELECT (CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM accounts a
       WHERE a.uid = NEW.auth_uid
         AND a.linked_employee_id = NEW.id
         AND a.employee_profile_enabled = 1
    )
    THEN RAISE(ABORT, 'identity_employee_reverse_link_missing')
  END);
END;

DROP TRIGGER IF EXISTS trg_employees_block_referenced_delete;
CREATE TRIGGER trg_employees_block_referenced_delete
BEFORE DELETE ON employees
WHEN EXISTS (
  SELECT 1 FROM accounts a WHERE a.linked_employee_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'identity_employee_is_still_linked');
END;
