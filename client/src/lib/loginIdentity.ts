import {
  buildAdminEmailFromUsername,
  normalizeAdminUsername,
} from "@/lib/adminUsername";
import { resolveHrCoreLoginIdentity } from "@/lib/hrCoreApi";

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

export function normalizeLoginEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isEmailLoginInput(value: string) {
  return normalizeLoginEmail(value).includes("@");
}

export function isLoginIdentityError(error: unknown): error is LoginIdentityError {
  return error instanceof LoginIdentityError;
}

function getUsernameFallbackDomains() {
  const configured = String(import.meta.env.VITE_LOGIN_USERNAME_EMAIL_DOMAINS || "")
    .split(",")
    .map(domain => domain.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set([
    "madanalbena.com",
    ...configured,
    "maedin.com",
    "maedin.sa",
    "gmail.com",
  ]));
}

function isHrCoreLookupUnavailable(error: unknown) {
  const status = Number((error as { status?: unknown })?.status || 0);
  const message = String((error as { message?: unknown })?.message || "").toLowerCase();
  return status === 0 || status === 404 || status >= 500 ||
    message.includes("not configured") ||
    message.includes("failed to fetch") ||
    message.includes("network");
}

export async function resolveLoginEmailCandidatesForAuth(value: string) {
  const input = normalizeLoginEmail(value);
  if (!input) return [];
  if (input.includes("@")) return [input];

  const username = normalizeAdminUsername(input);
  if (!username) throw new LoginIdentityError("username-not-found");

  const candidates = new Set<string>();

  try {
    const result = await resolveHrCoreLoginIdentity(username);
    const email = normalizeLoginEmail(String(result.email || ""));
    if (result.emailMissing) throw new LoginIdentityError("email-missing");
    if (result.found && email) candidates.add(email);
  } catch (error) {
    if (isLoginIdentityError(error)) throw error;
    if (!isHrCoreLookupUnavailable(error)) throw error;
    console.warn("[HR Login] D1 username lookup unavailable");
  }

  const generatedEmail = normalizeLoginEmail(buildAdminEmailFromUsername(username));
  if (generatedEmail) candidates.add(generatedEmail);
  for (const domain of getUsernameFallbackDomains()) candidates.add(`${username}@${domain}`);

  if (candidates.size === 0) throw new LoginIdentityError("username-not-found");
  return Array.from(candidates);
}

export async function resolveLoginEmailForAuth(value: string) {
  const candidates = await resolveLoginEmailCandidatesForAuth(value);
  if (!candidates[0]) throw new LoginIdentityError("username-not-found");
  return candidates[0];
}
