import i18next from "i18next";
import en from "./en.json";
import ru from "./ru.json";

export type Language = "en" | "ru";

export async function initI18n(language: Language): Promise<void> {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: language,
      fallbackLng: "en",
      resources: {
        en: { translation: en },
        ru: { translation: ru }
      },
      interpolation: { escapeValue: false }
    });
    return;
  }
  await i18next.changeLanguage(language);
}

export function t(key: string): string {
  return String(i18next.t(key));
}

export async function setLanguage(language: Language): Promise<void> {
  await i18next.changeLanguage(language);
}

export function getCurrentLanguage(): Language {
  const lang = i18next.language;
  return lang.startsWith("ru") ? "ru" : "en";
}

export const translations = { en, ru };
