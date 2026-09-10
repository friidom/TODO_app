import { createContext, useContext } from "react";

// split out so react-refresh doesn't choke on a file mixing a component with other exports

export type Theme = "light" | "dark";

export const ThemeContext = createContext({
  theme: "dark" as Theme,
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);
