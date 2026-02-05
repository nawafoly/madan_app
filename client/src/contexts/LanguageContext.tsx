import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type Language = "ar" | "en";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
};

const LANGUAGE_STORAGE_KEY = "app-language";

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "ar" || stored === "en") return stored;
  } catch {
    // Ignore storage errors
  }
  return null;
}

function writeStoredLanguage(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore storage errors
  }
}

function applyDocumentLanguage(language: Language) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = language;
  root.dir = language === "ar" ? "rtl" : "ltr";
}

export function initializeDocumentLanguage(defaultLanguage: Language = "ar") {
  const stored = typeof window !== "undefined" ? readStoredLanguage() : null;
  const language = stored ?? defaultLanguage;
  applyDocumentLanguage(language);
  return language;
}

export function LanguageProvider({
  children,
  defaultLanguage = "ar",
}: {
  children: React.ReactNode;
  defaultLanguage?: Language;
}) {
  const [language, setLanguage] = useState<Language>(() => {
    return readStoredLanguage() ?? defaultLanguage;
  });

  useEffect(() => {
    applyDocumentLanguage(language);
    writeStoredLanguage(language);
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage: () =>
        setLanguage((prev) => (prev === "ar" ? "en" : "ar")),
    }),
    [language]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
