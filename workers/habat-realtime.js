let configuredRealtimeBinding = null;

export function configureHabatRealtimeBinding(binding) {
  configuredRealtimeBinding = binding || null;
}

export function normalizeHabatRealtimeClientId(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._:-]/g, "")
    .slice(0, 128);
}

function normalizeAccessId(value) {
  return String(value || "").trim().slice(0, 128);
}

export function topicForHabatMutation(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "");

  if (path.includes("/auth/")) return "auth";
  if (path.includes("/settings")) return "settings";
  if (path.includes("/shifts")) return "shifts";
  if (path.includes("/assignments")) return "assignments";
  if (path.includes("/day-overrides")) return "records";
  if (path.includes("/records")) return "records";
  if (/\/check-(?:in|out)$/.test(path)) return "attendance";
  if (path.includes("/access")) return "access";
  if (path.includes("/workforce/")) return "workforce";
  if (path.includes("/monthly-summary") || path.includes("/reports/")) {
    return "reports";
  }

  return "data";
}

export function audienceForHabatMutation({
  pathname,
  requester,
  responsePayload,
}) {
  const topic = topicForHabatMutation(pathname);

  const requesterAccessId = normalizeAccessId(requester?.accessId);

  if (topic === "attendance" && requesterAccessId) {
    return {
      scope: "access",
      accessIds: [requesterAccessId],
    };
  }

  if (topic === "assignments") {
    const target = normalizeAccessId(
      responsePayload?.assignment?.accessId
    );

    if (target) {
      return {
        scope: "access",
        accessIds: [target],
      };
    }
  }

  if (topic === "access") {
    const target = normalizeAccessId(
      responsePayload?.account?.id ||
      responsePayload?.access?.id ||
      responsePayload?.accessId
    );

    if (target) {
      return {
        scope: "access",
        accessIds: [target],
      };
    }
  }

  // Shift/settings changes are intentionally global because they can affect
  // every active employee. Record corrections fall back to global delivery
  // unless the response exposes a canonical access ID.
  return {
    scope: "all",
    accessIds: [],
  };
}

function realtimeStub() {
  if (!configuredRealtimeBinding) return null;

  const id = configuredRealtimeBinding.idFromName("habat-global");
  return configuredRealtimeBinding.get(id);
}

