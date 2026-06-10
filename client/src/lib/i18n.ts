import type { Language } from "@/contexts/LanguageContext";

export type LocalizedText = {
  ar: string;
  en: string;
};

export function isArabic(language: Language) {
  return language === "ar";
}

export function languageDir(language: Language): "rtl" | "ltr" {
  return isArabic(language) ? "rtl" : "ltr";
}

export function textAlignClass(language: Language) {
  return isArabic(language) ? "text-right" : "text-left";
}

export function iconMarginStartClass(language: Language) {
  return isArabic(language) ? "ml-2" : "mr-2";
}

export function tr(language: Language, ar: string, en: string) {
  return isArabic(language) ? ar : en;
}

export function localize(language: Language, value: LocalizedText) {
  return tr(language, value.ar, value.en);
}

export function hasArabicText(value: unknown) {
  return /[\u0600-\u06FF]/.test(String(value ?? ""));
}

export function safeEnglishText(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  if (!text || hasArabicText(text)) return fallback;
  return text;
}

export function pickLocalizedText(
  language: Language,
  values: {
    ar?: unknown;
    en?: unknown;
    neutral?: unknown;
  },
  fallback: LocalizedText
) {
  const ar = String(values.ar ?? "").trim();
  const en = String(values.en ?? "").trim();
  const neutral = String(values.neutral ?? "").trim();

  if (language === "ar") {
    return ar || en || neutral || fallback.ar;
  }

  if (en && !hasArabicText(en)) return en;
  if (neutral && !hasArabicText(neutral)) return neutral;
  return fallback.en;
}

export function pickLabelValue(
  language: Language,
  value: unknown,
  fallback: LocalizedText
) {
  if (value && typeof value === "object") {
    const source = value as { ar?: unknown; en?: unknown };
    return pickLocalizedText(language, source, fallback);
  }

  if (typeof value === "string") {
    if (language === "ar") return value || fallback.ar;
    return safeEnglishText(value, fallback.en);
  }

  return localize(language, fallback);
}
