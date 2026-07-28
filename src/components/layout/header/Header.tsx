import { useTranslation } from "react-i18next";
import HeaderBackground from "./HeaderBackground";
import HeaderActions from "./HeaderActions";

export default function Header() {
  // const { data: profile, isLoading } = useProfile();
  const { t } = useTranslation();

  // const { theme, toggleTheme } = useTheme();
  return (
    <header className="relative h-72 overflow-hidden bg-cover bg-center pt-2">
      <HeaderBackground />
      <div className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-start justify-between px-6 pt-12">
          <h1 className="text-4xl font-bold tracking-[0.5em] text-white drop-shadow-lg">
            {t("title")}
          </h1>
          <HeaderActions />
        </div>
      </div>
    </header>
  );
}
