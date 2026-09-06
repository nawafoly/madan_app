PRAGMA foreign_keys = ON;

-- Tenant cutover only.
-- Legacy Habbat table names are intentionally confined to this migration and the
-- Habbat edge adapter. Workforce Core business logic remains tenant-agnostic.

INSERT INTO workforce_tenants (
  id, product_key, tenant_key, display_name, timezone, is_active, created_at, updated_at
) VALUES (
  'restaurant_tenant_habat_alwaraq',
  'restaurants',
  'habat-alwaraq',
  'حبات الورق',
  'Asia/Riyadh',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  product_key = excluded.product_key,
  tenant_key = excluded.tenant_key,
  display_name = excluded.display_name,
  timezone = excluded.timezone,
  is_active = 1,
  updated_at = excluded.updated_at;

-- Keep already-cut-over employees current without replacing their Workforce IDs.
UPDATE workforce_employee_profiles
SET account_uid = (
      SELECT NULLIF(trim(a.uid), '')
      FROM habat_attendance_access a
      WHERE a.id = workforce_employee_profiles.source_id
    ),
    account_email = (
      SELECT lower(trim(a.email))
      FROM habat_attendance_access a
      WHERE a.id = workforce_employee_profiles.source_id
    ),
    display_name = COALESCE((
      SELECT NULLIF(trim(a.display_name), '')
      FROM habat_attendance_access a
      WHERE a.id = workforce_employee_profiles.source_id
    ), display_name),
    status = COALESCE((
      SELECT CASE WHEN a.is_active = 1 THEN 'active' ELSE 'inactive' END
      FROM habat_attendance_access a
      WHERE a.id = workforce_employee_profiles.source_id
    ), status),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
  AND source_type = 'legacy_attendance_access'
  AND EXISTS (
    SELECT 1
    FROM habat_attendance_access a
    WHERE a.id = workforce_employee_profiles.source_id
  );

INSERT INTO workforce_employee_profiles (
  id, tenant_id, account_uid, account_email, display_name, status,
  source_type, source_id, created_at, updated_at
)
SELECT
  'wf_emp_' || a.id,
  'restaurant_tenant_habat_alwaraq',
  NULLIF(trim(a.uid), ''),
  lower(trim(a.email)),
  COALESCE(NULLIF(trim(a.display_name), ''), lower(trim(a.email)), a.id),
  CASE WHEN a.is_active = 1 THEN 'active' ELSE 'inactive' END,
  'legacy_attendance_access',
  a.id,
  COALESCE(a.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  COALESCE(a.updated_at, a.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM habat_attendance_access a
WHERE NOT EXISTS (
  SELECT 1
  FROM workforce_employee_profiles p
  WHERE p.tenant_id = 'restaurant_tenant_habat_alwaraq'
    AND p.source_type = 'legacy_attendance_access'
    AND p.source_id = a.id
);

INSERT INTO workforce_employment (
  employee_id, tenant_id, employment_status, created_at, updated_at
)
SELECT
  p.id,
  p.tenant_id,
  CASE WHEN p.status = 'active' THEN 'active' ELSE 'inactive' END,
  p.created_at,
  p.updated_at
FROM workforce_employee_profiles p
WHERE p.tenant_id = 'restaurant_tenant_habat_alwaraq'
ON CONFLICT(employee_id) DO UPDATE SET
  employment_status = excluded.employment_status,
  updated_at = excluded.updated_at;

-- Legacy shifts become generic schedule templates. Their legacy IDs are only a
-- cutover concern; future tenants create templates through Workforce Core APIs.
INSERT INTO workforce_schedule_templates (
  id, tenant_id, name, start_time, end_time, grace_minutes,
  early_leave_tolerance_minutes, working_days_json, is_active, created_at, updated_at
)
SELECT
  'wf_sched_' || s.id,
  'restaurant_tenant_habat_alwaraq',
  s.name,
  s.start_time,
  s.end_time,
  COALESCE(s.grace_minutes, 0),
  COALESCE(s.early_leave_tolerance_minutes, 0),
  '[' || COALESCE(NULLIF(trim(s.working_days), ''), '') || ']',
  COALESCE(s.is_active, 1),
  COALESCE(s.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  COALESCE(s.updated_at, s.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM habat_attendance_shifts s
WHERE NOT EXISTS (
  SELECT 1 FROM workforce_schedule_templates t
  WHERE t.tenant_id = 'restaurant_tenant_habat_alwaraq'
    AND t.id = 'wf_sched_' || s.id
);

UPDATE workforce_schedule_templates
SET name = (SELECT s.name FROM habat_attendance_shifts s WHERE 'wf_sched_' || s.id = workforce_schedule_templates.id),
    start_time = (SELECT s.start_time FROM habat_attendance_shifts s WHERE 'wf_sched_' || s.id = workforce_schedule_templates.id),
    end_time = (SELECT s.end_time FROM habat_attendance_shifts s WHERE 'wf_sched_' || s.id = workforce_schedule_templates.id),
    grace_minutes = COALESCE((SELECT s.grace_minutes FROM habat_attendance_shifts s WHERE 'wf_sched_' || s.id = workforce_schedule_templates.id), grace_minutes),
    early_leave_tolerance_minutes = COALESCE((SELECT s.early_leave_tolerance_minutes FROM habat_attendance_shifts s WHERE 'wf_sched_' || s.id = workforce_schedule_templates.id), early_leave_tolerance_minutes),
    working_days_json = COALESCE((SELECT '[' || COALESCE(NULLIF(trim(s.working_days), ''), '') || ']' FROM habat_attendance_shifts s WHERE 'wf_sched_' || s.id = workforce_schedule_templates.id), working_days_json),
    is_active = COALESCE((SELECT s.is_active FROM habat_attendance_shifts s WHERE 'wf_sched_' || s.id = workforce_schedule_templates.id), is_active),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE tenant_id = 'restaurant_tenant_habat_alwaraq'
  AND id LIKE 'wf_sched_%';

-- Legacy Habbat resolves an employee with no explicit assignment to the active
-- default shift (habat_shift_default, otherwise the first active shift). Preserve
-- that implicit behavior by materializing a baseline generic assignment for every
-- cut-over employee. Explicit dated assignments below remain more specific because
-- they carry later effective_from values; when they expire, the baseline is again
-- available as the fallback instead of leaving the employee unscheduled.
INSERT INTO workforce_schedule_assignments (
  id, tenant_id, employee_id, template_id, effective_from, effective_to,
  created_by_uid, created_by_email, created_at
)
SELECT
  'wf_asg_legacy_default_' || p.source_id,
  'restaurant_tenant_habat_alwaraq',
  p.id,
  'wf_sched_' || d.id,
  '1970-01-01',
  NULL,
  NULL,
  NULL,
  COALESCE(p.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM workforce_employee_profiles p
JOIN (
  SELECT id
  FROM habat_attendance_shifts
  WHERE is_active = 1
  ORDER BY CASE WHEN id = 'habat_shift_default' THEN 0 ELSE 1 END, created_at ASC
  LIMIT 1
) d
JOIN workforce_schedule_templates t
  ON t.tenant_id = 'restaurant_tenant_habat_alwaraq'
 AND t.id = 'wf_sched_' || d.id
WHERE p.tenant_id = 'restaurant_tenant_habat_alwaraq'
  AND p.source_type = 'legacy_attendance_access'
  AND NOT EXISTS (
    SELECT 1 FROM workforce_schedule_assignments x
    WHERE x.id = 'wf_asg_legacy_default_' || p.source_id
  );

-- Preserve explicit legacy assignments as dated overrides of the baseline.
INSERT INTO workforce_schedule_assignments (
  id, tenant_id, employee_id, template_id, effective_from, effective_to,
  created_by_uid, created_by_email, created_at
)
SELECT
  'wf_asg_' || a.id,
  'restaurant_tenant_habat_alwaraq',
  p.id,
  'wf_sched_' || a.shift_id,
  a.effective_from,
  a.effective_to,
  a.created_by_uid,
  a.created_by_email,
  COALESCE(a.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM habat_attendance_shift_assignments a
JOIN workforce_employee_profiles p
  ON p.tenant_id = 'restaurant_tenant_habat_alwaraq'
 AND p.source_type = 'legacy_attendance_access'
 AND p.source_id = a.access_id
JOIN workforce_schedule_templates t
  ON t.tenant_id = 'restaurant_tenant_habat_alwaraq'
 AND t.id = 'wf_sched_' || a.shift_id
WHERE NOT EXISTS (
  SELECT 1 FROM workforce_schedule_assignments x
  WHERE x.id = 'wf_asg_' || a.id
);

INSERT INTO workforce_attendance_links (
  id, tenant_id, employee_id, source_type, source_employee_id, status,
  created_at, updated_at
)
SELECT
  'wf_att_link_' || p.source_id,
  p.tenant_id,
  p.id,
  'legacy_attendance_access',
  p.source_id,
  'confirmed',
  p.created_at,
  p.updated_at
FROM workforce_employee_profiles p
WHERE p.tenant_id = 'restaurant_tenant_habat_alwaraq'
  AND p.source_type = 'legacy_attendance_access'
ON CONFLICT(tenant_id, employee_id) DO UPDATE SET
  source_type = excluded.source_type,
  source_employee_id = excluded.source_employee_id,
  status = 'confirmed',
  updated_at = excluded.updated_at;

-- Preserve historical emergency leave/absence day overrides in the new domains.
INSERT INTO workforce_leaves (
  id, tenant_id, employee_id, leave_type, duration_kind,
  start_date, end_date, status, reason,
  requested_by_uid, approved_by_uid, approved_by_email, approved_at,
  created_at, updated_at
)
SELECT
  'wf_leave_legacy_' || o.id,
  'restaurant_tenant_habat_alwaraq',
  p.id,
  'emergency',
  CASE WHEN o.day_portion = 'half_day' THEN 'half_day' ELSE 'full_day' END,
  o.attendance_date,
  o.attendance_date,
  'approved',
  o.reason,
  o.created_by_uid,
  o.created_by_uid,
  o.created_by_email,
  o.created_at,
  o.created_at,
  o.updated_at
FROM habat_attendance_day_overrides o
JOIN workforce_employee_profiles p
  ON p.tenant_id = 'restaurant_tenant_habat_alwaraq'
 AND p.source_type = 'legacy_attendance_access'
 AND p.source_id = o.access_id
WHERE o.override_type = 'emergency_leave'
  AND NOT EXISTS (
    SELECT 1 FROM workforce_leaves l
    WHERE l.id = 'wf_leave_legacy_' || o.id
  );

INSERT INTO workforce_absences (
  id, tenant_id, employee_id, absence_date, day_portion, status,
  reason, payroll_treatment, created_by_uid, created_by_email,
  created_at, updated_at
)
SELECT
  'wf_absence_legacy_' || o.id,
  'restaurant_tenant_habat_alwaraq',
  p.id,
  o.attendance_date,
  CASE WHEN o.day_portion = 'half_day' THEN 'half_day' ELSE 'full_day' END,
  'approved',
  o.reason,
  'attendance_policy',
  o.created_by_uid,
  o.created_by_email,
  o.created_at,
  o.updated_at
FROM habat_attendance_day_overrides o
JOIN workforce_employee_profiles p
  ON p.tenant_id = 'restaurant_tenant_habat_alwaraq'
 AND p.source_type = 'legacy_attendance_access'
 AND p.source_id = o.access_id
WHERE o.override_type = 'absence'
  AND NOT EXISTS (
    SELECT 1 FROM workforce_absences x
    WHERE x.id = 'wf_absence_legacy_' || o.id
  );

-- Preserve saved monthly attendance summaries as historical snapshots. They are
-- not payroll deductions by themselves; payroll may use them only after readiness
-- rules confirm the month is safe to calculate.
INSERT INTO workforce_attendance_month_snapshots (
  id, tenant_id, employee_id, month_key, link_status, source_type,
  source_revision, summary_json, generated_by_uid, generated_by_email,
  generated_at
)
SELECT
  'wf_att_month_' || m.id,
  'restaurant_tenant_habat_alwaraq',
  p.id,
  m.month_key,
  'confirmed',
  'legacy_habat_monthly_summary',
  m.id,
  m.summary_json,
  m.generated_by_uid,
  m.generated_by_email,
  m.generated_at
FROM habat_attendance_monthly_summaries m
JOIN workforce_employee_profiles p
  ON p.tenant_id = 'restaurant_tenant_habat_alwaraq'
 AND p.source_type = 'legacy_attendance_access'
 AND p.source_id = m.access_id
WHERE NOT EXISTS (
  SELECT 1 FROM workforce_attendance_month_snapshots s
  WHERE s.tenant_id = 'restaurant_tenant_habat_alwaraq'
    AND s.employee_id = p.id
    AND s.month_key = m.month_key
);
