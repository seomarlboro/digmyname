import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { prerenderRoutes } from "./scripts/prerender-plugin";

// Long-lived vendor chunks: a page edit no longer invalidates React, Radix or
// supabase-js in the browser cache, and the per-page chunks stay small.
const VENDOR_GROUPS: [RegExp, string][] = [
  [/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/, "vendor-react"],
  [/[\\/]node_modules[\\/]@supabase[\\/]/, "vendor-supabase"],
  [/[\\/]node_modules[\\/]@radix-ui[\\/]/, "vendor-radix"],
];

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), prerenderRoutes()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          for (const [pattern, name] of VENDOR_GROUPS) {
            if (pattern.test(id)) return name;
          }
          return undefined;
        },
      },
    },
  },
}));
