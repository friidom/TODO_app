import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// The React Compiler is deliberately NOT enabled here (M9-04).
//
// It was on in the Vite template this project started from, was commented out
// during unrelated feature work in July, and sat as dead text ever since while
// README.md went on claiming it was enabled. That ambiguity is what M9-04
// existed to end; the measurements behind the answer are recorded next to the
// task in docs/IMPLEMENTATION_PLAN.md.
//
// The short version: enabling it cost 2.7x build time and +25% on the board
// chunk, against a re-render saving nobody has measured. M9-05 is the task that
// measures it — "profile first; memoise only what the profiler names" — and it
// is the trigger to revisit this, with numbers on both sides rather than one.
//
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
