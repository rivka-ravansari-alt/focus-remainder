import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      input: "src/content/main.tsx",
      output: {
        format: "iife",
        name: "FocusReminderContent",
        entryFileNames: "content.js",
        codeSplitting: false
      }
    }
  }
});
