import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: [
      "23fb0ab1-e45d-4a7c-94c1-736f63e7d208-00-3klv4i1f5f6db.spock.replit.dev",
      ".replit.dev",
      ".repl.co",
    ],
  },
});
