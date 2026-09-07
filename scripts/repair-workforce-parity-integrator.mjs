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

// Contract repair: Habat shift templates remain template-only in the UI, but the
// legacy transport shape must keep workingDays with all seven days until that
// transport contract is retired separately.
const typeRemoval = 'admin = admin.replace(`  workingDays: number[];\\n};`, `};`);\n';
if (text.includes(typeRemoval)) {
  text = text.replace(typeRemoval, "");
  changed = true;
}

const defaultRemovalStart = 'admin = admin.replace(\n  /  earlyLeaveToleranceMinutes: 0,';
const toggleRemovalStart = 'admin = admin.replace(\n  /\\n  function toggleDay';
const defaultStartIndex = text.indexOf(defaultRemovalStart);
const toggleStartIndex = text.indexOf(toggleRemovalStart, defaultStartIndex >= 0 ? defaultStartIndex : 0);
if (defaultStartIndex >= 0 && toggleStartIndex > defaultStartIndex) {
  text = text.slice(0, defaultStartIndex) + text.slice(toggleStartIndex);
  changed = true;
}

const dynamicWorkingDaysRemoval = 'admin = admin.replace(`      workingDays: shift.workingDays,\\n`, ``);';
const dynamicWorkingDaysCompatibility = 'admin = admin.replace(`      workingDays: shift.workingDays,\\n`, `      workingDays: [0, 1, 2, 3, 4, 5, 6],\\n`);';
if (text.includes(dynamicWorkingDaysRemoval)) {
  text = text.replace(dynamicWorkingDaysRemoval, dynamicWorkingDaysCompatibility);
  changed = true;
}

const staticWorkingDaysRemoval = 'admin = admin.replace(`      workingDays: [0, 1, 2, 3, 4, 5, 6],\\n`, ``);\n';
if (text.includes(staticWorkingDaysRemoval)) {
  text = text.replace(staticWorkingDaysRemoval, "");
  changed = true;
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
