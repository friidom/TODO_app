import { createContext, useContext } from "react";

// split out so react-refresh doesn't choke on a file mixing a component with other exports

export type Theme = "light" | "dark";

// Not the old "theme" key: that one was written on every first visit, so a "dark" stored there can't be told apart
// from the old dark default. index.html's pre-paint script reads this same key.
export const THEME_KEY = "theme:choice";

// Light unless dark was chosen, whatever the OS prefers. Guarded because a private window can throw on access.
export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // a choice that can't be remembered still applies for this visit
  }
}

export const ThemeContext = createContext({
  theme: "light" as Theme,
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);
