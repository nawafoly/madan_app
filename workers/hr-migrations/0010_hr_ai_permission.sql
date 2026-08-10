PRAGMA foreign_keys = ON;

INSERT INTO permissions (permission_key, label_ar, label_en, category) VALUES
  ('hr_ai.view', 'استخدام مساعد معدن AI', 'Use Maedin AI HR Assistant', 'ai')
ON CONFLICT(permission_key) DO UPDATE SET
  label_ar = excluded.label_ar,
  label_en = excluded.label_en,
  category = excluded.category;

INSERT OR IGNORE INTO role_permissions (role_key, permission_key) VALUES
  ('owner', 'hr_ai.view'),
  ('admin', 'hr_ai.view'),
  ('hr', 'hr_ai.view');
