import fs from "node:fs";

const path = "client/src/features/workforce/WorkforceEmployeeFile.tsx";
let text = fs.readFileSync(path, "utf8");

const finalAnchor = `  reason?: string | null;\n  weekly_rest_weekday?: number | null;\n  week_pattern_json?: string | null;\n  createdAt?: string | null;`;
const integratorAnchor = `  reason?: string | null;\n  createdAt?: string | null;`;
const currentAnchor = `  effective_from?: string;\n  effective_to?: string | null;\n};`;

if (text.includes(finalAnchor) || text.includes(integratorAnchor)) {
  console.log("PASS - employee assignment anchor already prepared.");
  process.exit(0);
}

if (!text.includes(currentAnchor)) {
  throw new Error("prepare_anchor_missing:AssignmentRow");
}

text = text.replace(
  currentAnchor,
  `  effective_from?: string;\n  effective_to?: string | null;\n  reason?: string | null;\n  createdAt?: string | null;\n};`
);

fs.writeFileSync(path, text);
console.log("PASS - employee assignment integration anchor prepared.");
