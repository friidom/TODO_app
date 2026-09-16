import "dotenv/config";

import { z } from "zod";

const databaseUrl = z
  .string()
  .min(1)
  .superRefine((raw, ctx) => {
    let url: URL;

    try {
      url = new URL(raw);
    } catch {
      ctx.addIssue({
        code: "custom",
        // The password is the usual culprit: an unencoded @ splits the
        // authority in the wrong place and the parse fails here rather than
        // at connect time, where the error is far less obvious.
        message:
          "expected a URL like postgresql://user:password@localhost:5432/todo_app — " +
          "if the password contains @ : / ? # or %, percent-encode it (@ becomes %40)",
      });

      return;
    }

    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
      ctx.addIssue({
        code: "custom",
        message: `expected protocol "postgresql:", got "${url.protocol}"`,
      });
    }

    if (url.pathname === "" || url.pathname === "/") {
      ctx.addIssue({
        code: "custom",
        message: "no database name — expected .../todo_app at the end",
      });
    }
  });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  DATABASE_URL: databaseUrl,
});

// An empty string is treated as absent so a commented-out or blank .env entry
// falls back to its default instead of failing .min(1).
const raw = Object.fromEntries(
  Object.keys(schema.shape)
    .map((key) => [key, process.env[key]?.trim()] as const)
    .filter(([, value]) => value !== undefined && value !== ""),
);

const parsed = schema.safeParse(raw);

if (!parsed.success) {
  const lines = parsed.error.issues.map(
    (issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );

  // Fails at import time, before the server binds a port: a process that
  // cannot reach its database should not accept traffic and report healthy.
  throw new Error(
    `Invalid backend environment — check backend/.env against .env.example:\n${lines.join("\n")}`,
  );
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
} as const;

// new URL() splits the authority on the LAST "@", so a password containing a
// literal "@" still parses -- it just relies on pg's parser happening to split
// in the same place. That coincidence is what made an unencoded password
// "work" in B2. Not fatal, because a username like user@servername is valid on
// some hosted Postgres, so this warns rather than refuses.
{
  const authority = env.DATABASE_URL.split("//")[1]?.split("/")[0] ?? "";

  if ((authority.match(/@/g)?.length ?? 0) > 1) {
    console.warn(
      "[env] DATABASE_URL has more than one '@' before the host. If that is an " +
        "unencoded password, percent-encode it (@ becomes %40) — otherwise this " +
        "connects only while two different URL parsers agree where it splits.",
    );
  }
}

export function describeDatabase(): string {
  const { hostname, port, pathname, username } = new URL(env.DATABASE_URL);

  return `${username}@${hostname}:${port || "5432"}${pathname}`;
}
