import { handleHabatAttendanceRequest } from "./habat-attendance-core.js";
import { handleHabatAttendanceV2Request } from "./habat-attendance-v2.js";
import { handleHabatAttendanceV3Request } from "./habat-attendance-v3.js";
import { handleHabatAttendanceReportingRequest } from "./habat-attendance-reporting.js";
import { handleHabatPortalRequest } from "./habat-portal.js";
import { handleHabatWorkforceRequest } from "./habat-workforce-adapter.js";
import { resolveHabatRequesterContext } from "./habat-auth.js";
import { handleHabatNativeAuthRequest, isTrustedMutationOrigin } from "./habat-native-auth.js";

// All Habat routes share the same native session and mutation-origin boundary.
export async function handleHabatRequest(args) {
  const { request, url, db } = args;
  const pathname = url.pathname.replace(/\/+$/, "");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !isTrustedMutationOrigin(request)) {
    return Response.json({ ok: false, message: "habat_auth_origin_forbidden" }, {
      status: 403, headers: { "Cache-Control": "no-store" },
    });
  }
  const authResponse = await handleHabatNativeAuthRequest({ request, url, db });
  if (authResponse) return authResponse;

  const habatArgs = {
    ...args,
    resolveRequesterContext: request => resolveHabatRequesterContext({ request, db }),
  };
  if (pathname.startsWith("/attendance/habat/workforce/")) return handleHabatWorkforceRequest(habatArgs);
  if (pathname.startsWith("/attendance/habat/portal/")) return handleHabatPortalRequest(habatArgs);
  if (["/attendance/habat/v2/reports/summary", "/attendance/habat/v3/reports/summary", "/attendance/habat/v3/monthly-summary/generate"].includes(pathname)) {
    return handleHabatAttendanceReportingRequest(habatArgs);
  }
  if (pathname.startsWith("/attendance/habat/v3/")) return handleHabatAttendanceV3Request(habatArgs);
  if (pathname.startsWith("/attendance/habat/v2/")) return handleHabatAttendanceV2Request(habatArgs);
  return handleHabatAttendanceRequest(habatArgs);
}
