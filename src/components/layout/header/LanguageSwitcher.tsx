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
      className="border-hairline bg-surface text-ink-2 hover:text-ink h-9 cursor-pointer rounded-control border px-2 text-sm transition-colors"
    >
      <option value="en">🇺🇸 EN</option>
      <option value="ru">🇷🇺 RU</option>
      <option value="uz">🇺🇿 UZ</option>
    </select>
  );
}
