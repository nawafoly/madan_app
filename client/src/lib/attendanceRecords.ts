import { auth } from "@/_core/firebase";
import { buildDocumentWorkerUrl } from "@/lib/documentUploadService";

export type AttendanceRecordType = "check_in" | "check_out";
export type AttendanceRecordResult = "allowed" | "rejected";

export type AttendanceRecord = {
  id: string;
  employeeUid: string;
  employeeDocId: string;
  employeeName: string | null;
  type: AttendanceRecordType;
  result: AttendanceRecordResult;
  serverTime: string;
  clientTime: string | null;
  location: { lat: number; lng: number; accuracy: number };
  zoneId: string | null;
  zoneName: string | null;
  zoneType: string | null;
  distanceMeters: number | null;
  rejectionReason: string | null;
  accuracyAccepted: boolean;
  deviceInfo: {
    deviceId?: string | null;
    deviceChanged?: boolean;
    previousDeviceId?: string | null;
    userAgent?: string | null;
    platform?: string | null;
    language?: string | null;
    timeZone?: string | null;
    sharedDevice?: {
      employeeCount: number;
      employees: Array<{
        uid: string;
        name?: string | null;
        firstSeenAt?: string | null;
        lastSeenAt?: string | null;
        recordsCount?: number;
      }>;
    } | null;
  };
  createdByEmail: string | null;
  createdByRole: string | null;
};

export type AttendanceRecordsFilters = {
  employeeUid?: string;
  fromDate?: string;
  toDate?: string;
  result?: AttendanceRecordResult;
  type?: AttendanceRecordType;
  deviceChanged?: boolean;
  limit?: number;
  page?: number;
  cursor?: string;
};

export type AttendanceSummary = {
  checkIns: number;
  checkOuts: number;
  rejected: number;
  newDevices: number;
  averageAccuracy: number | null;
  date: string;
};

export type AttendanceRecordsResponse = {
  records: AttendanceRecord[];
  total: number;
  page: number;
  limit: number;
  nextCursor: string | null;
  summary: AttendanceSummary;
};

export type AttendanceMonthlySummary = {
  id: string;
  employeeUid: string;
  employeeDocId: string | null;
  yearMonth: string;
  presentDays: number;
  checkInCount: number;
  checkOutCount: number;
  rejectedCount: number;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  shortageMinutes: number;
  deviceIds: string[];
  zoneIds: string[];
  firstCheckIn: string | null;
  lastCheckOut: string | null;
  sourceRecordsCount: number;
  generatedAt: string | null;
  updatedAt: string | null;
};

export type AdminAttendanceAdjustmentInput = {
  employeeUid: string;
  employeeDocId: string;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  note?: string;
};

