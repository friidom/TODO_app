import { execFileSync } from "node:child_process";
import path from "node:path";
import { defineConfig } from "vitest/config";

const PROJECT_REF = "nxnnfaoyttbzndphnawe";

/**
 * The admin key for the linked project, read at config time through the same
 * Supabase CLI the migration scripts use.
 *
 * **It is fetched rather than stored, and that is the point.** A service-role
 * key in `.env` is a key on disk in a repo, one `git add -f` away from being
 * published, and it would sit beside two values that are *meant* to ship to the
 * browser. Read on demand it exists only for the length of this process, and
 * only for someone whose CLI is already logged in to the project.
 *
 * It reaches the suite through `test.env`, so it never touches the client
 * bundle: it has no `VITE_` prefix, and nothing under `src/` outside the live
 * test reads it.
 */
function serviceRoleKey(): string {
  const raw = execFileSync(
    "npx",
    [
      "--no-install",
      "supabase",
      "projects",
      "api-keys",
      "--project-ref",
      PROJECT_REF,
    ],
    { encoding: "utf8", shell: true },
  );

  const { keys } = JSON.parse(raw) as {
    keys: { id: string; api_key: string }[];
  };
  const key = keys.find((k) => k.id === "service_role")?.api_key;

  if (!key) {
    throw new Error(
      "No service_role key from the Supabase CLI. Run `npx supabase login` first.",
    );
  }

  return key;
}

/**
 * The live suite, kept out of `npm test` on purpose.
 *
 * `vitest.config.ts` is the gate: fast, offline, deterministic, and safe to run
 * on every save. `src/**\/*.live.test.ts` is none of those — it opens real
 * sockets to the linked project, creates and deletes real auth users, and takes
 * minutes because half of what it measures is elapsed time. Mixing the two would
 * make the gate need credentials and a network, which is how a suite stops being
 * run at all.
 *
 * Two configs rather than a tag or an env flag: an env variable would have to be
 * set differently on Windows and on CI, and a `describe.skipIf` would report the
 * live checks as passing-because-skipped, which is the one thing M6-12's
 * evidence must never do.
 *
 * Run with `npm run test:live`. Single-threaded and unbounded per file, because
 * the peers share one board and the order they touch it is the scenario.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.live.test.ts"],
    environment: "node",
    env: { VEYLO_SERVICE_ROLE_KEY: serviceRoleKey() },
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
