import "dotenv/config";

import { defineConfig } from "vitest/config";

// db/client.ts reads env.DATABASE_URL at module load, so there is no later
// point at which the suite could be redirected: TEST_DATABASE_URL is injected
// under that name here, before anything imports it.
const url = process.env.TEST_DATABASE_URL;

if (url === undefined || url === "") {
  throw new Error(
    "TEST_DATABASE_URL is not set. The integration suite needs its own database — " +
      "see backend/.env.example.",
  );
}

const database = new URL(url).pathname.slice(1);

// The suite empties every table. A TEST_DATABASE_URL copied from DATABASE_URL
// would empty the development database on its first run.
if (!database.endsWith("_test")) {
  throw new Error(`TEST_DATABASE_URL must name a database ending in _test; got "${database}".`);
}

export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    // One database, emptied between files: parallel workers would delete each
    // other's fixtures mid-test.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: url,
      JWT_SECRET: process.env.JWT_SECRET ?? "integration-secret-at-least-32-characters",
      MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? "integration-access-key",
      MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? "integration-secret-key",
    },
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
