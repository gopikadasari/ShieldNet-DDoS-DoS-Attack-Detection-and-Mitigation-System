import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite dev/preview configuration for the PIA‑Shield React storefront.
export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.FRONTEND_PORT || "5173", 10),
    host: "0.0.0.0",
  },
  preview: {
    port: parseInt(process.env.FRONTEND_PORT || "5173", 10),
    host: "0.0.0.0",
  },
});

