import { describe, expect, it } from "vitest";

// @ts-expect-error Production Worker modules are plain JavaScript by design.
import * as attendanceWorker from "../workers/attendance-worker.js";

const {
  resolveCanonicalAttendanceEmployee,
  resolveSingleActiveZoneId,
} = attendanceWorker;

type HrRow = {
  id: string;
  auth_uid?: string | null;
  email?: string | null;
  is_active?: number;
  employment_status?: string;
  allowed_zone_ids_json?: string;
};

function createHrDb(rows: HrRow[]) {
  return {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim().toUpperCase();
      return {
        bind(value: string) {
          return {
            async first() {
              if (normalized.includes("WHERE ID = ?")) {
                return rows.find(row => row.id === value) || null;
              }
              if (normalized.includes("WHERE AUTH_UID = ?")) {
                return rows.find(row => row.auth_uid === value) || null;
              }
              return null;
            },
          };
        },
      };
    },
  };
}

function createAttendanceDb(activeZoneIds: string[]) {
  return {
    prepare() {
      return {
        async all() {
          return {
            results: activeZoneIds.slice(0, 2).map(id => ({ id })),
          };
        },
      };
    },
  };
}

describe("attendance canonical employee-zone source", () => {
  it("uses HR Core allowed zones as the canonical assignment", async () => {
    const result = await resolveCanonicalAttendanceEmployee({
      hrDb: createHrDb([
        {
          id: "employee-1",
          auth_uid: "uid-1",
          is_active: 1,
          employment_status: "active",
          allowed_zone_ids_json: JSON.stringify(["zone-a", "zone-b"]),
        },
      ]),
      attendanceDb: createAttendanceDb(["zone-only"]),
      employeeDocId: "employee-1",
      requesterUid: "uid-1",
    });

    expect(result).toMatchObject({
      found: true,
      source: "hr_core",
      employeeId: "employee-1",
      allowedZoneIds: ["zone-a", "zone-b"],
    });
    expect(result.data?.data?.allowedZoneIds).toEqual(["zone-a", "zone-b"]);
  });

  it("uses the only active work zone for a newly provisioned employee with no assignment", async () => {
    const result = await resolveCanonicalAttendanceEmployee({
      hrDb: createHrDb([
        {
          id: "new-uid",
          auth_uid: "new-uid",
          is_active: 1,
          employment_status: "active",
          allowed_zone_ids_json: "[]",
        },
      ]),
      attendanceDb: createAttendanceDb(["riyadh-office"]),
      employeeDocId: "new-uid",
      requesterUid: "new-uid",
    });

    expect(result).toMatchObject({
      found: true,
      source: "single_active_zone_default",
      allowedZoneIds: ["riyadh-office"],
    });
  });

  it("fails closed when an unassigned employee could belong to more than one active zone", async () => {
    const result = await resolveCanonicalAttendanceEmployee({
      hrDb: createHrDb([
        {
          id: "new-uid",
          auth_uid: "new-uid",
          is_active: 1,
          employment_status: "active",
          allowed_zone_ids_json: "[]",
        },
      ]),
      attendanceDb: createAttendanceDb(["branch-a", "branch-b"]),
      employeeDocId: "new-uid",
      requesterUid: "new-uid",
    });

    expect(result).toMatchObject({
      found: true,
      source: "hr_core",
      allowedZoneIds: [],
    });
  });

  it("resolves by auth uid only when the employee document key is the requester uid", async () => {
    const hrDb = createHrDb([
      {
        id: "canonical-employee",
        auth_uid: "uid-1",
        is_active: 1,
        employment_status: "active",
        allowed_zone_ids_json: JSON.stringify(["zone-a"]),
      },
    ]);

    const safeFallback = await resolveCanonicalAttendanceEmployee({
      hrDb,
      attendanceDb: createAttendanceDb([]),
      employeeDocId: "uid-1",
      requesterUid: "uid-1",
    });
    expect(safeFallback).toMatchObject({
      found: true,
      employeeId: "canonical-employee",
      allowedZoneIds: ["zone-a"],
    });

    const mismatchedLinkedId = await resolveCanonicalAttendanceEmployee({
      hrDb,
      attendanceDb: createAttendanceDb([]),
      employeeDocId: "different-linked-id",
      requesterUid: "uid-1",
    });
    expect(mismatchedLinkedId).toMatchObject({
      found: false,
      source: "legacy_firestore",
    });
  });
});

describe("single active attendance zone fallback", () => {
  it("returns a zone only when exactly one active zone exists", async () => {
    await expect(resolveSingleActiveZoneId(createAttendanceDb([]))).resolves.toBeNull();
    await expect(
      resolveSingleActiveZoneId(createAttendanceDb(["only-zone"]))
    ).resolves.toBe("only-zone");
    await expect(
      resolveSingleActiveZoneId(createAttendanceDb(["a", "b"]))
    ).resolves.toBeNull();
  });
});
