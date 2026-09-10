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
      className="border-hairline bg-surface text-ink-2 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control grid size-9 cursor-pointer place-items-center border transition-colors outline-none focus-visible:ring-2"
    >
      {/* icons stacked and cross-faded so the button never resizes */}
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
