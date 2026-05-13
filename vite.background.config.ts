import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      input: "src/background.ts",
      output: {
        format: "es",
        entryFileNames: "background.js",
        codeSplitting: false
      }
    }
  }
});
