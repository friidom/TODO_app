// client-side mirror of profiles_username_key / profiles_username_shape — the DB is the real authority, this just gives a nicer error than a 23505
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

// lowercase is the canonical form — stored folded so no comparison anywhere has to remember to fold case itself
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

const USERNAME_SHAPE = /^[a-z0-9][a-z0-9_]{2,29}$/;

export function validateUsername(value: string): string | undefined {
  const username = normalizeUsername(value);

  if (!username) return "Username is required.";

  if (username.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters.`;
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return `Username must be at most ${USERNAME_MAX_LENGTH} characters.`;
  }

  if (!/^[a-z0-9]/.test(username)) {
    return "Username must start with a letter or a number.";
  }

  if (!USERNAME_SHAPE.test(username)) {
    return "Username can only contain letters, numbers and underscores.";
  }

  return undefined;
}

export function isUsernameShapeValid(value: string): boolean {
  return validateUsername(value) === undefined;
}
