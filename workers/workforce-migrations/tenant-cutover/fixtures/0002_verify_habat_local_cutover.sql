PRAGMA foreign_keys = ON;

-- LOCAL TEST VERIFICATION ONLY.
-- This file asserts the isolated Habbat fixture was cut over exactly once into
-- generic Workforce Core domains even when the cutover migration runs twice.
-- Never run it with --remote.
--
-- D1 does not authorize TEMP schema operations in this execution path, so this
-- uses a normal table inside the isolated --persist-to database. The harness
-- deletes the entire isolated state before every run, therefore no cleanup or
-- DROP statement is needed and this table can never reach production.

CREATE TABLE workforce_cutover_local_assertions (
  name TEXT PRIMARY KEY,
  ok INTEGER NOT NULL CHECK (ok = 1)
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'tenant_count',
  CASE WHEN (
    SELECT COUNT(*)
    FROM workforce_tenants
    WHERE id = 'restaurant_tenant_habat_alwaraq'
  ) = 1 THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'employee_count',
  CASE WHEN (
    SELECT COUNT(*)
    FROM workforce_employee_profiles
    WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
  ) = 1 THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'employment_count',
  CASE WHEN (
    SELECT COUNT(*)
    FROM workforce_employment
    WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
  ) = 1 THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'schedule_count',
  CASE WHEN (
    SELECT COUNT(*)
    FROM workforce_schedule_templates
    WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
  ) = 1 THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'assignment_count',
  CASE WHEN (
    SELECT COUNT(*)
    FROM workforce_schedule_assignments
    WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
  ) = 1 THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'attendance_link_count',
  CASE WHEN (
    SELECT COUNT(*)
    FROM workforce_attendance_links
    WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
  ) = 1 THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'leave_count',
  CASE WHEN (
    SELECT COUNT(*)
    FROM workforce_leaves
    WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
  ) = 1 THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'absence_count',
  CASE WHEN (
    SELECT COUNT(*)
    FROM workforce_absences
    WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
  ) = 1 THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'attendance_snapshot_count',
  CASE WHEN (
    SELECT COUNT(*)
    FROM workforce_attendance_month_snapshots
    WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
  ) = 1 THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'employee_mapping',
  CASE WHEN EXISTS (
    SELECT 1
    FROM workforce_employee_profiles
    WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
      AND id = 'wf_emp_habat_fixture_employee_1'
      AND account_uid = 'fixture_uid_employee_1'
      AND account_email = 'fixture.employee@example.test'
      AND display_name = 'موظف اختبار'
      AND status = 'active'
      AND source_type = 'legacy_attendance_access'
      AND source_id = 'habat_fixture_employee_1'
  ) THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'leave_mapping',
  CASE WHEN EXISTS (
    SELECT 1
    FROM workforce_leaves l
    JOIN workforce_employee_profiles p ON p.id = l.employee_id
    WHERE l.tenant_id = 'restaurant_tenant_habat_alwaraq'
      AND l.id = 'wf_leave_legacy_habat_fixture_leave_1'
      AND l.leave_type = 'emergency'
      AND l.duration_kind = 'full_day'
      AND l.start_date = '2026-09-02'
      AND l.end_date = '2026-09-02'
      AND l.status = 'approved'
      AND p.source_id = 'habat_fixture_employee_1'
  ) THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'absence_mapping',
  CASE WHEN EXISTS (
    SELECT 1
    FROM workforce_absences a
    JOIN workforce_employee_profiles p ON p.id = a.employee_id
    WHERE a.tenant_id = 'restaurant_tenant_habat_alwaraq'
      AND a.id = 'wf_absence_legacy_habat_fixture_absence_1'
      AND a.absence_date = '2026-09-03'
      AND a.day_portion = 'half_day'
      AND a.status = 'approved'
      AND a.payroll_treatment = 'attendance_policy'
      AND p.source_id = 'habat_fixture_employee_1'
  ) THEN 1 ELSE 0 END
);

INSERT INTO workforce_cutover_local_assertions (name, ok)
VALUES (
  'snapshot_mapping',
  CASE WHEN EXISTS (
    SELECT 1
    FROM workforce_attendance_month_snapshots s
    JOIN workforce_employee_profiles p ON p.id = s.employee_id
    WHERE s.tenant_id = 'restaurant_tenant_habat_alwaraq'
      AND s.id = 'wf_att_month_habat_fixture_summary_2026_09'
      AND s.month_key = '2026-09'
      AND s.link_status = 'confirmed'
      AND s.source_type = 'legacy_habat_monthly_summary'
      AND p.source_id = 'habat_fixture_employee_1'
  ) THEN 1 ELSE 0 END
);

SELECT name, ok
FROM workforce_cutover_local_assertions
ORDER BY name;
