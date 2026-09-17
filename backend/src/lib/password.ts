import argon2 from "argon2";

import { PASSWORD_MAX_BYTES } from "../config/constants.js";
import { AppError } from "./errors.js";

// Spelled out rather than left to argon2's defaults so the cost can't shift
// under a minor version bump, which would desync it from DUMMY_HASH below.
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

// A real hash of a random string nobody holds, at OPTIONS above. verifyDummy()
// checks against it so "no such account" costs the same as a wrong password —
// otherwise response time itself reveals which accounts exist. Precomputed
// rather than hashed at boot: a lazy dummy would make the *first* unknown-user
// login slower than every later one, the same leak in a subtler form.
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$INgTwy4P+s1mmMHXHDXdfA$H3peI4z9fezKBPC4OTuND2Za+I85Jomp6TrYjqk8Wuw";

export function assertPasswordLength(plain: string): void {
  if (Buffer.byteLength(plain, "utf8") > PASSWORD_MAX_BYTES) {
    throw new AppError("bad_request", `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`);
  }
}

export async function hashPassword(plain: string): Promise<string> {
  assertPasswordLength(plain);

  return argon2.hash(plain, OPTIONS);
}

// Never throws: an unparseable stored hash means a broken row, not an
// authenticated user, so it's treated as a rejected login.
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (Buffer.byteLength(plain, "utf8") > PASSWORD_MAX_BYTES) return false;

  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export async function verifyDummyPassword(plain: string): Promise<boolean> {
  return verifyPassword(DUMMY_HASH, plain);
}
