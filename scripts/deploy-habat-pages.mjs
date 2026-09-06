import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const envFile = path.join(repoRoot, ".env.habat.production.local");
const buildDir = path.join(repoRoot, "client", "dist");
const stagingDir = path.join(repoRoot, ".cf-pages");
const maxAssetBytes = 24 * 1024 * 1024;

function parseEnvFile(filePath) {
  const parsed = {};
  if (!fs.existsSync(filePath)) return parsed;

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: options.env ?? process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function cloudflareDeployEnv() {
  // Keep Cloudflare authentication completely separate from the client build
  // environment copied from Vercel. A stale CLOUDFLARE_* value in that file
  // must never override Wrangler's authenticated OAuth session.
  const authLookupEnv = { ...process.env };
  delete authLookupEnv.CLOUDFLARE_API_TOKEN;
  delete authLookupEnv.CLOUDFLARE_API_KEY;
  delete authLookupEnv.CLOUDFLARE_EMAIL;

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["wrangler", "auth", "token", "--json"], {
    cwd: repoRoot,
    env: authLookupEnv,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    console.error("[habat-pages] unable to refresh Wrangler authentication.");
    process.exit(result.status ?? 1);
  }

  let auth;
  try {
    auth = JSON.parse(String(result.stdout || "").trim());
  } catch {
    console.error("[habat-pages] Wrangler returned invalid authentication metadata.");
    process.exit(1);
  }

  const deployEnv = { ...authLookupEnv };
  if ((auth.type === "oauth" || auth.type === "api_token") && auth.token) {
    deployEnv.CLOUDFLARE_API_TOKEN = auth.token;
    return deployEnv;
  }

  if (auth.type === "api_key" && auth.key && auth.email) {
    deployEnv.CLOUDFLARE_API_KEY = auth.key;
    deployEnv.CLOUDFLARE_EMAIL = auth.email;
    return deployEnv;
  }

  console.error("[habat-pages] no usable Cloudflare authentication was found.");
  process.exit(1);
}

function copyTreeFiltered(source, target) {
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyTreeFiltered(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) continue;

    const stat = fs.statSync(sourcePath);
    if (stat.size > maxAssetBytes) {
      console.log(
        `[habat-pages] skipping oversized public asset: ${path.relative(repoRoot, sourcePath)} (${(
          stat.size /
          1024 /
          1024
        ).toFixed(2)} MiB)`
      );
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

const parsedLocalEnv = parseEnvFile(envFile);
const localClientEnv = Object.fromEntries(
  Object.entries(parsedLocalEnv).filter(([key]) => key.startsWith("VITE_"))
);
const buildEnv = {
  ...process.env,
  ...localClientEnv,
  VITE_APP_MODE: "habat-attendance",
  VITE_USE_HR_D1: "true",
  VITE_HR_CORE_API_URL: "https://maedin-hr-api.maedin2026.workers.dev",
};

const required = [
  "VITE_FB_API_KEY",
  "VITE_FB_AUTH_DOMAIN",
  "VITE_FB_PROJECT_ID",
  "VITE_FB_APP_ID",
];
const missing = required.filter(key => !String(buildEnv[key] ?? "").trim());

if (missing.length) {
  console.error(
    `[habat-pages] missing production client variables: ${missing.join(", ")}\n` +
      `Create ${path.basename(envFile)} first. It is ignored by git.`
  );
  process.exit(1);
}

console.log("[habat-pages] building Habbat production frontend...");
run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["run", "build"], { env: buildEnv });

if (!fs.existsSync(path.join(buildDir, "index.html"))) {
  console.error(`[habat-pages] build output not found at ${buildDir}`);
  process.exit(1);
}

fs.rmSync(stagingDir, { recursive: true, force: true });
copyTreeFiltered(buildDir, stagingDir);

fs.writeFileSync(
  path.join(stagingDir, "_routes.json"),
  `${JSON.stringify({ version: 1, include: ["/habat-api/*"], exclude: [] }, null, 2)}\n`,
  "utf8"
);

console.log("[habat-pages] refreshing Cloudflare authentication...");
const deployEnv = cloudflareDeployEnv();

console.log("[habat-pages] deploying to Cloudflare Pages project habat-alwaraq...");
run(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "wrangler",
    "pages",
    "deploy",
    ".cf-pages",
    "--project-name",
    "habat-alwaraq",
    "--branch",
    "habat-production",
    "--commit-dirty=true",
  ],
  { env: deployEnv }
);

console.log("[habat-pages] production alias: https://habat-alwaraq.pages.dev");
