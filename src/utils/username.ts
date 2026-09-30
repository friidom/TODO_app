import i18n from "@/components/i18n";

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

  if (!username) return i18n.t("validation.usernameRequired");

  if (username.length < USERNAME_MIN_LENGTH) {
    return i18n.t("validation.usernameMin", { count: USERNAME_MIN_LENGTH });
  }

  if (username.length > USERNAME_MAX_LENGTH) {
    return i18n.t("validation.usernameMax", { count: USERNAME_MAX_LENGTH });
  }

  if (!/^[a-z0-9]/.test(username)) {
    return i18n.t("validation.usernameStart");
  }

  if (!USERNAME_SHAPE.test(username)) {
    return i18n.t("validation.usernameChars");
  }

  return undefined;
}

export function isUsernameShapeValid(value: string): boolean {
  return validateUsername(value) === undefined;
}
