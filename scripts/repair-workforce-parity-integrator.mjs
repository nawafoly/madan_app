import fs from "node:fs";
import { spawnSync } from "node:child_process";

const path = "scripts/integrate-workforce-architecture-parity.mjs";
let text = fs.readFileSync(path, "utf8");
let changed = false;

const bad = '    id: normalizeText(row?.template_id) || `workforce:\\${normalizeText(row?.id)}`,';
const good = '    id: normalizeText(row?.template_id) || "workforce:" + normalizeText(row?.id),';

if (text.includes(bad)) {
  text = text.replace(bad, good);
  changed = true;
  console.log("PASS - repaired nested template literal in parity integrator.");
} else if (text.includes(good)) {
  console.log("PASS - parity integrator legacy syntax repair already applied.");
} else {
  console.log("PASS - legacy workforce-shift-id anchor no longer present; validating current integrator syntax instead.");
}

// Contract repair: employee schedule UI must explicitly identify the employee-owned
// baseline weekly rest day.
const oldWeeklyRestLabel = '<Field label="الإجازة الأسبوعية">';
const newWeeklyRestLabel = '<Field label="الإجازة الأسبوعية الأساسية">';
if (text.includes(oldWeeklyRestLabel)) {
  text = text.replace(oldWeeklyRestLabel, newWeeklyRestLabel);
  changed = true;
  console.log("PASS - employee weekly-rest label contract repaired.");
}

// Habat shift templates are template-only in the UI, but the legacy transport
// shape must continue carrying all seven workingDays until that transport is
// retired separately. Enforce the final generated source instead of depending
// on brittle removal-anchor rewrites.
const adminWriteAnchor = 'write(adminPath, admin);';
const compatibilityMarker = '// HABAT_LEGACY_WORKING_DAYS_TRANSPORT_COMPAT';
if (!text.includes(compatibilityMarker)) {
  const compatibilityBlock = `${compatibilityMarker}\nif (!admin.includes(\`  workingDays: number[];\`)) {\n  admin = admin.replace(\n    \`  earlyLeaveToleranceMinutes: number;\\n};\`,\n    \`  earlyLeaveToleranceMinutes: number;\\n  workingDays: number[];\\n};\`\n  );\n}\nif (!/earlyLeaveToleranceMinutes: 0,\\n  workingDays: \\[0, 1, 2, 3, 4, 5, 6\\],/.test(admin)) {\n  admin = admin.replace(\n    \`  earlyLeaveToleranceMinutes: 0,\\n};\`,\n    \`  earlyLeaveToleranceMinutes: 0,\\n  workingDays: [0, 1, 2, 3, 4, 5, 6],\\n};\`\n  );\n}\n// Editing a legacy shift must also satisfy ShiftDraft's transport-only field.\n// The employee rest day still belongs to the employee assignment, not the template UI.\nadmin = admin.replace(\n  \`      earlyLeaveToleranceMinutes: shift.earlyLeaveToleranceMinutes,\\n    });\`,\n  \`      earlyLeaveToleranceMinutes: shift.earlyLeaveToleranceMinutes,\\n      workingDays: [0, 1, 2, 3, 4, 5, 6],\\n    });\`\n);\n`;

  const adminWriteIndex = text.indexOf(adminWriteAnchor);
  if (adminWriteIndex < 0) throw new Error("repair_anchor_missing:habat-admin-write");
  text = text.slice(0, adminWriteIndex) + compatibilityBlock + text.slice(adminWriteIndex);
  changed = true;
  console.log("PASS - Habat legacy workingDays transport enforcement installed.");
}

if (changed) {
  fs.writeFileSync(path, text);
  console.log("PASS - parity integrator contract repairs applied.");
}

const syntax = spawnSync(process.execPath, ["--check", path], {
  stdio: "inherit",
  shell: false,
});

if (syntax.error) throw syntax.error;
if (syntax.status !== 0) {
  throw new Error(`integrator_syntax_check_failed:${syntax.status ?? "unknown"}`);
}

console.log("PASS - parity integrator syntax gate.");
