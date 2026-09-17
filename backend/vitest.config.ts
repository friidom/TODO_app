import { defineConfig } from "vitest/config";

// Pure logic only. Flows needing PostgreSQL (registration, rotation, reset)
// are exercised by `npm run auth:verify` instead, so this suite stays
// runnable with no database and no .env.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    // config/env.ts throws at import when these are missing; dotenv won't
    // overwrite a variable that's already set, so these win over a real .env.
    env: {
      DATABASE_URL: "postgresql://postgres:stub@localhost:5432/todo_app_stub",
      JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    },
  },
});
