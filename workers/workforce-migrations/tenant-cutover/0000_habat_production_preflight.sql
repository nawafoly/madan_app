-- PRODUCTION READ-ONLY PREFLIGHT.
-- SELECT-only diagnostics for the Habbat -> generic Workforce Core cutover.
-- Safe to run against remote D1 before the tenant cutover migration.

SELECT
  COUNT(*) AS source_employees,
  SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS source_active_employees,
  SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS source_inactive_employees,
  SUM(CASE WHEN NULLIF(trim(uid), '') IS NULL THEN 1 ELSE 0 END) AS source_missing_uid,
  SUM(CASE WHEN NULLIF(trim(email), '') IS NULL THEN 1 ELSE 0 END) AS source_missing_email
FROM habat_attendance_access;

SELECT
  COUNT(*) AS source_shifts,
  SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS source_active_shifts,
  SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS source_inactive_shifts
FROM habat_attendance_shifts;

SELECT
  COUNT(*) AS source_assignments,
  SUM(CASE WHEN effective_to IS NULL THEN 1 ELSE 0 END) AS source_open_assignments
FROM habat_attendance_shift_assignments;

SELECT
  COUNT(*) AS source_day_overrides,
  SUM(CASE WHEN override_type = 'emergency_leave' THEN 1 ELSE 0 END) AS source_emergency_leave_overrides,
  SUM(CASE WHEN override_type = 'absence' THEN 1 ELSE 0 END) AS source_absence_overrides
FROM habat_attendance_day_overrides;

SELECT
  COUNT(*) AS source_monthly_summaries,
  COUNT(DISTINCT access_id) AS source_employees_with_monthly_summaries
FROM habat_attendance_monthly_summaries;

SELECT
  COUNT(*) AS source_attendance_records,
  COUNT(DISTINCT access_id) AS source_employees_with_attendance_records,
  SUM(CASE WHEN access_id IS NULL THEN 1 ELSE 0 END) AS source_records_without_access_id
FROM habat_attendance_records;

SELECT
  COUNT(*) AS orphan_assignments_missing_employee
FROM habat_attendance_shift_assignments a
LEFT JOIN habat_attendance_access e ON e.id = a.access_id
WHERE e.id IS NULL;

SELECT
  COUNT(*) AS orphan_assignments_missing_shift
FROM habat_attendance_shift_assignments a
LEFT JOIN habat_attendance_shifts s ON s.id = a.shift_id
WHERE s.id IS NULL;

SELECT
  COUNT(*) AS orphan_day_overrides
FROM habat_attendance_day_overrides o
LEFT JOIN habat_attendance_access e ON e.id = o.access_id
WHERE e.id IS NULL;

SELECT
  COUNT(*) AS orphan_monthly_summaries
FROM habat_attendance_monthly_summaries m
LEFT JOIN habat_attendance_access e ON e.id = m.access_id
WHERE e.id IS NULL;

SELECT
  COUNT(*) AS target_tenants
FROM workforce_tenants
WHERE id = 'restaurant_tenant_habat_alwaraq';

SELECT
  COUNT(*) AS target_employees
FROM workforce_employee_profiles
WHERE tenant_id = 'restaurant_tenant_habat_alwaraq';

SELECT
  COUNT(*) AS target_employment_rows
FROM workforce_employment
WHERE tenant_id = 'restaurant_tenant_habat_alwaraq';

SELECT
  COUNT(*) AS target_schedule_templates
FROM workforce_schedule_templates
WHERE tenant_id = 'restaurant_tenant_habat_alwaraq';

SELECT
  COUNT(*) AS target_schedule_assignments
FROM workforce_schedule_assignments
WHERE tenant_id = 'restaurant_tenant_habat_alwaraq';

SELECT
  COUNT(*) AS target_attendance_links
FROM workforce_attendance_links
WHERE tenant_id = 'restaurant_tenant_habat_alwaraq';

SELECT
  COUNT(*) AS target_leaves
FROM workforce_leaves
WHERE tenant_id = 'restaurant_tenant_habat_alwaraq';

SELECT
  COUNT(*) AS target_absences
FROM workforce_absences
WHERE tenant_id = 'restaurant_tenant_habat_alwaraq';

SELECT
  COUNT(*) AS target_attendance_snapshots
FROM workforce_attendance_month_snapshots
WHERE tenant_id = 'restaurant_tenant_habat_alwaraq';

SELECT
  COUNT(*) AS conflicting_employee_identity_rows
FROM habat_attendance_access a
JOIN workforce_employee_profiles p
  ON p.tenant_id = 'restaurant_tenant_habat_alwaraq'
 AND (
      (
        NULLIF(trim(a.uid), '') IS NOT NULL
        AND NULLIF(trim(p.account_uid), '') = NULLIF(trim(a.uid), '')
      )
      OR (
        NULLIF(trim(a.email), '') IS NOT NULL
        AND lower(trim(p.account_email)) = lower(trim(a.email))
      )
    )
WHERE NOT (
  p.source_type = 'legacy_attendance_access'
  AND p.source_id = a.id
);

SELECT
  COUNT(*) AS conflicting_employee_source_rows
FROM habat_attendance_access a
JOIN workforce_employee_profiles p
  ON p.tenant_id = 'restaurant_tenant_habat_alwaraq'
 AND p.source_type = 'legacy_attendance_access'
 AND p.source_id = a.id
WHERE p.id <> 'wf_emp_' || a.id;

SELECT
  COUNT(*) AS expected_employee_rows_after_cutover
FROM habat_attendance_access;

SELECT
  COUNT(*) AS expected_schedule_rows_after_cutover
FROM habat_attendance_shifts;

SELECT
  COUNT(*) AS expected_assignment_rows_after_cutover
FROM habat_attendance_shift_assignments a
JOIN habat_attendance_access e ON e.id = a.access_id
JOIN habat_attendance_shifts s ON s.id = a.shift_id;

SELECT
  COUNT(*) AS expected_leave_rows_after_cutover
FROM habat_attendance_day_overrides
WHERE override_type = 'emergency_leave';

SELECT
  COUNT(*) AS expected_absence_rows_after_cutover
FROM habat_attendance_day_overrides
WHERE override_type = 'absence';

SELECT
  COUNT(*) AS expected_attendance_snapshot_rows_after_cutover
FROM habat_attendance_monthly_summaries m
JOIN habat_attendance_access e ON e.id = m.access_id;
