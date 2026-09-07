import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();

function run(label, command, args, options = {}) {
  console.log(`\n[habat-release-gate] ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  return options.capture ? String(result.stdout || "").trim() : "";
}

function executable(name, args, options) {
  if (process.platform === "win32") {
    return run(
      name,
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", name, ...args],
      options
    );
  }
  return run(name, name, args, options);
}

function fail(message, details = []) {
  console.error(`\n[habat-release-gate] FAIL - ${message}`);
  for (const detail of details) console.error(`  - ${detail}`);
  process.exit(1);
}

run("Habbat local proxy/runtime isolation contract", process.execPath, [
  "--test",
  "workers/habat-local-proxy-contract.test.mjs",
]);

run("full Workforce Phase 2 completion gate", process.execPath, [
  "scripts/gate-workforce-payroll-reports-phase2.mjs",
]);

const baseRef = "origin/habat-production";
const aheadBehind = executable(
  "git",
  ["rev-list", "--left-right", "--count", `${baseRef}...HEAD`],
  { capture: true }
);
const [behindText = "", aheadText = ""] = aheadBehind.split(/\s+/);
const behind = Number(behindText);
const ahead = Number(aheadText);
if (!Number.isFinite(behind) || !Number.isFinite(ahead)) {
  fail("could not determine release branch divergence", [aheadBehind]);
}
if (behind !== 0) {
  fail("feature branch is behind habat-production", [
    `behind=${behind}`,
    `ahead=${ahead}`,
    "Fetch and reconcile habat-production before release.",
  ]);
}
console.log(`[habat-release-gate] divergence OK - ahead=${ahead}, behind=${behind}`);

const changedText = executable(
  "git",
  ["diff", "--name-only", `${baseRef}...HEAD`],
  { capture: true }
);
const changed = changedText ? changedText.split(/\r?\n/).filter(Boolean) : [];

const forbiddenExact = new Set([
  "pnpm-lock.yaml",
  "client/src/pages/Home.tsx",
  "client/src/pages/About.tsx",
  "client/src/pages/Projects.tsx",
  "client/src/pages/ProjectDetails.tsx",
  "client/src/pages/Contact.tsx",
  "client/src/pages/Careers.tsx",
  "client/src/components/SiteLayout.tsx",
]);

const forbidden = changed.filter(path => {
  const normalized = path.replaceAll("\\", "/");
  if (forbiddenExact.has(normalized)) return true;
  if (normalized.startsWith("client/public/")) return true;
  if (normalized.startsWith("dist/")) return true;
  if (normalized.includes("/.wrangler/") || normalized.startsWith(".wrangler/")) return true;
  if (/^\.env(?:\.|$)/i.test(normalized) || normalized.includes("/.env")) return true;
  if (/\.(png|jpe?g|gif|webp|avif|mp4|mov|m4v|webm|avi|mkv)$/i.test(normalized)) return true;
  return false;
});

if (forbidden.length) {
  fail("protected Maedin/site assets or environment files changed in the Habbat release diff", forbidden);
}
console.log(`[habat-release-gate] protected Maedin surfaces OK - ${changed.length} changed files reviewed`);

const dirty = executable("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
  capture: true,
});
if (dirty) {
  fail("working tree is not clean after release gate", dirty.split(/\r?\n/));
}

const branch = executable("git", ["branch", "--show-current"], { capture: true });
const head = executable("git", ["rev-parse", "HEAD"], { capture: true });

console.log(`\n[habat-release-gate] branch: ${branch}`);
console.log(`[habat-release-gate] head:   ${head}`);
console.log("[habat-release-gate] PASS - Habbat Phase 2 is release-gated without touching protected Maedin site assets.");
