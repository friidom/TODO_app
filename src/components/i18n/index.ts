import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

// Only English ships in the entry chunk: it is the fallback, and most visitors
// never use the other two (each is 100–160 KB of JSON).
const otherLanguages: Record<string, () => Promise<{ default: object }>> = {
  ru: () => import("./locales/ru.json"),
  uz: () => import("./locales/uz.json"),
};

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
  },

  lng: "en",
  fallbackLng: "en",

  interpolation: {
    escapeValue: false,
  },
});

export async function changeLanguage(language: string): Promise<void> {
  const load = otherLanguages[language];

  if (load !== undefined && !i18n.hasResourceBundle(language, "translation")) {
    i18n.addResourceBundle(language, "translation", (await load()).default);
  }

  await i18n.changeLanguage(language);
}

// main.tsx awaits this before the first render, so a Russian reader never sees
// a flash of English. A failed fetch leaves the app in English.
export const i18nReady = changeLanguage(savedLanguage()).catch(() => {});

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
