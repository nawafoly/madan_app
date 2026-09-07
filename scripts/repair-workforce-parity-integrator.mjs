import fs from "node:fs";

const path = "scripts/integrate-workforce-architecture-parity.mjs";
let text = fs.readFileSync(path, "utf8");

const bad = '    id: normalizeText(row?.template_id) || `workforce:\\${normalizeText(row?.id)}`,';
const good = '    id: normalizeText(row?.template_id) || "workforce:" + normalizeText(row?.id),';

if (text.includes(good)) {
  console.log("PASS - parity integrator syntax already repaired.");
  process.exit(0);
}

if (!text.includes(bad)) {
  throw new Error("repair_anchor_missing:workforce-shift-id");
}

text = text.replace(bad, good);
fs.writeFileSync(path, text);
console.log("PASS - repaired nested template literal in parity integrator.");
