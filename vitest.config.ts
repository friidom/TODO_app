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
    // `*.live.test.ts` opens real sockets to the linked project and takes
    // minutes. It is a real suite with real assertions — see
    // `vitest.live.config.ts` and `npm run test:live` — but it is not a gate,
    // and a gate that needs credentials and a network stops being run.
    exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.live.test.ts"],
    // No jsdom: nothing here touches the DOM. React Testing Library is
    // deliberately absent — pure logic is where the risk is, and component
    // tests nobody needs are a maintenance cost.
    environment: "node",
    // `supabase.ts` throws at module load when these are missing, and CI has no
    // `.env`. That guard is right for the app — a missing variable should fail
    // at startup with a name rather than as an opaque error on the first query
    // — but it also fires for a test that only wants a *constant* from a module
    // the client happens to share: `todoApi.test.ts` imports TODO_LIST_FIELDS,
    // and `todoApi.ts` imports `supabase` four lines up. Stub values satisfy
    // the guard. Nothing in this suite opens a socket, so the values are never
    // dialled; the live suite has its own config and real credentials.
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "stub-publishable-key",
    },
  },
});
