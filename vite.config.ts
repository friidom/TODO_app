import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from "node:url";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // babel({ presets: [reactCompilerPreset()] }),
      
  ],
  resolve: {
    // alias: {
    //   "@": fileURLToPath(new URL("./src", import.meta.url)),
      
    // },
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
