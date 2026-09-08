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

  const headers = new Headers(context.request.headers);
  headers.delete("host");

  const init = {
    method: context.request.method,
    headers,
    redirect: "manual",
  };

  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    init.body = context.request.body;
  }

  return fetch(targetUrl.toString(), init);
}
