import { useEffect, useRef } from "react";

export type HabatRealtimeEvent = {
  type: "habat.changed";
  topic: string;
  action: string;
  revision: string;
  at: string;
  sourceClientId: string | null;
};

type RealtimeListener = (event: HabatRealtimeEvent) => void;

type RealtimeTicketPayload = {
  ok: true;
  webSocketUrl: string;
};

const listeners = new Set<RealtimeListener>();

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let heartbeatTimer: number | null = null;
let reconnectAttempt = 0;
let everOpened = false;
let volatileClientId = "";
let networkListenersAttached = false;
let connectGeneration = 0;
let connectInFlight = false;

const CLIENT_ID_KEY = "habat_realtime_client_id";

function createClientId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `habat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getHabatRealtimeClientId(): string {
  if (typeof window === "undefined") {
    if (!volatileClientId) {
      volatileClientId = createClientId();
    }

    return volatileClientId;
  }

  try {
    const existing = window.sessionStorage.getItem(CLIENT_ID_KEY);

    if (existing) {
      return existing;
    }

    const created = createClientId();
    window.sessionStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    if (!volatileClientId) {
      volatileClientId = createClientId();
    }

    return volatileClientId;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearHeartbeatTimer() {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function emit(event: HabatRealtimeEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("[habat-realtime] listener failed", error);
    }
  }
}

function scheduleReconnect() {
  if (
    typeof window === "undefined" ||
    listeners.size === 0 ||
    reconnectTimer !== null
  ) {
    return;
  }

  const delay = Math.min(1000 * 2 ** reconnectAttempt, 15000);
  reconnectAttempt = Math.min(reconnectAttempt + 1, 4);

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, delay);
}

function startHeartbeat(target: WebSocket) {
  clearHeartbeatTimer();

  heartbeatTimer = window.setInterval(() => {
    if (target.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      target.send(JSON.stringify({ type: "ping" }));
    } catch {
      try {
        target.close();
      } catch {
        // Socket is already closed.
      }
    }
  }, 25000);
}

async function requestRealtimeTicket(): Promise<string> {
  const response = await fetch("/habat-api/realtime/ticket", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Habat-Client-Id": getHabatRealtimeClientId(),
    },
    body: "{}",
  });

  const payload = (await response.json().catch(() => null)) as
    | RealtimeTicketPayload
    | { ok?: false; message?: string }
    | null;

  if (!response.ok || !payload || payload.ok !== true || !("webSocketUrl" in payload)) {
    throw new Error(
      String(
        (payload && "message" in payload && payload.message) ||
          `habat_realtime_ticket_${response.status}`
      )
    );
  }

  return payload.webSocketUrl;
}

async function connect(force = false) {
  if (
    typeof window === "undefined" ||
    typeof WebSocket === "undefined" ||
    (!force && listeners.size === 0) ||
    connectInFlight
  ) {
    return;
  }

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  clearReconnectTimer();
  connectInFlight = true;
  const generation = ++connectGeneration;

  try {
    const webSocketUrl = await requestRealtimeTicket();

    if (listeners.size === 0 || generation !== connectGeneration) {
      return;
    }

    const target = new WebSocket(webSocketUrl);
    socket = target;

    target.onopen = () => {
      const wasReconnect = everOpened;

      everOpened = true;
      reconnectAttempt = 0;
      startHeartbeat(target);

      if (wasReconnect) {
        emit({
          type: "habat.changed",
          topic: "all",
          action: "reconnected",
          revision: createClientId(),
          at: new Date().toISOString(),
          sourceClientId: null,
        });
      }
    };

    target.onmessage = message => {
      let payload: unknown;

      try {
        payload = JSON.parse(String(message.data || ""));
      } catch {
        return;
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as { type?: unknown }).type !== "habat.changed"
      ) {
        return;
      }

      const event = payload as HabatRealtimeEvent;

      emit(event);
    };

    target.onclose = () => {
      if (socket === target) {
        socket = null;
      }

      clearHeartbeatTimer();
      scheduleReconnect();
    };

    target.onerror = () => {
      try {
        target.close();
      } catch {
        // Socket is already closed.
      }
    };
  } catch (error) {
    console.warn("[habat-realtime] connection bootstrap failed", error);
    scheduleReconnect();
  } finally {
    connectInFlight = false;
  }
}

function attachNetworkListeners() {
  if (
    typeof window === "undefined" ||
    networkListenersAttached
  ) {
    return;
  }

  networkListenersAttached = true;

  window.addEventListener("online", () => {
    void connect();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void connect();
    }
  });
}

export function ensureHabatRealtimeConnection() {
  if (typeof window === "undefined") return;
  attachNetworkListeners();
  void connect(true);
}

export function subscribeHabatRealtime(
  listener: RealtimeListener
): () => void {
  listeners.add(listener);

  attachNetworkListeners();
  void connect();

  return () => {
    listeners.delete(listener);

    if (listeners.size !== 0) {
      return;
    }

    clearReconnectTimer();
    clearHeartbeatTimer();
    reconnectAttempt = 0;
    everOpened = false;
    connectGeneration += 1;

    if (socket) {
      const current = socket;
      socket = null;

      try {
        current.close(1000, "no_subscribers");
      } catch {
        // Socket is already closed.
      }
    }
  };
}

export function useHabatRealtimeRefresh(
  refresh: () => void | Promise<void>
) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let timer: number | null = null;
    let running = false;
    let pending = false;
    let disposed = false;

    async function runRefresh() {
      if (disposed) return;

      if (running) {
        pending = true;
        return;
      }

      running = true;

      try {
        await refreshRef.current();
      } catch (error) {
        console.warn("[habat-realtime] refresh failed", error);
      } finally {
        running = false;

        if (pending && !disposed) {
          pending = false;
          void runRefresh();
        }
      }
    }

    const unsubscribe = subscribeHabatRealtime(() => {
      if (running) {
        pending = true;
        return;
      }

      if (timer !== null) {
        window.clearTimeout(timer);
      }

      timer = window.setTimeout(() => {
        timer = null;
        void runRefresh();
      }, 75);
    });

    return () => {
      disposed = true;

      if (timer !== null) {
        window.clearTimeout(timer);
      }

      unsubscribe();
    };
  }, []);
}
