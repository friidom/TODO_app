import { defineConfig } from "vitest/config";
import path from "node:path";

// Deliberately standalone rather than a `test` block in vite.config.ts: these
// tests are pure TypeScript, so they need neither the React plugin nor
// Tailwind. Only the `@` alias is shared, and it is repeated rather than
// imported so loading this config does not pull in the whole build pipeline.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // No jsdom: nothing here touches the DOM. React Testing Library is
    // deliberately absent — pure logic is where the risk is, and component
    // tests nobody needs are a maintenance cost.
    environment: "node",
    // client.ts throws at module load when this is missing, and CI has no
    // .env. That guard is right for the app; a stub satisfies it for tests that
    // only want a constant from a module the client happens to share. Nothing
    // here opens a socket, so the value is never dialled.
    env: {
      VITE_API_URL: "http://localhost:4000/api/v1",
    },
  },
});
