import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

const plugins = [react(), tailwindcss()];

/**
 * ✅ Fix alias/@ reliably regardless of where vite.config.ts lives:
 * - If this config is inside /client => root is that folder
 * - If this config is in repo root and /client exists => root is /client
 */
const here = import.meta.dirname;

// Case A: vite.config.ts is inside client/
const isInsideClient =
  fs.existsSync(path.resolve(here, "src")) &&
  fs.existsSync(path.resolve(here, "public"));

// Case B: vite.config.ts is in repo root and client/ exists
const hasClientFolder =
  fs.existsSync(path.resolve(here, "client", "src")) &&
  fs.existsSync(path.resolve(here, "client", "public"));

const clientRoot = isInsideClient
  ? path.resolve(here)
  : hasClientFolder
    ? path.resolve(here, "client")
    : path.resolve(here); // fallback

const srcRoot = path.resolve(clientRoot, "src");
const repoRoot = isInsideClient ? path.resolve(here, "..") : path.resolve(here);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const isHabat = String(process.env.VITE_APP_MODE ?? env.VITE_APP_MODE ?? "").trim().toLowerCase() === "habat-attendance";
  return {
  plugins: [...plugins, ...(isHabat ? [{
    name: "habat-entry",
    transformIndexHtml: {
      order: "pre" as const,
      handler: (html: string) => html.replace('src="/src/main.tsx"', 'src="/src/habat-main.tsx"'),
    },
  }] : [])],

  resolve: {
    alias: {
      // ✅ @ => client/src (always)
      "@": srcRoot,
      "@shared": path.resolve(repoRoot, "shared"),
      "@assets": path.resolve(repoRoot, "attached_assets"),
    },
  },

  // ✅ Always load env from repo root
  envDir: repoRoot,

  // ✅ Vite root (client/ if exists)
  root: clientRoot,

  publicDir: path.resolve(clientRoot, "public"),

  build: {
    outDir: "dist",
    emptyOutDir: true,
  },

  server: {
    host: true,
    proxy: {
      "/habat-api": {
        target: process.env.HABAT_DEV_WORKER_URL || "https://upload.maedin2026.workers.dev",
        changeOrigin: true,
        secure: true,
        rewrite: path =>
          path.replace(/^\/habat-api/, "/attendance/habat"),
      },
    },
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
};
});
