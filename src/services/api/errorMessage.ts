import i18n from "@/components/i18n";

// The API answers in English. Messages it sends verbatim are matched here so a
// Russian reader gets Russian; anything unmatched keeps the server's text in
// English and falls back to a sentence per error code elsewhere, which says
// less but is never wrong.
const KNOWN: Record<string, string> = {
  "Invalid login credentials": "apiErrors.invalidCredentials",
  "Not authenticated.": "apiErrors.notAuthenticated",
  "Session expired. Please sign in again.": "apiErrors.sessionExpired",
  "Too many attempts. Try again later.": "apiErrors.tooManyAttempts",
  "An account with that email already exists.": "apiErrors.emailTaken",
  "That username is already taken.": "auth.usernameTaken",
  "That username was just taken. Please try another.":
    "apiErrors.usernameJustTaken",
  "You do not have permission to do that.": "apiErrors.noPermission",
  "That operation is not permitted.": "apiErrors.noPermission",
  "Board not found": "apiErrors.boardNotFound",
  "Not found": "apiErrors.notFound",
  "Not found.": "apiErrors.notFound",
  "Internal server error": "apiErrors.internal",
  "This board already has an active sprint.": "apiErrors.activeSprintExists",
  "This board has no visible 'todo' status to receive the sprint's items.":
    "apiErrors.noTodoStatus",
  "The destination sprint must differ from the one being completed.":
    "apiErrors.sameSprint",
  "That status is hidden and cannot receive work items.":
    "apiErrors.statusHidden",
  "That status is not on any column and cannot receive work items.":
    "apiErrors.statusUnmapped",
  "That status is not on this board.": "apiErrors.statusNotOnBoard",
  "The workflow was changed since it was loaded. Reload it and try again.":
    "workflow.editStale",
  "No file was uploaded.": "apiErrors.noFile",
  "No image was uploaded.": "apiErrors.noImage",
  "That file is not a PNG, JPEG or WebP image.": "apiErrors.badImage",
  "You can only delete files you uploaded.": "apiErrors.ownFilesOnly",
  "You can only delete your own comments.": "apiErrors.ownCommentsDelete",
  "You can only edit your own comments.": "apiErrors.ownCommentsEdit",
  "You cannot invite yourself.": "apiErrors.inviteSelf",
  "You cannot invite someone at or above your own role.":
    "apiErrors.inviteRole",
  "That person already has a pending invitation.": "apiErrors.invitePending",
  "That person is already a member of this board.": "apiErrors.alreadyMember",
  "That person is not a member of this board.": "apiErrors.notMember",
  "The board owner cannot be modified.": "apiErrors.ownerFixed",
  "The board owner cannot be removed.": "apiErrors.ownerFixed",
  "The board owner cannot leave the board.": "apiErrors.ownerCannotLeave",
  "You cannot grant a role at or above your own.": "apiErrors.grantRole",
  "You cannot modify a member at or above your own role.":
    "apiErrors.memberRole",
  "You cannot remove a member at or above your own role.":
    "apiErrors.memberRole",
  "This reset link is invalid or has expired.": "apiErrors.resetLinkInvalid",
  "This is the only way into your account. Set a password first, or connect another provider.":
    "profile.lastWayIn",
  "That already exists.": "apiErrors.alreadyExists",
  "That is still in use.": "apiErrors.stillInUse",
  "A referenced record is missing or still in use.": "apiErrors.stillInUse",
  "That value is not allowed.": "apiErrors.notAllowed",
  "A required field is missing.": "apiErrors.required",
  "That date is not valid.": "apiErrors.badDate",
  "That GitLab project is already connected to this board.":
    "gitlab.errors.alreadyConnected",
  "GitLab integration is not configured on this server.":
    "gitlab.errors.notConfigured",
  "project_url: must be an https:// address.": "gitlab.errors.https",
  "project_url: is not a GitLab project address.": "gitlab.errors.url",
  "project_url: must name a project, such as group/project.":
    "gitlab.errors.path",
  "token: must start with whsec_ — copy the whole signing token from GitLab.":
    "gitlab.tokenProblem.prefix",
  "token: is not a GitLab signing token.": "gitlab.errors.token",
};

const NO_TRANSITION =
  /^The workflow has no transition from "(.*)" to "(.*)"\.$/;

const BOARD_KEY_TAKEN = /^Board key (.*) is already in use\.$/;

export function localizeApiMessage(code: string, message: string): string {
  const key = KNOWN[message];

  if (key) return i18n.t(key);

  const transition = NO_TRANSITION.exec(message);

  if (transition) {
    return i18n.t("workflow.noTransition", {
      from: transition[1],
      to: transition[2],
    });
  }

  const keyTaken = BOARD_KEY_TAKEN.exec(message);

  if (keyTaken) return i18n.t("apiErrors.boardKeyTaken", { key: keyTaken[1] });

  if (i18n.language.startsWith("en")) return message;

  return i18n.t(`apiErrors.code.${code}`, {
    defaultValue: i18n.t("apiErrors.code.unknown"),
  });
}
