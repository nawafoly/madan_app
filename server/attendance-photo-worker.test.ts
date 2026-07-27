import { describe, expect, it } from "vitest";

// @ts-expect-error The production Worker is plain JavaScript by design.
import { handleAttendanceRequest } from "../workers/attendance-worker.js";

const zoneRow = {
  id: "main-office",
  name: "الفرع الرئيسي",
  type: "radius",
  center_lat: 24.7136,
  center_lng: 46.6753,
  radius_meters: 150,
  active: 1,
  office_ip: null,
  photo_attendance_enabled: 1,
  created_at: "2026-07-27T00:00:00.000Z",
  updated_at: "2026-07-27T00:00:00.000Z",
};

function createDb({ allowed = false } = {}) {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  return {
    calls,
    prepare(sql: string) {
      const statement = {
        sql,
        bindings: [] as unknown[],
        bind(...bindings: unknown[]) {
          this.bindings = bindings;
          calls.push({ sql, bindings });
          return this;
        },
        async all() {
          if (sql.includes("FROM work_zones WHERE id IN")) {
            return { results: [zoneRow] };
          }
          return { results: [] };
        },
        async first() {
          return null;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements: unknown[]) {
      return statements.map((_, index) =>
        index === 5
          ? {
              results: [
                {
                  result: allowed ? "allowed" : "rejected",
                  rejection_reason: allowed ? null : "duplicate_check_in",
                },
              ],
            }
          : { results: [], meta: { changes: 1 } }
      );
    },
  };
}

const requester = {
  ok: true,
  uid: "u1",
  email: "u1@example.test",
  idToken: "token",
  projectId: "demo",
  runtime: {
    isActive: true,
    role: "staff",
    permissionsAllow: [],
    permissionsDeny: [],
  },
  userData: {},
};

const fetchFirestoreDocument = async () => ({
  ok: true,
  found: true,
  data: { data: { allowedZoneIds: ["main-office"] } },
});

async function callAttendance(
  request: Request,
  options: { allowed?: boolean; bucket?: unknown } = {}
) {
  const db = createDb({ allowed: options.allowed });
  const response = await handleAttendanceRequest({
    request,
    url: new URL(request.url),
    db,
    directoryDb: null,
    bucket: options.bucket || null,
    resolveRequesterContext: async () => requester,
    fetchFirestoreDocument,
  });
  return { db, response, payload: await response.json() };
}

describe("photo attendance", () => {
  it("returns the per-zone photo requirement during preflight", async () => {
    const request = new Request(
      "https://example.test/attendance/requirements",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: "u1",
          type: "check_in",
          location: { lat: 24.7136, lng: 46.6753, accuracy: 12 },
        }),
      }
    );

    const { response, payload } = await callAttendance(request);
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      eligible: true,
      result: "allowed",
      zoneId: "main-office",
      photoRequired: true,
    });
  });

  it("rejects a photo-enabled zone when no live photo is supplied", async () => {
    const request = new Request("https://example.test/attendance/record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        employeeId: "u1",
        type: "check_in",
        clientTime: new Date().toISOString(),
        location: { lat: 24.7136, lng: 46.6753, accuracy: 12 },
        deviceInfo: { deviceId: "device-1" },
      }),
    });

    const { db, payload } = await callAttendance(request);
    expect(payload).toMatchObject({
      result: "rejected",
      rejectionReason: "photo_required",
      photoRequired: true,
      photoAttached: false,
    });
    const insert = db.calls.find(call =>
      call.sql.includes("INSERT INTO attendance_records")
    );
    expect(insert?.bindings).toHaveLength(29);
    expect(insert?.bindings[17]).toBe(1);
  });

  it("uploads a valid photo and allows the attendance transition", async () => {
    const uploads: Array<{ path: string; size: number }> = [];
    const bucket = {
      async put(path: string, bytes: ArrayBuffer) {
        uploads.push({ path, size: bytes.byteLength });
      },
      async delete() {},
    };
    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({
        employeeId: "u1",
        type: "check_in",
        clientTime: new Date().toISOString(),
        location: { lat: 24.7136, lng: 46.6753, accuracy: 12 },
        deviceInfo: { deviceId: "device-1" },
      })
    );
    form.append(
      "photo",
      new File([new Uint8Array([1, 2, 3, 4])], "selfie.jpg", {
        type: "image/jpeg",
      })
    );
    const request = new Request("https://example.test/attendance/record", {
      method: "POST",
      body: form,
    });

    const { payload } = await callAttendance(request, {
      allowed: true,
      bucket,
    });
    expect(payload).toMatchObject({
      result: "allowed",
      photoRequired: true,
      photoAttached: true,
    });
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.path).toContain("attendance-photos/main-office/");
  });
});
