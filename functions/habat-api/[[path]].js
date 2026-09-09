export async function onRequest(context) {
  const parts = Array.isArray(context.params.path)
    ? context.params.path
    : context.params.path
      ? [context.params.path]
      : [];

  const incomingUrl = new URL(context.request.url);

  const targetUrl = new URL(
    `https://upload.maedin2026.workers.dev/attendance/habat/${parts.join("/")}`
  );

  targetUrl.search = incomingUrl.search;

  const isWebSocket =
    context.request.headers.get("Upgrade")?.toLowerCase() === "websocket";

  if (isWebSocket) {
    const headers = new Headers();

    headers.set("Upgrade", "websocket");

    const cookie = context.request.headers.get("Cookie");
    if (cookie) headers.set("Cookie", cookie);

    const origin = context.request.headers.get("Origin");
    if (origin) headers.set("Origin", origin);

    return fetch(targetUrl.toString(), {
      method: "GET",
      headers,
    });
  }

  const headers = new Headers(context.request.headers);

  headers.delete("host");
  headers.delete("connection");
  headers.delete("upgrade");

  const init = {
    method: context.request.method,
    headers,
    redirect: "manual",
  };

  if (
    context.request.method !== "GET" &&
    context.request.method !== "HEAD"
  ) {
    init.body = context.request.body;
  }

  return fetch(targetUrl.toString(), init);
}