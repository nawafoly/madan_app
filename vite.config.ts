import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

const plugins = [react(), tailwindcss(), vitePluginManusRuntime()];

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

export default defineConfig({
  plugins,

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
});
