import fs from "node:fs";

const path = "scripts/integrate-workforce-architecture-parity.mjs";
let text = fs.readFileSync(path, "utf8");

const broken = '    id: normalizeText(row?.template_id) || `workforce:\\${normalizeText(row?.id)}`,';
const brokenAlt = '    id: normalizeText(row?.template_id) || `workforce:${normalizeText(row?.id)}`,';
const fixed = '    id: normalizeText(row?.template_id) || \\`workforce:\\${normalizeText(row?.id)}\\`,';

if (!text.includes(fixed)) {
  if (text.includes(broken)) {
    text = text.replace(broken, fixed);
  } else if (text.includes(brokenAlt)) {
    text = text.replace(brokenAlt, fixed);
  } else {
    throw new Error("integrator_nested_template_anchor_missing");
  }
}

const adminStart = 'const adminPath = "client/src/pages/habat/HabatAttendanceAdmin.tsx";';
const habatStart = 'const habatPath = "workers/habat-attendance-v2.js";';
const adminStartIndex = text.indexOf(adminStart);
const habatStartIndex = text.indexOf(habatStart);

if (adminStartIndex < 0 || habatStartIndex < 0 || habatStartIndex <= adminStartIndex) {
  throw new Error("integrator_habat_admin_block_anchor_missing");
}

const repairedAdminBlock = `const adminPath = "client/src/pages/habat/HabatAttendanceAdmin.tsx";
let admin = read(adminPath);

// This bridge can be re-run against Habat sources that already contain part of
// the architecture-parity cleanup. Remove legacy template-owned working-day UI
// only when each fragment is still present instead of failing on applied work.
admin = admin.replace(\`  workingDays: number[];\\n};\`, \`};\`);
admin = admin.replace(
  /  earlyLeaveToleranceMinutes: 0,\\n  workingDays: \\[[^\\n]*\\],\\n};/,
  \`  earlyLeaveToleranceMinutes: 0,\\n};\`
);
admin = admin.replace(
  /\\n  function toggleDay\\(day: number\\) \\{[\\s\\S]*?\\n  \\}\\n\\n  async function save/,
  \`\\n  async function save\`
);
admin = admin.replace(\`      workingDays: shift.workingDays,\\n\`, \`\`);
admin = admin.replace(\`      workingDays: [0, 1, 2, 3, 4, 5, 6],\\n\`, \`\`);
if (!admin.includes(\`<Panel title="قوالب الشفتات"\`)) {
  admin = admin.replace(
    \`<Panel title="الدوام والشفتات" subtitle="ساعات العمل، أيام الدوام، السماح بالتأخير والانصراف المبكر">\`,
    \`<Panel title="قوالب الشفتات" subtitle="أوقات وسياسات قابلة لإعادة الاستخدام. يوم الراحة يُحدد لكل موظف من ملفه.">\`
  );
}
admin = admin.replace(
  /\\n          <div>\\n            <p className="mb-2 text-sm font-bold">أيام العمل<\\/p>[\\s\\S]*?\\n          <\\/div>\\n/,
  \`\\n\`
);
admin = admin.replace(
  /\\n                  <p className="mt-2 text-xs text-slate-500">\\n                    \\{dayOptions[\\s\\S]*?<\\/p>/,
  \`\`
);
write(adminPath, admin);

`;

text = text.slice(0, adminStartIndex) + repairedAdminBlock + text.slice(habatStartIndex);
fs.writeFileSync(path, text);
console.log("PASS - parity integrator syntax + rerunnable Habat bridge repaired.");
