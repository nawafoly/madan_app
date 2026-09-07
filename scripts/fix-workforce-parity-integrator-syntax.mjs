import fs from "node:fs";

const path = "scripts/integrate-workforce-architecture-parity.mjs";
let text = fs.readFileSync(path, "utf8");

const broken = '    id: normalizeText(row?.template_id) || `workforce:\\${normalizeText(row?.id)}`,';
const brokenAlt = '    id: normalizeText(row?.template_id) || `workforce:${normalizeText(row?.id)}`,';
const fixed = '    id: normalizeText(row?.template_id) || \\`workforce:\\${normalizeText(row?.id)}\\`,';

if (text.includes(fixed)) {
  console.log("PASS - parity integrator nested template literal already fixed.");
  process.exit(0);
}

if (text.includes(broken)) {
  text = text.replace(broken, fixed);
} else if (text.includes(brokenAlt)) {
  text = text.replace(brokenAlt, fixed);
} else {
  throw new Error("integrator_nested_template_anchor_missing");
}

fs.writeFileSync(path, text);
console.log("PASS - parity integrator nested template literal repaired.");
