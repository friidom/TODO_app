import { createContext, useContext } from "react";

// Split out of ThemeProvider.tsx so that file only exports its component:
// react-refresh cannot fast-refresh a module that mixes components with other
// exports.

export type Theme = "light" | "dark";

export const ThemeContext = createContext({
  theme: "dark" as Theme,
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);
