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

// z.coerce.boolean() reads any non-empty string, including "false", as true.
const flag = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((value) => value === "true");

const SECONDS_PER_UNIT = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

// Parsed to seconds: jsonwebtoken's expiresIn only accepts a string literal
// type from the `ms` package, which no runtime env value can satisfy.
const duration = (fallback: string) =>
  z
    .string()
    .regex(/^\d+[smhd]$/, 'expected a duration like "15m", "24h" or "7d"')
    .default(fallback)
    .transform((value) => {
      const unit = value.at(-1) as keyof typeof SECONDS_PER_UNIT;

      return Number(value.slice(0, -1)) * SECONDS_PER_UNIT[unit];
    });

// Checked against the platform tz database rather than accepted as any
// string: a typo would otherwise surface as every date bucket silently
// falling back, which is the kind of wrong that looks right.
function timezone(fallback: string) {
  return z
    .string()
    .min(1)
    .default(fallback)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });

        return true;
      } catch {
        return false;
      }
    }, "must be an IANA time zone name, such as UTC or Asia/Tashkent");
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  DATABASE_URL: databaseUrl,

  MINIO_ENDPOINT: z.string().min(1).default("minio"),
  MINIO_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  MINIO_USE_SSL: flag("false"),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(1).default("todo-attachments"),

  JWT_SECRET: z.string().min(32, "must be at least 32 characters — generate one with: openssl rand -base64 48"),
  ACCESS_TOKEN_TTL: duration("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  COOKIE_SECURE: flag("false"),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),

  APP_URL: z.string().min(1).default("http://localhost:5173"),

  // The API's own EXTERNALLY REACHABLE base url — the one a browser uses,
  // which is not necessarily the one this process listens on. Under docker
  // compose the browser reaches the API through nginx on :3000, so this is
  // http://localhost:3000/api/v1 there and http://localhost:4000/api/v1 for
  // `npm run dev`. OAuth callback urls are derived from it (never configured
  // per provider), because the redirect uri has to be byte-identical in the
  // authorize request, the token exchange and the provider's console, and
  // three variables is three chances to make them disagree.
  API_PUBLIC_URL: z.string().min(1).default("http://localhost:4000/api/v1"),

  MAIL_DRIVER: z.enum(["console", "smtp"]).default("console"),
  MAIL_FROM: z.string().min(1).default("TODO App <no-reply@todo.local>"),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),

  AUTH_REQUIRE_EMAIL_VERIFICATION: flag("false"),

  // Optional in pairs: a provider with no credentials simply does not appear
  // on the sign-in page. The client ids are PUBLIC — they travel in the
  // authorize url, in the address bar. The secrets are not, and must never be
  // given a VITE_ name: Vite inlines those into the browser bundle.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),

  // Every admin bucket is computed in this one zone (M34 D-11). "Today"
  // differs by up to a day across zones, and a KPI that disagrees with the
  // developer own calendar will not be believed -- so the question is
  // answered once, here, rather than per query.
  APP_TIMEZONE: timezone("UTC"),
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

// Half a provider is worse than none: the button would render and the
// exchange would fail at the last step, after the user had already consented.
{
  const halves: [string, string | undefined, string | undefined][] = [
    ["GOOGLE", env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET],
    ["GITHUB", env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET],
  ];

  for (const [name, id, secret] of halves) {
    if ((id === undefined) !== (secret === undefined)) {
      throw new Error(
        `Invalid backend environment: ${name}_CLIENT_ID and ${name}_CLIENT_SECRET must be set together.`,
      );
    }
  }
}

if (env.isProduction) {
  const oauthConfigured = env.GOOGLE_CLIENT_ID !== undefined || env.GITHUB_CLIENT_ID !== undefined;

  const unsafe = [
    !env.COOKIE_SECURE && "COOKIE_SECURE must be true — the refresh cookie would otherwise travel in clear text",
    oauthConfigured &&
      !env.API_PUBLIC_URL.startsWith("https://") &&
      "API_PUBLIC_URL must be https — it is handed to Google and GitHub as the redirect target, and an authorization code would travel back in clear text",
    !env.AUTH_REQUIRE_EMAIL_VERIFICATION &&
      "AUTH_REQUIRE_EMAIL_VERIFICATION must be true — auto-verification lets anyone claim an address they do not own",
    env.MAIL_DRIVER === "console" &&
      "MAIL_DRIVER must be smtp — the console driver prints reset links to the log instead of sending them",
  ].filter((message): message is string => message !== false);

  if (unsafe.length > 0) {
    throw new Error(`Refusing to start in production:\n${unsafe.map((m) => `  ${m}`).join("\n")}`);
  }
}

// Browsers silently drop a SameSite=None cookie that isn't Secure.
if (env.COOKIE_SAMESITE === "none" && !env.COOKIE_SECURE) {
  throw new Error(
    "Invalid backend environment: COOKIE_SAMESITE=none requires COOKIE_SECURE=true — browsers reject the pair.",
  );
}

if (env.MAIL_DRIVER === "smtp" && !env.SMTP_HOST) {
  throw new Error("Invalid backend environment: MAIL_DRIVER=smtp requires SMTP_HOST.");
}

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
