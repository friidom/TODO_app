import { useTheme } from "../../../services/lib/themes/ThemeProvider";

export default function HeaderBackground() {
  const { theme } = useTheme();

  return (
    <>
      <div
        className={`
          absolute inset-0
          bg-[url('/themes/bg-desktop-light.jpg')]
          bg-cover bg-center
          transition-opacity duration-500
          ${theme === "light" ? "opacity-100" : "opacity-0"}
        `}
      />

      <div
        className={`
          absolute inset-0
          bg-[url('/themes/bg-desktop-dark.jpg')]
          bg-cover bg-center
          transition-opacity duration-500
          ${theme === "dark" ? "opacity-100" : "opacity-0"}
        `}
      />

      <div className="absolute inset-0 bg-black/20" />
    </>
  );
}