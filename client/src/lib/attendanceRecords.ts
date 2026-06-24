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

export type AdminAttendanceAdjustmentInput = {
  employeeUid: string;
  employeeDocId: string;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  note?: string;
};

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
