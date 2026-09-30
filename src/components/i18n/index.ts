import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ru from "./locales/ru.json";
import uz from "./locales/uz.json";

function savedLanguage(): string {
  if (typeof window === "undefined") return "en";

  try {
    return localStorage.getItem("language") || "en";
  } catch {
    return "en";
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en,
    },
    ru: {
      translation: ru,
    },
    uz: {
      translation: uz,
    },
  },

  lng: savedLanguage(),
  fallbackLng: "en",

  interpolation: {
    escapeValue: false,
  },
});

if (typeof document !== "undefined") {
  const setLang = (language: string) => {
    document.documentElement.lang = language;
  };

  setLang(i18n.language);
  i18n.on("languageChanged", setLang);
}

// Getters, so a module-level label map read during render follows the current
// language instead of the one active when the module loaded.
export function translated<K extends string>(
  keys: Record<K, string>,
): Readonly<Record<K, string>> {
  const labels = {} as Record<K, string>;

  for (const [name, key] of Object.entries(keys) as [K, string][]) {
    Object.defineProperty(labels, name, {
      enumerable: true,
      get: () => i18n.t(key),
    });
  }

  return labels;
}

export default i18n;
