PRAGMA foreign_keys = ON;

INSERT INTO permissions (
  permission_key,
  label_ar,
  label_en,
  category
) VALUES (
  'daily_tasks.manager_notes',
  'مراجعة المهام اليومية وكتابة ملاحظات الإدارة',
  'Review daily tasks and add management notes',
  'reports'
)
ON CONFLICT(permission_key) DO UPDATE SET
  label_ar = excluded.label_ar,
  label_en = excluded.label_en,
  category = excluded.category;

INSERT OR IGNORE INTO role_permissions (role_key, permission_key)
VALUES ('owner', 'daily_tasks.manager_notes');

-- Link employee rows that lost auth_uid during the legacy import.
UPDATE employees
SET
  auth_uid = (
    SELECT a.uid
    FROM accounts a
    WHERE a.linked_employee_id = employees.id
    ORDER BY a.is_active DESC, a.updated_at DESC
    LIMIT 1
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (auth_uid IS NULL OR TRIM(auth_uid) = '')
  AND EXISTS (
    SELECT 1
    FROM accounts a
    WHERE a.linked_employee_id = employees.id
  );

-- Replace UID/document-id placeholders with the best readable account identity.
UPDATE employees
SET
  name = COALESCE(
    (
      SELECT CASE
        WHEN LENGTH(TRIM(COALESCE(a.display_name, ''))) > 0
          AND LOWER(TRIM(a.display_name)) <> LOWER(TRIM(a.uid))
          THEN TRIM(a.display_name)
        WHEN LENGTH(TRIM(COALESCE(a.username, ''))) > 0
          THEN TRIM(a.username)
        WHEN INSTR(TRIM(COALESCE(a.email, '')), '@') > 1
          THEN SUBSTR(TRIM(a.email), 1, INSTR(TRIM(a.email), '@') - 1)
        ELSE NULL
      END
      FROM accounts a
      WHERE a.uid = employees.auth_uid
      LIMIT 1
    ),
    NULLIF(TRIM(name), ''),
    'موظف غير مرتبط'
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE TRIM(COALESCE(name, '')) = ''
   OR LOWER(TRIM(name)) = LOWER(TRIM(id))
   OR LOWER(TRIM(name)) = LOWER(TRIM(COALESCE(auth_uid, '')));
