const NUMBER_LOCALE = "en-US";
const ARABIC_TEXT_LOCALE_WITH_EN_DIGITS = "ar-SA-u-nu-latn";
const ARABIC_RELATIVE_TIME_LOCALE_WITH_EN_DIGITS = "ar-u-nu-latn";
const FALLBACK_TEXT = "—";

const arabicIndicDigits = /[٠-٩]/g;
const easternArabicDigits = /[۰-۹]/g;

const compactUnits = [
  { value: 1_000_000_000, suffix: "B" },
  { value: 1_000_000, suffix: "M" },
  { value: 1_000, suffix: "K" },
] as const;

const numberFormatterCache = new Map<string, Intl.NumberFormat>();
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const relativeTimeFormatterCache = new Map<string, Intl.RelativeTimeFormat>();

function buildCacheKey(locale: string, options: Record<string, unknown>) {
  return `${locale}:${JSON.stringify(options)}`;
}

function getNumberFormatter(locale: string, options: Intl.NumberFormatOptions = {}) {
  const key = buildCacheKey(locale, options);
  const cached = numberFormatterCache.get(key);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat(locale, options);
  numberFormatterCache.set(key, formatter);
  return formatter;
}

function getDateTimeFormatter(locale: string, options: Intl.DateTimeFormatOptions = {}) {
  const key = buildCacheKey(locale, options);
  const cached = dateTimeFormatterCache.get(key);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat(locale, options);
  dateTimeFormatterCache.set(key, formatter);
  return formatter;
}

function getRelativeTimeFormatter(
  locale: string,
  options: Intl.RelativeTimeFormatOptions = { numeric: "auto" }
) {
  const key = buildCacheKey(locale, options);
  const cached = relativeTimeFormatterCache.get(key);
  if (cached) return cached;

  const formatter = new Intl.RelativeTimeFormat(locale, options);
  relativeTimeFormatterCache.set(key, formatter);
  return formatter;
}

export function toSafeNumber(value: unknown, fallback = 0) {
  const amount = Number(value ?? fallback);
  return Number.isFinite(amount) ? amount : fallback;
}

export function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return Number.isFinite(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }
  if (typeof (value as { seconds?: unknown }).seconds === "number") {
    return new Date(Number((value as { seconds: number }).seconds) * 1000);
  }
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function normalizeEnglishDigits(value: unknown) {
  return String(value ?? "")
    .replace(arabicIndicDigits, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(easternArabicDigits, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

export function formatNumberEN(value: unknown, options: Intl.NumberFormatOptions = {}) {
  return normalizeEnglishDigits(
    getNumberFormatter(NUMBER_LOCALE, options).format(toSafeNumber(value))
  );
}

export function formatCompactNumberEN(
  value: unknown,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
) {
  const amount = toSafeNumber(value);
  const unitIndex = compactUnits.findIndex((unit) => Math.abs(amount) >= unit.value);

  if (unitIndex === -1) {
    return formatNumberEN(amount, {
      minimumFractionDigits: options?.minimumFractionDigits ?? 0,
      maximumFractionDigits: options?.maximumFractionDigits ?? 0,
    });
  }

  const formatCompactValue = (currentAmount: number, index: number): string => {
    const unit = compactUnits[index];
    const shortened = Math.round((currentAmount / unit.value) * 10) / 10;

    if (Math.abs(shortened) >= 1000 && index > 0) {
      return formatCompactValue(currentAmount, index - 1);
    }

    const maximumFractionDigits =
      options?.maximumFractionDigits ?? (Math.abs(shortened) >= 100 ? 0 : 1);
    const minimumFractionDigits = options?.minimumFractionDigits ?? 0;

    return `${formatNumberEN(shortened, {
      minimumFractionDigits,
      maximumFractionDigits,
    })}${unit.suffix}`;
  };

  return formatCompactValue(amount, unitIndex);
}

export function formatCurrencyEN(
  value: unknown,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    currencyLabel?: string;
  }
) {
  return `${formatNumberEN(value, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
  })} ${options?.currencyLabel ?? "ر.س"}`;
}

export function formatCurrencyShort(
  value: unknown,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    currencyLabel?: string;
  }
) {
  return `${formatCompactNumberEN(value, options)} ${options?.currencyLabel ?? "ر.س"}`;
}

export function formatPercentEN(
  value: unknown,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return FALLBACK_TEXT;

  return `${formatNumberEN(amount, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  })}%`;
}

export function formatDateEN(
  value: unknown,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  }
) {
  const date = toDateSafe(value);
  if (!date) return FALLBACK_TEXT;

  return normalizeEnglishDigits(
    getDateTimeFormatter(ARABIC_TEXT_LOCALE_WITH_EN_DIGITS, options).format(date)
  );
}

export function formatDateTimeEN(
  value: unknown,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }
) {
  const date = toDateSafe(value);
  if (!date) return FALLBACK_TEXT;

  return normalizeEnglishDigits(
    getDateTimeFormatter(ARABIC_TEXT_LOCALE_WITH_EN_DIGITS, options).format(date)
  );
}

export function formatRelativeTimeFromNowEN(value: unknown) {
  const date = toDateSafe(value);
  if (!date) return "بدون وقت";

  const formatter = getRelativeTimeFormatter(ARABIC_RELATIVE_TIME_LOCALE_WITH_EN_DIGITS, {
    numeric: "auto",
  });

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 60) return normalizeEnglishDigits(formatter.format(diffSeconds, "second"));

  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return normalizeEnglishDigits(formatter.format(diffMinutes, "minute"));
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return normalizeEnglishDigits(formatter.format(diffHours, "hour"));
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return normalizeEnglishDigits(formatter.format(diffDays, "day"));
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return normalizeEnglishDigits(formatter.format(diffMonths, "month"));
  }

  return normalizeEnglishDigits(formatter.format(Math.round(diffMonths / 12), "year"));
}

export function formatFileSizeEN(value: number | null) {
  if (value === null) return FALLBACK_TEXT;
  if (value === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${formatNumberEN(size, {
    maximumFractionDigits: size >= 100 ? 0 : size >= 10 ? 1 : 2,
  })} ${units[unitIndex]}`;
}
