import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AppError, toAppError, uniqueConstraintOf } from "./errors.js";

// Shape copied from a real Prisma error: the SQLSTATE and constraint live
// under meta, since Prisma's own codes (P2002) occupy the top-level `code`.
function prismaError(originalCode: string, constraint?: string) {
  return {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    meta: {
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode,
          originalMessage: "the server says this in its own locale",
          constraint: constraint === undefined ? undefined : { index: constraint },
          table: "users",
        },
      },
    },
  };
}

describe("toAppError", () => {
  it("passes an AppError through unchanged", () => {
    const original = new AppError("forbidden", "nope");

    expect(toAppError(original)).toBe(original);
  });

  it("turns a validation failure into a 400 naming the field", () => {
    const schema = z.object({ password: z.string().min(10, "must be at least 10 characters") });
    const result = schema.safeParse({ password: "short" });
    const error = toAppError(result.error);

    expect(error.status).toBe(400);
    expect(error.code).toBe("bad_request");
    expect(error.message).toBe("password: must be at least 10 characters");
  });

  it("does not put the rejected value in the message", () => {
    const schema = z.object({ password: z.string().min(10) });
    const error = toAppError(schema.safeParse({ password: "hunter2" }).error);

    expect(error.message).not.toContain("hunter2");
  });

  it("maps a unique violation to 409", () => {
    expect(toAppError(prismaError("23505")).status).toBe(409);
  });

  it("maps a trigger refusal to 403", () => {
    expect(toAppError(prismaError("42501")).status).toBe(403);
  });

  it("leaves anything unrecognised as a 500 with no detail", () => {
    const error = toAppError(new Error("connection reset by peer"));

    expect(error.status).toBe(500);
    expect(error.message).toBe("Internal server error");
  });
});

describe("uniqueConstraintOf", () => {
  it("names the constraint a unique violation hit", () => {
    expect(uniqueConstraintOf(prismaError("23505", "users_email_key"))).toBe("users_email_key");
  });

  it("reads the constraint off a raw pg error too", () => {
    expect(uniqueConstraintOf({ code: "23505", constraint: "users_email_key" })).toBe(
      "users_email_key",
    );
  });

  it("is undefined when the violation names no constraint", () => {
    expect(uniqueConstraintOf(prismaError("23505"))).toBeUndefined();
  });

  it("is undefined for anything that is not a unique violation", () => {
    expect(uniqueConstraintOf(prismaError("23503", "todos_board_id_fkey"))).toBeUndefined();
    expect(uniqueConstraintOf(new Error("boom"))).toBeUndefined();
    expect(uniqueConstraintOf(null)).toBeUndefined();
  });
});

describe("client input that the database or the parser refuses", () => {
  it("maps a NUL byte (22021) to 400, not 500", () => {
    const error = {
      name: "PrismaClientKnownRequestError",
      code: "P2039",
      meta: { driverAdapterError: { cause: { originalCode: "22021" } } },
    };

    expect(toAppError(error).status).toBe(400);
  });

  it("maps an untranslatable character (22P05) to 400", () => {
    const error = {
      name: "PrismaClientKnownRequestError",
      code: "P2039",
      meta: { driverAdapterError: { cause: { originalCode: "22P05" } } },
    };

    expect(toAppError(error).status).toBe(400);
  });

  it("maps an exposed http-error, such as a malformed JSON body, to 400", () => {
    const error = Object.assign(new SyntaxError("Unexpected end of JSON input"), {
      status: 400,
      statusCode: 400,
      type: "entity.parse.failed",
      expose: true,
    });

    const mapped = toAppError(error);

    expect(mapped.status).toBe(400);
    expect(mapped.code).toBe("bad_request");
  });

  it("does not turn an unexposed 5xx http-error into a client error", () => {
    const error = Object.assign(new Error("boom"), { status: 500, expose: false });

    expect(toAppError(error).status).toBe(500);
  });

  it("still leaves an unrecognised SQLSTATE as a 500", () => {
    const error = { code: "40001" };

    expect(toAppError(error).status).toBe(500);
  });
});
