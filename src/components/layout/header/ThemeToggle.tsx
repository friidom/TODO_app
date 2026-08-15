import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/providers/themeContext";
import { cn } from "@/utils/cn";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      // The same shell `LanguageSwitcher` wears, because the two sit in
      // consecutive rows of the profile's Preferences card and a bare icon
      // beside a bordered select read as two different kinds of control.
      className="border-hairline bg-surface text-ink-2 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control grid size-9 cursor-pointer place-items-center border transition-colors outline-none focus-visible:ring-2"
    >
      {/* The two icons are stacked and cross-faded, so the button never resizes
          and nothing around it moves. `active:scale-90` used to ride along with
          it — a bounce on a preference toggle, and the one piece of motion in
          the product that drew attention to itself. */}
      <div className="relative size-[18px]">
        <Sun
          size={18}
          className={cn(
            "absolute transition-all duration-150 ease-out",
            theme === "dark" ? "rotate-0 opacity-100" : "rotate-90 opacity-0",
          )}
        />

        <Moon
          size={18}
          className={cn(
            "absolute transition-all duration-150 ease-out",
            theme === "light" ? "rotate-0 opacity-100" : "-rotate-90 opacity-0",
          )}
        />
      </div>
    </button>
  );
}
