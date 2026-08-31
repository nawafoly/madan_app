import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(here, "..", relativePath), "utf8");
}

describe("HR employee save identity boundary", () => {
  it("keeps routine employee profile saves away from authUid mutations", () => {
    const source = readRepoFile("client/src/pages/admin/Employees.tsx");
    const start = source.indexOf("const handleSave = async () => {");
    const end = source.indexOf("const handleSaveManualLeaveBalance", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const saveBlock = source.slice(start, end);
    expect(saveBlock).toContain("updateHrCoreEmployee(linkedEmployeeId");
    expect(saveBlock).toContain("allowedZoneIds,");
    expect(saveBlock).not.toContain("authUid:");
    expect(saveBlock).not.toContain("linkedUserUid");
  });

  it("still lets HR Core synchronize the already-canonical auth binding", () => {
    const worker = readRepoFile("workers/hr-core-worker.js");
    expect(worker).toContain(
      'const nextAuthUid = Object.prototype.hasOwnProperty.call(patch, "authUid")'
    );
    expect(worker).toContain(": before.auth_uid;");
  });
});
