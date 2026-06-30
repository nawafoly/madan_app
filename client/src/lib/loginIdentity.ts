import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";

import { db, firebaseFunctions } from "@/_core/firebase";
import {
  buildAdminEmailFromUsername,
  normalizeAdminUsername,
} from "@/lib/adminUsername";

type ResolveLoginEmailRequest = {
  username: string;
};

type ResolveLoginEmailResponse = {
  found?: boolean;
  email?: string | null;
  emailMissing?: boolean;
};

export type LoginIdentityErrorCode =
  | "username-not-found"
  | "email-missing";

export class LoginIdentityError extends Error {
  code: LoginIdentityErrorCode;

  constructor(code: LoginIdentityErrorCode) {
    super(code);
    this.name = "LoginIdentityError";
    this.code = code;
  }
}

const resolveLoginEmailCallable = httpsCallable<
  ResolveLoginEmailRequest,
  ResolveLoginEmailResponse
>(firebaseFunctions, "resolveLoginEmail");

export function normalizeLoginEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isEmailLoginInput(value: string) {
  return normalizeLoginEmail(value).includes("@");
}

export function isLoginIdentityError(
  error: unknown
): error is LoginIdentityError {
  return error instanceof LoginIdentityError;
}

function isLocalhostRuntime() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function getUsernameFallbackDomains() {
  const configured = String(
    import.meta.env.VITE_LOGIN_USERNAME_EMAIL_DOMAINS || ""
  )
    .split(",")
    .map(domain => domain.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set([...configured, "maedin.sa", "gmail.com"]));
}

function isCallableUnavailable(error: unknown) {
  const code = String((error as { code?: unknown })?.code || "").toLowerCase();
  const message = String(
    (error as { message?: unknown })?.message || ""
  ).toLowerCase();

  return (
    code.includes("functions/not-found") ||
    code.includes("not-found") ||
    code.includes("unavailable") ||
    code.includes("internal") ||
    message.includes("not found") ||
    message.includes("not-found") ||
    message.includes("cors") ||
    message.includes("network")
  );
}

async function resolveLoginEmailFromUsernameIndex(username: string) {
  const usernameSnap = await getDoc(doc(db, "admin_usernames", username));
  if (!usernameSnap.exists()) return "";

  return normalizeLoginEmail(String(usernameSnap.data()?.email || ""));
}

export async function resolveLoginEmailCandidatesForAuth(value: string) {
  const input = normalizeLoginEmail(value);
  if (!input) return [];
  if (input.includes("@")) return [input];

  const username = normalizeAdminUsername(input);
  if (!username) throw new LoginIdentityError("username-not-found");

  const candidates = new Set<string>();
  const indexedEmail = await resolveLoginEmailFromUsernameIndex(username);
  if (indexedEmail) candidates.add(indexedEmail);

  let result: { data?: ResolveLoginEmailResponse } | null = null;

  if (!isLocalhostRuntime()) {
    try {
      result = await resolveLoginEmailCallable({ username });
    } catch (error) {
      if (!isCallableUnavailable(error)) throw error;
    }
  }

  const email = normalizeLoginEmail(String(result?.data?.email || ""));

  if (result?.data?.emailMissing) {
    throw new LoginIdentityError("email-missing");
  }

  if (result?.data?.found && email) {
    candidates.add(email);
  }

  const generatedEmail = normalizeLoginEmail(buildAdminEmailFromUsername(username));
  if (generatedEmail) {
    candidates.add(generatedEmail);
  }

  for (const domain of getUsernameFallbackDomains()) {
    candidates.add(`${username}@${domain}`);
  }

  if (candidates.size === 0) throw new LoginIdentityError("username-not-found");
  return Array.from(candidates);
}

export async function resolveLoginEmailForAuth(value: string) {
  const candidates = await resolveLoginEmailCandidatesForAuth(value);
  if (!candidates[0]) throw new LoginIdentityError("username-not-found");
  return candidates[0];
}
