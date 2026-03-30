import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const firebaseToolsLibRoot = path.join(
  process.env.APPDATA || "",
  "npm",
  "node_modules",
  "firebase-tools",
  "lib"
);
const firebaseAuth = require(path.join(firebaseToolsLibRoot, "auth.js"));
const firebaseApi = require(path.join(firebaseToolsLibRoot, "api.js"));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function readProjectId() {
  const envProjectId = String(process.env.VITE_FB_PROJECT_ID || "").trim();
  if (envProjectId) return envProjectId;

  const firebasercPath = path.join(repoRoot, ".firebaserc");
  const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, "utf8"));
  return String(firebaserc?.projects?.default || "").trim();
}

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function getFirebaseToolsAccount() {
  const projectAccount = firebaseAuth.getProjectDefaultAccount(repoRoot);
  if (projectAccount?.tokens?.refresh_token) return projectAccount;

  const globalAccount = firebaseAuth.getGlobalDefaultAccount();
  if (globalAccount?.tokens?.refresh_token) return globalAccount;

  throw new Error(
    "No Firebase CLI account with refresh token was found. Run `firebase login` first."
  );
}

function writeAuthorizedUserCredentials(account) {
  const credDir = path.join(repoRoot, ".tmp");
  fs.mkdirSync(credDir, { recursive: true });

  const credPath = path.join(credDir, "firebase-authorized-user.json");
  const payload = {
    type: "authorized_user",
    client_id: firebaseApi.clientId(),
    client_secret: firebaseApi.clientSecret(),
    refresh_token: account.tokens.refresh_token,
  };

  fs.writeFileSync(credPath, JSON.stringify(payload, null, 2), "utf8");
  return credPath;
}

function buildTemporaryPassword() {
  return `Owner@${crypto.randomBytes(9).toString("base64url")}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = String(args.email || "").trim().toLowerCase();
  const name = String(args.name || "").trim();
  const requestedPassword = String(args.password || "").trim();

  if (!email) {
    throw new Error("Missing required --email argument.");
  }

  if (!name) {
    throw new Error("Missing required --name argument.");
  }

  const projectId = readProjectId();
  if (!projectId) {
    throw new Error("Unable to resolve Firebase project id.");
  }

  const account = getFirebaseToolsAccount();
  const credentialsPath = writeAuthorizedUserCredentials(account);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }

  const auth = admin.auth();
  const db = admin.firestore();

  let created = false;
  let tempPassword = "";
  let userRecord;

  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;

    tempPassword = requestedPassword || buildTemporaryPassword();
    userRecord = await auth.createUser({
      email,
      password: tempPassword,
      displayName: name,
      disabled: false,
    });
    created = true;
  }

  await auth.updateUser(userRecord.uid, {
    displayName: name,
    disabled: false,
  });

  await auth.setCustomUserClaims(userRecord.uid, {
    role: "owner",
  });

  const userDocRef = db.doc(`users/${userRecord.uid}`);
  const userDocBefore = await userDocRef.get();
  const nextUserDoc = {
    email,
    role: "owner",
    name,
    displayName: name,
    fullName: name,
    active: true,
  };

  if (!userDocBefore.exists || !("createdAt" in (userDocBefore.data() || {}))) {
    nextUserDoc.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await userDocRef.set(nextUserDoc, { merge: true });

  const userDocAfter = await userDocRef.get();
  const userDocData = userDocAfter.data() || {};

  const result = {
    projectId,
    uid: userRecord.uid,
    email,
    role: "owner",
    name,
    created,
    userDocExistedBefore: userDocBefore.exists,
    userDocName: userDocData.name || "",
    userDocRole: userDocData.role || "",
    userDocActive: Boolean(userDocData.active),
    tempPassword: created ? tempPassword : "",
  };

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  const message = error?.stack || error?.message || String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
