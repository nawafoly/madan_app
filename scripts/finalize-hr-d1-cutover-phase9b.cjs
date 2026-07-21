const fs = require("node:fs");

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, content) {
  fs.writeFileSync(path, content.replace(/\r\n/g, "\n"), "utf8");
}

function replaceExact(path, from, to, expected = 1) {
  let content = read(path);
  const count = content.split(from).length - 1;
  if (count !== expected) {
    throw new Error(`${path}: expected ${expected} exact match(es), found ${count}\n${from}`);
  }
  content = content.split(from).join(to);
  write(path, content);
}

function replaceRegex(path, regex, replacement, expected = 1) {
  let content = read(path);
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const matcher = new RegExp(regex.source, flags);
  const matches = [...content.matchAll(matcher)];
  if (matches.length !== expected) {
    throw new Error(`${path}: expected ${expected} regex match(es), found ${matches.length}\n${regex}`);
  }
  content = content.replace(matcher, replacement);
  write(path, content);
}

function assertAbsent(path, snippets) {
  const content = read(path);
  for (const snippet of snippets) {
    if (content.includes(snippet)) {
      throw new Error(`${path}: forbidden snippet remains: ${snippet}`);
    }
  }
}

const profilePath = "client/src/pages/employee/Profile.tsx";
replaceRegex(
  profilePath,
  /import \{\n  addDoc,[\s\S]*?\n\} from "firebase\/firestore";\n/,
  ""
);
replaceExact(
  profilePath,
  `import { auth, db } from "@/_core/firebase";`,
  `import { auth } from "@/_core/firebase";`
);
replaceExact(
  profilePath,
  `import {
  HR_CORE_D1_ENABLED,
  createHrCoreLeaveRequest,
  createHrCoreServiceRequest,
  isHrCoreConfigured,
  listHrCoreLeaveRequests,
  listHrCorePayrollRecords,
  listHrCoreServiceRequests,
} from "@/lib/hrCoreApi";`,
  `import {
  createHrCoreLeaveRequest,
  createHrCoreServiceRequest,
  getHrCoreEmployee,
  getHrCoreMe,
  isHrCoreConfigured,
  listHrCoreEmployeeFiles,
  listHrCoreLeaveRequests,
  listHrCorePayrollRecords,
  listHrCoreServiceRequests,
  updateHrCoreEmployee,
  type HrCoreEmployee,
} from "@/lib/hrCoreApi";`
);
replaceExact(profilePath, `  EMPLOYEE_FILES_COLLECTION,\n`, "");
replaceExact(profilePath, `  EMPLOYEE_LEAVE_REQUESTS_COLLECTION,\n`, "");
replaceExact(profilePath, `  buildEmployeeLeaveRequestPayload,\n`, "");
replaceExact(profilePath, `  EMPLOYEE_SERVICE_REQUESTS_COLLECTION,\n`, "");
replaceExact(profilePath, `  buildEmployeeServiceRequestPayload,\n`, "");
replaceExact(profilePath, `  EMPLOYEE_PAYROLL_RECORDS_COLLECTION,\n`, "");
replaceExact(
  profilePath,
  `type EmployeeProfileSource = {
  collectionName: "employees" | "users";
  docId: string;
  entityId: string;
};`,
  `type EmployeeProfileSource = {
  docId: string;
  entityId: string;
};`
);
replaceExact(
  profilePath,
  `    employeeDocId:
      source.collectionName === "employees"
        ? normalizeScopeValue(source.docId) || null
        : null,`,
  `    employeeDocId: normalizeScopeValue(source.docId) || null,`
);
replaceExact(
  profilePath,
  `  return recordAuthIds.includes(scope.authUid);
}

function getEmployeePortalViewFromHash()`,
  `  return recordAuthIds.includes(scope.authUid);
}

function mapHrCoreEmployeeToProfileDoc(
  employee: HrCoreEmployee
): EmployeeProfileUserDoc {
  const rawPersonal = (employee.personal || {}) as Record<string, any>;
  const rawEmployment = (employee.employment || {}) as Record<string, any>;
  const personal = {
    ...rawPersonal,
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    avatar: employee.avatarUrl
      ? {
          ...(rawPersonal.avatar && typeof rawPersonal.avatar === "object"
            ? rawPersonal.avatar
            : {}),
          fileUrl: employee.avatarUrl,
        }
      : rawPersonal.avatar || null,
  };
  const employment = {
    ...rawEmployment,
    title: employee.title,
    department: employee.department,
    employeeCode: employee.employeeCode,
    fingerprintNumber: employee.fingerprintNumber,
    employmentStatus: employee.employmentStatus,
    status: employee.employmentStatus,
    startDate: employee.startDate,
    leaveBalance: employee.leaveBalance,
    baseSalary: employee.salary.baseSalary,
    housingAllowance: employee.salary.housingAllowance,
    transportationAllowance: employee.salary.transportationAllowance,
    otherAllowances: employee.salary.otherAllowances,
    insuranceDeduction: employee.salary.insuranceDeduction,
    salaryDeductions: employee.salary.deductions,
    shiftStartTime: employee.workSchedule.startTime,
    shiftEndTime: employee.workSchedule.endTime,
    workSchedule: {
      ...(rawEmployment.workSchedule &&
      typeof rawEmployment.workSchedule === "object"
        ? rawEmployment.workSchedule
        : {}),
      startTime: employee.workSchedule.startTime,
      endTime: employee.workSchedule.endTime,
      weeklyOffDays: employee.workSchedule.weeklyOffDays,
    },
    allowedZoneIds: employee.allowedZoneIds,
    adminNotes: employee.adminNotes,
  };

  return {
    uid: employee.authUid || employee.id,
    displayName: employee.name,
    name: employee.name,
    fullName: employee.name,
    email: employee.email,
    phone: employee.phone,
    photoURL: employee.avatarUrl,
    employeeId: employee.id,
    title: employee.title,
    department: employee.department,
    employeeCode: employee.employeeCode,
    fingerprintNumber: employee.fingerprintNumber,
    startDate: employee.startDate,
    leaveBalance: employee.leaveBalance,
    active: employee.isActive,
    isActive: employee.isActive,
    status: employee.employmentStatus,
    personal,
    employment,
    employeeProfile: { personal, employment },
  } as EmployeeProfileUserDoc;
}

function getEmployeePortalViewFromHash()`
);
replaceRegex(
  profilePath,
  /  useEffect\(\(\) => \{\n    if \(!user\?\.uid\) \{\n      setEmployeeProfileSource\(null\);[\s\S]*?  \}, \[employeeProfileSource, user\?\.uid\]\);\n/,
  `  useEffect(() => {
    if (!user?.uid) {
      setEmployeeProfileSource(null);
      setUserDoc(null);
      setLoading(false);
      return;
    }

    if (!isHrCoreConfigured()) {
      setEmployeeProfileSource(null);
      setUserDoc(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      const me = await getHrCoreMe();
      const employeeId = String(
        me.account.linkedEmployeeId || user.linkedEmployeeId || user.uid
      ).trim();
      if (!employeeId) throw new Error("employee_profile_link_missing");

      const response = await getHrCoreEmployee(employeeId);
      if (cancelled) return;

      setEmployeeProfileSource({
        docId: response.employee.id,
        entityId: response.employee.id,
      });
      setUserDoc(mapHrCoreEmployeeToProfileDoc(response.employee));
      setLoading(false);
    })().catch(error => {
      if (cancelled) return;
      console.error("employee_profile_d1_load_failed", error);
      setEmployeeProfileSource(null);
      setUserDoc(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    user?.employeeProfileEnabled,
    user?.linkedEmployeeId,
    user?.role,
    user?.uid,
  ]);
`
);
replaceRegex(
  profilePath,
  /  useEffect\(\(\) => \{\n    if \(!user\?\.uid\) \{\n      setEmployeeFiles\(\[\]\);[\s\S]*?  \}, \[employeeRecordScope, user\?\.uid\]\);\n/,
  `  useEffect(() => {
    if (!user?.uid) {
      setEmployeeFiles([]);
      setEmployeeFilesLoading(false);
      return;
    }

    let active = true;
    setEmployeeFilesLoading(true);

    void listHrCoreEmployeeFiles({
      employeeUid: user.uid,
      active: true,
      limit: 200,
      offset: 0,
    })
      .then(result => {
        if (!active) return;
        setEmployeeFiles(
          sortEmployeeFiles(
            result.employeeFiles
              .map(file =>
                normalizeEmployeeFileRecord(
                  file.id,
                  file as Record<string, any>
                )
              )
              .filter(record =>
                employeeRecordBelongsToScope(record, employeeRecordScope)
              )
          )
        );
        setEmployeeFilesLoading(false);
      })
      .catch(error => {
        if (!active) return;
        console.error("employee_profile_files_hr_core_error", error);
        setEmployeeFiles([]);
        setEmployeeFilesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [employeeRecordScope, user?.uid]);
`
);
replaceRegex(
  profilePath,
  /  useEffect\(\(\) => \{\n    if \(!user\?\.uid\) \{\n      setEmployeePayrollRecords\(\[\]\);[\s\S]*?  \}, \[employeeRecordScope, user\?\.linkedEmployeeId, user\?\.uid\]\);\n/,
  `  useEffect(() => {
    if (!user?.uid) {
      setEmployeePayrollRecords([]);
      setEmployeePayrollRecordsLoading(false);
      return;
    }

    const linkedEmployeeId = String(
      employeeProfileSource?.entityId || user.linkedEmployeeId || ""
    ).trim();
    let active = true;
    setEmployeePayrollRecordsLoading(true);

    void listHrCorePayrollRecords({
      employeeUid: user.uid,
      employeeId: linkedEmployeeId || undefined,
      limit: 200,
    })
      .then(result => {
        if (!active) return;
        setEmployeePayrollRecords(
          sortEmployeePayrollRecords(
            result.payrollRecords
              .map(record =>
                normalizeEmployeePayrollRecord(
                  record.id,
                  record as Record<string, any>
                )
              )
              .filter(record =>
                employeeRecordBelongsToScope(record, employeeRecordScope)
              )
          )
        );
        setEmployeePayrollRecordsLoading(false);
      })
      .catch(error => {
        if (!active) return;
        console.error("employee_payroll_records_hr_core_error", error);
        setEmployeePayrollRecords([]);
        setEmployeePayrollRecordsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    employeeProfileSource?.entityId,
    employeeRecordScope,
    user?.linkedEmployeeId,
    user?.uid,
  ]);
`
);
replaceRegex(
  profilePath,
  /  useEffect\(\(\) => \{\n    if \(!user\?\.uid\) \{\n      setLeaveRequests\(\[\]\);[\s\S]*?  \}, \[employeeRecordScope, hrOperationsRevision, user\?\.uid\]\);\n/,
  `  useEffect(() => {
    if (!user?.uid) {
      setLeaveRequests([]);
      setLeaveRequestsLoading(false);
      return;
    }

    let active = true;
    setLeaveRequestsLoading(true);

    void listHrCoreLeaveRequests({
      employeeUid: user.uid,
      limit: 500,
      offset: 0,
    })
      .then(result => {
        if (!active) return;
        setLeaveRequests(
          sortEmployeeLeaveRequests(
            result.leaveRequests
              .map(request =>
                normalizeEmployeeLeaveRequest(request.id, request)
              )
              .filter(request =>
                employeeRecordBelongsToScope(request, employeeRecordScope)
              )
          )
        );
        setLeaveRequestsLoading(false);
      })
      .catch(error => {
        if (!active) return;
        console.error("employee_leave_requests_hr_core_error", error);
        setLeaveRequests([]);
        setLeaveRequestsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [employeeRecordScope, hrOperationsRevision, user?.uid]);
`
);
replaceRegex(
  profilePath,
  /  useEffect\(\(\) => \{\n    if \(!user\?\.uid\) \{\n      setServiceRequests\(\[\]\);[\s\S]*?  \}, \[employeeRecordScope, hrOperationsRevision, user\?\.uid\]\);\n/,
  `  useEffect(() => {
    if (!user?.uid) {
      setServiceRequests([]);
      setServiceRequestsLoading(false);
      return;
    }

    let active = true;
    setServiceRequestsLoading(true);

    void listHrCoreServiceRequests({
      employeeUid: user.uid,
      limit: 500,
      offset: 0,
    })
      .then(result => {
        if (!active) return;
        setServiceRequests(
          sortEmployeeServiceRequests(
            result.serviceRequests
              .map(request =>
                normalizeEmployeeServiceRequest(request.id, request)
              )
              .filter(request =>
                employeeRecordBelongsToScope(request, employeeRecordScope)
              )
          )
        );
        setServiceRequestsLoading(false);
      })
      .catch(error => {
        if (!active) return;
        console.error("employee_service_requests_hr_core_error", error);
        setServiceRequests([]);
        setServiceRequestsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [employeeRecordScope, hrOperationsRevision, user?.uid]);
`
);
replaceRegex(
  profilePath,
  /  const handleSavePhone = async \(\) => \{[\s\S]*?\n  \};\n\n  const resetAvatarCropState/,
  `  const handleSavePhone = async () => {
    const normalizedPhone = phoneInput.trim();
    if (!user?.uid || !employeeProfileSource) return;
    if (!validatePhone(normalizedPhone)) {
      toast.error("رقم الجوال غير صالح.");
      return;
    }

    setSavingPhone(true);
    try {
      const response = await updateHrCoreEmployee(
        employeeProfileSource.entityId,
        { phone: normalizedPhone }
      );
      setUserDoc(mapHrCoreEmployeeToProfileDoc(response.employee));
      toast.success("تم تحديث رقم الجوال.");
    } catch (error) {
      console.error("employee_phone_update_failed", error);
      toast.error("تعذر تحديث رقم الجوال.");
    } finally {
      setSavingPhone(false);
    }
  };

  const resetAvatarCropState`
);
replaceRegex(
  profilePath,
  /\n  \/\*\n      const uploaded = await uploadDocumentToCloudflare\([\s\S]*?\n    \*\/\n/,
  "\n"
);
replaceExact(
  profilePath,
  `      await setDoc(
        doc(
          db,
          employeeProfileSource.collectionName,
          employeeProfileSource.docId
        ),
        {
          ...buildEmployeeAvatarPatch(avatarPayload),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );`,
  `      const response = await updateHrCoreEmployee(
        employeeProfileSource.entityId,
        { avatarUrl: uploaded.fileUrl }
      );
      setUserDoc(mapHrCoreEmployeeToProfileDoc(response.employee));`
);
replaceExact(
  profilePath,
  `      const employeeDocId =
        (employeeProfileSource.collectionName === "employees"
          ? employeeProfileSource.docId
          : String(user.linkedEmployeeId || "").trim()) || null;`,
  `      const employeeDocId = employeeProfileSource.docId || null;`,
  2
);
replaceRegex(
  profilePath,
  /      if \(HR_CORE_D1_ENABLED && isHrCoreConfigured\(\)\) \{\n        const created = await createHrCoreServiceRequest\([\s\S]*?\n      \}\n\n      try \{/,
  `      const created = await createHrCoreServiceRequest({
        employeeId: employeeDocId,
        employeeUid: user.uid,
        employeeName,
        employeeEmail,
        requestType,
        requestDate: serviceRequestForm.requestDate || null,
        startDate: serviceRequestForm.startDate || null,
        endDate: serviceRequestForm.endDate || null,
        startTime: serviceRequestForm.startTime || null,
        endTime: serviceRequestForm.endTime || null,
        amount: requestType === "salary_advance" ? amount : null,
        letterType: serviceRequestForm.letterType || null,
        employeeNote: serviceRequestForm.employeeNote,
      });
      createdRequestId = created.serviceRequest.id;
      setHrOperationsRevision(current => current + 1);

      try {`
);
replaceRegex(
  profilePath,
  /      if \(HR_CORE_D1_ENABLED && isHrCoreConfigured\(\)\) \{\n        const created = await createHrCoreLeaveRequest\([\s\S]*?\n      \}\n\n      try \{/,
  `      const created = await createHrCoreLeaveRequest({
        employeeId: employeeDocId,
        employeeUid: user.uid,
        employeeName,
        employeeEmail,
        leaveType: leaveForm.leaveType,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        employeeNote: leaveForm.employeeNote,
      });
      createdRequestId = created.leaveRequest.id;
      setHrOperationsRevision(current => current + 1);

      try {`
);

const hrCoreApiPath = "client/src/lib/hrCoreApi.ts";
replaceExact(
  hrCoreApiPath,
  `  }>("/api/hr/employees", {}, params);
}

export async function getHrCoreEmployee(employeeId: string) {`,
  `  }>("/api/hr/employees", {}, params);
}

export type HrCoreEmployeeDirectoryEntry = {
  uid: string;
  employeeId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  title: string | null;
  department: string | null;
  statusKey: string;
  employeeCode: string | null;
  allowedZoneIds: string[];
};

export async function listHrCoreEmployeeDirectory() {
  return requestHrCore<{
    ok: true;
    employees: HrCoreEmployeeDirectoryEntry[];
  }>("/api/hr/employee-directory");
}

export async function getHrCoreEmployee(employeeId: string) {`
);

const directoryPath = "client/src/lib/employeeDirectoryWorker.ts";
replaceExact(
  directoryPath,
  `import { buildDocumentWorkerUrl } from "@/lib/documentUploadService";`,
  `import { buildDocumentWorkerUrl } from "@/lib/documentUploadService";\nimport { listHrCoreEmployeeDirectory } from "@/lib/hrCoreApi";`
);
replaceExact(
  directoryPath,
  `  statusKey: string;\n};`,
  `  statusKey: string;\n  employeeCode?: string | null;\n  allowedZoneIds?: string[];\n};`
);
replaceRegex(
  directoryPath,
  /export async function fetchEmployeeDirectoryFromWorker\(\) \{[\s\S]*?\n\}\n\nexport async function syncEmployeeDirectoryFromWorker/,
  `export async function fetchEmployeeDirectoryFromWorker() {
  const result = await listHrCoreEmployeeDirectory();
  return result.employees.map(employee => ({
    uid: String(employee.uid || "").trim(),
    name: String(employee.name || "").trim(),
    email: normalizeOptionalText(employee.email),
    avatarUrl: normalizeOptionalText(employee.avatarUrl),
    title: normalizeOptionalText(employee.title),
    department: normalizeOptionalText(employee.department),
    statusKey: String(employee.statusKey || "active").trim() || "active",
    employeeCode: normalizeOptionalText(employee.employeeCode),
    allowedZoneIds: Array.isArray(employee.allowedZoneIds)
      ? employee.allowedZoneIds.map(value => String(value || "").trim()).filter(Boolean)
      : [],
  }));
}

export async function syncEmployeeDirectoryFromWorker`
);

const attendancePath = "client/src/pages/hr/Attendance.tsx";
replaceExact(
  attendancePath,
  `import { collection, getDocs } from "firebase/firestore";\n`,
  ""
);
replaceExact(attendancePath, `import { db } from "@/_core/firebase";\n`, "");
replaceRegex(
  attendancePath,
  /  useEffect\(\(\) => \{\n    let active = true;\n    Promise\.all\(\[[\s\S]*?  \}, \[\]\);\n/,
  `  useEffect(() => {
    let active = true;

    Promise.all([fetchEmployeeDirectoryFromWorker(), fetchWorkZones()])
      .then(([items, zones]) => {
        if (!active) return;

        setWorkZones(zones);
        setEmployees(
          items.map(item => ({
            uid: item.uid,
            name: item.name,
            employeeCode: item.employeeCode || "-",
            allowedZoneIds: normalizeAllowedZoneIds(item.allowedZoneIds),
          }))
        );
      })
      .catch(directoryError => {
        console.error(
          "hr_attendance_employee_directory_failed",
          directoryError
        );
        if (active) {
          setEmployees([]);
          setWorkZones([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);
`
);

const staffPortalPath = "client/src/pages/hr/StaffPortal.tsx";
replaceExact(
  staffPortalPath,
  `import { collection, onSnapshot, query, where } from "firebase/firestore";\n`,
  ""
);
replaceExact(
  staffPortalPath,
  `import { auth, db } from "@/_core/firebase";`,
  `import { auth } from "@/_core/firebase";`
);
replaceExact(
  staffPortalPath,
  `import { listInAppNotifications } from "@/lib/inAppNotifications";`,
  `import { listInAppNotifications } from "@/lib/inAppNotifications";\nimport { listHrCoreWeeklyReports } from "@/lib/hrCoreApi";`
);
replaceRegex(
  staffPortalPath,
  /  useEffect\(\(\) => \{\n    if \(!user\?\.uid \|\| !canWriteWeeklyReportNotes\) return;[\s\S]*?  \}, \[canWriteWeeklyReportNotes, user\?\.uid\]\);\n/,
  `  useEffect(() => {
    if (!user?.uid || !canWriteWeeklyReportNotes) return;

    let active = true;
    const loadPendingWeeklyReports = async () => {
      try {
        const result = await listHrCoreWeeklyReports({
          status: "sent",
          limit: 200,
          offset: 0,
        });
        if (!active) return;
        setWeeklyReportBadgeCount(
          result.weeklyReports.filter(report =>
            !String(report.managerNotes ?? "").trim()
          ).length
        );
      } catch (error) {
        console.error("weekly_report_pending_badge_failed", error);
        if (active) setWeeklyReportBadgeCount(0);
      }
    };

    void loadPendingWeeklyReports();
    const timer = window.setInterval(
      () => void loadPendingWeeklyReports(),
      30_000
    );

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canWriteWeeklyReportNotes, user?.uid]);
`
);

const workerPath = "workers/hr-core-worker.js";
replaceExact(
  workerPath,
  `const HR_WORKER_RELEASE = "phase8b-files-messages-v1";`,
  `const HR_WORKER_RELEASE = "phase9b-self-service-profile-v1";`
);
replaceExact(
  workerPath,
  `  if (pathname === "/api/hr/me" && request.method === "GET") {
    return json(200, {
      ok: true,
      account: mapAccountRow(requester.account),
      permissions: requester.permissions,
    });
  }`,
  `  if (pathname === "/api/hr/me" && request.method === "GET") {
    return json(200, {
      ok: true,
      account: mapAccountRow(requester.account),
      permissions: requester.permissions,
    });
  }

  if (pathname === "/api/hr/employee-directory" && request.method === "GET") {
    if (!canViewEmployeeDirectory(requester)) {
      return forbidden("employee_directory_view_forbidden");
    }
    return listEmployeeDirectory(env.HR_DB);
  }`
);
replaceExact(
  workerPath,
  `  if (employeeMatch && request.method === "PATCH") {
    if (!canManageEmployees(requester)) return forbidden("employees_manage_forbidden");
    return updateEmployee(
      request,
      env.HR_DB,
      requester,
      decodeURIComponent(employeeMatch[1])
    );
  }`,
  `  if (employeeMatch && request.method === "PATCH") {
    const employeeId = decodeURIComponent(employeeMatch[1]);
    if (canManageEmployees(requester)) {
      return updateEmployee(request, env.HR_DB, requester, employeeId);
    }
    if (canReadEmployee(requester, employeeId)) {
      return updateOwnEmployeeProfile(
        request,
        env.HR_DB,
        requester,
        employeeId
      );
    }
    return forbidden("employees_manage_forbidden");
  }`
);
replaceExact(
  workerPath,
  `function canReadEmployee(requester, employeeId) {
  if (canReadEmployees(requester)) return true;
  return normalizeText(requester.account?.linked_employee_id) === employeeId;
}

function canViewLeaveRequests(requester) {`,
  `function canReadEmployee(requester, employeeId) {
  if (canReadEmployees(requester)) return true;
  return normalizeText(requester.account?.linked_employee_id) === employeeId;
}

function canViewEmployeeDirectory(requester) {
  const role = normalizeRole(requester.account?.role_key);
  return Boolean(requester.account?.is_active) && !["client", "guest"].includes(role);
}

function canViewLeaveRequests(requester) {`
);
replaceExact(
  workerPath,
  `async function listEmployees(url, db) {`,
  `async function listEmployeeDirectory(db) {
  try {
    const rows = await db
      .prepare(
        \`SELECT
           e.id, e.auth_uid, e.name, e.email, e.avatar_url,
           e.title, e.department, e.employment_status,
           e.employee_code, e.allowed_zone_ids_json
         FROM employees e
         LEFT JOIN accounts a ON a.uid = e.auth_uid
         WHERE e.is_active = 1
           AND e.auth_uid IS NOT NULL
           AND (a.is_active IS NULL OR a.is_active = 1)
         ORDER BY e.name COLLATE NOCASE ASC, e.id ASC
         LIMIT 500\`
      )
      .all();

    return json(200, {
      ok: true,
      employees: (rows.results || []).map(row => ({
        uid: row.auth_uid,
        employeeId: row.id,
        name: row.name,
        email: row.email || null,
        avatarUrl: row.avatar_url || null,
        title: row.title || null,
        department: row.department || null,
        statusKey: row.employment_status || "active",
        employeeCode: row.employee_code || null,
        allowedZoneIds: parseJsonArray(row.allowed_zone_ids_json),
      })),
    });
  } catch (error) {
    return serverError("employee_directory_query_failed", error);
  }
}

async function listEmployees(url, db) {`
);

replaceExact(
  workerPath,
  `async function updateEmployee(request, db, requester, id) {`,
  `export function normalizeEmployeeSelfServicePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "invalid_employee_self_service_payload" };
  }

  const raw = value;
  const allowedKeys = new Set(["phone", "avatarUrl"]);
  const unknown = Object.keys(raw).filter(key => !allowedKeys.has(key));
  if (unknown.length) {
    return {
      ok: false,
      message: "employee_self_service_fields_forbidden",
      unknown,
    };
  }

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(raw, "phone")) {
    const phone = normalizeText(raw.phone);
    const digits = phone.replace(/\\D/g, "");
    if (phone.length < 7 || digits.length < 7) {
      return { ok: false, message: "employee_phone_invalid" };
    }
    patch.phone = phone;
  }

  if (Object.prototype.hasOwnProperty.call(raw, "avatarUrl")) {
    const avatarUrl = normalizeText(raw.avatarUrl);
    if (!/^(https?:\\/\\/|\\/)/i.test(avatarUrl)) {
      return { ok: false, message: "employee_avatar_url_invalid" };
    }
    patch.avatarUrl = avatarUrl;
  }

  if (!Object.keys(patch).length) {
    return { ok: false, message: "no_employee_fields_to_update" };
  }

  return { ok: true, value: patch };
}

async function updateOwnEmployeeProfile(request, db, requester, id) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const payload = normalizeEmployeeSelfServicePayload(bodyResult.value);
  if (!payload.ok) {
    return json(400, {
      ok: false,
      message: payload.message,
      unknown: payload.unknown || [],
    });
  }

  const before = await db
    .prepare("SELECT * FROM employees WHERE id = ? OR auth_uid = ? LIMIT 1")
    .bind(id, id)
    .first();
  if (!before) return json(404, { ok: false, message: "employee_not_found" });

  const columns = [];
  const bindings = [];
  if (Object.prototype.hasOwnProperty.call(payload.value, "phone")) {
    columns.push("phone = ?");
    bindings.push(payload.value.phone);
  }
  if (Object.prototype.hasOwnProperty.call(payload.value, "avatarUrl")) {
    columns.push("avatar_url = ?");
    bindings.push(payload.value.avatarUrl);
  }

  const now = new Date().toISOString();
  columns.push("updated_at = ?");
  bindings.push(now, before.id);

  try {
    await db.batch([
      db
        .prepare(
          \`UPDATE employees SET \${columns.join(", ")} WHERE id = ?\`
        )
        .bind(...bindings),
      buildAuditStatement(db, request, requester, {
        action: "employee.self_profile.update",
        entityType: "employee",
        entityId: before.id,
        before,
        after: payload.value,
      }),
    ]);
    return getEmployee(db, before.id);
  } catch (error) {
    return databaseMutationError("employee_self_profile_update_failed", error);
  }
}

async function updateEmployee(request, db, requester, id) {`
);

assertAbsent(profilePath, [
  "firebase/firestore",
  "HR_CORE_D1_ENABLED",
  "collectionName",
  "addDoc(",
  "onSnapshot(",
  "setDoc(",
  "serverTimestamp(",
]);
assertAbsent(attendancePath, ["firebase/firestore", "collection(db", "getDocs("]);
assertAbsent(staffPortalPath, ["firebase/firestore", "onSnapshot(", "collection(db"]);
assertAbsent(directoryPath, ["/listActiveEmployeeDirectory"]);

console.log(
  "Phase 9B applied: employee profile, HR attendance directory, staff portal badges, and self-service profile updates are D1-only."
);