function unavailable() {
  return Response.json(
    { ok: false, message: "habat_realtime_unavailable" },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function handleHabatRealtimeRequest({
  request,
  resolveRequesterContext,
}) {
  if (request.method !== "GET") {
    return Response.json(
      { ok: false, message: "method_not_allowed" },
      {
        status: 405,
        headers: {
          Allow: "GET",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
    return Response.json(
      { ok: false, message: "habat_realtime_upgrade_required" },
      {
        status: 426,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  if (typeof resolveRequesterContext !== "function") {
    return unavailable();
  }

  const requester = await resolveRequesterContext(request);

  if (!requester?.ok) {
    return (
      requester?.response ||
      Response.json(
        { ok: false, message: "habat_session_required" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        }
      )
    );
  }

  if (requester.runtime?.isActive === false) {
    return Response.json(
      { ok: false, message: "inactive_account" },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const stub = realtimeStub();
  if (!stub) return unavailable();

  const incomingUrl = new URL(request.url);

  const clientId = normalizeHabatRealtimeClientId(
    incomingUrl.searchParams.get("clientId")
  );

  const headers = new Headers(request.headers);

  headers.set(
    "X-Habat-Realtime-Access-Id",
    normalizeAccessId(requester.accessId)
  );

  headers.set(
    "X-Habat-Realtime-Role",
    String(requester.accessLevel || "employee")
  );

  if (clientId) {
    headers.set("X-Habat-Realtime-Client-Id", clientId);
  }

  return stub.fetch(
    new Request(request, {
      headers,
    })
  );
}

export async function publishHabatRealtimeMutation({
  pathname,
  method,
  sourceClientId,
  requester,
  responsePayload,
}) {
  const stub = realtimeStub();

  if (!stub) {
    return {
      ok: false,
      skipped: true,
      reason: "binding_unavailable",
    };
  }

  const audience = audienceForHabatMutation({
    pathname,
    requester,
    responsePayload,
  });

  const event = {
    type: "habat.changed",
    topic: topicForHabatMutation(pathname),
    action: String(method || "").toLowerCase(),
    revision: crypto.randomUUID(),
    at: new Date().toISOString(),
    sourceClientId:
      normalizeHabatRealtimeClientId(sourceClientId) || null,
    audience,
  };

  try {
    const response = await stub.fetch(
      "https://habat-realtime.internal/publish",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      console.warn(
        "[habat-realtime] publish returned",
        response.status
      );

      return {
        ok: false,
        skipped: false,
        reason: "publish_failed",
      };
    }

    return {
      ok: true,
      event,
    };
  } catch (error) {
    // Realtime delivery is secondary. A successful D1 mutation must remain
    // successful even if websocket delivery is temporarily unavailable.
    console.warn("[habat-realtime] publish failed", error);

    return {
      ok: false,
      skipped: false,
      reason: "publish_failed",
    };
  }
}

function addSocket(target, socket) {
  if (socket) target.add(socket);
}

export class HabatRealtimeHub {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (
      url.hostname === "habat-realtime.internal" &&
      url.pathname === "/publish"
    ) {
      if (request.method !== "POST") {
        return new Response("method_not_allowed", { status: 405 });
      }

      let internalEvent;

      try {
        internalEvent = await request.json();
      } catch {
        return new Response("invalid_json", { status: 400 });
      }

      const audience = internalEvent?.audience || {
        scope: "all",
        accessIds: [],
      };

      // Audience metadata is internal routing information only.
      // Never expose access IDs to browser clients.
      const {
        audience: _internalAudience,
        ...publicEvent
      } = internalEvent || {};

      const targets = new Set();

      if (audience.scope === "all") {
        for (const socket of this.state.getWebSockets()) {
          addSocket(targets, socket);
        }
      } else {
        // Managers always receive operational events.
        for (const socket of this.state.getWebSockets("manager")) {
          addSocket(targets, socket);
        }

        for (const accessId of audience.accessIds || []) {
          const normalized = normalizeAccessId(accessId);
          if (!normalized) continue;

          for (
            const socket of this.state.getWebSockets(
              `access:${normalized}`
            )
          ) {
            addSocket(targets, socket);
          }
        }
      }

      const serialized = JSON.stringify(publicEvent);
      let delivered = 0;

      for (const socket of targets) {
        try {
          socket.send(serialized);
          delivered += 1;
        } catch {
          // Dead sockets are managed by Durable Object websocket lifecycle.
        }
      }

      return Response.json({
        ok: true,
        delivered,
      });
    }

    if (
      String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket"
    ) {
      return new Response("websocket_required", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const accessId = normalizeAccessId(
      request.headers.get("X-Habat-Realtime-Access-Id")
    );

    const role = String(
      request.headers.get("X-Habat-Realtime-Role") || "employee"
    ).trim();

    const tags = [];

    if (role === "manager") {
      tags.push("manager");
    }

    if (accessId) {
      tags.push(`access:${accessId}`);
    }

    this.state.acceptWebSocket(server, tags);

    server.send(
      JSON.stringify({
        type: "habat.realtime.ready",
        at: new Date().toISOString(),
      })
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  webSocketMessage(socket, message) {
    try {
      const raw = String(message || "");

      if (raw === "ping") {
        socket.send(
          JSON.stringify({
            type: "habat.realtime.pong",
            at: new Date().toISOString(),
          })
        );
        return;
      }

      let payload;

      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      if (payload?.type === "ping") {
        socket.send(
          JSON.stringify({
            type: "habat.realtime.pong",
            at: new Date().toISOString(),
          })
        );
      }
    } catch {
      // Ignore malformed control messages.
    }
  }

  webSocketClose(socket, code, reason) {
    try {
      socket.close(code, reason);
    } catch {
      // Socket is already closed.
    }
  }

  webSocketError(socket) {
    try {
      socket.close(1011, "realtime_error");
    } catch {
      // Socket is already closed.
    }
  }
}