PRAGMA foreign_keys = ON;

-- Habbat legacy day overrides -> canonical Workforce leave/absence rows.
-- Non-destructive and idempotent: legacy rows remain for rollback/read-only audit.

INSERT INTO workforce_leaves (
  id, tenant_id, employee_id, leave_type, duration_kind,
  start_date, end_date, partial_start_time, partial_end_time, requested_minutes,
  status, reason, note, requested_by_uid, approved_by_uid, approved_by_email,
  approved_at, created_at, updated_at
)
SELECT
  'wf_legacy_leave_' || o.id,
  'restaurant_tenant_habat_alwaraq',
  p.id,
  'emergency',
  CASE WHEN o.day_portion = 'half_day' THEN 'half_day' ELSE 'full_day' END,
  o.attendance_date,
  o.attendance_date,
  NULL,
  NULL,
  NULL,
  'approved',
  o.reason,
  'Migrated from habat_attendance_day_overrides:' || o.id,
  o.created_by_uid,
  o.created_by_uid,
  o.created_by_email,
  COALESCE(o.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  COALESCE(o.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  COALESCE(o.updated_at, o.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM habat_attendance_day_overrides o
JOIN workforce_employee_profiles p
  ON p.tenant_id = 'restaurant_tenant_habat_alwaraq'
 AND p.source_type = 'legacy_attendance_access'
 AND p.source_id = o.access_id
WHERE o.override_type = 'emergency_leave'
  AND NOT EXISTS (
    SELECT 1
      FROM workforce_leaves l
     WHERE l.id = 'wf_legacy_leave_' || o.id
        OR (
          l.tenant_id = 'restaurant_tenant_habat_alwaraq'
          AND l.employee_id = p.id
          AND l.status = 'approved'
          AND l.leave_type = 'emergency'
          AND l.start_date = o.attendance_date
          AND l.end_date = o.attendance_date
          AND l.duration_kind = CASE WHEN o.day_portion = 'half_day' THEN 'half_day' ELSE 'full_day' END
          AND COALESCE(l.reason, '') = COALESCE(o.reason, '')
        )
  );

INSERT INTO workforce_absences (
  id, tenant_id, employee_id, absence_date, day_portion, status,
  reason, payroll_treatment, created_by_uid, created_by_email,
  created_at, updated_at
)
SELECT
  'wf_legacy_absence_' || o.id,
  'restaurant_tenant_habat_alwaraq',
  p.id,
  o.attendance_date,
  CASE WHEN o.day_portion = 'half_day' THEN 'half_day' ELSE 'full_day' END,
  'approved',
  o.reason,
  'attendance_policy',
  o.created_by_uid,
  o.created_by_email,
  COALESCE(o.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  COALESCE(o.updated_at, o.created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM habat_attendance_day_overrides o
JOIN workforce_employee_profiles p
  ON p.tenant_id = 'restaurant_tenant_habat_alwaraq'
 AND p.source_type = 'legacy_attendance_access'
 AND p.source_id = o.access_id
WHERE o.override_type = 'absence'
  AND NOT EXISTS (
    SELECT 1
      FROM workforce_absences a
     WHERE a.id = 'wf_legacy_absence_' || o.id
        OR (
          a.tenant_id = 'restaurant_tenant_habat_alwaraq'
          AND a.employee_id = p.id
          AND a.absence_date = o.attendance_date
          AND a.status = 'approved'
        )
  );
