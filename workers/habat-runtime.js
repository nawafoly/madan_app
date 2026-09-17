import { handleHabatAttendanceRequest } from "./habat-attendance-core.js";
import { handleHabatAttendanceV2Request } from "./habat-attendance-v2.js";
import { handleHabatAttendanceV3Request } from "./habat-attendance-v3.js";
import { handleHabatAttendanceReportingRequest } from "./habat-attendance-reporting.js";
import { handleHabatAttendanceExtensionsRequest } from "./habat-attendance-extensions.js";
import { handleHabatPortalRequest } from "./habat-portal.js";
import { handleHabatWorkforceRequest } from "./habat-workforce-adapter.js";
import { resolveHabatRequesterContext } from "./habat-auth.js";
import {
  handleHabatNativeAuthRequest,
  isTrustedMutationOrigin,
} from "./habat-native-auth.js";
import {
  handleHabatRealtimeRequest,
  handleHabatRealtimeTicketRequest,
  publishHabatRealtimeMutation,
} from "./habat-realtime.js";

// All Habat routes share the same native session and mutation-origin boundary.
export async function handleHabatRequest(args) {
  const { request, url, db } = args;
  const pathname = url.pathname.replace(/\/+$/, "");
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);

  if (isMutation && !isTrustedMutationOrigin(request)) {
    return Response.json(
      { ok: false, message: "habat_auth_origin_forbidden" },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const authResponse = await handleHabatNativeAuthRequest({
    request,
    url,
    db,
  });

  if (authResponse) {
    return authResponse;
  }

  let requesterPromise = null;

  const resolveCachedRequester = currentRequest => {
    if (!requesterPromise) {
      requesterPromise = resolveHabatRequesterContext({
        request: currentRequest,
        db,
      });
    }

    return requesterPromise;
  };

  const habatArgs = {
    ...args,
    resolveRequesterContext: resolveCachedRequester,
  };

  if (pathname === "/attendance/habat/realtime/ticket") {
    return handleHabatRealtimeTicketRequest(habatArgs);
  }

  if (pathname === "/attendance/habat/realtime") {
    return handleHabatRealtimeRequest(habatArgs);
  }

  let response;
  const usesAttendanceExtensions =
    pathname === "/attendance/habat/v2/check-in" ||
    pathname === "/attendance/habat/v2/check-out" ||
    pathname === "/attendance/habat/v2/locations" ||
    pathname.startsWith("/attendance/habat/v2/locations/") ||
    pathname.startsWith("/attendance/habat/v2/location-assignments/") ||
    pathname === "/attendance/habat/v2/attendance-photos" ||
    pathname.startsWith("/attendance/habat/v2/attendance-photos/");

  if (usesAttendanceExtensions) {
    try {
      response = await handleHabatAttendanceExtensionsRequest(habatArgs);
    } catch (error) {
      const status = Number(error?.status || 500);
      const code = String(error?.code || error?.message || "habat_attendance_extension_failed");
      console.error("[habat-runtime] attendance extension failed", error);
      response = Response.json(
        { ok: false, message: code },
        {
          status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }
  } else if (pathname.startsWith("/attendance/habat/workforce/")) {
    response = await handleHabatWorkforceRequest(habatArgs);
  } else if (pathname.startsWith("/attendance/habat/portal/")) {
    response = await handleHabatPortalRequest(habatArgs);
  } else if (
    [
      "/attendance/habat/v2/reports/summary",
      "/attendance/habat/v3/reports/summary",
      "/attendance/habat/v3/monthly-summary/generate",
    ].includes(pathname)
  ) {
    response = await handleHabatAttendanceReportingRequest(habatArgs);
  } else if (pathname.startsWith("/attendance/habat/v3/")) {
    response = await handleHabatAttendanceV3Request(habatArgs);
  } else if (pathname.startsWith("/attendance/habat/v2/")) {
    response = await handleHabatAttendanceV2Request(habatArgs);
  } else {
    response = await handleHabatAttendanceRequest(habatArgs);
  }

  if (isMutation && response?.ok) {
    let requester = null;
    let responsePayload = null;

    try {
      requester = await resolveCachedRequester(request);
    } catch {
      requester = null;
    }

    try {
      responsePayload = await response.clone().json();
    } catch {
      responsePayload = null;
    }

    await publishHabatRealtimeMutation({
      pathname,
      method: request.method,
      sourceClientId: request.headers.get("X-Habat-Client-Id"),
      requester,
      responsePayload,
    });
  }

  return response;
}
