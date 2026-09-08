import { resolveHabatNativeSessionContext } from "./habat-native-auth.js";

// Habat identity and authorization are owned by its D1 access record.
export async function resolveHabatRequesterContext({ request, db }) {
  const requester = await resolveHabatNativeSessionContext({ request, db });
  if (!requester) return denied(401, "habat_session_required");
  if (requester.mustChangePassword) return denied(403, "habat_password_change_required");
  return requester;
}

function denied(status, message) {
  return {
    ok: false,
    response: Response.json({ ok: false, message }, {
      status,
      headers: { "Cache-Control": "no-store" },
    }),
  };
}
