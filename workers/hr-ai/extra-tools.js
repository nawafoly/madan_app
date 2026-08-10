const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function dateKey(value) {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error("invalid_date");
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("invalid_date");
  return normalized;
}

function riyadhUtcRange(date) {
  const key = dateKey(date);
  const [year, month, day] = key.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day, -3, 0, 0, 0);
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86400000).toISOString(),
  };
}

function todayRiyadh() {
  return new Date(Date.now() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

function money(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requirePermission(permissions, key, errorCode) {
  if (!Array.isArray(permissions) || !permissions.includes(key)) throw new Error(errorCode);
}

export const EXTRA_HR_AI_TOOL_DEFINITIONS = [
  {
    name: "getEmployeeCompensationByName",
    description: "Get configured salary and allowance fields for an active employee by name. Requires payroll.view and employees.view. Use for questions like how much is Nawaf's salary.",
    parameters: {
      type: "object",
      properties: { employeeName: { type: "string" } },
      required: ["employeeName"],
    },
  },
  {
    name: "getAttendanceLocationsForDate",
    description: "List configured active attendance work zones and the employees who had allowed attendance records in each zone on one Riyadh date.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD" } },
      required: ["date"],
    },
  },
];

export function isExtraHrAiTool(name) {
  return EXTRA_HR_AI_TOOL_DEFINITIONS.some(tool => tool.name === name);
}

export async function executeExtraHrAiTool(name, rawArgs, ctx) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  const { hrDb, attendanceDb, permissions } = ctx;
  if (!hrDb || !attendanceDb) throw new Error("missing_ai_database_binding");

  if (name === "getEmployeeCompensationByName") {
    requirePermission(permissions, "employees.view", "employees_view_forbidden");
    requirePermission(permissions, "payroll.view", "payroll_view_forbidden");
    const employeeName = text(args.employeeName).slice(0, 120);
    if (!employeeName) throw new Error("invalid_employee_search");
    const needle = `%${employeeName.toLowerCase()}%`;
    const result = await hrDb.prepare(
      `SELECT id, name, employee_code, base_salary, housing_allowance,
              transportation_allowance, other_allowances, insurance_deduction
         FROM employees
        WHERE is_active = 1
          AND lower(trim(employment_status)) NOT IN ('deleted','terminated','inactive')
          AND lower(name) LIKE ?
        ORDER BY CASE WHEN lower(name) = ? THEN 0 ELSE 1 END, name COLLATE NOCASE ASC
        LIMIT 5`
    ).bind(needle, employeeName.toLowerCase()).all();

    return {
      query: employeeName,
      matches: (result.results || []).map(row => ({
        employeeId: row.id,
        name: row.name,
        employeeCode: row.employee_code || null,
        compensation: {
          baseSalary: money(row.base_salary),
          housingAllowance: money(row.housing_allowance),
          transportationAllowance: money(row.transportation_allowance),
          otherAllowances: money(row.other_allowances),
          insuranceDeduction: money(row.insurance_deduction),
        },
      })),
    };
  }

  if (name === "getAttendanceLocationsForDate") {
    requirePermission(permissions, "employees.view", "employees_view_forbidden");
    requirePermission(permissions, "attendance.view", "attendance_view_forbidden");
    const date = dateKey(args.date || todayRiyadh());
    const range = riyadhUtcRange(date);

    const [zonesResult, recordsResult, employeesResult] = await Promise.all([
      attendanceDb.prepare(
        `SELECT id, name, type, active
           FROM work_zones
          WHERE active = 1
          ORDER BY name COLLATE NOCASE ASC, id ASC`
      ).all(),
      attendanceDb.prepare(
        `SELECT employee_uid, employee_doc_id, type, server_time, zone_id, zone_name
           FROM attendance_records
          WHERE result = 'allowed' AND server_time >= ? AND server_time < ?
          ORDER BY server_time ASC`
      ).bind(range.start, range.end).all(),
      hrDb.prepare(
        `SELECT id, auth_uid, name
           FROM employees
          WHERE is_active = 1 AND lower(trim(employment_status)) NOT IN ('deleted','terminated','inactive')`
      ).all(),
    ]);

    const byId = new Map();
    const byUid = new Map();
    for (const employee of employeesResult.results || []) {
      byId.set(text(employee.id), employee);
      if (text(employee.auth_uid)) byUid.set(text(employee.auth_uid), employee);
    }

    const zones = new Map();
    for (const zone of zonesResult.results || []) {
      zones.set(text(zone.id), {
        zoneId: zone.id,
        zoneName: zone.name,
        zoneType: zone.type || null,
        configured: true,
        employees: new Map(),
        recordCount: 0,
      });
    }

    for (const row of recordsResult.results || []) {
      const zoneId = text(row.zone_id);
      const fallbackKey = zoneId || `name:${text(row.zone_name) || "unknown"}`;
      if (!zones.has(fallbackKey)) {
        zones.set(fallbackKey, {
          zoneId: zoneId || null,
          zoneName: text(row.zone_name) || "غير محدد",
          zoneType: null,
          configured: false,
          employees: new Map(),
          recordCount: 0,
        });
      }
      const zone = zones.get(fallbackKey);
      zone.recordCount += 1;
      const employee = byUid.get(text(row.employee_uid)) || byId.get(text(row.employee_doc_id));
      if (!employee) continue;
      const employeeKey = text(employee.id);
      const current = zone.employees.get(employeeKey) || {
        employeeId: employee.id,
        name: employee.name,
        actions: [],
      };
      current.actions.push({ type: row.type, serverTime: row.server_time });
      zone.employees.set(employeeKey, current);
    }

    return {
      date,
      configuredActiveLocationCount: (zonesResult.results || []).length,
      locations: [...zones.values()].map(zone => ({
        zoneId: zone.zoneId,
        zoneName: zone.zoneName,
        zoneType: zone.zoneType,
        configured: zone.configured,
        recordCount: zone.recordCount,
        employeeCount: zone.employees.size,
        employees: [...zone.employees.values()].map(employee => ({
          employeeId: employee.employeeId,
          name: employee.name,
        })),
      })),
    };
  }

  throw new Error("unknown_extra_hr_ai_tool");
}
