import { afterEach, describe, expect, it, vi } from "vitest";

const SAFE_PRODUCTION = {
  NODE_ENV: "production",
  COOKIE_SECURE: "true",
  AUTH_REQUIRE_EMAIL_VERIFICATION: "true",
  MAIL_DRIVER: "smtp",
  SMTP_HOST: "smtp.example.com",
  API_PUBLIC_URL: "https://veylo.example/api/v1",
  JWT_SECRET: "a-production-secret-that-is-long-enough-123",
  MINIO_SECRET_KEY: "a-production-minio-secret",
};

async function loadWith(overrides: Record<string, string>) {
  vi.resetModules();

  for (const [key, value] of Object.entries({ ...SAFE_PRODUCTION, ...overrides })) {
    vi.stubEnv(key, value);
  }

  return import("./env.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production refuses docker-compose.yml's default secrets", () => {
  it("starts with secrets of its own", async () => {
    await expect(loadWith({})).resolves.toBeDefined();
  });

  it("refuses the default JWT_SECRET", async () => {
    await expect(
      loadWith({ JWT_SECRET: "docker-demo-secret-change-me-at-least-32-chars" }),
    ).rejects.toThrow(/JWT_SECRET is docker-compose\.yml's public default/);
  });

  it("refuses the default MinIO secret", async () => {
    await expect(loadWith({ MINIO_SECRET_KEY: "minioadmin123" })).rejects.toThrow(
      /MINIO_SECRET_KEY is docker-compose\.yml's public default/,
    );
  });

  it("allows the defaults outside production", async () => {
    await expect(
      loadWith({
        NODE_ENV: "development",
        JWT_SECRET: "docker-demo-secret-change-me-at-least-32-chars",
        MINIO_SECRET_KEY: "minioadmin123",
      }),
    ).resolves.toBeDefined();
  });
});
