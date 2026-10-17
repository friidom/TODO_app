import { useEffect, useState } from "react";
import { ThemeContext, readTheme, saveTheme, type Theme } from "./themeContext";

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#070a12" : "#f0f1f4");
  }, [theme]);

  // saved only on a real choice, never on mount, so the default stays a default
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";

    saveTheme(next);
    setTheme(next);
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
