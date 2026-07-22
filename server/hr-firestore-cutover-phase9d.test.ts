import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const root=process.cwd();
const source=(f:string)=>fs.readFileSync(path.join(root,f),"utf8");
describe("HR Firestore cutover phase 9D",()=>{
  it("removes Firestore username lookup",()=>{ const s=source("client/src/lib/loginIdentity.ts"); expect(s).toContain("resolveHrCoreLoginIdentity"); expect(s).not.toContain("firebase/firestore"); expect(s).not.toContain("firebase/functions"); expect(s).not.toContain("admin_usernames"); });
  it("adds public D1 resolver",()=>{ const a=source("client/src/lib/hrCoreApi.ts"); const w=source("workers/hr-core-worker.js"); expect(a).toContain("/api/hr/auth/resolve-login-email"); expect(w).toContain("phase9d-d1-login-identity-v1"); expect(w).toContain("LOWER(TRIM(username)) = ?"); });
});


describe("Phase 9D username length compatibility", () => {
  it("supports two-character usernames", () => {
    const worker = source("workers/hr-core-worker.js");
    const adminUsername = source("client/src/lib/adminUsername.ts");

    expect(worker).toContain("username.length < 2");
    expect(adminUsername).toContain(
      "username.length >= 2 && username.length <= 32"
    );
  });
});
