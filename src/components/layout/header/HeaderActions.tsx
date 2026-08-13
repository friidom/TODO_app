import { BellIcon } from "lucide-react";

import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";
import UserAvatar from "./UserAvatar";

/**
 * Notifications is a placeholder — inert and marked `disabled`, like Search and
 * Create. The language switcher, theme toggle and avatar are the existing
 * working controls and are unchanged apart from spacing.
 */
export default function HeaderActions() {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled
        title="Notifications — not built yet"
        aria-label="Notifications — not built yet"
        className="text-ink-2 hover:bg-elevated grid size-9 place-items-center rounded-control transition-colors disabled:cursor-default disabled:opacity-70"
      >
        <BellIcon className="size-[18px]" />
      </button>

      <LanguageSwitcher />
      <ThemeToggle />
      <UserAvatar />
    </div>
  );
}
