import fs from "node:fs";
import { spawnSync } from "node:child_process";

const path = "scripts/integrate-workforce-architecture-parity.mjs";
let text = fs.readFileSync(path, "utf8");

const bad = '    id: normalizeText(row?.template_id) || `workforce:\\${normalizeText(row?.id)}`,';
const good = '    id: normalizeText(row?.template_id) || "workforce:" + normalizeText(row?.id),';

if (text.includes(bad)) {
  text = text.replace(bad, good);
  fs.writeFileSync(path, text);
  console.log("PASS - repaired nested template literal in parity integrator.");
} else if (text.includes(good)) {
  console.log("PASS - parity integrator legacy syntax repair already applied.");
} else {
  console.log("PASS - legacy workforce-shift-id anchor no longer present; validating current integrator syntax instead.");
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
