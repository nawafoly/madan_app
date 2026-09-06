PRAGMA foreign_keys = ON;

INSERT INTO permissions (permission_key, label_ar, label_en, category) VALUES
  ('habat_attendance.access', 'الدخول إلى حضور حبات الورق', 'Access Habbat Al Waraq attendance', 'habat_attendance'),
  ('habat_attendance.manage', 'إدارة حضور حبات الورق', 'Manage Habbat Al Waraq attendance', 'habat_attendance')
ON CONFLICT(permission_key) DO UPDATE SET
  label_ar = excluded.label_ar,
  label_en = excluded.label_en,
  category = excluded.category;

-- Owner keeps emergency/admin access. Other accounts must be explicitly granted access.
INSERT INTO role_permissions (role_key, permission_key) VALUES
  ('owner', 'habat_attendance.access'),
  ('owner', 'habat_attendance.manage')
ON CONFLICT(role_key, permission_key) DO NOTHING;
