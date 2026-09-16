export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "internal";

// One table pairs code and status, so a call site cannot invent a combination
// like 404 "conflict". Picking the code picks the status.
const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
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

// Prisma-level failures with no SQLSTATE behind them.
const BY_PRISMA_CODE: Record<string, { code: ErrorCode; message: string }> = {
  P2025: { code: "not_found", message: "Not found." },
};

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

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
