import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Browser-only harness: no Cloudflare plugin, Agents, Wrangler, remote proxy or production credentials.
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true }
});
