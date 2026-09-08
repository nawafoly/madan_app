import { HabatApiError, type HabatPrincipal } from "./habatAttendanceClient";

type HabatAuthResponse = {
  ok: true;
  authenticated: true;
  authSource: "habat_session";
  mustChangePassword: boolean;
  principal: HabatPrincipal;
};

function authUrl(path: string): string {
  return `/habat-api/auth/${path.replace(/^\/+/, "")}`;
}

async function authRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set("Accept", "application/json");

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(authUrl(path), {
    ...init,
    headers,
    credentials: "same-origin",
  });

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok || !payload) {
    throw new HabatApiError(
      response.status,
      String(payload?.message || `habat_auth_http_${response.status}`),
      payload
    );
  }

  return payload as T;
}

export function habatLogin(email: string, password: string) {
  return authRequest<HabatAuthResponse>("login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function habatSession() {
  return authRequest<HabatAuthResponse>("session");
}

export function habatLogout() {
  return authRequest<{ ok: true; authenticated: false }>("logout", {
    method: "POST",
  });
}

export function habatChangePassword(currentPassword: string, newPassword: string) {
  return authRequest<{ ok: true; passwordChanged: true }>("change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function habatProvisionCredentials(accessId: string, password: string) {
  return authRequest<{ ok: true; accessId: string; credentialsCreated: true; mustChangePassword: true }>("admin/credentials", {
    method: "POST",
    body: JSON.stringify({ accessId, password }),
  });
}

export function habatResetPassword(accessId: string, password: string) {
  return authRequest<{ ok: true; accessId: string; passwordReset: true; mustChangePassword: true; sessionsRevoked: true }>("admin/reset-password", {
    method: "POST",
    body: JSON.stringify({ accessId, password }),
  });
}
