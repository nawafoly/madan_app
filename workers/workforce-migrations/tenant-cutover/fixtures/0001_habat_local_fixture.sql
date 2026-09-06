PRAGMA foreign_keys = ON;

-- LOCAL TEST FIXTURE ONLY.
-- This file exists to validate the tenant cutover against the real legacy Habbat
-- schema without reading or mutating production data. Never run it with --remote.

INSERT OR IGNORE INTO habat_attendance_access (
  id, uid, email, display_name, access_level, clock_enabled, is_active,
  created_by_uid, created_by_email, created_at, updated_at
) VALUES (
  'habat_fixture_employee_1',
  'fixture_uid_employee_1',
  'fixture.employee@example.test',
  'موظف اختبار',
  'employee',
  1,
  1,
  'fixture_admin_uid',
  'fixture.admin@example.test',
  '2026-09-01T06:00:00.000Z',
  '2026-09-01T06:00:00.000Z'
);

INSERT OR IGNORE INTO habat_attendance_shift_assignments (
  id, access_id, shift_id, effective_from, effective_to,
  created_by_uid, created_by_email, created_at
) VALUES (
  'habat_fixture_assignment_1',
  'habat_fixture_employee_1',
  'habat_shift_default',
  '2026-09-01',
  NULL,
  'fixture_admin_uid',
  'fixture.admin@example.test',
  '2026-09-01T06:05:00.000Z'
);

INSERT OR IGNORE INTO habat_attendance_day_overrides (
  id, access_id, attendance_date, override_type, day_portion, reason,
  created_by_uid, created_by_email, created_at, updated_at
) VALUES
  (
    'habat_fixture_leave_1',
    'habat_fixture_employee_1',
    '2026-09-02',
    'emergency_leave',
    'full_day',
    'اختبار نقل إجازة',
    'fixture_admin_uid',
    'fixture.admin@example.test',
    '2026-09-02T06:00:00.000Z',
    '2026-09-02T06:00:00.000Z'
  ),
  (
    'habat_fixture_absence_1',
    'habat_fixture_employee_1',
    '2026-09-03',
    'absence',
    'half_day',
    'اختبار نقل غياب',
    'fixture_admin_uid',
    'fixture.admin@example.test',
    '2026-09-03T06:00:00.000Z',
    '2026-09-03T06:00:00.000Z'
  );

INSERT OR IGNORE INTO habat_attendance_monthly_summaries (
  id, access_id, month_key, summary_json,
  generated_by_uid, generated_by_email, generated_at
) VALUES (
  'habat_fixture_summary_2026_09',
  'habat_fixture_employee_1',
  '2026-09',
  '{"month":"2026-09","scheduledDays":2,"attendedDays":0,"absentDays":0.5,"emergencyLeaveDays":1,"lateDays":0,"earlyLeaveDays":0,"incompleteDays":0,"workedMinutes":0,"daysWithAttendance":0}',
  'fixture_admin_uid',
  'fixture.admin@example.test',
  '2026-09-04T06:00:00.000Z'
);
