import { createServer } from "vite";

const host = "127.0.0.1";
const port = 5199;
const url = `http://${host}:${port}/habat-api/v2/context`;

let server;
try {
  server = await createServer({
    server: {
      host,
      port,
      strictPort: true,
    },
    logLevel: "error",
  });

  await server.listen();

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const payload = await response.json().catch(() => null);

  if (response.status !== 401) {
    throw new Error(
      `Expected Habbat Worker auth boundary (401), received ${response.status}. ` +
        `payload=${JSON.stringify(payload)}`
    );
  }

  const message = String(payload?.message || "");
  if (message !== "missing_firebase_id_token") {
    throw new Error(
      `Expected missing_firebase_id_token through local proxy, received ${message || "<empty>"}.`
    );
  }

  console.log(
    "[habat-local-proxy] PASS - /habat-api/v2/context reached the production Habbat Worker and returned the expected 401 auth boundary."
  );
} finally {
  if (server) await server.close();
}
