import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves the site from /flash-flood-compendium/.
export default defineConfig({
  base: "/flash-flood-compendium/",
  plugins: [react(), tailwindcss()],
  // The MapLibre worker is an ES module that imports a shared chunk.
  worker: { format: "es" },
});
