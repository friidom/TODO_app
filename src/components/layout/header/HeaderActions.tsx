import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";
import UserAvatar from "./UserAvatar";

export default function HeaderActions() {
  return (
    <div className="flex items-center gap-4">
      <LanguageSwitcher />
      <ThemeToggle />
      <UserAvatar />
    </div>
  );
}
