import { ZodError } from "zod";

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_many_requests"
  | "internal";

// One table pairs code and status, so a call site cannot invent a combination
// like 404 "conflict". Picking the code picks the status.
const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_many_requests: 429,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);

    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
  }
}

// Only the states this schema actually produces. 23503/23514/42501 are raised
// by our own trigger functions; 23505/23502/22P02 come from the table
// definitions and from malformed input. Anything else stays a 500 on purpose —
// an unrecognised state is a bug to read in the log, not a status to guess.
const BY_SQLSTATE: Record<string, { code: ErrorCode; message: string }> = {
  "23505": { code: "conflict", message: "That already exists." },
  "23503": { code: "conflict", message: "A referenced record is missing or still in use." },
  "23514": { code: "bad_request", message: "That value is not allowed." },
  "23502": { code: "bad_request", message: "A required field is missing." },
  "22P02": { code: "bad_request", message: "Malformed value." },
  // A NUL byte in any text field. PostgreSQL cannot store one, so this is
  // client input the database refuses rather than a bug: verified as a 500
  // before this entry existed. 22P05 is the same family.
  "22021": { code: "bad_request", message: "That value contains characters that cannot be stored." },
  // A number past the column width (int4) and a date PostgreSQL cannot
  // represent. Both are reachable from an ordinary request body, so both are
  // the client telling us something wrong rather than us being wrong.
  "22003": { code: "bad_request", message: "That number is out of range." },
  "22007": { code: "bad_request", message: "That date is not valid." },
  "22008": { code: "bad_request", message: "That date is out of range." },
  "22P05": { code: "bad_request", message: "That value contains characters that cannot be stored." },
  // Every ownership and membership invariant in 0006 refuses with this.
  "42501": { code: "forbidden", message: "That operation is not permitted." },
};

// Prisma reports its own P-code and keeps the driver's original SQLSTATE in
// meta. The meta path is read first because Prisma's codes collide with real
// SQLSTATEs — PostgreSQL's plpgsql RAISE is P0001, Prisma's unique violation
// is P2002, and both match the same shape.
function sqlStateOf(error: object): string | undefined {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } })
    .meta;
  const original = meta?.driverAdapterError?.cause?.originalCode;

  if (typeof original === "string") return original;

  if ((error as { name?: unknown }).name === "PrismaClientKnownRequestError") {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;

  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}

// The name of the constraint a 23505 violated, so callers can say which
// unique value collided. The message beside it is skipped: it's in the
// server's own locale (Russian, on this machine).
export function uniqueConstraintOf(error: unknown): string | undefined {
  if (error === null || typeof error !== "object") return undefined;

  if (sqlStateOf(error) !== "23505") return undefined;

  // The driver adapter reports it as { constraint: { index } }; a raw pg
  // error carries a plain `constraint` string.
  const adapter = (
    error as {
      meta?: { driverAdapterError?: { cause?: { constraint?: unknown } } };
    }
  ).meta?.driverAdapterError?.cause?.constraint;

  if (typeof adapter === "string") return adapter;

  if (adapter !== null && typeof adapter === "object") {
    const index = (adapter as { index?: unknown }).index;

    if (typeof index === "string") return index;
  }

  const direct = (error as { constraint?: unknown }).constraint;

  return typeof direct === "string" ? direct : undefined;
}

// Prisma-level failures with no SQLSTATE behind them.
const BY_PRISMA_CODE: Record<string, { code: ErrorCode; message: string }> = {
  P2025: { code: "not_found", message: "Not found." },
};

function isExposedHttpError(
  error: unknown,
): error is { status: number; message: string; expose: true } {
  if (error === null || typeof error !== "object") return false;

  const candidate = error as { status?: unknown; expose?: unknown; message?: unknown };

  return (
    candidate.expose === true &&
    typeof candidate.status === "number" &&
    candidate.status >= 400 &&
    typeof candidate.message === "string"
  );
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  // Only the field path and rule are reported, never the value — on an auth
  // route the value can be a password.
  if (error instanceof ZodError) {
    const [issue] = error.issues;
    const path = issue?.path.join(".");

    return new AppError(
      "bad_request",
      issue === undefined
        ? "Invalid request."
        : path
          ? `${path}: ${issue.message}`
          : issue.message,
    );
  }

  // body-parser (and anything else built on http-errors) sets expose:true only
  // for client errors, so a malformed JSON body arrives as a 400 rather than
  // falling through to 500. Its own message is safe to show — that is what
  // expose means.
  if (isExposedHttpError(error)) {
    return new AppError(error.status >= 500 ? "internal" : "bad_request", error.message);
  }

  if (error !== null && typeof error === "object") {
    const sqlState = sqlStateOf(error);
    const mapped = sqlState === undefined ? undefined : BY_SQLSTATE[sqlState];

    if (mapped) return new AppError(mapped.code, mapped.message);

    const prismaCode = (error as { code?: unknown }).code;

    if (typeof prismaCode === "string") {
      const byPrisma = BY_PRISMA_CODE[prismaCode];

      if (byPrisma) return new AppError(byPrisma.code, byPrisma.message);
    }
  }

  return new AppError("internal", "Internal server error");
}
