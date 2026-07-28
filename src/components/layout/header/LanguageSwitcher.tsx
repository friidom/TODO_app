import { useTranslation } from "react-i18next";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  function changeLanguage(language: string) {
    i18n.changeLanguage(language);
    localStorage.setItem("language", language);
  }

  return (
    <select
      value={i18n.language}
      onChange={(e) => changeLanguage(e.target.value)}
      className="rounded-lg border border-app bg-card px-3 py-2 text-main"
    >
      <option value="en">🇺🇸 EN</option>
      <option value="ru">🇷🇺 RU</option>
      <option value="uz">🇺🇿 UZ</option>
    </select>
  );
}
