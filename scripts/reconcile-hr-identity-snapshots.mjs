#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { planMissingOnlyIdentityReconciliation } from "../workers/hr-identity-reconciliation.js";

function parseArgs(argv) {
  const args = {
    source: null,
    canonical: null,
    output: null,
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--source") {
      args.source = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (token === "--canonical") {
      args.canonical = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (token === "--output") {
      args.output = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (token === "--apply") {
      args.apply = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    throw new Error(`unknown_argument:${token}`);
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/reconcile-hr-identity-snapshots.mjs --source <source.json> --canonical <canonical.json> [--output <plan.json>]",
    "",
    "Snapshot format:",
    "  { \"accounts\": [...], \"employees\": [...] }",
    "",
    "Safety:",
    "  This command is dry-run only. --apply is intentionally rejected.",
  ].join("\n");
}

async function readSnapshot(filePath, label) {
  const absolute = path.resolve(filePath);
  const raw = (await fs.readFile(absolute, "utf8")).replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${label}_snapshot_invalid`);
  }
  if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.employees)) {
    throw new Error(`${label}_snapshot_requires_accounts_and_employees_arrays`);
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (args.apply) {
    process.stderr.write(
      "identity_reconciliation_apply_disabled: use a separately reviewed governed apply command\n"
    );
    process.exitCode = 2;
    return;
  }

  if (!args.source || !args.canonical) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 1;
    return;
  }

  const [source, canonical] = await Promise.all([
    readSnapshot(args.source, "source"),
    readSnapshot(args.canonical, "canonical"),
  ]);

  const plan = planMissingOnlyIdentityReconciliation({
    sourceAccounts: source.accounts,
    sourceEmployees: source.employees,
    canonicalAccounts: canonical.accounts,
    canonicalEmployees: canonical.employees,
  });

  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  process.stdout.write(serialized);

  if (args.output) {
    const outputPath = path.resolve(args.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, serialized, "utf8");
  }

  if (plan.blocked) {
    process.exitCode = 2;
  }
}

main().catch(error => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