export type AdminAttendanceClearInput = {
  employeeUid: string;
  employeeDocId: string;
  date: string;
  recordIds?: string[];
  serverTimes?: string[];
  note?: string;
};

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(item => String(item || "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function normalizeMonthlySummary(value: unknown): AttendanceMonthlySummary {
  const row = (value || {}) as Record<string, unknown>;
  return {
    id: String(row.id || ""),
    employeeUid: String(row.employeeUid || row.employee_uid || ""),
    employeeDocId:
      row.employeeDocId || row.employee_doc_id
        ? String(row.employeeDocId || row.employee_doc_id)
        : null,
    yearMonth: String(row.yearMonth || row.year_month || ""),
    presentDays: Number(row.presentDays ?? row.present_days ?? 0),
    checkInCount: Number(row.checkInCount ?? row.check_in_count ?? 0),
    checkOutCount: Number(row.checkOutCount ?? row.check_out_count ?? 0),
    rejectedCount: Number(row.rejectedCount ?? row.rejected_count ?? 0),
    workedMinutes: Number(row.workedMinutes ?? row.worked_minutes ?? 0),
    lateMinutes: Number(row.lateMinutes ?? row.late_minutes ?? 0),
    earlyLeaveMinutes: Number(
      row.earlyLeaveMinutes ?? row.early_leave_minutes ?? 0
    ),
    overtimeMinutes: Number(row.overtimeMinutes ?? row.overtime_minutes ?? 0),
    shortageMinutes: Number(row.shortageMinutes ?? row.shortage_minutes ?? 0),
    deviceIds: normalizeStringArray(row.deviceIds ?? row.device_ids_json),
    zoneIds: normalizeStringArray(row.zoneIds ?? row.zone_ids_json),
    firstCheckIn:
      row.firstCheckIn || row.first_check_in
        ? String(row.firstCheckIn || row.first_check_in)
        : null,
    lastCheckOut:
      row.lastCheckOut || row.last_check_out
        ? String(row.lastCheckOut || row.last_check_out)
        : null,
    sourceRecordsCount: Number(
      row.sourceRecordsCount ?? row.source_records_count ?? 0
    ),
    generatedAt:
      row.generatedAt || row.generated_at
        ? String(row.generatedAt || row.generated_at)
        : null,
    updatedAt:
      row.updatedAt || row.updated_at
        ? String(row.updatedAt || row.updated_at)
        : null,
  };
}

export async function fetchAttendanceRecords(
  filters: AttendanceRecordsFilters = {}
): Promise<AttendanceRecordsResponse> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Authentication required.");

  const params: Record<string, string | undefined> = {
    employeeUid: filters.employeeUid || undefined,
    fromDate: filters.fromDate || undefined,
    toDate: filters.toDate || undefined,
    result: filters.result || undefined,
    type: filters.type || undefined,
    deviceChanged:
      filters.deviceChanged === undefined
        ? undefined
        : String(filters.deviceChanged),
    limit: filters.limit ? String(filters.limit) : undefined,
    page: filters.page ? String(filters.page) : undefined,
    cursor: filters.cursor || undefined,
  };
  const requestUrl = buildDocumentWorkerUrl("/attendance/records", params);
  if (!requestUrl) throw new Error("Attendance worker URL is not configured.");

  const response = await fetch(requestUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${await currentUser.getIdToken()}`,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | (Partial<AttendanceRecordsResponse> & {
        ok?: boolean;
        message?: string;
        detail?: string;
      })
    | null;

  if (!response.ok || !payload?.ok || !Array.isArray(payload.records)) {
    throw new Error(
      String(
        payload?.message ||
          payload?.detail ||
          `Attendance records request failed (${response.status}).`
      )
    );
  }

  return {
    records: payload.records,
    total: Number(payload.total || 0),
    page: Number(payload.page || 1),
    limit: Number(payload.limit || filters.limit || 50),
    nextCursor: payload.nextCursor || null,
    summary: {
      checkIns: Number(payload.summary?.checkIns || 0),
      checkOuts: Number(payload.summary?.checkOuts || 0),
      rejected: Number(payload.summary?.rejected || 0),
      newDevices: Number(payload.summary?.newDevices || 0),
      averageAccuracy:
        payload.summary?.averageAccuracy == null
          ? null
          : Number(payload.summary.averageAccuracy),
      date: String(payload.summary?.date || ""),
    },
  };
}

export async function adjustAttendanceRecordsAsAdmin(
  input: AdminAttendanceAdjustmentInput
) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Authentication required.");

  const requestUrl = buildDocumentWorkerUrl("/attendance/admin-adjustment");
  if (!requestUrl) throw new Error("Attendance worker URL is not configured.");

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${await currentUser.getIdToken()}`,
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    detail?: string;
    records?: Array<{
      id: string;
      type: AttendanceRecordType;
      action: "created" | "updated";
      serverTime: string;
    }>;
  } | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(
      String(
        payload?.message ||
          payload?.detail ||
          `Attendance adjustment request failed (${response.status}).`
      )
    );
  }

  return payload.records || [];
}

export async function generateAttendanceMonthlySummary(
  employeeUid: string,
  yearMonth: string
): Promise<AttendanceMonthlySummary> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Authentication required.");

  const requestUrl = buildDocumentWorkerUrl(
    "/attendance/monthly-summary/generate"
  );
  if (!requestUrl) throw new Error("Attendance worker URL is not configured.");

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${await currentUser.getIdToken()}`,
    },
    body: JSON.stringify({ employeeUid, yearMonth }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    detail?: string;
    summary?: unknown;
  } | null;

  if (!response.ok || !payload?.ok || !payload.summary) {
    throw new Error(
      String(
        payload?.message ||
          payload?.detail ||
          `Monthly summary generation failed (${response.status}).`
      )
    );
  }

  return normalizeMonthlySummary(payload.summary);
}

export async function listAttendanceMonthlySummaries(
  employeeUid: string,
  fromMonth: string,
  toMonth: string
): Promise<AttendanceMonthlySummary[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Authentication required.");

  const requestUrl = buildDocumentWorkerUrl("/attendance/monthly-summaries", {
    employeeUid,
    fromMonth,
    toMonth,
  });
  if (!requestUrl) throw new Error("Attendance worker URL is not configured.");

  const response = await fetch(requestUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${await currentUser.getIdToken()}`,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    detail?: string;
    summaries?: unknown[];
  } | null;

  if (!response.ok || !payload?.ok || !Array.isArray(payload.summaries)) {
    throw new Error(
      String(
        payload?.message ||
          payload?.detail ||
          `Monthly summaries request failed (${response.status}).`
      )
    );
  }

  return payload.summaries.map(normalizeMonthlySummary);
}

export async function clearAttendanceRecordsAsAdmin(
  input: AdminAttendanceClearInput
) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Authentication required.");

  const requestUrl = buildDocumentWorkerUrl("/attendance/admin-adjustment");
  if (!requestUrl) throw new Error("Attendance worker URL is not configured.");

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${await currentUser.getIdToken()}`,
    },
    body: JSON.stringify({
      ...input,
      action: "clear",
      clear: true,
      recordIds: input.recordIds || [],
      serverTimes: input.serverTimes || [],
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    message?: string;
    detail?: string;
    clearedRecords?: number;
  } | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(
      String(
        payload?.message ||
          payload?.detail ||
          `Attendance clear request failed (${response.status}).`
      )
    );
  }

  return Number(payload.clearedRecords || 0);
}
