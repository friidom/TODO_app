/**
 * Self-check for the auth form validation. No test runner installed, so run it
 * directly:
 *
 *   node --experimental-strip-types src/utils/validation.check.ts
 */
import assert from "node:assert/strict";

import {
  PASSWORD_MIN_LENGTH,
  hasErrors,
  validateAuthForm,
  validateEmail,
  validatePassword,
} from "./validation.ts";

// --- email ------------------------------------------------------------------

assert.equal(validateEmail(""), "Email is required.");

// Whitespace is not an address.
assert.equal(validateEmail("   "), "Email is required.");

assert.equal(validateEmail("notanemail"), "Enter a valid email address.");
assert.equal(validateEmail("no@domain"), "Enter a valid email address.");
assert.equal(validateEmail("@example.com"), "Enter a valid email address.");
assert.equal(validateEmail("two@@example.com"), "Enter a valid email address.");
assert.equal(
  validateEmail("spaces in@example.com"),
  "Enter a valid email address.",
);

assert.equal(validateEmail("someone@example.com"), undefined);
assert.equal(validateEmail("first.last+tag@sub.example.co.uk"), undefined);

// Padding is trimmed before the shape is checked, matching what the form sends.
assert.equal(validateEmail("  someone@example.com  "), undefined);

// --- password ---------------------------------------------------------------

assert.equal(validatePassword(""), "Password is required.");

assert.equal(
  validatePassword("12345"),
  `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
);

assert.equal(validatePassword("123456"), undefined);
assert.equal(validatePassword("a-long-enough-password"), undefined);

// Passwords are never trimmed: spaces count, and a password of six spaces is
// a password the user may well have registered with.
assert.equal(validatePassword("      "), undefined);
assert.equal(
  validatePassword("  a  "),
  `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
);

// --- both together ----------------------------------------------------------

assert.deepEqual(validateAuthForm("someone@example.com", "123456"), {});

assert.deepEqual(validateAuthForm("", ""), {
  email: "Email is required.",
  password: "Password is required.",
});

// One bad field does not report the other.
assert.deepEqual(validateAuthForm("nope", "123456"), {
  email: "Enter a valid email address.",
});

assert.deepEqual(validateAuthForm("someone@example.com", "12"), {
  password: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
});

// --- hasErrors --------------------------------------------------------------

assert.equal(hasErrors({}), false);
assert.equal(hasErrors({ email: "Email is required." }), true);
assert.equal(hasErrors({ password: "Password is required." }), true);
assert.equal(
  hasErrors(validateAuthForm("someone@example.com", "123456")),
  false,
);
assert.equal(hasErrors(validateAuthForm("", "")), true);

console.log("validation: all checks passed");
