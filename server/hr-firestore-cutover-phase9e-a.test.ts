import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
function source(relativePath: string) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }

describe("HR Firestore cutover phase 9E-A", () => {
  it("loads runtime role and permissions from HR Core D1", () => {
    const useAuth = source("client/src/_core/hooks/useAuth.ts");
    expect(useAuth).toContain("getHrCoreMe");
    expect(useAuth).toContain("effectivePermissions");
    expect(useAuth).toContain("resolveRuntime");
    expect(useAuth).not.toContain("firebase/firestore");
    expect(useAuth).not.toContain("onSnapshot");
    expect(useAuth).not.toContain('doc(db, "users"');
    expect(useAuth).not.toContain('doc(db, "admin_users"');
  });

  it("resolves the current role from HR Core D1", () => {
    const getUserRole = source("client/src/_core/getUserRole.ts");
    expect(getUserRole).toContain("getHrCoreMe");
    expect(getUserRole).not.toContain("firebase/firestore");
    expect(getUserRole).not.toContain("getDoc(");
    expect(getUserRole).not.toContain("doc(db");
  });

  it("keeps unknown public accounts as clients but denies the staff surface", () => {
    const useAuth = source("client/src/_core/hooks/useAuth.ts");
    expect(useAuth).toContain("getPublicClientRuntime");
    expect(useAuth).toContain("getDeniedStaffRuntime");
    expect(useAuth).toContain('surface === "staff"');
  });
});
