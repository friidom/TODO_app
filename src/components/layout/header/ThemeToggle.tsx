import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/providers/themeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="text-ink-2 hover:bg-elevated hover:text-ink grid size-9 cursor-pointer place-items-center rounded-control transition-colors active:scale-90"
    >
      <div className="relative size-[18px]">
        <Sun
          size={18}
          className={`absolute transition-all duration-500 ${
            theme === "dark"
              ? "scale-100 rotate-0 opacity-100"
              : "scale-0 rotate-180 opacity-0"
          } `}
        />

        <Moon
          size={18}
          className={`absolute transition-all duration-500 ${
            theme === "light"
              ? "scale-100 rotate-0 opacity-100"
              : "scale-0 -rotate-180 opacity-0"
          } `}
        />
      </div>
    </button>
  );
}
