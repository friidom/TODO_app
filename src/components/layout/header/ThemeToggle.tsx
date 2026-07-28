import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../../services/lib/themes/ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="cursor-pointer text-white transition hover:scale-110 active:scale-90"
    >
      <div className="relative h-7 w-7">
        <Sun
          size={28}
          className={`absolute transition-all duration-500 ${
            theme === "dark"
              ? "scale-100 rotate-0 opacity-100"
              : "scale-0 rotate-180 opacity-0"
          } `}
        />

        <Moon
          size={28}
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
