import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const d1OnlyFiles = [
  "client/src/components/RequireEmployeeProfileAccess.tsx",
  "client/src/components/DashboardLayout.tsx",
  "client/src/lib/inAppNotifications.ts",
  "client/src/pages/employee/Files.tsx",
  "client/src/pages/employee/messages/EmployeeMessagesScreen.tsx",
];

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("HR Firestore cutover phase 9A", () => {
  for (const relativePath of d1OnlyFiles) {
    it(`${relativePath} has no Firestore dependency`, () => {
      const content = read(relativePath);
      expect(content).not.toContain('firebase/firestore');
      expect(content).not.toMatch(/\b(collection|doc|getDoc|getDocs|onSnapshot|setDoc|updateDoc|writeBatch|serverTimestamp)\s*\(/);
    });
  }

  it("notifications are pinned to HR Core D1", () => {
    const content = read("client/src/lib/inAppNotifications.ts");
    expect(content).toContain("listHrCoreNotifications");
    expect(content).toContain("createHrCoreNotification");
    expect(content).not.toContain("HR_CORE_D1_ENABLED");
  });

  it("employee files and messages are pinned to HR Core D1", () => {
    const files = read("client/src/pages/employee/Files.tsx");
    const messages = read(
      "client/src/pages/employee/messages/EmployeeMessagesScreen.tsx"
    );
    expect(files).toContain("listHrCoreEmployeeFiles");
    expect(files).toContain("createHrCoreEmployeeFile");
    expect(messages).toContain("listHrCoreEmployeeMessages");
    expect(messages).toContain("createHrCoreEmployeeMessage");
    expect(messages).toContain("markHrCoreEmployeeMessagesRead");
  });
});
